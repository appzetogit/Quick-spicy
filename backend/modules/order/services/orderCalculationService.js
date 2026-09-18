import Restaurant from '../../restaurant/models/Restaurant.js';
import Offer from '../../restaurant/models/Offer.js';
import FreebieOffer from '../../restaurant/models/FreebieOffer.js';
import FeeSettings from '../../admin/models/FeeSettings.js';
import Menu from '../../restaurant/models/Menu.js';
import { areOffersEnabled } from '../../../shared/utils/offersSwitch.js';
import mongoose from 'mongoose';

const getEffectiveOfferEndDate = (endDateValue) => {
  if (!endDateValue) return null;
  const endDate = new Date(endDateValue);
  if (Number.isNaN(endDate.getTime())) return null;

  const isUtcMidnight =
    endDate.getUTCHours() === 0 &&
    endDate.getUTCMinutes() === 0 &&
    endDate.getUTCSeconds() === 0 &&
    endDate.getUTCMilliseconds() === 0;

  const isLocalMidnight =
    endDate.getHours() === 0 &&
    endDate.getMinutes() === 0 &&
    endDate.getSeconds() === 0 &&
    endDate.getMilliseconds() === 0;

  if (isUtcMidnight || isLocalMidnight) {
    endDate.setHours(23, 59, 59, 999);
  }

  return endDate;
};

/**
 * Get active fee settings from database
 * Returns default values if no settings found
 */
const getFeeSettings = async () => {
  try {
    const feeSettings = await FeeSettings.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();
    
    if (feeSettings) {
      return feeSettings;
    }
    
    // Return default values if no active settings found
    return {
      deliveryFee: 25,
      deliveryBaseDistanceKm: 2.5,
      deliveryFeePerKm: 6,
      platformFee: 5,
      gstRate: 5,
    };
  } catch (error) {
    console.error('Error fetching fee settings:', error);
    // Return default values on error
    return {
      deliveryFee: 25,
      deliveryBaseDistanceKm: 2.5,
      deliveryFeePerKm: 6,
      platformFee: 5,
      gstRate: 5,
    };
  }
};

/**
 * How far a delivery may be before the distance is treated as bad data rather than a
 * journey. Deliveries are zone-local - a few kilometres - and cross-zone ordering is
 * blocked at checkout, so a larger number means coordinates that are wrong, not a rider
 * about to drive across the state. Left uncapped, the per-km fee ran away with it: a drop
 * pinned at 0,0 produced a Rs 42,805 delivery fee, and four orders in the last 60 days
 * were recorded more than 50km from their restaurant, one of them 224km.
 */
export const MAX_FEE_DISTANCE_KM = Number(process.env.MAX_FEE_DISTANCE_KM || 50);

/**
 * @returns {{distanceKm: number, implausible: boolean}} the distance the fee may be based
 * on. Charging the base fee for nonsense coordinates is wrong by a few rupees; charging
 * the uncapped figure is wrong by thousands.
 */
export const boundedFeeDistanceKm = (rawKm, maxKm = MAX_FEE_DISTANCE_KM) => {
  // Number(null) is 0, which would pass as a legitimate zero-kilometre delivery rather
  // than the "we could not work it out" that it actually is.
  if (rawKm === null || rawKm === undefined || rawKm === '') return { distanceKm: 0, implausible: true };
  const distance = Number(rawKm);
  if (!Number.isFinite(distance) || distance < 0) return { distanceKm: 0, implausible: true };
  if (distance > maxKm) return { distanceKm: maxKm, implausible: true };
  return { distanceKm: distance, implausible: false };
};

/**
 * How many item units a coupon may discount in one order, unless the coupon sets its own.
 *
 * Coupons were being farmed by stacking units under a steep discount: GET75%OFF was
 * applied to one order of twelve breakfast items for Rs 248 off. A per-coupon cap existed,
 * but it was optional, unset on every single offer, and counted each item line separately -
 * so a coupon covering vada, poori, idly and dosa still discounted that many of each. Every
 * coupon now has a per-order limit. Set COUPON_DEFAULT_MAX_ITEMS=0 to remove the default.
 */
export const COUPON_DEFAULT_MAX_ITEMS = Number(process.env.COUPON_DEFAULT_MAX_ITEMS ?? 3);

/** The per-order item limit for this offer: its own maxDiscountedQuantity, else the default. */
export const couponItemLimit = (offer) => {
  const own = Number(offer?.maxDiscountedQuantity);
  if (Number.isFinite(own) && own > 0) return Math.floor(own);
  const fallback = Number(COUPON_DEFAULT_MAX_ITEMS);
  return Number.isFinite(fallback) && fallback > 0 ? Math.floor(fallback) : Infinity;
};

/**
 * Same-dish cap: how many units of any ONE dish a coupon discounts. The order-wide limit
 * alone still let the whole allowance go on a single dish (3 x the same pizza). Set
 * COUPON_DEFAULT_MAX_PER_DISH=0 to remove the default; a coupon's own value always wins.
 */
export const COUPON_DEFAULT_MAX_PER_DISH = Number(process.env.COUPON_DEFAULT_MAX_PER_DISH ?? 2);

export const couponPerDishLimit = (offer) => {
  const own = Number(offer?.maxQuantityPerDish);
  if (Number.isFinite(own) && own > 0) return Math.floor(own);
  const fallback = Number(COUPON_DEFAULT_MAX_PER_DISH);
  return Number.isFinite(fallback) && fallback > 0 ? Math.floor(fallback) : Infinity;
};

/** Clamp each line's quantity to the per-dish limit before the order-wide limit applies. */
export const capPerDish = (lines = [], perDish = Infinity) =>
  (Array.isArray(lines) ? lines : []).map((line) => ({
    ...line,
    quantity: Math.min(Math.max(0, Math.floor(Number(line?.quantity) || 0)), perDish),
  }));

/**
 * Why a coupon must be refused for these quantities, or null when it may apply.
 * Over the admin-set limits the coupon is disabled outright - not partially applied.
 *
 * @param {{name?: string, quantity: number}[]} lines the cart lines the coupon covers
 */
export const couponQuantityRejection = (lines = [], maxItems = Infinity, maxPerDish = Infinity) => {
  const list = Array.isArray(lines) ? lines : [];
  const qty = (line) => Math.max(0, Math.floor(Number(line?.quantity) || 0));
  const overDish = list.find((line) => qty(line) > maxPerDish);
  if (overDish) {
    return `This coupon allows at most ${maxPerDish} of the same dish` +
      (overDish.name ? ` (you have ${qty(overDish)} x ${overDish.name})` : '');
  }
  const units = list.reduce((sum, line) => sum + qty(line), 0);
  if (units > maxItems) {
    return `This coupon is valid for up to ${maxItems} ${maxItems === 1 ? 'item' : 'items'} (you have ${units})`;
  }
  return null;
};

/**
 * Total discount across the order when at most maxUnits units may be discounted.
 *
 * Counts units across the whole order, not per line, and takes the units worth the most
 * discount first, so the customer always gets the best the limit allows. Anything beyond
 * the limit is simply charged at full price rather than refused.
 *
 * @param {{unitDiscount: number, quantity: number}[]} lines
 */
export const capDiscountedUnits = (lines = [], maxUnits = Infinity) => {
  const units = (Array.isArray(lines) ? lines : [])
    .map((line) => ({
      unitDiscount: Math.max(0, Number(line?.unitDiscount) || 0),
      quantity: Math.max(0, Math.floor(Number(line?.quantity) || 0)),
    }))
    .sort((a, b) => b.unitDiscount - a.unitDiscount);
  let remaining = Number.isFinite(Number(maxUnits)) ? Math.max(0, Math.floor(Number(maxUnits))) : Infinity;
  let total = 0;
  for (const line of units) {
    if (remaining <= 0) break;
    const take = Math.min(line.quantity, remaining);
    total += take * line.unitDiscount;
    remaining -= take;
  }
  return total;
};

/**
 * Calculate delivery fee based on distance and fee settings
 */
export const calculateDeliveryFee = async (orderValue, restaurant, deliveryAddress = null) => {
  const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
  const feeSettings = await getFeeSettings();
  const baseDeliveryFee = Number(feeSettings.deliveryFee ?? 25);
  const baseDistanceKm = Number(feeSettings.deliveryBaseDistanceKm ?? 2.5);
  const additionalFeePerKm = Number(feeSettings.deliveryFeePerKm ?? 6);
  const restaurantCoordinates = restaurant?.location?.coordinates;
  const deliveryCoordinates = deliveryAddress?.location?.coordinates;

  if (
    Array.isArray(restaurantCoordinates) &&
    restaurantCoordinates.length >= 2 &&
    Array.isArray(deliveryCoordinates) &&
    deliveryCoordinates.length >= 2
  ) {
    const rawDistanceKm = Math.max(0, calculateDistance(restaurantCoordinates, deliveryCoordinates));
    const { distanceKm, implausible } = boundedFeeDistanceKm(rawDistanceKm);
    if (implausible) {
      console.warn(
        `[DELIVERY FEE] Implausible distance ${rawDistanceKm.toFixed(1)}km between restaurant ` +
        `${JSON.stringify(restaurantCoordinates)} and drop ${JSON.stringify(deliveryCoordinates)} - ` +
        `charging as ${distanceKm}km. Check the coordinates on this restaurant or address.`
      );
    }
    const extraDistanceKm = Math.max(0, distanceKm - baseDistanceKm);
    const additionalFee = extraDistanceKm * additionalFeePerKm;
    const totalFee = baseDeliveryFee + additionalFee;

    return {
      fee: round2(totalFee),
      breakdown: {
        source: 'distance',
        distanceKm: round2(distanceKm),
        rawDistanceKm: round2(rawDistanceKm),
        implausibleDistance: implausible,
        baseDistanceKm: round2(baseDistanceKm),
        extraDistanceKm: round2(extraDistanceKm),
        basePayout: round2(baseDeliveryFee),
        commissionPerKm: round2(additionalFeePerKm),
        total: round2(totalFee)
      }
    };
  }

  return {
    fee: round2(baseDeliveryFee),
    breakdown: {
      source: 'base',
      baseDistanceKm: round2(baseDistanceKm),
      basePayout: round2(baseDeliveryFee),
      commissionPerKm: round2(additionalFeePerKm),
      total: round2(baseDeliveryFee)
    }
  };
};

/**
 * Calculate platform fee
 */
export const calculatePlatformFee = async () => {
  const feeSettings = await getFeeSettings();
  return Number(feeSettings.platformFee ?? 5);
};

/**
 * Calculate GST (Goods and Services Tax)
 * GST is calculated on subtotal after discounts
 */
export const calculateGST = async (subtotal, discount = 0) => {
  const taxableAmount = subtotal - discount;
  const feeSettings = await getFeeSettings();
  const gstRate = Number(feeSettings.gstRate ?? 5) / 100; // Convert percentage to decimal
  return Math.round(taxableAmount * gstRate);
};

/**
 * Calculate discount based on coupon code
 */
export const calculateDiscount = (coupon, subtotal) => {
  if (!coupon) return 0;
  
  if (coupon.minOrder && subtotal < coupon.minOrder) {
    return 0; // Minimum order not met
  }
  
  if (coupon.type === 'percentage') {
    const maxDiscount = coupon.maxDiscount || Infinity;
    const discount = Math.min(
      Math.round(subtotal * (coupon.discount / 100)),
      maxDiscount
    );
    return discount;
  } else if (coupon.type === 'flat') {
    return Math.min(coupon.discount, subtotal); // Can't discount more than subtotal
  }
  
  // Default: flat discount
  return Math.min(coupon.discount || 0, subtotal);
};

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in kilometers
 */
export const calculateDistance = (coord1, coord2) => {
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;
  
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
};

const findMenuItemById = (menuSections = [], itemId) => {
  const normalizedItemId = String(itemId || '').trim();
  if (!normalizedItemId) return null;

  for (const section of menuSections) {
    for (const item of section?.items || []) {
      if (String(item?.id || '').trim() === normalizedItemId) {
        return item;
      }
    }

    for (const subsection of section?.subsections || []) {
      for (const item of subsection?.items || []) {
        if (String(item?.id || '').trim() === normalizedItemId) {
          return item;
        }
      }
    }
  }

  return null;
};

const findAddonById = (addons = [], itemId) => {
  const normalizedItemId = String(itemId || '').trim();
  if (!normalizedItemId) return null;
  return addons.find((addon) => String(addon?.id || '').trim() === normalizedItemId) || null;
};

const normalizeResolvedOrderItem = (sourceItem, clientItem, resolvedPrice) => {
  const authoritativePrice = Math.max(0, Number(resolvedPrice) || 0);
  const originalPrice = Math.max(
    authoritativePrice,
    Number(sourceItem?.originalPrice ?? authoritativePrice) || authoritativePrice
  );

  return {
    itemId: String(sourceItem?.id || clientItem?.itemId || '').trim(),
    name: sourceItem?.name || clientItem?.name || 'Item',
    price: authoritativePrice,
    originalPrice,
    discountAmount: Math.max(0, originalPrice - authoritativePrice),
    discountType: sourceItem?.discountAmount > 0 ? 'menu-offer' : (clientItem?.discountType || ''),
    quantity: Math.max(1, Number(clientItem?.quantity) || 1),
    image: sourceItem?.image || clientItem?.image || '',
    description: sourceItem?.description || clientItem?.description || '',
    isVeg: sourceItem?.foodType ? sourceItem.foodType === 'Veg' : clientItem?.isVeg !== false,
    preparationTime: sourceItem?.preparationTime || clientItem?.preparationTime || ''
  };
};

export const resolveOrderItems = async (items = [], restaurantId) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Order must have at least one item');
  }

  if (!restaurantId) {
    throw new Error('Restaurant ID is required to validate order items');
  }

  let restaurant = null;
  if (mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
    restaurant = await Restaurant.findById(restaurantId).select('_id').lean();
  }
  if (!restaurant) {
    restaurant = await Restaurant.findOne({
      $or: [
        { restaurantId: restaurantId },
        { slug: restaurantId }
      ]
    }).select('_id').lean();
  }

  if (!restaurant?._id) {
    throw new Error('Restaurant not found for order item validation');
  }

  const menu = await Menu.findOne({
    restaurant: restaurant._id,
    isActive: true
  })
    .select('sections addons')
    .lean();

  if (!menu) {
    throw new Error('Active menu not found for restaurant');
  }

  return items.map((clientItem) => {
    const itemId = String(clientItem?.itemId || '').trim();
    if (!itemId) {
      throw new Error('Each order item must include a valid itemId');
    }

    const menuItem = findMenuItemById(menu.sections, itemId);
    const addonItem = menuItem ? null : findAddonById(menu.addons, itemId);
    const sourceItem = menuItem || addonItem;

    if (!sourceItem) {
      throw new Error(`Item ${itemId} is not available for this restaurant`);
    }

    if (sourceItem.isAvailable === false) {
      throw new Error(`Item ${sourceItem.name} is currently unavailable`);
    }

    return normalizeResolvedOrderItem(sourceItem, clientItem, sourceItem.price);
  });
};

/**
 * Main function to calculate order pricing
 */
export const calculateOrderPricing = async ({
  items,
  restaurantId,
  deliveryAddress = null,
  couponCode = null,
  deliveryFleet = 'standard',
  tipAmount = 0
}) => {
  try {
    const resolvedItems = await resolveOrderItems(items, restaurantId);

    // Calculate subtotal from items
    const subtotal = resolvedItems.reduce((sum, item) => {
      return sum + (item.price || 0) * (item.quantity || 1);
    }, 0);
    
    if (subtotal <= 0) {
      throw new Error('Order subtotal must be greater than 0');
    }
    
    // Get restaurant details
    let restaurant = null;
    if (restaurantId) {
      if (mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
        restaurant = await Restaurant.findById(restaurantId).lean();
      }
      if (!restaurant) {
        restaurant = await Restaurant.findOne({
          $or: [
            { restaurantId: restaurantId },
            { slug: restaurantId }
          ]
        }).lean();
      }
    }
    
    // Calculate coupon discount
    let discount = 0;
    let appliedCoupon = null;
    let couponRejection = null;
    
    // Honour the platform offers kill switch here too, not just in the listing endpoints.
    // A customer holding a coupon code could otherwise still redeem it at checkout while
    // offers were supposedly paused.
    const offersCurrentlyEnabled = await areOffersEnabled();

    if (couponCode && restaurant && offersCurrentlyEnabled) {
      try {
        // Get restaurant ObjectId
        let restaurantObjectId = restaurant._id;
        if (!restaurantObjectId && mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
          restaurantObjectId = new mongoose.Types.ObjectId(restaurantId);
        }

        if (restaurantObjectId) {
          const now = new Date();
          
          // Find active offer with this coupon code for this restaurant
          const offer = await Offer.findOne({
            restaurant: restaurantObjectId,
            status: 'active',
            'items.couponCode': couponCode,
            startDate: { $lte: now }
          }).lean();

          if (offer) {
            const effectiveEndDate = getEffectiveOfferEndDate(offer.endDate);
            const isStillValid = !effectiveEndDate || effectiveEndDate >= now;
            if (!isStillValid) {
              // Treat date-only coupon expiry as end-of-day; otherwise ignore expired offers.
            } else {

              // Find all specific item coupons matching the code
              const couponItems = offer.items.filter(item => item.couponCode === couponCode);
              
              if (couponItems.length > 0) {
                const globalCouponItem = couponItems.find(item => 
                  item.itemId === 'all' ||
                  (typeof item.itemId === 'string' && item.itemId.startsWith('admin-coupon-')) ||
                  item.itemName === 'All Items'
                );

                const isGlobalCoupon = !!globalCouponItem;
                const couponItem = globalCouponItem || couponItems[0]; // Reference item for metadata

                // Check if coupon is valid for items in cart
                const cartItemIds = resolvedItems.map(item => item.itemId);
                const validCouponItemsInCart = isGlobalCoupon 
                  ? couponItems 
                  : couponItems.filter(item => cartItemIds.includes(item.itemId));

                const isValidForCart = isGlobalCoupon || validCouponItemsInCart.length > 0;
                
                // Check minimum order value
                const minOrderMet = !offer.minOrderValue || subtotal >= offer.minOrderValue;
                
                // Over the admin-set quantity limits the coupon is disabled, not trimmed.
                const quantityRejection = couponQuantityRejection(
                  isGlobalCoupon
                    ? resolvedItems
                    : resolvedItems.filter((item) => validCouponItemsInCart.some((c) => c.itemId === item.itemId)),
                  couponItemLimit(offer),
                  couponPerDishLimit(offer),
                );
                if (quantityRejection) couponRejection = { code: couponCode, reason: quantityRejection };

                if (isValidForCart && minOrderMet && !quantityRejection) {
                  if (isGlobalCoupon) {
                    // Global coupon applies on order subtotal
                    if (offer.discountType === 'percentage') {
                      // A percentage of the whole subtotal ignored any item limit, so the more
                      // items stacked into one order, the bigger the discount. Identical to
                      // before whenever the order is within the limit.
                      const rate = (couponItem.discountPercentage || 0) / 100;
                      discount = Math.round(capDiscountedUnits(
                        capPerDish(resolvedItems.map((item) => ({
                          unitDiscount: (item.price || 0) * rate,
                          quantity: item.quantity || 1,
                        })), couponPerDishLimit(offer)),
                        couponItemLimit(offer),
                      ));
                      if (Number.isFinite(offer.maxLimit) && offer.maxLimit > 0) {
                        discount = Math.min(discount, offer.maxLimit);
                      }
                    } else {
                      const flatDiscount = (couponItem.originalPrice || 0) - (couponItem.discountedPrice || 0);
                      discount = Math.round(flatDiscount);
                    }
                    discount = Math.min(Math.max(discount, 0), subtotal);
                  } else {
                    // Item-specific coupon: sum up discounts for all matching items in the cart
                    // One limit for the whole order. It used to apply per item line, so a
                    // coupon covering four different dishes still discounted the limit of
                    // each, and the twelve-item breakfast order went straight through. The
                    // customer can still order as many as they like; units beyond the
                    // limit are charged at full price.
                    const discountLines = [];
                    for (const cItem of validCouponItemsInCart) {
                      const itemInCart = resolvedItems.find(item => item.itemId === cItem.itemId);
                      if (!itemInCart) continue;
                      const unitPrice = itemInCart.price || 0;
                      const rawUnitDiscount = offer.discountType === 'percentage'
                        ? unitPrice * ((cItem.discountPercentage || 0) / 100)
                        : (cItem.originalPrice || 0) - (cItem.discountedPrice || 0);
                      discountLines.push({
                        // Never more off a unit than the unit costs.
                        unitDiscount: Math.min(Math.max(rawUnitDiscount, 0), unitPrice),
                        quantity: itemInCart.quantity || 1,
                      });
                    }
                    discount = Math.round(capDiscountedUnits(capPerDish(discountLines, couponPerDishLimit(offer)), couponItemLimit(offer)));

                    // Apply max limit on the total coupon discount if specified
                    if (offer.discountType === 'percentage' && Number.isFinite(offer.maxLimit) && offer.maxLimit > 0) {
                      discount = Math.min(discount, offer.maxLimit);
                    }
                  }
                  
                  appliedCoupon = {
                    code: couponCode,
                    discount: discount,
                    discountPercentage: couponItem.discountPercentage,
                    maxDiscount: offer.maxLimit ?? null,
                    maxItems: Number.isFinite(couponItemLimit(offer)) ? couponItemLimit(offer) : null,
                    maxPerDish: Number.isFinite(couponPerDishLimit(offer)) ? couponPerDishLimit(offer) : null,
                    minOrder: offer.minOrderValue || 0,
                    type: offer.discountType === 'percentage' ? 'percentage' : 'flat',
                    itemId: isGlobalCoupon ? 'all' : validCouponItemsInCart.map(item => item.itemId).join(','),
                    itemName: isGlobalCoupon ? 'All Items' : validCouponItemsInCart.map(item => item.itemName).join(','),
                    isGlobalCoupon,
                    originalPrice: couponItem.originalPrice,
                    discountedPrice: couponItem.discountedPrice,
                  };
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching coupon from database: ${error.message}`);
        // Continue without coupon if there's an error
      }
    }
    
    // Calculate delivery fee
    const deliveryFeeResult = await calculateDeliveryFee(
      subtotal,
      restaurant,
      deliveryAddress
    );
    const deliveryFee = Number(deliveryFeeResult?.fee ?? deliveryFeeResult ?? 0);
    
    // Apply free delivery from coupon
    const finalDeliveryFee = appliedCoupon?.freeDelivery ? 0 : deliveryFee;
    const deliveryFeeBreakdown = {
      ...(deliveryFeeResult?.breakdown || {}),
      originalFee: Math.round(deliveryFee),
      finalFee: Math.round(finalDeliveryFee),
      freeDeliveryApplied: Boolean(appliedCoupon?.freeDelivery)
    };
    
    // Calculate platform fee
    const platformFee = await calculatePlatformFee();
    
    // Calculate GST on subtotal after discount
    const gst = await calculateGST(subtotal, discount);

    const normalizedTipAmount = Math.max(0, Number(tipAmount) || 0);
    
    // "Spend X, get Y free".
    //
    // Resolved against the subtotal BEFORE any coupon discount: the customer earned it by
    // what they put in the basket, and a coupon should not silently take the free food
    // away again. Deliberately does not change the total - the reward is an item, not
    // money off - so it never interacts with GST, delivery or settlement maths.
    let freebie = null;
    try {
      if (restaurantId) {
        let freebieRestaurantId = null;
        if (mongoose.Types.ObjectId.isValid(restaurantId) && String(restaurantId).length === 24) {
          freebieRestaurantId = new mongoose.Types.ObjectId(String(restaurantId));
        }
        if (freebieRestaurantId) {
          const freebieOffer = await FreebieOffer.findOne({ restaurant: freebieRestaurantId });
          const tier = freebieOffer ? freebieOffer.resolveTierFor(subtotal) : null;
          const next = freebieOffer ? freebieOffer.nextTierAfter(subtotal) : null;

          if (tier) {
            freebie = {
              earned: true,
              tierId: String(tier._id),
              minOrderValue: Number(tier.minOrderValue),
              rewardType: tier.rewardType,
              rewardId: tier.rewardId,
              rewardName: tier.rewardName,
              rewardImage: tier.rewardImage || '',
              rewardIsVeg: typeof tier.rewardIsVeg === 'boolean' ? tier.rewardIsVeg : null,
              rewardValue: Number(tier.rewardValue) || 0,
            };
          } else if (next) {
            // Not earned yet - tell the cart how close they are so it can nudge.
            freebie = {
              earned: false,
              minOrderValue: Number(next.minOrderValue),
              amountAway: Math.max(0, Math.round(Number(next.minOrderValue) - subtotal)),
              rewardName: next.rewardName,
              rewardImage: next.rewardImage || '',
              rewardIsVeg: typeof next.rewardIsVeg === 'boolean' ? next.rewardIsVeg : null,
            };
          }
        }
      }
    } catch (freebieError) {
      // A broken freebie config must never block an order being priced.
      console.error('[freebie] Could not resolve threshold reward:', freebieError?.message);
    }

    // Calculate total
    const total = subtotal - discount + finalDeliveryFee + platformFee + gst + normalizedTipAmount;
    
    // Calculate savings (discount + any delivery savings)
    const savings = discount + (deliveryFee > finalDeliveryFee ? deliveryFee - finalDeliveryFee : 0);
    
    return {
      subtotal: Math.round(subtotal),
      discount: Math.round(discount),
      deliveryFee: Math.round(finalDeliveryFee),
      platformFee: Math.round(platformFee),
      tax: gst, // Already rounded in calculateGST
      tip: Math.round(normalizedTipAmount),
      total: Math.round(total),
      savings: Math.round(savings),
      appliedCoupon: appliedCoupon ? {
        code: appliedCoupon.code,
        discount: discount,
        freeDelivery: appliedCoupon.freeDelivery || false,
        minOrder: appliedCoupon.minOrder || 0,
        // The cart uses this to explain why a big order got a smaller saving than the
        // coupon's percentage suggests. It was computed above and dropped here.
        maxItems: appliedCoupon.maxItems ?? null,
        maxPerDish: appliedCoupon.maxPerDish ?? null
      } : null,
      // Set when a coupon was refused for exceeding its quantity limits; the cart shows it.
      couponRejection,
      deliveryFeeBreakdown,
      // Null when the restaurant runs no scheme. earned:false carries the nudge.
      freebie,
      items: resolvedItems,
      breakdown: {
        itemTotal: Math.round(subtotal),
        discountAmount: Math.round(discount),
        deliveryFee: Math.round(finalDeliveryFee),
        platformFee: Math.round(platformFee),
        gst: gst,
        tip: Math.round(normalizedTipAmount),
        total: Math.round(total)
      }
    };
  } catch (error) {
    throw new Error(`Failed to calculate order pricing: ${error.message}`);
  }
};


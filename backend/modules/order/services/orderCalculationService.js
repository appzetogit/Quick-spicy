import Restaurant from '../../restaurant/models/Restaurant.js';
import Offer from '../../restaurant/models/Offer.js';
import FeeSettings from '../../admin/models/FeeSettings.js';
import Menu from '../../restaurant/models/Menu.js';
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
    const distanceKm = Math.max(0, calculateDistance(restaurantCoordinates, deliveryCoordinates));
    const extraDistanceKm = Math.max(0, distanceKm - baseDistanceKm);
    const additionalFee = extraDistanceKm * additionalFeePerKm;
    const totalFee = baseDeliveryFee + additionalFee;

    return {
      fee: round2(totalFee),
      breakdown: {
        source: 'distance',
        distanceKm: round2(distanceKm),
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
    
    if (couponCode && restaurant) {
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

              // Find the specific item coupon
              const couponItem = offer.items.find(item => item.couponCode === couponCode);
              
              if (couponItem) {
                // Check if coupon is valid for items in cart
                const cartItemIds = resolvedItems.map(item => item.itemId);
                const isGlobalCoupon =
                  couponItem.itemId === 'all' ||
                  (typeof couponItem.itemId === 'string' && couponItem.itemId.startsWith('admin-coupon-')) ||
                  couponItem.itemName === 'All Items';
                const isValidForCart = isGlobalCoupon || (couponItem.itemId && cartItemIds.includes(couponItem.itemId));
                
                // Check minimum order value
                const minOrderMet = !offer.minOrderValue || subtotal >= offer.minOrderValue;
                
                if (isValidForCart && minOrderMet) {
                  if (isGlobalCoupon) {
                    // Global coupon applies on order subtotal
                    if (offer.discountType === 'percentage') {
                      discount = Math.round(subtotal * ((couponItem.discountPercentage || 0) / 100));
                      if (Number.isFinite(offer.maxLimit) && offer.maxLimit > 0) {
                        discount = Math.min(discount, offer.maxLimit);
                      }
                    } else {
                      const flatDiscount = (couponItem.originalPrice || 0) - (couponItem.discountedPrice || 0);
                      discount = Math.round(flatDiscount);
                    }
                    discount = Math.min(Math.max(discount, 0), subtotal);
                  } else {
                    // Item-specific coupon applies only on matching item
                    const itemInCart = resolvedItems.find(item => item.itemId === couponItem.itemId);
                    if (itemInCart) {
                      const itemQuantity = itemInCart.quantity || 1;
                      
                      // Calculate discount per item
                      const discountPerItem = couponItem.originalPrice - couponItem.discountedPrice;
                      
                      // Apply discount to all quantities of this item
                      discount = Math.round(discountPerItem * itemQuantity);
                      
                      // Ensure discount doesn't exceed item subtotal
                      const itemSubtotal = (itemInCart.price || 0) * itemQuantity;
                      discount = Math.min(discount, itemSubtotal);
                    }
                  }

                  appliedCoupon = {
                    code: couponCode,
                    discount: discount,
                    discountPercentage: couponItem.discountPercentage,
                    maxDiscount: offer.maxLimit ?? null,
                    minOrder: offer.minOrderValue || 0,
                    type: offer.discountType === 'percentage' ? 'percentage' : 'flat',
                    itemId: couponItem.itemId,
                    itemName: couponItem.itemName,
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
        minOrder: appliedCoupon.minOrder || 0
      } : null,
      deliveryFeeBreakdown,
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


import Offer from '../models/Offer.js';
import Restaurant from '../models/Restaurant.js';
import mongoose from 'mongoose';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

// Create/Activate offer
export const createOffer = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  
  const {
    goalId,
    discountType,
    items = [],
    customerGroup = 'all',
    offerPreference = 'all',
    offerDays = 'all',
    startDate,
    endDate,
    targetMealtime = 'all',
    minOrderValue = 0,
    maxLimit = null,
    discountCards = [],
    priceCards = [],
    discountConstruct = '',
    freebieItems = [],
  } = req.body;

  // Validate required fields
  if (!goalId || !discountType) {
    return errorResponse(res, 400, 'goalId and discountType are required');
  }

  // For percentage discounts, items are required
  if (discountType === 'percentage' && (!items || items.length === 0)) {
    return errorResponse(res, 400, 'At least one item is required for percentage discount');
  }

  // Validate each item has required fields
  if (items.length > 0) {
    for (const item of items) {
      if (!item.itemId || !item.itemName || item.originalPrice === undefined || 
          item.discountPercentage === undefined || !item.couponCode) {
        return errorResponse(res, 400, 'Each item must have itemId, itemName, originalPrice, discountPercentage, and couponCode');
      }
    }
  }

  // Create offer
  const offerData = {
    restaurant: restaurantId,
    goalId,
    discountType,
    items,
    customerGroup,
    offerPreference,
    offerDays,
    targetMealtime,
    minOrderValue,
    maxLimit,
    discountCards,
    priceCards,
    discountConstruct,
    freebieItems,
    status: 'active', // Automatically activate
    startDate: startDate ? new Date(startDate) : new Date(),
    endDate: endDate ? new Date(endDate) : null,
  };

  const offer = await Offer.create(offerData);

  return successResponse(res, 201, 'Offer created and activated successfully', {
    offer,
  });
});

// Get all offers for restaurant
export const getOffers = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { status, goalId, discountType } = req.query;

  const query = { restaurant: restaurantId };
  
  if (status) {
    query.status = status;
  }
  
  if (goalId) {
    query.goalId = goalId;
  }
  
  if (discountType) {
    query.discountType = discountType;
  }

  const offers = await Offer.find(query)
    .sort({ createdAt: -1 })
    .lean();

  return successResponse(res, 200, 'Offers retrieved successfully', {
    offers,
    total: offers.length,
  });
});

// Get offer by ID
export const getOfferById = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { id } = req.params;

  const offer = await Offer.findOne({
    _id: id,
    restaurant: restaurantId,
  }).lean();

  if (!offer) {
    return errorResponse(res, 404, 'Offer not found');
  }

  return successResponse(res, 200, 'Offer retrieved successfully', {
    offer,
  });
});

// Update offer status (activate, pause, cancel)
export const updateOfferStatus = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['active', 'paused', 'cancelled'].includes(status)) {
    return errorResponse(res, 400, 'Valid status (active, paused, cancelled) is required');
  }

  const offer = await Offer.findOneAndUpdate(
    {
      _id: id,
      restaurant: restaurantId,
    },
    { status },
    { new: true }
  );

  if (!offer) {
    return errorResponse(res, 404, 'Offer not found');
  }

  return successResponse(res, 200, `Offer ${status} successfully`, {
    offer,
  });
});

// Delete offer
export const deleteOffer = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { id } = req.params;

  const offer = await Offer.findOneAndDelete({
    _id: id,
    restaurant: restaurantId,
  });

  if (!offer) {
    return errorResponse(res, 404, 'Offer not found');
  }

  return successResponse(res, 200, 'Offer deleted successfully');
});

// Get coupons for a specific item/dish
export const getCouponsByItemId = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { itemId } = req.params;

  console.log(`[COUPONS] Request received for itemId: ${itemId}, restaurantId: ${restaurantId}`);

  if (!itemId) {
    return errorResponse(res, 400, 'Item ID is required');
  }

  const now = new Date();
  console.log(`[COUPONS] Current date: ${now.toISOString()}`);

  // Debug: Check all offers for this restaurant
  const allRestaurantOffers = await Offer.find({
    restaurant: restaurantId,
    status: 'active',
  })
    .select('items discountType minOrderValue startDate endDate status')
    .lean();
  
  console.log(`[COUPONS] Total active offers for restaurant: ${allRestaurantOffers.length}`);
  allRestaurantOffers.forEach(offer => {
    console.log(`[COUPONS] Offer ${offer._id} has ${offer.items?.length || 0} items`);
    offer.items?.forEach((item, idx) => {
      console.log(`[COUPONS]   Item ${idx}: itemId=${item.itemId}, couponCode=${item.couponCode}`);
    });
  });

  // Find all active offers that include this item OR are global coupons
  const allOffers = await Offer.find({
    restaurant: restaurantId,
    status: 'active',
    items: {
      $elemMatch: {
        $or: [
          { itemId },
          { itemId: 'all' },
          { itemId: { $regex: /^admin-coupon-/ } },
        ],
      },
    },
  })
    .select('items discountType minOrderValue startDate endDate status customerGroup')
    .lean();

  console.log(`[COUPONS] Found ${allOffers.length} active offers with itemId ${itemId}`);

  // Filter by date validity
  const validOffers = allOffers.filter(offer => {
    const startDate = offer.startDate ? new Date(offer.startDate) : null;
    const endDate = offer.endDate ? new Date(offer.endDate) : null;
    
    // Start date should be <= now (or null)
    const startValid = !startDate || startDate <= now;
    
    // End date should be >= now (or null)
    // Add 1 day buffer to include offers that end today
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const endValid = !endDate || endDate >= endOfToday;
    
    console.log(`[COUPONS] Offer ${offer._id}:`);
    console.log(`  startDate: ${startDate?.toISOString()}, now: ${now.toISOString()}, startValid: ${startValid}`);
    console.log(`  endDate: ${endDate?.toISOString()}, endOfToday: ${endOfToday.toISOString()}, endValid: ${endValid}`);
    
    return startValid && endValid;
  });

  console.log(`[COUPONS] Found ${validOffers.length} valid offers after date filtering`);

  // Extract coupons for this specific item (including global coupons)
  const coupons = [];
  validOffers.forEach(offer => {
    console.log(`[COUPONS] Processing offer ${offer._id} with ${offer.items?.length || 0} items`);
    offer.items.forEach((item, idx) => {
      const isGlobalCoupon =
        item.itemId === 'all' ||
        (typeof item.itemId === 'string' && item.itemId.startsWith('admin-coupon-')) ||
        item.itemName === 'All Items';
      const isItemMatch = item.itemId === itemId;
      console.log(`[COUPONS]   Item ${idx}: itemId="${item.itemId}", searching for="${itemId}", match=${isItemMatch || isGlobalCoupon}`);
      if (isItemMatch || isGlobalCoupon) {
        const coupon = {
          couponCode: item.couponCode,
          discountPercentage: item.discountPercentage,
          originalPrice: item.originalPrice,
          discountedPrice: item.discountedPrice,
          minOrderValue: offer.minOrderValue || 0,
          discountType: offer.discountType,
          customerGroup: offer.customerGroup || 'all',
          isGlobalCoupon,
          startDate: offer.startDate,
          endDate: offer.endDate,
        };
        console.log(`[COUPONS]   ✅ Adding coupon:`, coupon);
        coupons.push(coupon);
      }
    });
  });

  console.log(`[COUPONS] ✅ Returning ${coupons.length} coupons for itemId ${itemId}`);
  console.log(`[COUPONS] Coupons array:`, JSON.stringify(coupons, null, 2));

  return successResponse(res, 200, 'Coupons retrieved successfully', {
    coupons,
    total: coupons.length,
  });
});

// Get coupons for a specific item/dish (PUBLIC - for user cart)
export const getCouponsByItemIdPublic = asyncHandler(async (req, res) => {
  const { itemId, restaurantId } = req.params;

  console.log(`[COUPONS-PUBLIC] Request received for itemId: ${itemId}, restaurantId: ${restaurantId}`);

  if (!itemId || !restaurantId) {
    return errorResponse(res, 400, 'Item ID and Restaurant ID are required');
  }

  const now = new Date();
  console.log(`[COUPONS-PUBLIC] Current date: ${now.toISOString()}`);

  // Find restaurant by ID, slug, or restaurantId to get the actual MongoDB _id
  let restaurantObjectId = null;
  
  // Try to find restaurant first
  try {
    const restaurantQuery = {};
    
    // Check if restaurantId is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
      restaurantQuery._id = new mongoose.Types.ObjectId(restaurantId);
    } else {
      // Try restaurantId field or slug
      restaurantQuery.$or = [
        { restaurantId: restaurantId },
        { slug: restaurantId },
      ];
    }

    const restaurant = await Restaurant.findOne(restaurantQuery).select('_id').lean();

    if (restaurant) {
      restaurantObjectId = restaurant._id;
      console.log(`[COUPONS-PUBLIC] Found restaurant with _id: ${restaurantObjectId}`);
    } else {
      console.log(`[COUPONS-PUBLIC] Restaurant not found for ID: ${restaurantId}`);
      return successResponse(res, 200, 'No coupons found', {
        coupons: [],
        total: 0,
      });
    }
  } catch (error) {
    console.error(`[COUPONS-PUBLIC] Error finding restaurant:`, error);
    return errorResponse(res, 500, `Error finding restaurant: ${error.message}`);
  }

  // Find all active offers that include this item OR are global coupons for this restaurant
  const allOffers = await Offer.find({
    restaurant: restaurantObjectId,
    status: 'active',
    items: {
      $elemMatch: {
        $or: [
          { itemId },
          { itemId: 'all' },
          { itemId: { $regex: /^admin-coupon-/ } },
        ],
      },
    },
  })
    .select('items discountType minOrderValue startDate endDate status customerGroup')
    .lean();

  console.log(`[COUPONS-PUBLIC] Found ${allOffers.length} active offers with itemId ${itemId} for restaurant ${restaurantId}`);

  // Filter by date validity
  const validOffers = allOffers.filter(offer => {
    const startDate = offer.startDate ? new Date(offer.startDate) : null;
    const endDate = offer.endDate ? new Date(offer.endDate) : null;
    
    const startValid = !startDate || startDate <= now;
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const endValid = !endDate || endDate >= endOfToday;
    
    return startValid && endValid;
  });

  console.log(`[COUPONS-PUBLIC] Found ${validOffers.length} valid offers after date filtering`);

  // Extract coupons for this specific item (including global coupons)
  const coupons = [];
  validOffers.forEach(offer => {
    offer.items.forEach(item => {
      const isGlobalCoupon =
        item.itemId === 'all' ||
        (typeof item.itemId === 'string' && item.itemId.startsWith('admin-coupon-')) ||
        item.itemName === 'All Items';
      const isItemMatch = item.itemId === itemId;
      if (isItemMatch || isGlobalCoupon) {
        coupons.push({
          couponCode: item.couponCode,
          discountPercentage: item.discountPercentage,
          originalPrice: item.originalPrice,
          discountedPrice: item.discountedPrice,
          minOrderValue: offer.minOrderValue || 0,
          discountType: offer.discountType,
          customerGroup: offer.customerGroup || 'all',
          isGlobalCoupon,
          startDate: offer.startDate,
          endDate: offer.endDate,
        });
      }
    });
  });

  console.log(`[COUPONS-PUBLIC] Returning ${coupons.length} coupons for itemId ${itemId}`);

  return successResponse(res, 200, 'Coupons retrieved successfully', {
    coupons,
    total: coupons.length,
  });
});

// Get all active offers with restaurant and dish details (PUBLIC - for user offers page)
export const getPublicOffers = asyncHandler(async (req, res) => {
  try {
    console.log('[PUBLIC-OFFERS] Request received');
    const now = new Date();
    
    // Find all active offers
    const offers = await Offer.find({
      status: 'active',
    })
      .populate('restaurant', 'name restaurantId slug profileImage rating estimatedDeliveryTime distance')
      .sort({ createdAt: -1 })
      .lean();
    
    console.log(`[PUBLIC-OFFERS] Found ${offers.length} active offers`);

    // Filter by date validity and flatten to show dishes with offers
    const offerDishes = [];
    
    offers.forEach((offer) => {
      // Check if offer is valid (date-wise)
      const startDate = offer.startDate ? new Date(offer.startDate) : null;
      const endDate = offer.endDate ? new Date(offer.endDate) : null;
      
      const startValid = !startDate || startDate <= now;
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);
      const endValid = !endDate || endDate >= endOfToday;
      
      if (!startValid || !endValid) {
        return; // Skip expired or not yet started offers
      }

      // Skip if restaurant is not found or not active
      if (!offer.restaurant || !offer.restaurant.name) {
        return;
      }

      // Process each item in the offer
      if (offer.items && offer.items.length > 0) {
        offer.items.forEach((item) => {
          // Format offer text based on discount type
          let offerText = '';
          if (offer.discountType === 'percentage') {
            offerText = `Flat ${item.discountPercentage}% OFF`;
          } else if (offer.discountType === 'flat-price') {
            const discountAmount = item.originalPrice - item.discountedPrice;
            offerText = `Flat ₹${Math.round(discountAmount)} OFF`;
          } else if (offer.discountType === 'bogo') {
            offerText = 'Buy 1 Get 1 Free';
          } else {
            offerText = 'Special Offer';
          }

          offerDishes.push({
            id: `${offer._id}_${item.itemId}`,
            restaurantId: offer.restaurant._id.toString(),
            restaurantName: offer.restaurant.name,
            restaurantSlug: offer.restaurant.slug || offer.restaurant.name.toLowerCase().replace(/\s+/g, '-'),
            restaurantImage: offer.restaurant.profileImage?.url || '',
            restaurantRating: offer.restaurant.rating || 0,
            deliveryTime: offer.restaurant.estimatedDeliveryTime || '25-30 mins',
            distance: offer.restaurant.distance || '1.2 km',
            dishId: item.itemId,
            dishName: item.itemName,
            dishImage: item.image || '',
            originalPrice: item.originalPrice,
            discountedPrice: item.discountedPrice,
            discountPercentage: item.discountPercentage,
            offer: offerText,
            couponCode: item.couponCode,
            isVeg: item.isVeg || false,
            minOrderValue: offer.minOrderValue || 0,
          });
        });
      }
    });

    // Group by offer text for the "FLAT 50% OFF" section
    const groupedByOffer = {};
    offerDishes.forEach((dish) => {
      if (!groupedByOffer[dish.offer]) {
        groupedByOffer[dish.offer] = [];
      }
      groupedByOffer[dish.offer].push(dish);
    });

    console.log(`[PUBLIC-OFFERS] Returning ${offerDishes.length} offer dishes`);
    
    return successResponse(res, 200, 'Offers retrieved successfully', {
      allOffers: offerDishes,
      groupedByOffer,
      total: offerDishes.length,
    });
  } catch (error) {
    console.error('[PUBLIC-OFFERS] Error fetching public offers:', error);
    console.error('[PUBLIC-OFFERS] Error stack:', error.stack);
    return errorResponse(res, 500, error.message || 'Failed to fetch offers');
  }
});


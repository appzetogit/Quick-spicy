import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Delivery from '../models/Delivery.js';
import Order from '../../order/models/Order.js';
import Payment from '../../payment/models/Payment.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import DeliveryWallet from '../models/DeliveryWallet.js';
import DeliveryBoyCommission from '../../admin/models/DeliveryBoyCommission.js';
import RestaurantWallet from '../../restaurant/models/RestaurantWallet.js';
import RestaurantCommission from '../../admin/models/RestaurantCommission.js';
import AdminCommission from '../../admin/models/AdminCommission.js';
import { calculateRoute } from '../../order/services/routeCalculationService.js';
import mongoose from 'mongoose';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Get Delivery Partner Orders
 * GET /api/delivery/orders
 * Query params: status, page, limit
 */
export const getOrders = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { status, page = 1, limit = 20, includeDelivered, discover } = req.query;

    // Build query
    const isDiscoverMode = discover === 'true' || discover === true;
    const query = isDiscoverMode
      ? {
          $or: [
            { deliveryPartnerId: delivery._id },
            { deliveryPartnerId: null, status: { $in: ['preparing', 'ready'] } },
            { deliveryPartnerId: { $exists: false }, status: { $in: ['preparing', 'ready'] } },
          ],
        }
      : { deliveryPartnerId: delivery._id };

    if (status) {
      query.status = status;
    } else {
      // By default, exclude delivered and cancelled orders unless explicitly requested
      if (includeDelivered !== 'true' && includeDelivered !== true) {
        query.status = { $nin: ['delivered', 'cancelled'] };
        // Also exclude orders with completed delivery phase
        query.$or = [
          { 'deliveryState.currentPhase': { $ne: 'completed' } },
          { 'deliveryState.currentPhase': { $exists: false } }
        ];
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch orders
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('restaurantId', 'name slug profileImage address location phone ownerPhone')
      .populate('userId', 'name phone')
      .lean();

    // Get total count
    const total = await Order.countDocuments(query);

    return successResponse(res, 200, 'Orders retrieved successfully', {
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching delivery orders: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch orders');
  }
});

/**
 * Get Single Order Details
 * GET /api/delivery/orders/:orderId
 */
export const getOrderDetails = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { orderId } = req.params;

    // Build query to find order by either _id or orderId field
    // Allow access if order is assigned to this delivery partner OR if they were notified about it
    let query = {};

    // Check if orderId is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
      query._id = orderId;
    } else {
      // If not a valid ObjectId, search by orderId field
      query.orderId = orderId;
    }

    // First, try to find order (without deliveryPartnerId filter)
    let order = await Order.findOne(query)
      .populate('restaurantId', 'name slug profileImage address phone ownerPhone location')
      .populate('userId', 'name phone email')
      .lean();

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    // Check if order is assigned to this delivery partner OR if they were notified
    const orderDeliveryPartnerId = order.deliveryPartnerId?.toString();
    const currentDeliveryId = delivery._id.toString();
    
    // Helper function to normalize ID for comparison (handles ObjectId, string, etc.)
    const normalizeId = (id) => {
      if (!id) return null;
      if (typeof id === 'string') return id;
      if (id.toString) return id.toString();
      return String(id);
    };
    
    // Valid statuses for order acceptance (unassigned orders in these statuses can be viewed by any delivery boy)
    const validAcceptanceStatuses = ['preparing', 'ready'];
    
    // If order is assigned to this delivery partner, allow access
    if (orderDeliveryPartnerId === currentDeliveryId) {
      // Order is assigned, proceed
      console.log(`✅ Order ${order.orderId} is assigned to current delivery partner ${currentDeliveryId}`);
    } else if (!orderDeliveryPartnerId) {
      // Order not assigned yet - allow access if:
      // 1. Order is in a valid status for acceptance (preparing/ready), OR
      // 2. This delivery boy was notified about it
      
      const isInValidStatus = validAcceptanceStatuses.includes(order.status);
      
      // Check if this delivery boy was notified
      const assignmentInfo = order.assignmentInfo || {};
      const priorityIds = assignmentInfo.priorityDeliveryPartnerIds || [];
      const expandedIds = assignmentInfo.expandedDeliveryPartnerIds || [];
      
      // Normalize all IDs to strings for comparison
      const normalizedCurrentId = normalizeId(currentDeliveryId);
      const normalizedPriorityIds = priorityIds.map(normalizeId).filter(Boolean);
      const normalizedExpandedIds = expandedIds.map(normalizeId).filter(Boolean);
      
      const wasNotified = normalizedPriorityIds.includes(normalizedCurrentId) || 
                         normalizedExpandedIds.includes(normalizedCurrentId);
      
      console.log(`🔍 Checking access for order ${order.orderId}:`, {
        currentDeliveryId: normalizedCurrentId,
        orderStatus: order.status,
        isInValidStatus,
        wasNotified,
        priorityIds: normalizedPriorityIds,
        expandedIds: normalizedExpandedIds
      });
      
      // Allow access if order is in valid status OR delivery boy was notified
      if (isInValidStatus || wasNotified) {
        console.log(`✅ Allowing access to order ${order.orderId} - Status: ${order.status}, Notified: ${wasNotified}`);
        // Allow access to view order details
      } else {
        console.warn(`⚠️ Delivery partner ${currentDeliveryId} cannot access order ${order.orderId} - Status: ${order.status}, Notified: ${wasNotified}`);
        return errorResponse(res, 403, 'Order not found or not available for you');
      }
    } else {
      // Order is assigned to another delivery partner
      console.warn(`⚠️ Order ${order.orderId} is assigned to ${orderDeliveryPartnerId}, but current delivery partner is ${currentDeliveryId}`);
      return errorResponse(res, 403, 'Order not found or not available for you');
    }

    // Resolve payment method for delivery boy (COD vs Online)
    let paymentMethod = order.payment?.method || 'razorpay';
    if (paymentMethod !== 'cash') {
      try {
        const paymentRecord = await Payment.findOne({ orderId: order._id }).select('method').lean();
        if (paymentRecord?.method === 'cash') paymentMethod = 'cash';
      } catch (e) { /* ignore */ }
    }
    const orderWithPayment = { ...order, paymentMethod };

    return successResponse(res, 200, 'Order details retrieved successfully', {
      order: orderWithPayment
    });
  } catch (error) {
    logger.error(`Error fetching order details: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch order details');
  }
});

/**
 * Accept Order (Delivery Boy accepts the assigned order)
 * PATCH /api/delivery/orders/:orderId/accept
 */
export const acceptOrder = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { orderId } = req.params;
    const { currentLat, currentLng } = req.body; // Delivery boy's current location

    // Validate orderId
    if (!orderId || (typeof orderId !== 'string' && typeof orderId !== 'object')) {
      console.error(`❌ Invalid orderId provided: ${orderId}`);
      return errorResponse(res, 400, 'Invalid order ID');
    }

    console.log(`📦 Delivery partner ${delivery._id} attempting to accept order ${orderId}`);
    console.log(`📍 Location provided: lat=${currentLat}, lng=${currentLng}`);

    // Find order - try both by _id and orderId
    // First check if order exists (without deliveryPartnerId filter)
    let order = await Order.findOne({
      $or: [
        { _id: orderId },
        { orderId: orderId }
      ]
    })
      .populate('restaurantId', 'name location address phone ownerPhone')
      .populate('userId', 'name phone')
      .lean();

    if (!order) {
      console.error(`❌ Order ${orderId} not found in database`);
      return errorResponse(res, 404, 'Order not found');
    }

    // Check if order is assigned to this delivery partner
    const orderDeliveryPartnerId = order.deliveryPartnerId?.toString();
    const currentDeliveryId = delivery._id.toString();

    // If order is not assigned, check if this delivery boy was notified (priority-based system)
    // Also allow acceptance if order is in valid status (preparing/ready) - more permissive
    if (!orderDeliveryPartnerId) {
      console.log(`ℹ️ Order ${order.orderId} is not assigned yet. Checking if this delivery partner was notified...`);
      
      // Check if this delivery boy was in the priority or expanded notification list
      const assignmentInfo = order.assignmentInfo || {};
      const priorityIds = assignmentInfo.priorityDeliveryPartnerIds || [];
      const expandedIds = assignmentInfo.expandedDeliveryPartnerIds || [];
      
      // Helper function to normalize ID for comparison
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (id.toString) return id.toString();
        return String(id);
      };
      
      // Normalize all IDs to strings for comparison
      const normalizedCurrentId = normalizeId(currentDeliveryId);
      const normalizedPriorityIds = priorityIds.map(normalizeId).filter(Boolean);
      const normalizedExpandedIds = expandedIds.map(normalizeId).filter(Boolean);
      
      console.log(`🔍 Checking notification status for order acceptance:`, {
        currentDeliveryId: normalizedCurrentId,
        priorityIds: normalizedPriorityIds,
        expandedIds: normalizedExpandedIds,
        orderStatus: order.status,
        assignmentInfo: JSON.stringify(assignmentInfo)
      });
      
      const wasNotified = normalizedPriorityIds.includes(normalizedCurrentId) || 
                         normalizedExpandedIds.includes(normalizedCurrentId);
      
      // Also allow if order is in valid status (preparing/ready) - more permissive for unassigned orders
      const isValidStatus = order.status === 'preparing' || order.status === 'ready';
      
      if (!wasNotified && !isValidStatus) {
        console.error(`❌ Order ${order.orderId} is not assigned, delivery partner ${currentDeliveryId} was not notified, and order status is ${order.status}`);
        console.error(`❌ Full order details:`, {
          orderId: order.orderId,
          orderStatus: order.status,
          deliveryPartnerId: order.deliveryPartnerId,
          assignmentInfo: JSON.stringify(order.assignmentInfo),
          priorityIds: normalizedPriorityIds,
          expandedIds: normalizedExpandedIds,
          currentDeliveryId: normalizedCurrentId
        });
        return errorResponse(res, 403, 'This order is not available for you. It may have been assigned to another delivery partner or you were not notified about it.');
      }
      
      // Allow acceptance if delivery boy was notified OR order is in valid status
      if (wasNotified) {
        console.log(`✅ Delivery partner ${currentDeliveryId} was notified about this order. Assigning order to them...`);
      } else if (isValidStatus) {
        console.log(`⚠️ Order ${order.orderId} is not assigned and delivery partner ${currentDeliveryId} was not notified, but order is in valid status (${order.status}). Allowing acceptance and assigning order.`);
      }
      
      // Proceed with assignment (first come first serve)
      
      // Reload order as document (not lean) to update it
      let orderDoc;
      try {
        orderDoc = await Order.findOne({
          $or: [
            { _id: orderId },
            { orderId: orderId }
          ]
        });
        
        if (!orderDoc) {
          console.error(`❌ Order document not found for ID: ${orderId}`);
          return errorResponse(res, 404, 'Order not found');
        }
      } catch (findError) {
        console.error(`❌ Error finding order document: ${findError.message}`);
        console.error(`❌ Error stack: ${findError.stack}`);
        return errorResponse(res, 500, 'Error finding order. Please try again.');
      }
      
      // Check again if order was assigned in the meantime (race condition)
      if (orderDoc.deliveryPartnerId) {
        const assignedId = orderDoc.deliveryPartnerId.toString();
        if (assignedId !== currentDeliveryId) {
          console.error(`❌ Order ${order.orderId} was just assigned to another delivery partner ${assignedId}`);
          return errorResponse(res, 403, 'Order was just assigned to another delivery partner. Please try another order.');
        }
      }
      
      // Assign order to this delivery partner
      try {
        orderDoc.deliveryPartnerId = delivery._id;
        orderDoc.assignmentInfo = {
          ...(orderDoc.assignmentInfo || {}),
          deliveryPartnerId: currentDeliveryId,
          assignedAt: new Date(),
          assignedBy: 'delivery_accept',
          acceptedFromNotification: true
        };
        await orderDoc.save();
        console.log(`✅ Order ${order.orderId} assigned to delivery partner ${currentDeliveryId} upon acceptance`);
      } catch (saveError) {
        console.error(`❌ Error saving order assignment: ${saveError.message}`);
        console.error(`❌ Error stack: ${saveError.stack}`);
        // Log validation errors if present
        if (saveError.errors) {
          console.error(`❌ Validation errors:`, JSON.stringify(saveError.errors, null, 2));
        }
        if (saveError.name === 'ValidationError') {
          const validationMessages = Object.values(saveError.errors || {}).map(err => err.message).join(', ');
          return errorResponse(res, 400, `Validation error: ${validationMessages || saveError.message}`);
        }
        return errorResponse(res, 500, 'Failed to assign order. Please try again.');
      }
      
      // Reload order with populated data (use orderDoc._id to ensure we get the updated order)
      const updatedOrderId = orderDoc._id || orderId;
      try {
        order = await Order.findOne({
          $or: [
            { _id: updatedOrderId },
            { orderId: orderId }
          ]
        })
          .populate('restaurantId', 'name location address phone ownerPhone')
          .populate('userId', 'name phone')
          .lean();
        
        if (!order) {
          console.error(`❌ Order not found after assignment: ${updatedOrderId}`);
          return errorResponse(res, 500, 'Order not found after assignment. Please try again.');
        }
      } catch (reloadError) {
        console.error(`❌ Error reloading order after assignment: ${reloadError.message}`);
        console.error(`❌ Error stack: ${reloadError.stack}`);
        return errorResponse(res, 500, 'Error reloading order. Please try again.');
      }
      
      // Update orderDeliveryPartnerId after assignment
      const updatedOrderDeliveryPartnerId = order.deliveryPartnerId?.toString();
      if (updatedOrderDeliveryPartnerId !== currentDeliveryId) {
        console.error(`❌ Order assignment failed - order still not assigned to ${currentDeliveryId}, got ${updatedOrderDeliveryPartnerId}`);
        return errorResponse(res, 500, 'Failed to assign order. Please try again.');
      }
    } else if (orderDeliveryPartnerId !== currentDeliveryId) {
      console.error(`❌ Order ${order.orderId} is assigned to ${orderDeliveryPartnerId}, but current delivery partner is ${currentDeliveryId}`);
      return errorResponse(res, 403, 'Order is assigned to another delivery partner');
    } else {
      console.log(`✅ Order ${order.orderId} is already assigned to current delivery partner`);
    }

    console.log(`✅ Order found: ${order.orderId}, Status: ${order.status}, Delivery Partner: ${order.deliveryPartnerId}`);
    console.log(`📍 Order details:`, {
      orderId: order.orderId,
      status: order.status,
      restaurantId: order.restaurantId?._id || order.restaurantId,
      hasRestaurantLocation: !!(order.restaurantId?.location?.coordinates),
      restaurantLocationType: typeof order.restaurantId?.location
    });

    // Check if order is in valid state to accept
    const validStatuses = ['preparing', 'ready'];
    if (!validStatuses.includes(order.status)) {
      console.warn(`⚠️ Order ${order.orderId} cannot be accepted. Current status: ${order.status}, Valid statuses: ${validStatuses.join(', ')}`);
      return errorResponse(res, 400, `Order cannot be accepted. Current status: ${order.status}. Order must be in 'preparing' or 'ready' status.`);
    }

    // Get restaurant location
    let restaurantLat, restaurantLng;
    try {
      if (order.restaurantId && order.restaurantId.location && order.restaurantId.location.coordinates) {
        [restaurantLng, restaurantLat] = order.restaurantId.location.coordinates;
        console.log(`📍 Restaurant location from populated order: lat=${restaurantLat}, lng=${restaurantLng}`);
      } else {
        // Try to fetch restaurant from database
        console.log(`⚠️ Restaurant location not in populated order, fetching from database...`);
        const restaurantId = order.restaurantId?._id || order.restaurantId;
        console.log(`🔍 Fetching restaurant with ID: ${restaurantId}`);
        
        const restaurant = await Restaurant.findById(restaurantId);
        if (restaurant && restaurant.location && restaurant.location.coordinates) {
          [restaurantLng, restaurantLat] = restaurant.location.coordinates;
          console.log(`📍 Restaurant location from database: lat=${restaurantLat}, lng=${restaurantLng}`);
        } else {
          console.error(`❌ Restaurant location not found for restaurant ID: ${restaurantId}`);
          console.error(`❌ Restaurant data:`, {
            restaurantExists: !!restaurant,
            hasLocation: !!(restaurant?.location),
            hasCoordinates: !!(restaurant?.location?.coordinates),
            locationType: typeof restaurant?.location
          });
          return errorResponse(res, 400, 'Restaurant location not found');
        }
      }
      
      // Validate coordinates
      if (!restaurantLat || !restaurantLng || isNaN(restaurantLat) || isNaN(restaurantLng)) {
        console.error(`❌ Invalid restaurant coordinates: lat=${restaurantLat}, lng=${restaurantLng}`);
        return errorResponse(res, 400, 'Invalid restaurant location coordinates');
      }
    } catch (locationError) {
      console.error(`❌ Error getting restaurant location: ${locationError.message}`);
      console.error(`❌ Location error stack: ${locationError.stack}`);
      return errorResponse(res, 500, 'Error getting restaurant location. Please try again.');
    }

    // Get delivery boy's current location
    let deliveryLat = currentLat;
    let deliveryLng = currentLng;

    console.log(`📍 Initial delivery location: lat=${deliveryLat}, lng=${deliveryLng}`);

    if (!deliveryLat || !deliveryLng) {
      console.log(`⚠️ Location not provided in request, fetching from delivery partner profile...`);
      // Try to get from delivery partner's current location
      try {
        const deliveryPartner = await Delivery.findById(delivery._id)
          .select('availability.currentLocation')
          .lean();
        
        if (deliveryPartner?.availability?.currentLocation?.coordinates) {
          [deliveryLng, deliveryLat] = deliveryPartner.availability.currentLocation.coordinates;
          console.log(`📍 Delivery location from profile: lat=${deliveryLat}, lng=${deliveryLng}`);
        } else {
          console.error(`❌ Delivery partner location not found in profile`);
          return errorResponse(res, 400, 'Delivery partner location not found. Please enable location services.');
        }
      } catch (deliveryLocationError) {
        console.error(`❌ Error fetching delivery partner location: ${deliveryLocationError.message}`);
        return errorResponse(res, 500, 'Error getting delivery partner location. Please try again.');
      }
    }

    // Validate coordinates before calculating route
    if (!deliveryLat || !deliveryLng || isNaN(deliveryLat) || isNaN(deliveryLng) ||
        !restaurantLat || !restaurantLng || isNaN(restaurantLat) || isNaN(restaurantLng)) {
      console.error(`❌ Invalid coordinates for route calculation:`, {
        deliveryLat,
        deliveryLng,
        restaurantLat,
        restaurantLng,
        deliveryLatValid: !!(deliveryLat && !isNaN(deliveryLat)),
        deliveryLngValid: !!(deliveryLng && !isNaN(deliveryLng)),
        restaurantLatValid: !!(restaurantLat && !isNaN(restaurantLat)),
        restaurantLngValid: !!(restaurantLng && !isNaN(restaurantLng))
      });
      return errorResponse(res, 400, 'Invalid location coordinates. Please ensure location services are enabled.');
    }
    
    console.log(`✅ Valid coordinates confirmed - Delivery: (${deliveryLat}, ${deliveryLng}), Restaurant: (${restaurantLat}, ${restaurantLng})`);

    // Calculate route from delivery boy to restaurant
    console.log(`🗺️ Starting route calculation...`);
    let routeData;
    const haversineDistance = (lat1, lng1, lat2, lng2) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };
    
    try {
      console.log(`🗺️ Calling calculateRoute with:`, {
        from: `(${deliveryLat}, ${deliveryLng})`,
        to: `(${restaurantLat}, ${restaurantLng})`
      });
      routeData = await calculateRoute(deliveryLat, deliveryLng, restaurantLat, restaurantLng);
      console.log(`🗺️ Route calculation result:`, {
        hasData: !!routeData,
        hasCoordinates: !!(routeData?.coordinates),
        coordinatesLength: routeData?.coordinates?.length || 0,
        distance: routeData?.distance,
        duration: routeData?.duration,
        method: routeData?.method
      });
      
      // Validate route data - ensure all required fields are present and valid
      if (!routeData || 
          !routeData.coordinates || 
          !Array.isArray(routeData.coordinates) ||
          routeData.coordinates.length === 0 ||
          typeof routeData.distance !== 'number' ||
          isNaN(routeData.distance) ||
          typeof routeData.duration !== 'number' ||
          isNaN(routeData.duration)) {
        console.warn('⚠️ Route calculation returned invalid data, using fallback');
        // Fallback to straight line
        const distance = haversineDistance(deliveryLat, deliveryLng, restaurantLat, restaurantLng);
        routeData = {
          coordinates: [[deliveryLat, deliveryLng], [restaurantLat, restaurantLng]],
          distance: distance,
          duration: (distance / 30) * 60, // Assume 30 km/h average speed
          method: 'haversine_fallback'
        };
        console.log(`✅ Using fallback route: ${distance.toFixed(2)} km`);
      } else {
        console.log(`✅ Route calculated successfully: ${routeData.distance.toFixed(2)} km, ${routeData.duration.toFixed(1)} mins`);
      }
    } catch (routeError) {
      console.error('❌ Error calculating route:', routeError);
      console.error('❌ Route error stack:', routeError.stack);
      // Fallback to straight line
      const distance = haversineDistance(deliveryLat, deliveryLng, restaurantLat, restaurantLng);
      routeData = {
        coordinates: [[deliveryLat, deliveryLng], [restaurantLat, restaurantLng]],
        distance: distance,
        duration: (distance / 30) * 60,
        method: 'haversine_fallback'
      };
      console.log(`✅ Using fallback route after error: ${distance.toFixed(2)} km`);
    }
    
    // Final validation - ensure routeData is valid before using it
    if (!routeData || 
        !routeData.coordinates || 
        !Array.isArray(routeData.coordinates) ||
        routeData.coordinates.length === 0 ||
        typeof routeData.distance !== 'number' ||
        isNaN(routeData.distance) ||
        typeof routeData.duration !== 'number' ||
        isNaN(routeData.duration)) {
      console.error('❌ Route data validation failed after all fallbacks');
      console.error('❌ Route data:', JSON.stringify(routeData, null, 2));
      return errorResponse(res, 500, 'Failed to calculate route. Please try again.');
    }
    
    console.log(`✅ Route data validated successfully`);

    // Update order status and tracking
    console.log(`💾 Starting order update...`);
    // Use order._id (MongoDB ObjectId) - ensure it exists
    if (!order._id) {
      console.error(`❌ Order ${order.orderId} does not have _id field`);
      return errorResponse(res, 500, 'Order data is invalid');
    }
    
    const orderMongoId = order._id;
    console.log(`💾 Order MongoDB ID: ${orderMongoId}`);
    
    // Prepare route data for storage - ensure coordinates are valid
    const routeToPickup = {
      coordinates: routeData.coordinates,
      distance: Number(routeData.distance),
      duration: Number(routeData.duration),
      calculatedAt: new Date(),
      method: routeData.method || 'unknown'
    };
    
    console.log(`💾 Route data to save:`, {
      coordinatesCount: routeToPickup.coordinates.length,
      distance: routeToPickup.distance,
      duration: routeToPickup.duration,
      method: routeToPickup.method
    });
    
    // Validate route coordinates before saving
    if (!Array.isArray(routeToPickup.coordinates) || routeToPickup.coordinates.length === 0) {
      console.error('❌ Invalid route coordinates');
      console.error('❌ Route coordinates:', routeToPickup.coordinates);
      return errorResponse(res, 500, 'Invalid route data. Please try again.');
    }
    
    let updatedOrder;
    try {
      console.log(`💾 Updating order in database...`);
      updatedOrder = await Order.findByIdAndUpdate(
        orderMongoId,
        {
          $set: {
            'deliveryState.status': 'accepted',
            'deliveryState.acceptedAt': new Date(),
            'deliveryState.currentPhase': 'en_route_to_pickup',
            'deliveryState.routeToPickup': routeToPickup
          }
        },
        { new: true }
      )
        .populate('restaurantId', 'name location address phone ownerPhone')
        .populate('userId', 'name phone')
        .lean();
        
      if (!updatedOrder) {
        console.error(`❌ Order ${orderMongoId} not found after update attempt`);
        return errorResponse(res, 404, 'Order not found');
      }
      console.log(`✅ Order updated successfully: ${updatedOrder.orderId}`);
    } catch (updateError) {
      console.error('❌ Error updating order:', updateError);
      console.error('❌ Update error message:', updateError.message);
      console.error('❌ Update error name:', updateError.name);
      console.error('❌ Update error stack:', updateError.stack);
      if (updateError.errors) {
        console.error('❌ Update validation errors:', updateError.errors);
      }
      return errorResponse(res, 500, `Failed to update order: ${updateError.message || 'Unknown error'}`);
    }

    console.log(`✅ Order ${order.orderId} accepted by delivery partner ${delivery._id}`);
    console.log(`📍 Route calculated: ${routeData.distance.toFixed(2)} km, ${routeData.duration.toFixed(1)} mins`);

    // Calculate delivery distance (restaurant to customer) for earnings calculation
    let deliveryDistance = 0;
    if (updatedOrder.restaurantId?.location?.coordinates && updatedOrder.address?.location?.coordinates) {
      const [restaurantLng, restaurantLat] = updatedOrder.restaurantId.location.coordinates;
      const [customerLng, customerLat] = updatedOrder.address.location.coordinates;
      
      // Calculate distance using Haversine formula
      const R = 6371; // Earth radius in km
      const dLat = (customerLat - restaurantLat) * Math.PI / 180;
      const dLng = (customerLng - restaurantLng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(restaurantLat * Math.PI / 180) * Math.cos(customerLat * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      deliveryDistance = R * c;
    }

    // Calculate estimated earnings based on delivery distance
    let estimatedEarnings = null;
    try {
      const DeliveryBoyCommission = (await import('../../admin/models/DeliveryBoyCommission.js')).default;
      const commissionResult = await DeliveryBoyCommission.calculateCommission(deliveryDistance);
      
      // Validate commission result
      if (!commissionResult || 
          !commissionResult.breakdown || 
          typeof commissionResult.commission !== 'number' ||
          isNaN(commissionResult.commission)) {
        throw new Error('Invalid commission result structure');
      }
      
      const breakdown = commissionResult.breakdown || {};
      const rule = commissionResult.rule || { minDistance: 4 };
      
      estimatedEarnings = {
        basePayout: Math.round((breakdown.basePayout || 10) * 100) / 100,
        distance: Math.round(deliveryDistance * 100) / 100,
        commissionPerKm: Math.round((breakdown.commissionPerKm || 5) * 100) / 100,
        distanceCommission: Math.round((breakdown.distanceCommission || 0) * 100) / 100,
        totalEarning: Math.round(commissionResult.commission * 100) / 100,
        breakdown: {
          basePayout: breakdown.basePayout || 10,
          distance: deliveryDistance,
          commissionPerKm: breakdown.commissionPerKm || 5,
          distanceCommission: breakdown.distanceCommission || 0,
          minDistance: rule.minDistance || 4
        }
      };
      
      console.log(`💰 Estimated earnings calculated: ₹${estimatedEarnings.totalEarning} for ${deliveryDistance.toFixed(2)} km`);
    } catch (earningsError) {
      console.error('❌ Error calculating estimated earnings:', earningsError);
      console.error('❌ Earnings error stack:', earningsError.stack);
      // Fallback to default
      estimatedEarnings = {
        basePayout: 10,
        distance: Math.round(deliveryDistance * 100) / 100,
        commissionPerKm: 5,
        distanceCommission: deliveryDistance > 4 ? Math.round(deliveryDistance * 5 * 100) / 100 : 0,
        totalEarning: 10 + (deliveryDistance > 4 ? Math.round(deliveryDistance * 5 * 100) / 100 : 0),
        breakdown: {
          basePayout: 10,
          distance: deliveryDistance,
          commissionPerKm: 5,
          distanceCommission: deliveryDistance > 4 ? deliveryDistance * 5 : 0,
          minDistance: 4
        }
      };
    }

    // Resolve payment method for delivery boy (COD vs Online) - use Payment collection if order.payment is wrong
    let paymentMethod = updatedOrder.payment?.method || 'razorpay';
    if (paymentMethod !== 'cash') {
      try {
        const paymentRecord = await Payment.findOne({ orderId: updatedOrder._id }).select('method').lean();
        if (paymentRecord?.method === 'cash') paymentMethod = 'cash';
      } catch (e) { /* ignore */ }
    }
    const orderWithPayment = { ...updatedOrder, paymentMethod };

    return successResponse(res, 200, 'Order accepted successfully', {
      order: orderWithPayment,
      route: {
        coordinates: routeData.coordinates,
        distance: routeData.distance,
        duration: routeData.duration,
        method: routeData.method
      },
      estimatedEarnings: estimatedEarnings,
      deliveryDistance: deliveryDistance
    });
  } catch (error) {
    logger.error(`Error accepting order: ${error.message}`);
    console.error('❌ Error accepting order - Full error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      orderId: req.params?.orderId,
      deliveryId: req.delivery?._id
    });
    return errorResponse(res, 500, error.message || 'Failed to accept order');
  }
});

/**
 * Confirm Reached Pickup
 * PATCH /api/delivery/orders/:orderId/reached-pickup
 */
export const confirmReachedPickup = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { orderId } = req.params;
    const deliveryId = delivery._id;

    console.log(`📍 confirmReachedPickup called - orderId: ${orderId}, deliveryId: ${deliveryId}`);

    // Find order by _id or orderId field
    let order = null;
    
    // Check if orderId is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
      order = await Order.findOne({
        _id: orderId,
        deliveryPartnerId: deliveryId
      });
    } else {
      // If not a valid ObjectId, search by orderId field
      order = await Order.findOne({
        orderId: orderId,
        deliveryPartnerId: deliveryId
      });
    }

    if (!order) {
      console.warn(`⚠️ Order not found - orderId: ${orderId}, deliveryId: ${deliveryId}`);
      return errorResponse(res, 404, 'Order not found or not assigned to you');
    }

    console.log(`✅ Order found: ${order.orderId}, Current phase: ${order.deliveryState?.currentPhase || 'none'}, Status: ${order.deliveryState?.status || 'none'}, Order status: ${order.status || 'none'}`);

    // Initialize deliveryState if it doesn't exist
    if (!order.deliveryState) {
      order.deliveryState = {
        status: 'accepted',
        currentPhase: 'en_route_to_pickup'
      };
    }

    // Ensure currentPhase exists
    if (!order.deliveryState.currentPhase) {
      order.deliveryState.currentPhase = 'en_route_to_pickup';
    }

    // Check if order is already past pickup phase (order ID confirmed or out for delivery)
    // If so, return success with current state (idempotent)
    const isPastPickupPhase = order.deliveryState.currentPhase === 'en_route_to_delivery' ||
                               order.deliveryState.currentPhase === 'picked_up' ||
                               order.deliveryState.status === 'order_confirmed' ||
                               order.status === 'out_for_delivery';

    if (isPastPickupPhase) {
      console.log(`ℹ️ Order ${order.orderId} is already past pickup phase. Current phase: ${order.deliveryState?.currentPhase || 'unknown'}, Status: ${order.deliveryState?.status || 'unknown'}, Order status: ${order.status || 'unknown'}`);
      return successResponse(res, 200, 'Order is already past pickup phase', {
        order,
        message: 'Order is already out for delivery'
      });
    }

    // Check if order is in valid state
    // Allow reached pickup if:
    // - currentPhase is 'en_route_to_pickup' OR
    // - currentPhase is 'at_pickup' (already at pickup - idempotent, allow re-confirmation)
    // - status is 'accepted' OR  
    // - currentPhase is 'accepted' (alternative phase name)
    // - order status is 'preparing' or 'ready' (restaurant preparing/ready)
    const isValidState = order.deliveryState.currentPhase === 'en_route_to_pickup' || 
                         order.deliveryState.currentPhase === 'at_pickup' || // Already at pickup - idempotent
                         order.deliveryState.status === 'accepted' ||
                         order.deliveryState.status === 'reached_pickup' || // Already reached - idempotent
                         order.deliveryState.currentPhase === 'accepted' ||
                         order.status === 'preparing' || // Order is preparing, can reach pickup
                         order.status === 'ready'; // Order is ready, can reach pickup

    // If already at pickup, just return success (idempotent operation)
    if (order.deliveryState.currentPhase === 'at_pickup' || order.deliveryState.status === 'reached_pickup') {
      console.log(`ℹ️ Order ${order.orderId} already at pickup. Returning success (idempotent).`);
      return successResponse(res, 200, 'Reached pickup already confirmed', {
        order,
        message: 'Order was already marked as reached pickup'
      });
    }

    if (!isValidState) {
      return errorResponse(res, 400, `Order is not in valid state for reached pickup. Current phase: ${order.deliveryState?.currentPhase || 'unknown'}, Status: ${order.deliveryState?.status || 'unknown'}, Order status: ${order.status || 'unknown'}`);
    }

    // Update order state
    order.deliveryState.status = 'reached_pickup';
    order.deliveryState.currentPhase = 'at_pickup';
    order.deliveryState.reachedPickupAt = new Date();
    await order.save();

    console.log(`✅ Delivery partner ${delivery._id} reached pickup for order ${order.orderId}`);

    // After 10 seconds, trigger order ID confirmation request
    // Use order._id (MongoDB ObjectId) instead of orderId string
    const orderMongoId = order._id;
    setTimeout(async () => {
      try {
        const freshOrder = await Order.findById(orderMongoId);
        if (freshOrder && freshOrder.deliveryState?.currentPhase === 'at_pickup') {
          // Emit socket event to request order ID confirmation
          let getIO;
          try {
            const serverModule = await import('../../../server.js');
            getIO = serverModule.getIO;
          } catch (importError) {
            console.error('Error importing server module:', importError);
            return;
          }
          
          if (getIO) {
            const io = getIO();
            if (io) {
              const deliveryNamespace = io.of('/delivery');
              const deliveryId = delivery._id.toString();
              deliveryNamespace.to(`delivery:${deliveryId}`).emit('request_order_id_confirmation', {
                orderId: freshOrder.orderId,
                orderMongoId: freshOrder._id.toString()
              });
              console.log(`📢 Requested order ID confirmation for order ${freshOrder.orderId} to delivery ${deliveryId}`);
            }
          }
        }
      } catch (error) {
        console.error('Error sending order ID confirmation request:', error);
      }
    }, 10000); // 10 seconds delay

    return successResponse(res, 200, 'Reached pickup confirmed', {
      order,
      message: 'Order ID confirmation will be requested in 10 seconds'
    });
  } catch (error) {
    logger.error(`Error confirming reached pickup: ${error.message}`);
    return errorResponse(res, 500, 'Failed to confirm reached pickup');
  }
});

/**
 * Confirm Order ID
 * PATCH /api/delivery/orders/:orderId/confirm-order-id
 */
export const confirmOrderId = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { orderId } = req.params;
    const { confirmedOrderId, billImageUrl } = req.body; // Order ID confirmed by delivery boy, bill image URL
    const { currentLat, currentLng } = req.body; // Current location for route calculation

    // Find order by _id or orderId - try multiple methods for better compatibility
    let order = null;
    const deliveryId = delivery._id;
    
    // Method 1: Try as MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
      order = await Order.findOne({
        $and: [
          { _id: orderId },
          { deliveryPartnerId: deliveryId }
        ]
      })
        .populate('userId', 'name phone')
        .populate('restaurantId', 'name location address phone ownerPhone')
        .lean();
    }
    
    // Method 2: Try by orderId field
    if (!order) {
      order = await Order.findOne({
        $and: [
          { orderId: orderId },
          { deliveryPartnerId: deliveryId }
        ]
      })
        .populate('userId', 'name phone')
        .populate('restaurantId', 'name location address phone ownerPhone')
        .lean();
    }
    
    // Method 3: Try with string comparison for deliveryPartnerId
    if (!order) {
      order = await Order.findOne({
        $and: [
          {
            $or: [
              { _id: orderId },
              { orderId: orderId }
            ]
          },
          {
            deliveryPartnerId: deliveryId.toString()
          }
        ]
      })
        .populate('userId', 'name phone')
        .populate('restaurantId', 'name location address phone ownerPhone')
        .lean();
    }

    if (!order) {
      console.error(`❌ Order ${orderId} not found or not assigned to delivery ${deliveryId}`);
      return errorResponse(res, 404, 'Order not found or not assigned to you');
    }

    // Verify order ID matches
    if (confirmedOrderId && confirmedOrderId !== order.orderId) {
      return errorResponse(res, 400, 'Order ID does not match');
    }

    // Check if order is in valid state
    // Initialize deliveryState if it doesn't exist
    if (!order.deliveryState) {
      // If deliveryState doesn't exist, initialize it but still allow confirmation
      // This can happen if reached pickup was confirmed but deliveryState wasn't saved properly
      order.deliveryState = {
        status: 'reached_pickup',
        currentPhase: 'at_pickup'
      };
    }

    // Ensure currentPhase exists
    if (!order.deliveryState.currentPhase) {
      order.deliveryState.currentPhase = 'at_pickup';
    }

    // Check if order ID is already confirmed (idempotent check)
    const isAlreadyConfirmed = order.deliveryState?.status === 'order_confirmed' ||
                               order.deliveryState?.currentPhase === 'en_route_to_delivery' ||
                               order.deliveryState?.currentPhase === 'picked_up' ||
                               order.status === 'out_for_delivery' ||
                               order.deliveryState?.orderIdConfirmedAt;

    if (isAlreadyConfirmed) {
      // Order ID is already confirmed - return success with current order data (idempotent)
      console.log(`✅ Order ID already confirmed for order ${order.orderId}, returning current state`);
      
      // Get customer location for route calculation if not already calculated
      const [customerLng, customerLat] = order.address.location.coordinates;
      
      // Get delivery boy's current location
      let deliveryLat = currentLat;
      let deliveryLng = currentLng;
      
      if (!deliveryLat || !deliveryLng) {
        const deliveryPartner = await Delivery.findById(delivery._id)
          .select('availability.currentLocation')
          .lean();
        
        if (deliveryPartner?.availability?.currentLocation?.coordinates) {
          [deliveryLng, deliveryLat] = deliveryPartner.availability.currentLocation.coordinates;
        } else if (order.restaurantId) {
          let restaurant = null;
          if (mongoose.Types.ObjectId.isValid(order.restaurantId)) {
            restaurant = await Restaurant.findById(order.restaurantId)
              .select('location')
              .lean();
          } else {
            restaurant = await Restaurant.findOne({ restaurantId: order.restaurantId })
              .select('location')
              .lean();
          }
          if (restaurant?.location?.coordinates) {
            [deliveryLng, deliveryLat] = restaurant.location.coordinates;
          }
        }
      }

      // Return existing route if available, otherwise calculate new route
      let routeData = null;
      if (order.deliveryState?.routeToDelivery?.coordinates?.length > 0) {
        // Use existing route
        routeData = {
          coordinates: order.deliveryState.routeToDelivery.coordinates,
          distance: order.deliveryState.routeToDelivery.distance,
          duration: order.deliveryState.routeToDelivery.duration,
          method: order.deliveryState.routeToDelivery.method || 'dijkstra'
        };
      } else if (deliveryLat && deliveryLng && customerLat && customerLng) {
        // Calculate new route if not available
        routeData = await calculateRoute(deliveryLat, deliveryLng, customerLat, customerLng, {
          useDijkstra: true
        });
      }

      return successResponse(res, 200, 'Order ID already confirmed', {
        order: order,
        route: routeData
      });
    }

    // Check if order is in valid state for order ID confirmation
    // Allow confirmation if:
    // - currentPhase is 'at_pickup' (after Reached Pickup) OR
    // - status is 'reached_pickup' OR
    // - order status is 'preparing' or 'ready' (restaurant preparing/ready) OR
    // - currentPhase is 'en_route_to_pickup' or status is 'accepted' (Reached Pickup not yet persisted / edge case)
    const isValidState = order.deliveryState.currentPhase === 'at_pickup' ||
                         order.deliveryState.status === 'reached_pickup' ||
                         order.status === 'preparing' ||
                         order.status === 'ready' ||
                         order.deliveryState.currentPhase === 'en_route_to_pickup' ||
                         order.deliveryState.status === 'accepted';

    if (!isValidState) {
      return errorResponse(res, 400, `Order is not at pickup. Current phase: ${order.deliveryState?.currentPhase || 'unknown'}, Status: ${order.deliveryState?.status || 'unknown'}, Order status: ${order.status || 'unknown'}`);
    }

    // Get customer location
    if (!order.address?.location?.coordinates || order.address.location.coordinates.length < 2) {
      return errorResponse(res, 400, 'Customer location not found');
    }

    const [customerLng, customerLat] = order.address.location.coordinates;

    // Get delivery boy's current location (should be at restaurant)
    let deliveryLat = currentLat;
    let deliveryLng = currentLng;

    if (!deliveryLat || !deliveryLng) {
      // Try to get from delivery partner's current location
      const deliveryPartner = await Delivery.findById(delivery._id)
        .select('availability.currentLocation')
        .lean();
      
      if (deliveryPartner?.availability?.currentLocation?.coordinates) {
        [deliveryLng, deliveryLat] = deliveryPartner.availability.currentLocation.coordinates;
      } else {
        // Use restaurant location as fallback
        // order.restaurantId might be a string or ObjectId
        let restaurant = null;
        if (mongoose.Types.ObjectId.isValid(order.restaurantId)) {
          restaurant = await Restaurant.findById(order.restaurantId)
            .select('location')
            .lean();
        } else {
          // Try to find by restaurantId field if it's a string
          restaurant = await Restaurant.findOne({ restaurantId: order.restaurantId })
            .select('location')
            .lean();
        }
        if (restaurant?.location?.coordinates) {
          [deliveryLng, deliveryLat] = restaurant.location.coordinates;
        } else {
          return errorResponse(res, 400, 'Location not found for route calculation');
        }
      }
    }

    // Calculate route from restaurant to customer using Dijkstra algorithm
    const routeData = await calculateRoute(deliveryLat, deliveryLng, customerLat, customerLng, {
      useDijkstra: true
    });

    // Update order state - use order._id (MongoDB _id) not orderId string
    // Since we found the order, order._id should exist (from .lean() it's a plain object with _id)
    const orderMongoId = order._id;
    if (!orderMongoId) {
      return errorResponse(res, 500, 'Order ID not found in order object');
    }
    const now = new Date();
    const readyTimestamp = order?.tracking?.ready?.timestamp
      ? new Date(order.tracking.ready.timestamp)
      : now;

    const updateData = {
      'deliveryState.status': 'order_confirmed',
      'deliveryState.currentPhase': 'en_route_to_delivery',
      'deliveryState.orderIdConfirmedAt': now,
      'deliveryState.routeToDelivery': {
        coordinates: routeData.coordinates,
        distance: routeData.distance,
        duration: routeData.duration,
        calculatedAt: now,
        method: routeData.method
      },
      // Ensure "ready for pickup" is reflected before moving to out_for_delivery.
      'tracking.ready': {
        status: true,
        timestamp: readyTimestamp
      },
      status: 'out_for_delivery',
      'tracking.outForDelivery': {
        status: true,
        timestamp: now
      }
    };

    // Add bill image URL if provided (with validation)
    if (billImageUrl) {
      // Validate URL format
      try {
        const url = new URL(billImageUrl);
        // Ensure it's a valid HTTP/HTTPS URL
        if (!['http:', 'https:'].includes(url.protocol)) {
          return errorResponse(res, 400, 'Bill image URL must be HTTP or HTTPS');
        }
        // Optional: Validate it's from Cloudinary (security check)
        if (!url.hostname.includes('cloudinary.com') && !url.hostname.includes('res.cloudinary.com')) {
          console.warn(`⚠️ Bill image URL is not from Cloudinary: ${url.hostname}`);
          // Don't reject, but log warning for monitoring
        }
        updateData.billImageUrl = billImageUrl;
        console.log(`📸 Bill image URL validated and saved for order ${order.orderId}`);
      } catch (urlError) {
        console.error(`❌ Invalid bill image URL format: ${billImageUrl}`, urlError);
        return errorResponse(res, 400, 'Invalid bill image URL format');
      }
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      orderMongoId,
      { $set: updateData },
      { new: true }
    )
      .populate('userId', 'name phone')
      .populate('restaurantId', 'name location address')
      .lean();

    console.log(`✅ Order ID confirmed for order ${order.orderId}`);
    console.log(`📍 Route to delivery calculated: ${routeData.distance.toFixed(2)} km, ${routeData.duration.toFixed(1)} mins`);

    // Send response first, then handle socket notification asynchronously
    const responseData = {
      order: updatedOrder,
      route: {
        coordinates: routeData.coordinates,
        distance: routeData.distance,
        duration: routeData.duration,
        method: routeData.method
      }
    };

    const response = successResponse(res, 200, 'Order ID confirmed', responseData);

    // Emit socket event to customer asynchronously (don't block response)
    (async () => {
      try {
        // Get IO instance dynamically to avoid circular dependencies
        const serverModule = await import('../../../server.js');
        const getIO = serverModule.getIO;
        const io = getIO ? getIO() : null;

        if (io) {
          // Emit to customer tracking this order
          // Format matches server.js: order:${orderId}
          io.to(`order:${updatedOrder._id.toString()}`).emit('order_status_update', {
            title: "Order Update",
            message: "Your delivery partner is on the way! 🏍️",
            status: 'out_for_delivery',
            orderId: updatedOrder.orderId,
            deliveryStartedAt: new Date(),
            estimatedDeliveryTime: routeData.duration || null
          });

          console.log(`📢 Notified customer for order ${updatedOrder.orderId} - Delivery partner on the way`);
        } else {
          console.warn('⚠️ Socket.IO not initialized, skipping customer notification');
        }
      } catch (notifError) {
        console.error('Error sending customer notification:', notifError);
        // Don't fail the response if notification fails
      }
    })();

    return response;
  } catch (error) {
    logger.error(`Error confirming order ID: ${error.message}`);
    console.error('Error stack:', error.stack);
    return errorResponse(res, 500, 'Failed to confirm order ID');
  }
});

/**
 * Confirm Reached Drop (Delivery Boy reached customer location)
 * PATCH /api/delivery/orders/:orderId/reached-drop
 */
export const confirmReachedDrop = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { orderId } = req.params;

    if (!delivery || !delivery._id) {
      return errorResponse(res, 401, 'Delivery partner authentication required');
    }

    if (!orderId) {
      return errorResponse(res, 400, 'Order ID is required');
    }

    // Find order by _id or orderId, and ensure it's assigned to this delivery partner
    // Try multiple comparison methods for deliveryPartnerId (ObjectId vs string)
    const deliveryId = delivery._id;
    
    console.log(`🔍 Searching for order: ${orderId}, Delivery ID: ${deliveryId}`);
    
    // Try finding order with different deliveryPartnerId comparison methods
    // First try without lean() to get Mongoose document (needed for proper ObjectId comparison)
    let order = await Order.findOne({
      $and: [
        {
          $or: [
            { _id: orderId },
            { orderId: orderId }
          ]
        },
        {
          deliveryPartnerId: deliveryId // Try as ObjectId first (most common)
        }
      ]
    });
    
    // If not found, try with string comparison
    if (!order) {
      console.log(`⚠️ Order not found with ObjectId comparison, trying string comparison...`);
      order = await Order.findOne({
        $and: [
          {
            $or: [
              { _id: orderId },
              { orderId: orderId }
            ]
          },
          {
            deliveryPartnerId: deliveryId.toString() // Try as string
          }
        ]
      });
    }

    if (!order) {
      console.error(`❌ Order ${orderId} not found or not assigned to delivery ${deliveryId}`);
      return errorResponse(res, 404, 'Order not found or not assigned to you');
    }
    
    console.log(`✅ Order found: ${order.orderId || order._id}, Status: ${order.status}, Phase: ${order.deliveryState?.currentPhase || 'N/A'}`);

    // Initialize deliveryState if it doesn't exist
    if (!order.deliveryState) {
      order.deliveryState = {
        status: 'pending',
        currentPhase: 'assigned'
      };
    }

    // Ensure deliveryState.currentPhase exists
    if (!order.deliveryState.currentPhase) {
      order.deliveryState.currentPhase = 'assigned';
    }

    // Check if order is in valid state
    // Allow reached drop if order is out_for_delivery OR if currentPhase is en_route_to_delivery OR status is order_confirmed
    const isValidState = order.status === 'out_for_delivery' || 
                         order.deliveryState?.currentPhase === 'en_route_to_delivery' ||
                         order.deliveryState?.status === 'order_confirmed' ||
                         order.deliveryState?.currentPhase === 'at_delivery'; // Allow if already at delivery (idempotent)

    if (!isValidState) {
      return errorResponse(res, 400, `Order is not in valid state for reached drop. Current status: ${order.status}, Phase: ${order.deliveryState?.currentPhase || 'unknown'}`);
    }

    // Update order state - only if not already at delivery (idempotent)
    let finalOrder = null;
    
    if (order.deliveryState.currentPhase !== 'at_delivery') {
      try {
        // Update the order document directly since we have it
        order.deliveryState.status = 'en_route_to_delivery';
        order.deliveryState.currentPhase = 'at_delivery';
        order.deliveryState.reachedDropAt = new Date();
        
        // Save the order
        await order.save();
        
        // Populate and get the updated order for response
        const updatedOrder = await Order.findById(order._id)
          .populate('restaurantId', 'name location address phone ownerPhone')
          .populate('userId', 'name phone')
          .lean(); // Use lean() for better performance

        if (!updatedOrder) {
          console.error(`❌ Failed to fetch updated order ${order._id}`);
          return errorResponse(res, 500, 'Failed to update order state');
        }

        finalOrder = updatedOrder;
      } catch (updateError) {
        console.error(`❌ Error updating order ${order._id}:`, updateError);
        console.error('Update error stack:', updateError.stack);
        console.error('Update error details:', {
          message: updateError.message,
          name: updateError.name,
          orderId: order._id,
          orderStatus: order.status,
          deliveryPhase: order.deliveryState?.currentPhase
        });
        throw updateError; // Re-throw to be caught by outer catch
      }
    } else {
      // If already at delivery, populate the order for response
      try {
        const populatedOrder = await Order.findById(order._id)
          .populate('restaurantId', 'name location address phone ownerPhone')
          .populate('userId', 'name phone')
          .lean(); // Use lean() for better performance
        
        if (!populatedOrder) {
          console.error(`❌ Failed to fetch order ${order._id} details`);
          return errorResponse(res, 500, 'Failed to fetch order details');
        }
        
        finalOrder = populatedOrder;
      } catch (fetchError) {
        console.error(`❌ Error fetching order ${order._id}:`, fetchError);
        console.error('Fetch error stack:', fetchError.stack);
        throw fetchError; // Re-throw to be caught by outer catch
      }
    }

    if (!finalOrder) {
      return errorResponse(res, 500, 'Failed to process order');
    }

    const orderIdForLog = finalOrder.orderId || finalOrder._id?.toString() || orderId;
    console.log(`✅ Delivery partner ${delivery._id} reached drop location for order ${orderIdForLog}`);

    return successResponse(res, 200, 'Reached drop confirmed', {
      order: finalOrder,
      message: 'Reached drop location confirmed'
    });
  } catch (error) {
    logger.error(`Error confirming reached drop: ${error.message}`);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      orderId: req.params?.orderId,
      deliveryId: req.delivery?._id
    });
    return errorResponse(res, 500, `Failed to confirm reached drop: ${error.message}`);
  }
});

/**
 * Confirm Delivery Complete
 * PATCH /api/delivery/orders/:orderId/complete-delivery
 */
export const completeDelivery = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { orderId } = req.params;
    const { rating, review } = req.body; // Optional rating and review from delivery boy

    if (!delivery || !delivery._id) {
      return errorResponse(res, 401, 'Delivery partner authentication required');
    }

    if (!orderId) {
      return errorResponse(res, 400, 'Order ID is required');
    }

    // Find order - try both by _id and orderId, and ensure it's assigned to this delivery partner
    const deliveryId = delivery._id;
    let order = null;
    
    // Check if orderId is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
      order = await Order.findOne({
        _id: orderId,
        deliveryPartnerId: deliveryId
      })
        .populate('restaurantId', 'name location address phone ownerPhone')
        .populate('userId', 'name phone')
        .lean();
    } else {
      // If not a valid ObjectId, search by orderId field
      order = await Order.findOne({
        orderId: orderId,
        deliveryPartnerId: deliveryId
      })
        .populate('restaurantId', 'name location address phone ownerPhone')
        .populate('userId', 'name phone')
        .lean();
    }
    
    // If still not found, try with string comparison for deliveryPartnerId
    if (!order) {
      order = await Order.findOne({
        $and: [
          {
            $or: [
              { _id: orderId },
              { orderId: orderId }
            ]
          },
          {
            deliveryPartnerId: deliveryId.toString()
          }
        ]
      })
        .populate('restaurantId', 'name location address phone ownerPhone')
        .populate('userId', 'name phone')
        .lean();
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found or not assigned to you');
    }

    // Check if order is already delivered/completed (idempotent - allow if already completed)
    const isAlreadyDelivered = order.status === 'delivered' || 
                               order.deliveryState?.currentPhase === 'completed' ||
                               order.deliveryState?.status === 'delivered';
    
    if (isAlreadyDelivered) {
      console.log(`ℹ️ Order ${order.orderId || order._id} is already delivered/completed. Returning success (idempotent).`);
      
      // Return success with existing order data (idempotent operation)
      // Still calculate earnings if not already calculated
      let earnings = null;
      try {
        // Check if earnings were already calculated
        const wallet = await DeliveryWallet.findOne({ deliveryPartnerId: delivery._id });
        const orderIdForTransaction = order._id?.toString ? order._id.toString() : order._id;
        const existingTransaction = wallet?.transactions?.find(
          t => t.orderId && t.orderId.toString() === orderIdForTransaction && t.type === 'payment'
        );
        
        if (existingTransaction) {
          earnings = {
            amount: existingTransaction.amount,
            transactionId: existingTransaction._id?.toString() || existingTransaction.id
          };
        } else {
          // Calculate earnings even if order is already delivered (for consistency)
          let deliveryDistance = 0;
          if (order.deliveryState?.routeToDelivery?.distance) {
            deliveryDistance = order.deliveryState.routeToDelivery.distance;
          } else if (order.assignmentInfo?.distance) {
            deliveryDistance = order.assignmentInfo.distance;
          }
          
          if (deliveryDistance > 0) {
            const commissionResult = await DeliveryBoyCommission.calculateCommission(deliveryDistance);
            earnings = {
              amount: commissionResult.commission,
              breakdown: commissionResult.breakdown
            };
          }
        }
      } catch (earningsError) {
        console.error('⚠️ Error calculating earnings for already delivered order:', earningsError.message);
      }
      
      return successResponse(res, 200, 'Order already delivered', {
        order: order,
        earnings: earnings,
        message: 'Order was already marked as delivered'
      });
    }

    // Check if order is in valid state for completion
    // Allow completion if order is out_for_delivery OR at_delivery phase
    const isValidState = order.status === 'out_for_delivery' || 
                         order.deliveryState?.currentPhase === 'at_delivery' ||
                         order.deliveryState?.currentPhase === 'en_route_to_delivery';
    
    if (!isValidState) {
      return errorResponse(res, 400, `Order cannot be completed. Current status: ${order.status}, Phase: ${order.deliveryState?.currentPhase || 'unknown'}`);
    }

    // Ensure we have order._id - from .lean() it's a plain object with _id
    const orderMongoId = order._id;
    if (!orderMongoId) {
      return errorResponse(res, 500, 'Order ID not found in order object');
    }

    // Prepare update object
    const updateData = {
      status: 'delivered',
      'tracking.delivered': {
        status: true,
        timestamp: new Date()
      },
      deliveredAt: new Date(),
      'deliveryState.status': 'delivered',
      'deliveryState.currentPhase': 'completed'
    };
    
    // Add review and rating if provided
    if (rating && rating >= 1 && rating <= 5) {
      updateData['review.rating'] = rating;
      updateData['review.submittedAt'] = new Date();
      if (order.userId) {
        updateData['review.reviewedBy'] = order.userId;
      }
    }
    
    if (review && review.trim()) {
      updateData['review.comment'] = review.trim();
      if (!updateData['review.submittedAt']) {
        updateData['review.submittedAt'] = new Date();
      }
      if (order.userId && !updateData['review.reviewedBy']) {
        updateData['review.reviewedBy'] = order.userId;
      }
    }
    
    // Update order to delivered
    const updatedOrder = await Order.findByIdAndUpdate(
      orderMongoId,
      {
        $set: updateData
      },
      { new: true, runValidators: true }
    )
      .populate('restaurantId', 'name location address phone ownerPhone')
      .populate('userId', 'name phone')
      .lean();

    if (!updatedOrder) {
      return errorResponse(res, 500, 'Failed to update order status');
    }

    const orderIdForLog = updatedOrder.orderId || order.orderId || orderMongoId?.toString() || orderId;
    console.log(`✅ Order ${orderIdForLog} marked as delivered by delivery partner ${delivery._id}`);

    // Mark COD payment as collected (admin Payment Status → Collected)
    if (order.payment?.method === 'cash' || order.payment?.method === 'cod') {
      try {
        await Payment.updateOne(
          { orderId: orderMongoId },
          { $set: { status: 'completed', completedAt: new Date() } }
        );
        console.log(`✅ COD payment marked as collected for order ${orderIdForLog}`);
      } catch (paymentUpdateError) {
        console.warn('⚠️ Could not update COD payment status:', paymentUpdateError.message);
      }
    }

    // Release escrow and distribute funds (this handles all wallet credits)
    try {
      const { releaseEscrow } = await import('../../order/services/escrowWalletService.js');
      await releaseEscrow(orderMongoId);
      console.log(`✅ Escrow released and funds distributed for order ${orderIdForLog}`);
    } catch (escrowError) {
      console.error(`❌ Error releasing escrow for order ${orderIdForLog}:`, escrowError);
      // Continue with legacy wallet update as fallback
    }

    // Calculate delivery earnings based on admin's commission rules
    // Get delivery distance (in km) from order
    let deliveryDistance = 0;
    
    // Priority 1: Get distance from routeToDelivery (most accurate)
    if (order.deliveryState?.routeToDelivery?.distance) {
      deliveryDistance = order.deliveryState.routeToDelivery.distance;
    }
    // Priority 2: Get distance from assignmentInfo
    else if (order.assignmentInfo?.distance) {
      deliveryDistance = order.assignmentInfo.distance;
    }
    // Priority 3: Calculate distance from restaurant to customer if coordinates available
    else if (order.restaurantId?.location?.coordinates && order.address?.location?.coordinates) {
      const [restaurantLng, restaurantLat] = order.restaurantId.location.coordinates;
      const [customerLng, customerLat] = order.address.location.coordinates;
      
      // Calculate distance using Haversine formula
      const R = 6371; // Earth radius in km
      const dLat = (customerLat - restaurantLat) * Math.PI / 180;
      const dLng = (customerLng - restaurantLng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(restaurantLat * Math.PI / 180) * Math.cos(customerLat * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      deliveryDistance = R * c;
    }
    
    console.log(`📏 Delivery distance: ${deliveryDistance.toFixed(2)} km for order ${orderIdForLog}`);

    // Calculate earnings using admin's commission rules
    let totalEarning = 0;
    let commissionBreakdown = null;
    
    try {
      // Use DeliveryBoyCommission model to calculate commission based on distance
      const commissionResult = await DeliveryBoyCommission.calculateCommission(deliveryDistance);
      totalEarning = commissionResult.commission;
      commissionBreakdown = commissionResult.breakdown;
      
      console.log(`💰 Delivery earnings calculated using commission rules: ₹${totalEarning.toFixed(2)} for order ${orderIdForLog}`);
      console.log(`📊 Commission breakdown:`, {
        rule: commissionResult.rule.name,
        basePayout: commissionResult.breakdown.basePayout,
        distance: commissionResult.breakdown.distance,
        commissionPerKm: commissionResult.breakdown.commissionPerKm,
        distanceCommission: commissionResult.breakdown.distanceCommission,
        total: totalEarning
      });
    } catch (commissionError) {
      console.error('⚠️ Error calculating commission using rules:', commissionError.message);
      // Fallback: Use delivery fee as earnings if commission calculation fails
      totalEarning = order.pricing?.deliveryFee || 0;
      console.warn(`⚠️ Using fallback earnings (delivery fee): ₹${totalEarning.toFixed(2)}`);
    }

    // Add earning to delivery boy's wallet
    let walletTransaction = null;
    try {
      // Find or create wallet for delivery boy
      let wallet = await DeliveryWallet.findOrCreateByDeliveryId(delivery._id);
      
      // Check if transaction already exists for this order
      const orderIdForTransaction = orderMongoId?.toString ? orderMongoId.toString() : orderMongoId;
      const existingTransaction = wallet.transactions?.find(
        t => t.orderId && t.orderId.toString() === orderIdForTransaction && t.type === 'payment'
      );

      if (existingTransaction) {
        console.warn(`⚠️ Earning already added for order ${orderIdForLog}, skipping wallet update`);
      } else {
        // Add payment transaction (earning) with paymentCollected: false so cashInHand gets COD amount, not commission
        const isCOD = order.payment?.method === 'cash' || order.payment?.method === 'cod';
        walletTransaction = wallet.addTransaction({
          amount: totalEarning,
          type: 'payment',
          status: 'Completed',
          description: `Delivery earnings for Order #${orderIdForLog} (Distance: ${deliveryDistance.toFixed(2)} km)`,
          orderId: orderMongoId || order._id,
          paymentCollected: false
        });

        await wallet.save();

        // COD: add cash collected (order total) to cashInHand so Pocket balance shows it
        const codAmount = Number(order.pricing?.total) || 0;
        const paymentMethod = (order.payment?.method || '').toString().toLowerCase();
        const isCashOrder = paymentMethod === 'cash' || paymentMethod === 'cod';
        if (isCashOrder && codAmount > 0) {
          try {
            const updateResult = await DeliveryWallet.updateOne(
              { deliveryId: delivery._id },
              { $inc: { cashInHand: codAmount } }
            );
            if (updateResult.modifiedCount > 0) {
              console.log(`✅ Cash collected ₹${codAmount.toFixed(2)} (COD) added to cashInHand for order ${orderIdForLog}`);
            } else {
              console.warn(`⚠️ Wallet update for cashInHand had no effect (deliveryId: ${delivery._id})`);
            }
          } catch (codErr) {
            console.error(`❌ Failed to add COD to cashInHand:`, codErr.message);
          }
        }

        const cashCollectedThisOrder = isCOD ? codAmount : 0;
        logger.info(`💰 Earning added to wallet for delivery: ${delivery._id}`, {
          deliveryId: delivery.deliveryId || delivery._id.toString(),
          orderId: orderIdForLog,
          amount: totalEarning,
          cashCollected: cashCollectedThisOrder,
          distance: deliveryDistance,
          transactionId: walletTransaction?._id || walletTransaction?.id,
          walletBalance: wallet.totalBalance,
          cashInHand: wallet.cashInHand
        });

        console.log(`✅ Earning ₹${totalEarning.toFixed(2)} added to delivery boy's wallet`);
        console.log(`💰 New wallet balance: ₹${wallet.totalBalance.toFixed(2)}, cashInHand: ₹${wallet.cashInHand?.toFixed(2) || '0.00'}`);
      }
    } catch (walletError) {
      logger.error('❌ Error adding earning to wallet:', walletError);
      console.error('❌ Error processing delivery wallet:', walletError);
      // Don't fail the delivery completion if wallet update fails
      // But log it for investigation
    }

    // Check and award earning addon bonuses if delivery boy qualifies
    let earningAddonBonus = null;
    try {
      const { checkAndAwardEarningAddon } = await import('../services/earningAddonService.js');
      earningAddonBonus = await checkAndAwardEarningAddon(
        delivery._id,
        orderMongoId || order._id,
        updatedOrder.deliveredAt || new Date()
      );
      
      if (earningAddonBonus) {
        console.log(`🎉 Earning addon bonus awarded: ₹${earningAddonBonus.amount} for offer "${earningAddonBonus.offerTitle}"`);
        logger.info(`Earning addon bonus awarded to delivery ${delivery._id}`, {
          offerId: earningAddonBonus.offerId,
          amount: earningAddonBonus.amount,
          ordersCompleted: earningAddonBonus.ordersCompleted
        });
      }
    } catch (earningAddonError) {
      logger.error('❌ Error checking earning addon bonuses:', earningAddonError);
      console.error('❌ Error processing earning addon bonus:', earningAddonError);
      // Don't fail the delivery completion if bonus check fails
    }

    // Calculate restaurant commission and update restaurant wallet
    let restaurantWalletTransaction = null;
    let adminCommissionRecord = null;
    try {
      // Get order total amount (subtotal, excluding delivery fee and tax for commission calculation)
      const orderTotal = order.pricing?.subtotal || order.pricing?.total || 0;
      
      // Find restaurant by restaurantId (can be string or ObjectId)
      let restaurant = null;
      if (mongoose.Types.ObjectId.isValid(order.restaurantId)) {
        restaurant = await Restaurant.findById(order.restaurantId);
      } else {
        restaurant = await Restaurant.findOne({ restaurantId: order.restaurantId });
      }

      if (!restaurant) {
        console.warn(`⚠️ Restaurant not found for order ${orderIdForLog}, skipping commission calculation`);
      } else {
        // Calculate restaurant commission
        const commissionResult = await RestaurantCommission.calculateCommissionForOrder(
          restaurant._id,
          orderTotal
        );

        const commissionAmount = commissionResult.commission || 0;
        const restaurantEarning = orderTotal - commissionAmount;

        console.log(`💰 Restaurant commission calculation for order ${orderIdForLog}:`, {
          orderTotal: orderTotal,
          commissionPercentage: commissionResult.value,
          commissionAmount: commissionAmount,
          restaurantEarning: restaurantEarning
        });

        // Update restaurant wallet
        if (restaurant._id) {
          const restaurantWallet = await RestaurantWallet.findOrCreateByRestaurantId(restaurant._id);
          
          // Check if transaction already exists for this order
          const existingRestaurantTransaction = restaurantWallet.transactions?.find(
            t => t.orderId && t.orderId.toString() === orderIdForTransaction && t.type === 'payment'
          );

          if (existingRestaurantTransaction) {
            console.warn(`⚠️ Restaurant earning already added for order ${orderIdForLog}, skipping wallet update`);
          } else {
            // Add payment transaction to restaurant wallet
            restaurantWalletTransaction = restaurantWallet.addTransaction({
              amount: restaurantEarning,
              type: 'payment',
              status: 'Completed',
              description: `Order #${orderIdForLog} - Amount: ₹${orderTotal.toFixed(2)}, Commission: ₹${commissionAmount.toFixed(2)}`,
              orderId: orderMongoId || order._id
            });

            await restaurantWallet.save();

            logger.info(`💰 Earning added to restaurant wallet: ${restaurant._id}`, {
              restaurantId: restaurant.restaurantId || restaurant._id.toString(),
              orderId: orderIdForLog,
              orderTotal: orderTotal,
              commissionAmount: commissionAmount,
              restaurantEarning: restaurantEarning,
              walletBalance: restaurantWallet.totalBalance
            });

            console.log(`✅ Restaurant earning ₹${restaurantEarning.toFixed(2)} added to wallet`);
            console.log(`💰 New restaurant wallet balance: ₹${restaurantWallet.totalBalance.toFixed(2)}`);
          }
        }

        // Track admin commission earned
        try {
          // Check if commission record already exists
          const existingCommission = await AdminCommission.findOne({ orderId: orderMongoId || order._id });
          
          if (!existingCommission) {
            adminCommissionRecord = await AdminCommission.create({
              orderId: orderMongoId || order._id,
              orderAmount: orderTotal,
              commissionAmount: commissionAmount,
              commissionPercentage: commissionResult.value,
              restaurantId: restaurant._id,
              restaurantName: restaurant.name || order.restaurantName,
              restaurantEarning: restaurantEarning,
              status: 'completed',
              orderDate: order.createdAt || new Date()
            });

            logger.info(`💰 Admin commission recorded: ${commissionAmount}`, {
              orderId: orderIdForLog,
              commissionAmount: commissionAmount,
              orderTotal: orderTotal
            });

            console.log(`✅ Admin commission ₹${commissionAmount.toFixed(2)} recorded`);
          } else {
            console.warn(`⚠️ Admin commission already recorded for order ${orderIdForLog}`);
          }
        } catch (adminCommissionError) {
          logger.error('❌ Error recording admin commission:', adminCommissionError);
          console.error('❌ Error recording admin commission:', adminCommissionError);
          // Don't fail the delivery completion if commission tracking fails
        }
      }
    } catch (restaurantWalletError) {
      logger.error('❌ Error processing restaurant wallet:', restaurantWalletError);
      console.error('❌ Error processing restaurant wallet:', restaurantWalletError);
      // Don't fail the delivery completion if restaurant wallet update fails
      // But log it for investigation
    }

    // Send response first, then handle notifications asynchronously
    // This prevents timeouts if notifications take too long
    const responseData = {
      order: updatedOrder,
      earnings: {
        amount: totalEarning,
        currency: 'INR',
        distance: deliveryDistance,
        breakdown: commissionBreakdown || {
          basePayout: 0,
          distance: deliveryDistance,
          commissionPerKm: 0,
          distanceCommission: 0
        }
      },
      wallet: walletTransaction ? {
        transactionId: walletTransaction._id,
        balance: walletTransaction.amount
      } : null,
      earningAddonBonus: earningAddonBonus ? {
        offerId: earningAddonBonus.offerId,
        offerTitle: earningAddonBonus.offerTitle,
        amount: earningAddonBonus.amount,
        ordersCompleted: earningAddonBonus.ordersCompleted,
        ordersRequired: earningAddonBonus.ordersRequired
      } : null,
      message: 'Delivery completed successfully'
    };

    // Send response immediately
    const response = successResponse(res, 200, 'Delivery completed successfully', responseData);

    // Handle notifications asynchronously (don't block response)
    const orderIdForNotification = orderMongoId?.toString ? orderMongoId.toString() : orderMongoId;
    Promise.all([
      // Notify restaurant about delivery completion
      (async () => {
        try {
          const { notifyRestaurantOrderUpdate } = await import('../../order/services/restaurantNotificationService.js');
          await notifyRestaurantOrderUpdate(orderIdForNotification, 'delivered');
        } catch (notifError) {
          console.error('Error sending restaurant notification:', notifError);
        }
      })(),
      // Notify user about delivery completion
      (async () => {
        try {
          const { notifyUserOrderUpdate } = await import('../../order/services/userNotificationService.js');
          if (notifyUserOrderUpdate) {
            await notifyUserOrderUpdate(orderIdForNotification, 'delivered');
          }
        } catch (notifError) {
          console.error('Error sending user notification:', notifError);
        }
      })()
    ]).catch(error => {
      console.error('Error in notification promises:', error);
    });

    return response;
  } catch (error) {
    logger.error(`Error completing delivery: ${error.message}`);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      orderId: req.params?.orderId,
      deliveryId: req.delivery?._id
    });
    return errorResponse(res, 500, `Failed to complete delivery: ${error.message}`);
  }
});


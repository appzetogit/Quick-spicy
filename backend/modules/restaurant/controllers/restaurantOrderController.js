import Order from '../../order/models/Order.js';
import Payment from '../../payment/models/Payment.js';
import Restaurant from '../models/Restaurant.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import { notifyRestaurantOrderUpdate } from '../../order/services/restaurantNotificationService.js';
import { assignOrderToDeliveryBoy, findNearestDeliveryBoys, findNearestDeliveryBoy } from '../../order/services/deliveryAssignmentService.js';
import { notifyDeliveryBoyNewOrder, notifyMultipleDeliveryBoys } from '../../order/services/deliveryNotificationService.js';
import mongoose from 'mongoose';

/**
 * Get all orders for restaurant
 * GET /api/restaurant/orders
 */
export const getRestaurantOrders = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { status, page = 1, limit = 50 } = req.query;

    // Get restaurant ID - normalize to string (Order.restaurantId is String type)
    const restaurantIdString = restaurant._id?.toString() ||
      restaurant.restaurantId?.toString() ||
      restaurant.id?.toString();

    if (!restaurantIdString) {
      console.error('❌ No restaurant ID found:', restaurant);
      return errorResponse(res, 500, 'Restaurant ID not found');
    }

    // Query orders by restaurantId (stored as String in Order model)
    // Try multiple restaurantId formats to handle different storage formats
    const restaurantIdVariations = [restaurantIdString];
    
    // Also add ObjectId string format if valid (both directions)
    if (mongoose.Types.ObjectId.isValid(restaurantIdString)) {
      const objectIdString = new mongoose.Types.ObjectId(restaurantIdString).toString();
      if (!restaurantIdVariations.includes(objectIdString)) {
        restaurantIdVariations.push(objectIdString);
      }
      
      // Also try the original ObjectId if restaurantIdString is already a string
      try {
        const objectId = new mongoose.Types.ObjectId(restaurantIdString);
        const objectIdStr = objectId.toString();
        if (!restaurantIdVariations.includes(objectIdStr)) {
          restaurantIdVariations.push(objectIdStr);
        }
      } catch (e) {
        // Ignore if not a valid ObjectId
      }
    }
    
    // Also try direct match without ObjectId conversion
    restaurantIdVariations.push(restaurantIdString);

    // Build query - search for orders with any matching restaurantId variation
    // Use $in for multiple variations and also try direct match as fallback
    const query = {
      $or: [
        { restaurantId: { $in: restaurantIdVariations } },
        // Direct match fallback
        { restaurantId: restaurantIdString }
      ]
    };

    // If status filter is provided, add it to query
    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log('🔍 Fetching orders for restaurant:', {
      restaurantId: restaurantIdString,
      restaurant_id: restaurant._id?.toString(),
      restaurant_restaurantId: restaurant.restaurantId,
      restaurantIdVariations: restaurantIdVariations,
      query: JSON.stringify(query),
      status: status || 'all'
    });

    const orders = await Order.find(query)
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const total = await Order.countDocuments(query);

    // Resolve paymentMethod: order.payment.method or Payment collection (COD fallback)
    const orderIds = orders.map(o => o._id);
    const codOrderIds = new Set();
    try {
      const codPayments = await Payment.find({ orderId: { $in: orderIds }, method: 'cash' }).select('orderId').lean();
      codPayments.forEach(p => codOrderIds.add(p.orderId?.toString()));
    } catch (e) { /* ignore */ }
    const ordersWithPaymentMethod = orders.map(o => {
      let paymentMethod = o.payment?.method ?? 'razorpay';
      if (paymentMethod !== 'cash' && codOrderIds.has(o._id?.toString())) paymentMethod = 'cash';
      return { ...o, paymentMethod };
    });

    // Log detailed order info for debugging
    console.log('✅ Found orders:', {
      count: orders.length,
      total,
      restaurantId: restaurantIdString,
      queryUsed: JSON.stringify(query),
      orders: orders.map(o => ({ 
        orderId: o.orderId, 
        status: o.status, 
        restaurantId: o.restaurantId,
        restaurantIdType: typeof o.restaurantId,
        createdAt: o.createdAt
      }))
    });
    
    // If no orders found, log a warning with more details
    if (orders.length === 0 && total === 0) {
      console.warn('⚠️ No orders found for restaurant:', {
        restaurantId: restaurantIdString,
        restaurant_id: restaurant._id?.toString(),
        variationsTried: restaurantIdVariations,
        query: JSON.stringify(query)
      });
      
      // Try to find ANY orders in database for debugging
      const allOrdersCount = await Order.countDocuments({});
      console.log(`📊 Total orders in database: ${allOrdersCount}`);
      
      // Check if orders exist with similar restaurantId
      const sampleOrders = await Order.find({}).limit(5).select('orderId restaurantId status').lean();
      if (sampleOrders.length > 0) {
        console.log('📊 Sample orders in database (first 5):', sampleOrders.map(o => ({
          orderId: o.orderId,
          restaurantId: o.restaurantId,
          restaurantIdType: typeof o.restaurantId,
          status: o.status
        })));
      }
    }

    return successResponse(res, 200, 'Orders retrieved successfully', {
      orders: ordersWithPaymentMethod,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching restaurant orders:', error);
    return errorResponse(res, 500, 'Failed to fetch orders');
  }
});

/**
 * Get order by ID
 * GET /api/restaurant/orders/:id
 */
export const getRestaurantOrderById = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;

    const restaurantId = restaurant._id?.toString() ||
      restaurant.restaurantId ||
      restaurant.id;

    const restaurantIdVariations = [restaurantId];
    if (restaurant._id) {
      const mongoId = restaurant._id.toString();
      if (!restaurantIdVariations.includes(mongoId)) {
        restaurantIdVariations.push(mongoId);
      }
    }
    if (
      mongoose.Types.ObjectId.isValid(restaurantId) &&
      restaurantId.length === 24
    ) {
      const objectIdString = new mongoose.Types.ObjectId(restaurantId).toString();
      if (!restaurantIdVariations.includes(objectIdString)) {
        restaurantIdVariations.push(objectIdString);
      }
    }
    if (restaurant.restaurantId && !restaurantIdVariations.includes(restaurant.restaurantId)) {
      restaurantIdVariations.push(restaurant.restaurantId);
    }

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdVariations }
      })
        .populate('userId', 'name email phone')
        .lean();
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdVariations }
      })
        .populate('userId', 'name email phone')
        .lean();
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    return successResponse(res, 200, 'Order retrieved successfully', {
      order
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    return errorResponse(res, 500, 'Failed to fetch order');
  }
});

/**
 * Accept order
 * PATCH /api/restaurant/orders/:id/accept
 */
export const acceptOrder = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;
    const { preparationTime } = req.body;

    const restaurantId = restaurant._id?.toString() ||
      restaurant.restaurantId ||
      restaurant.id;

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId
      });
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId
      });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    // Allow accepting orders with status 'pending' or 'confirmed'
    // 'confirmed' status means payment is verified, restaurant can still accept
    if (!['pending', 'confirmed'].includes(order.status)) {
      return errorResponse(res, 400, `Order cannot be accepted. Current status: ${order.status}`);
    }

    // When restaurant accepts order, it means they're starting to prepare it
    // So set status to 'preparing' and mark as confirmed if it was pending
    if (order.status === 'pending') {
      order.tracking.confirmed = { status: true, timestamp: new Date() };
    }

    // Set status to 'preparing' when restaurant accepts
    order.status = 'preparing';
    order.tracking.preparing = { status: true, timestamp: new Date() };

    // Handle preparation time update from restaurant
    if (preparationTime) {
      const restaurantPrepTime = parseInt(preparationTime, 10);
      const initialPrepTime = order.preparationTime || 0;
      
      // Calculate additional time restaurant is adding
      const additionalTime = Math.max(0, restaurantPrepTime - initialPrepTime);
      
      // Update ETA with additional time (add to both min and max)
      if (order.eta) {
        const currentMin = order.eta.min || 0;
        const currentMax = order.eta.max || 0;
        
        order.eta.min = currentMin + additionalTime;
        order.eta.max = currentMax + additionalTime;
        order.eta.additionalTime = (order.eta.additionalTime || 0) + additionalTime;
        order.eta.lastUpdated = new Date();
        
        // Update estimated delivery time to average of new min and max
        order.estimatedDeliveryTime = Math.ceil((order.eta.min + order.eta.max) / 2);
      } else {
        // If ETA doesn't exist, create it
        order.eta = {
          min: (order.estimatedDeliveryTime || 30) + additionalTime,
          max: (order.estimatedDeliveryTime || 30) + additionalTime,
          additionalTime: additionalTime,
          lastUpdated: new Date()
        };
        order.estimatedDeliveryTime = Math.ceil((order.eta.min + order.eta.max) / 2);
      }
      
      console.log(`📋 Restaurant updated preparation time:`, {
        initialPrepTime,
        restaurantPrepTime,
        additionalTime,
        newETA: order.eta,
        newEstimatedDeliveryTime: order.estimatedDeliveryTime
      });
    }

    await order.save();

    // Trigger ETA recalculation for restaurant accepted event
    try {
      const etaEventService = (await import('../../order/services/etaEventService.js')).default;
      await etaEventService.handleRestaurantAccepted(order._id.toString(), new Date());
      console.log(`✅ ETA updated after restaurant accepted order ${order.orderId}`);
    } catch (etaError) {
      console.error('Error updating ETA after restaurant accept:', etaError);
      // Continue even if ETA update fails
    }

    // Notify about status update
    try {
      await notifyRestaurantOrderUpdate(order._id.toString(), 'preparing');
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
    }

    // Priority-based order notification: First notify nearest delivery boys, then expand after 30 seconds
    if (!order.deliveryPartnerId) {
      try {
        console.log(`🔄 Starting priority-based order notification for order ${order.orderId}...`);

        // Get restaurant location
        let restaurantDoc = null;
        if (mongoose.Types.ObjectId.isValid(restaurantId)) {
          restaurantDoc = await Restaurant.findById(restaurantId).lean();
        }
        if (!restaurantDoc) {
          restaurantDoc = await Restaurant.findOne({
            $or: [
              { restaurantId: restaurantId },
              { _id: restaurantId }
            ]
          }).lean();
        }

        if (!restaurantDoc) {
          console.error(`❌ Restaurant not found for restaurantId: ${restaurantId}`);
        } else if (!restaurantDoc.location || !restaurantDoc.location.coordinates ||
          restaurantDoc.location.coordinates.length < 2 ||
          (restaurantDoc.location.coordinates[0] === 0 && restaurantDoc.location.coordinates[1] === 0)) {
          console.error(`❌ Restaurant location not found or invalid for restaurant ${restaurantId}`);
        } else {
          const [restaurantLng, restaurantLat] = restaurantDoc.location.coordinates;
          console.log(`📍 Restaurant location: ${restaurantLat}, ${restaurantLng}`);

          // Reload order to ensure we have the latest version
          const freshOrder = await Order.findById(order._id);
          if (!freshOrder) {
            console.error(`❌ Order ${order.orderId} not found after save`);
          } else if (freshOrder.deliveryPartnerId) {
            console.log(`⚠️ Order ${order.orderId} already has delivery partner: ${freshOrder.deliveryPartnerId}`);
          } else {
            // Step 1: Find nearest delivery boys (within 5km priority distance)
            const priorityDeliveryBoys = await findNearestDeliveryBoys(restaurantLat, restaurantLng, restaurantId, 5);
            
            if (priorityDeliveryBoys && priorityDeliveryBoys.length > 0) {
              console.log(`✅ Found ${priorityDeliveryBoys.length} priority delivery partners within 5km`);
              
              // Store priority notification info in order
              freshOrder.assignmentInfo = {
                priorityNotifiedAt: new Date(),
                priorityDeliveryPartnerIds: priorityDeliveryBoys.map(db => db.deliveryPartnerId),
                notificationPhase: 'priority'
              };
              await freshOrder.save();

              // Reload order with populated userId and restaurantId (with location)
              const populatedOrder = await Order.findById(freshOrder._id)
                .populate('userId', 'name phone')
                .populate('restaurantId', 'name address location phone ownerPhone')
                .lean();

              if (populatedOrder) {
                // Notify priority delivery boys (without assigning)
                const priorityIds = priorityDeliveryBoys.map(db => db.deliveryPartnerId);
                await notifyMultipleDeliveryBoys(populatedOrder, priorityIds, 'priority');
                console.log(`✅ Notified ${priorityIds.length} priority delivery partners for order ${order.orderId}`);

                // Step 2: Set timeout to expand to other delivery boys after 30 seconds
                setTimeout(async () => {
                  try {
                    // Re-check if order still doesn't have delivery partner
                    const checkOrder = await Order.findById(order._id);
                    if (!checkOrder || checkOrder.deliveryPartnerId) {
                      console.log(`ℹ️ Order ${order.orderId} already assigned, skipping expanded notification`);
                      return;
                    }

                    console.log(`⏰ 30 seconds passed, expanding notification to other delivery partners for order ${order.orderId}`);
                    
                    // Find all other delivery boys (excluding already notified priority ones)
                    // Get all delivery boys within 50km, excluding priority ones
                    const allDeliveryBoys = await findNearestDeliveryBoys(
                      restaurantLat, 
                      restaurantLng, 
                      restaurantId, 
                      50 // Max distance 50km
                    );

                    // Filter out priority delivery boys
                    const expandedDeliveryBoys = allDeliveryBoys.filter(
                      db => !priorityIds.includes(db.deliveryPartnerId)
                    );

                    if (expandedDeliveryBoys && expandedDeliveryBoys.length > 0) {
                      const expandedIds = expandedDeliveryBoys.map(db => db.deliveryPartnerId);
                      
                      // Update assignment info
                      checkOrder.assignmentInfo = {
                        ...(checkOrder.assignmentInfo || {}),
                        expandedNotifiedAt: new Date(),
                        expandedDeliveryPartnerIds: expandedIds,
                        notificationPhase: 'expanded'
                      };
                      await checkOrder.save();

                      // Reload with populated userId and restaurantId (with location)
                      const expandedOrder = await Order.findById(checkOrder._id)
                        .populate('userId', 'name phone')
                        .populate('restaurantId', 'name address location phone ownerPhone')
                        .lean();

                      if (expandedOrder) {
                        // Notify all expanded delivery boys
                        await notifyMultipleDeliveryBoys(expandedOrder, expandedIds, 'expanded');
                        console.log(`✅ Notified ${expandedIds.length} expanded delivery partners for order ${order.orderId}`);
                      }
                    } else {
                      console.warn(`⚠️ No additional delivery partners found for order ${order.orderId}`);
                    }
                  } catch (expandError) {
                    console.error(`❌ Error in expanded notification for order ${order.orderId}:`, expandError);
                  }
                }, 30000); // 30 seconds timeout
              }
            } else {
              // No priority delivery boys found, immediately try to find any delivery boy
              console.log(`⚠️ No priority delivery partners found, searching for any available delivery partner`);
              const anyDeliveryBoy = await findNearestDeliveryBoy(restaurantLat, restaurantLng, restaurantId, 50);
              
              if (anyDeliveryBoy) {
                const populatedOrder = await Order.findById(freshOrder._id)
                  .populate('userId', 'name phone')
                  .lean();

                if (populatedOrder) {
                  await notifyMultipleDeliveryBoys(populatedOrder, [anyDeliveryBoy.deliveryPartnerId], 'immediate');
                  console.log(`✅ Notified delivery partner immediately for order ${order.orderId}`);
                }
              } else {
                console.warn(`⚠️ No delivery partners available for order ${order.orderId}`);
              }
            }
          }
        }
      } catch (assignmentError) {
        console.error('❌ Error in priority-based order notification:', assignmentError);
        console.error('❌ Error stack:', assignmentError.stack);
        // Don't fail the order acceptance if notification fails
      }
    } else {
      console.log(`ℹ️ Order ${order.orderId} already has delivery partner assigned: ${order.deliveryPartnerId}`);
    }

    return successResponse(res, 200, 'Order accepted successfully', {
      order
    });
  } catch (error) {
    console.error('Error accepting order:', error);
    return errorResponse(res, 500, 'Failed to accept order');
  }
});

/**
 * Reject order
 * PATCH /api/restaurant/orders/:id/reject
 */
export const rejectOrder = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;
    const { reason } = req.body;

    const restaurantId = restaurant._id?.toString() ||
      restaurant.restaurantId ||
      restaurant.id;

    // Log for debugging
    console.log('🔍 Reject order - Looking up order:', {
      orderIdParam: id,
      restaurantId: restaurantId,
      restaurant_id: restaurant._id?.toString(),
      restaurant_restaurantId: restaurant.restaurantId
    });

    // Prepare restaurantId variations for query (handle both _id and restaurantId formats)
    const restaurantIdVariations = [restaurantId];
    if (mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
      const objectIdString = new mongoose.Types.ObjectId(restaurantId).toString();
      if (!restaurantIdVariations.includes(objectIdString)) {
        restaurantIdVariations.push(objectIdString);
      }
    }
    // Also add restaurant._id if different
    if (restaurant._id) {
      const restaurantMongoId = restaurant._id.toString();
      if (!restaurantIdVariations.includes(restaurantMongoId)) {
        restaurantIdVariations.push(restaurantMongoId);
      }
    }
    // Also add restaurant.restaurantId if different
    if (restaurant.restaurantId && !restaurantIdVariations.includes(restaurant.restaurantId)) {
      restaurantIdVariations.push(restaurant.restaurantId);
    }

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId: { $in: restaurantIdVariations }
      });
      console.log('🔍 Order lookup by _id:', {
        orderId: id,
        found: !!order,
        orderRestaurantId: order?.restaurantId
      });
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId: { $in: restaurantIdVariations }
      });
      console.log('🔍 Order lookup by orderId:', {
        orderId: id,
        found: !!order,
        orderRestaurantId: order?.restaurantId,
        restaurantIdVariations
      });
    }

    if (!order) {
      console.error('❌ Order not found for rejection:', {
        orderIdParam: id,
        restaurantId: restaurantId,
        restaurantIdVariations,
        restaurant_id: restaurant._id?.toString(),
        restaurant_restaurantId: restaurant.restaurantId
      });
      return errorResponse(res, 404, 'Order not found');
    }

    console.log('✅ Order found for rejection:', {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
      orderRestaurantId: order.restaurantId,
      orderStatus: order.status
    });

    // Allow rejecting/cancelling orders with status 'pending', 'confirmed', or 'preparing'
    if (!['pending', 'confirmed', 'preparing'].includes(order.status)) {
      return errorResponse(res, 400, `Order cannot be cancelled. Current status: ${order.status}`);
    }

    order.status = 'cancelled';
    order.cancellationReason = reason || 'Cancelled by restaurant';
    order.cancelledBy = 'restaurant';
    order.cancelledAt = new Date();
    await order.save();

    // Calculate refund amount but don't process automatically
    // Admin will process refund manually via refund button
    try {
      const { calculateCancellationRefund } = await import('../../order/services/cancellationRefundService.js');
      await calculateCancellationRefund(order._id, reason || 'Rejected by restaurant');
      console.log(`✅ Cancellation refund calculated for order ${order.orderId} - awaiting admin approval`);
    } catch (refundError) {
      console.error(`❌ Error calculating cancellation refund for order ${order.orderId}:`, refundError);
      // Don't fail order cancellation if refund calculation fails
      // But log it for investigation
    }

    // Notify about status update
    try {
      await notifyRestaurantOrderUpdate(order._id.toString(), 'cancelled');
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
    }

    return successResponse(res, 200, 'Order rejected successfully', {
      order
    });
  } catch (error) {
    console.error('Error rejecting order:', error);
    return errorResponse(res, 500, 'Failed to reject order');
  }
});

/**
 * Update order status to preparing
 * PATCH /api/restaurant/orders/:id/preparing
 */
export const markOrderPreparing = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;

    const restaurantId = restaurant._id?.toString() ||
      restaurant.restaurantId ||
      restaurant.id;

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId
      });
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId
      });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    // Allow marking as preparing if status is 'confirmed', 'pending', or already 'preparing' (for retry scenarios)
    // If already preparing, we allow it to retry delivery assignment if no delivery partner is assigned
    const allowedStatuses = ['confirmed', 'pending', 'preparing'];
    if (!allowedStatuses.includes(order.status)) {
      return errorResponse(res, 400, `Order cannot be marked as preparing. Current status: ${order.status}`);
    }

    // Only update status if it's not already preparing
    // If already preparing, we're just retrying delivery assignment
    const wasAlreadyPreparing = order.status === 'preparing';
    if (!wasAlreadyPreparing) {
      order.status = 'preparing';
      order.tracking.preparing = { status: true, timestamp: new Date() };
      await order.save();
    }

    // Notify about status update only if status actually changed
    if (!wasAlreadyPreparing) {
      try {
        await notifyRestaurantOrderUpdate(order._id.toString(), 'preparing');
      } catch (notifError) {
        console.error('Error sending notification:', notifError);
      }
    }

    // CRITICAL: Don't assign delivery partner if order is cancelled
    if (freshOrder.status === 'cancelled') {
      console.log(`⚠️ Order ${freshOrder.orderId} is cancelled. Cannot assign delivery partner.`);
      return successResponse(res, 200, 'Order is cancelled. Cannot assign delivery partner.', {
        order: freshOrder
      });
    }

    // Assign order to nearest delivery boy and notify them (if not already assigned)
    // This is critical - even if order is already preparing, we need to assign delivery partner
    // Reload order first to get the latest state (in case it was updated elsewhere)
    const freshOrder = await Order.findById(order._id);
    if (!freshOrder) {
      console.error(`❌ Order ${order.orderId} not found after save`);
      return errorResponse(res, 404, 'Order not found after update');
    }

    // CRITICAL: Don't assign delivery partner if order is cancelled
    if (freshOrder.status === 'cancelled') {
      console.log(`⚠️ Order ${freshOrder.orderId} is cancelled. Cannot assign delivery partner.`);
      return successResponse(res, 200, 'Order is cancelled. Cannot assign delivery partner.', {
        order: freshOrder
      });
    }

    // Check if delivery partner is already assigned (after reload)
    if (!freshOrder.deliveryPartnerId) {
      try {
        console.log(`🔄 Attempting to assign order ${freshOrder.orderId} to delivery boy (status: ${freshOrder.status})...`);

        // Get restaurant location
        let restaurantDoc = null;
        if (mongoose.Types.ObjectId.isValid(restaurantId)) {
          restaurantDoc = await Restaurant.findById(restaurantId).lean();
        }
        if (!restaurantDoc) {
          restaurantDoc = await Restaurant.findOne({
            $or: [
              { restaurantId: restaurantId },
              { _id: restaurantId }
            ]
          }).lean();
        }

        if (!restaurantDoc) {
          console.error(`❌ Restaurant not found for restaurantId: ${restaurantId}`);
          return errorResponse(res, 500, 'Restaurant location not found. Cannot assign delivery partner.');
        }

        if (!restaurantDoc.location || !restaurantDoc.location.coordinates ||
          restaurantDoc.location.coordinates.length < 2 ||
          (restaurantDoc.location.coordinates[0] === 0 && restaurantDoc.location.coordinates[1] === 0)) {
          console.error(`❌ Restaurant location not found or invalid for restaurant ${restaurantId}`);
          return errorResponse(res, 500, 'Restaurant location is invalid. Please update restaurant location.');
        }

        const [restaurantLng, restaurantLat] = restaurantDoc.location.coordinates;
        console.log(`📍 Restaurant location: ${restaurantLat}, ${restaurantLng}`);

        // Check if order already has delivery partner assigned
        const orderCheck = await Order.findById(freshOrder._id).select('deliveryPartnerId');
        const isResendRequest = req.query.resend === 'true' || req.body.resend === true;

        // If order already has delivery partner and it's a resend request, resend notification to existing partner
        if (orderCheck && orderCheck.deliveryPartnerId && isResendRequest) {
          console.log(`🔄 Resend request detected - resending notification to existing delivery partner ${orderCheck.deliveryPartnerId}`);

          // Reload order with populated userId
          const populatedOrder = await Order.findById(freshOrder._id)
            .populate('userId', 'name phone')
            .lean();

          if (!populatedOrder) {
            console.error(`❌ Could not reload order ${freshOrder.orderId} for resend`);
            return errorResponse(res, 500, 'Could not reload order for resend');
          }

          // Resend notification to existing delivery partner
          try {
            await notifyDeliveryBoyNewOrder(populatedOrder, orderCheck.deliveryPartnerId);
            console.log(`✅ Resent notification to delivery partner ${orderCheck.deliveryPartnerId} for order ${freshOrder.orderId}`);

            const finalOrder = await Order.findById(freshOrder._id);
            return successResponse(res, 200, 'Notification resent to delivery partner', {
              order: finalOrder,
              resend: true,
              deliveryPartnerId: orderCheck.deliveryPartnerId
            });
          } catch (notifyError) {
            console.error(`❌ Error resending notification:`, notifyError);
            // Continue to try reassignment if notification fails
            console.log(`🔄 Notification failed, attempting to reassign to new delivery partner...`);
          }
        }

        // If order already has delivery partner and it's NOT a resend request, just return
        if (orderCheck && orderCheck.deliveryPartnerId && !isResendRequest) {
          console.log(`⚠️ Order ${freshOrder.orderId} was assigned delivery partner ${orderCheck.deliveryPartnerId} by another process`);
          // Reload full order for response
          const updatedOrder = await Order.findById(freshOrder._id);
          return successResponse(res, 200, 'Order marked as preparing', {
            order: updatedOrder
          });
        }

        // If resend request failed notification, or no partner assigned, try to assign/reassign
        // Clear existing assignment if resend request
        if (isResendRequest && orderCheck && orderCheck.deliveryPartnerId) {
          console.log(`🔄 Resend request - clearing existing delivery partner to allow reassignment`);
          freshOrder.deliveryPartnerId = null;
          freshOrder.assignmentInfo = undefined;
          await freshOrder.save();
          // Reload to get fresh state
          const reloadedOrder = await Order.findById(freshOrder._id);
          if (reloadedOrder) {
            freshOrder = reloadedOrder;
          }
        }

        // Assign to nearest delivery boy
        const assignmentResult = await assignOrderToDeliveryBoy(freshOrder, restaurantLat, restaurantLng, restaurantId);

        if (assignmentResult && assignmentResult.deliveryPartnerId) {
          // Reload order with populated userId after assignment
          const populatedOrder = await Order.findById(freshOrder._id)
            .populate('userId', 'name phone')
            .lean();

          if (!populatedOrder) {
            console.error(`❌ Could not reload order ${freshOrder.orderId} after assignment`);
            return errorResponse(res, 500, 'Order assignment succeeded but could not reload order');
          } else {
            // Notify delivery boy about the new order
            try {
              await notifyDeliveryBoyNewOrder(populatedOrder, assignmentResult.deliveryPartnerId);
              console.log(`✅ Order ${freshOrder.orderId} assigned to delivery boy ${assignmentResult.deliveryPartnerId} and notification sent`);
            } catch (notifyError) {
              console.error(`❌ Error notifying delivery boy:`, notifyError);
              console.error(`❌ Notification error details:`, {
                message: notifyError.message,
                stack: notifyError.stack
              });
              // Assignment succeeded but notification failed - still return success but log error
              console.warn(`⚠️ Order assigned but notification failed. Delivery boy may need to refresh.`);
            }

            // Reload full order for response
            const finalOrder = await Order.findById(freshOrder._id);
            return successResponse(res, 200, 'Order marked as preparing and assigned to delivery partner', {
              order: finalOrder,
              assignment: assignmentResult
            });
          }
        } else {
          console.warn(`⚠️ Could not assign order ${freshOrder.orderId} to delivery boy - no available delivery partners`);
          // Return success but warn about no delivery partners
          const finalOrder = await Order.findById(freshOrder._id);
          return successResponse(res, 200, 'Order marked as preparing, but no delivery partners available', {
            order: finalOrder,
            warning: 'No delivery partners available. Order will be assigned when a delivery partner comes online.'
          });
        }
      } catch (assignmentError) {
        console.error('❌ Error assigning order to delivery boy:', assignmentError);
        console.error('❌ Error stack:', assignmentError.stack);
        // Return error so restaurant knows assignment failed
        const finalOrder = await Order.findById(freshOrder._id);
        return errorResponse(res, 500, `Order marked as preparing, but delivery assignment failed: ${assignmentError.message}`, {
          order: finalOrder
        });
      }
    } else {
      console.log(`ℹ️ Order ${freshOrder.orderId} already has delivery partner assigned: ${freshOrder.deliveryPartnerId}`);
      // Reload full order for response
      const finalOrder = await Order.findById(freshOrder._id);
      return successResponse(res, 200, 'Order marked as preparing', {
        order: finalOrder
      });
    }
  } catch (error) {
    console.error('Error updating order status:', error);
    return errorResponse(res, 500, 'Failed to update order status');
  }
});

/**
 * Update order status to ready
 * PATCH /api/restaurant/orders/:id/ready
 */
export const markOrderReady = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;

    const restaurantId = restaurant._id?.toString() ||
      restaurant.restaurantId ||
      restaurant.id;

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId
      });
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId
      });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    if (order.status !== 'preparing') {
      return errorResponse(res, 400, `Order cannot be marked as ready. Current status: ${order.status}`);
    }

    // Update order status and tracking
    const now = new Date();
    order.status = 'ready';
    if (!order.tracking) {
      order.tracking = {};
    }
    order.tracking.ready = {
      status: true,
      timestamp: now
    };
    await order.save();

    // Populate order for notifications
    const populatedOrder = await Order.findById(order._id)
      .populate('restaurantId', 'name location address phone')
      .populate('userId', 'name phone')
      .populate('deliveryPartnerId', 'name phone')
      .lean();

    try {
      await notifyRestaurantOrderUpdate(order._id.toString(), 'ready');
    } catch (notifError) {
      console.error('Error sending restaurant notification:', notifError);
    }

    // Notify delivery boy that order is ready for pickup
    if (populatedOrder.deliveryPartnerId) {
      try {
        const { notifyDeliveryBoyOrderReady } = await import('../../order/services/deliveryNotificationService.js');
        const deliveryPartnerId = populatedOrder.deliveryPartnerId._id || populatedOrder.deliveryPartnerId;
        await notifyDeliveryBoyOrderReady(populatedOrder, deliveryPartnerId);
        console.log(`✅ Order ready notification sent to delivery partner ${deliveryPartnerId}`);
      } catch (deliveryNotifError) {
        console.error('Error sending delivery boy notification:', deliveryNotifError);
      }
    }

    return successResponse(res, 200, 'Order marked as ready', {
      order: populatedOrder || order
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    return errorResponse(res, 500, 'Failed to update order status');
  }
});

/**
 * Resend delivery notification for unassigned order
 * POST /api/restaurant/orders/:id/resend-delivery-notification
 */
export const resendDeliveryNotification = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { id } = req.params;

    const restaurantId = restaurant._id?.toString() ||
      restaurant.restaurantId ||
      restaurant.id;

    // Try to find order by MongoDB _id or orderId
    let order = null;

    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        restaurantId
      });
    }

    if (!order) {
      order = await Order.findOne({
        orderId: id,
        restaurantId
      });
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    // Check if order is in valid status (preparing or ready)
    if (!['preparing', 'ready'].includes(order.status)) {
      return errorResponse(res, 400, `Cannot resend notification. Order status must be 'preparing' or 'ready'. Current status: ${order.status}`);
    }

    // Get restaurant location
    const restaurantDoc = await Restaurant.findById(restaurantId)
      .select('location')
      .lean();

    if (!restaurantDoc || !restaurantDoc.location || !restaurantDoc.location.coordinates) {
      return errorResponse(res, 400, 'Restaurant location not found. Please update restaurant location.');
    }

    const [restaurantLng, restaurantLat] = restaurantDoc.location.coordinates;

    // Find nearest delivery boys
    const priorityDeliveryBoys = await findNearestDeliveryBoys(
      restaurantLat,
      restaurantLng,
      restaurantId,
      20, // 20km radius for priority
      10  // Top 10 nearest
    );

    if (!priorityDeliveryBoys || priorityDeliveryBoys.length === 0) {
      // Try with larger radius
      const allDeliveryBoys = await findNearestDeliveryBoys(
        restaurantLat,
        restaurantLng,
        restaurantId,
        50, // 50km radius
        20  // Top 20 nearest
      );

      if (!allDeliveryBoys || allDeliveryBoys.length === 0) {
        return errorResponse(res, 404, 'No delivery partners available in your area');
      }

      // Notify all available delivery boys
      const populatedOrder = await Order.findById(order._id)
        .populate('userId', 'name phone')
        .populate('restaurantId', 'name location address phone ownerPhone')
        .lean();

      if (populatedOrder) {
        const deliveryPartnerIds = allDeliveryBoys.map(db => db.deliveryPartnerId);
        
        // Update assignment info
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            'assignmentInfo.priorityDeliveryPartnerIds': deliveryPartnerIds,
            'assignmentInfo.assignedBy': 'manual_resend',
            'assignmentInfo.assignedAt': new Date()
          }
        });

        await notifyMultipleDeliveryBoys(populatedOrder, deliveryPartnerIds, 'priority');
        
        console.log(`✅ Resent notification to ${deliveryPartnerIds.length} delivery partners for order ${order.orderId}`);

        return successResponse(res, 200, `Notification sent to ${deliveryPartnerIds.length} delivery partners`, {
          order: populatedOrder,
          notifiedCount: deliveryPartnerIds.length
        });
      }
    } else {
      // Notify priority delivery boys
      const populatedOrder = await Order.findById(order._id)
        .populate('userId', 'name phone')
        .populate('restaurantId', 'name location address phone ownerPhone')
        .lean();

      if (populatedOrder) {
        const priorityIds = priorityDeliveryBoys.map(db => db.deliveryPartnerId);
        
        // Update assignment info
        await Order.findByIdAndUpdate(order._id, {
          $set: {
            'assignmentInfo.priorityDeliveryPartnerIds': priorityIds,
            'assignmentInfo.assignedBy': 'manual_resend',
            'assignmentInfo.assignedAt': new Date()
          }
        });

        await notifyMultipleDeliveryBoys(populatedOrder, priorityIds, 'priority');
        
        console.log(`✅ Resent notification to ${priorityIds.length} priority delivery partners for order ${order.orderId}`);

        return successResponse(res, 200, `Notification sent to ${priorityIds.length} delivery partners`, {
          order: populatedOrder,
          notifiedCount: priorityIds.length
        });
      }
    }

    return errorResponse(res, 500, 'Failed to send notification');
  } catch (error) {
    console.error('Error resending delivery notification:', error);
    return errorResponse(res, 500, `Failed to resend notification: ${error.message}`);
  }
});

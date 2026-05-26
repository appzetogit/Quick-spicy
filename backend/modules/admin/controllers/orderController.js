import Order from '../../order/models/Order.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import mongoose from 'mongoose';
import { findNearestDeliveryBoys } from '../../order/services/deliveryAssignmentService.js';
import { notifyMultipleDeliveryBoys } from '../../order/services/deliveryNotificationService.js';
import { notifyRestaurantOrderUpdate } from '../../order/services/restaurantNotificationService.js';
import { notifyUserOrderUpdate } from '../../order/services/userNotificationService.js';
import { sendAdminOrderSmsAlertForOrder } from '../../order/services/adminNotificationService.js';
import { removeActiveOrderTracking, syncDeliveryPartnerPresence } from '../../delivery/services/firebaseRealtimeTrackingService.js';

const ADMIN_ORDER_SMS_FALLBACK_WINDOW_MS = 30 * 60 * 1000;
const ONLINE_PAYMENT_METHODS = ['cashfree', 'razorpay', 'upi', 'card'];

function normalizeLocation(location) {
  if (!location || typeof location !== 'object') return null;

  const coordinates = Array.isArray(location.coordinates) && location.coordinates.length >= 2
    ? [Number(location.coordinates[0]), Number(location.coordinates[1])]
    : null;

  return {
    ...location,
    coordinates: coordinates && coordinates.every((value) => Number.isFinite(value))
      ? coordinates
      : location.coordinates,
  };
}

function buildRestaurantLookupKeys(restaurant) {
  if (!restaurant || typeof restaurant !== 'object') return [];

  return [
    restaurant._id?.toString?.(),
    restaurant.restaurantId,
    restaurant.name,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function getRestaurantFromMaps(order, restaurantMaps) {
  const restaurantRef = order?.restaurantId;
  if (restaurantRef && typeof restaurantRef === 'object') {
    return restaurantRef;
  }

  const candidates = [
    restaurantRef,
    order?.restaurantId,
    order?.restaurantName,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const directMatch = restaurantMaps.byKey.get(candidate);
    if (directMatch) return directMatch;

    const nameMatch = restaurantMaps.byName.get(candidate.toLowerCase());
    if (nameMatch) return nameMatch;
  }

  return null;
}

function buildUnpaidOnlinePlaceholderCondition() {
  return {
    'payment.method': { $in: ONLINE_PAYMENT_METHODS },
    'payment.status': 'pending',
    'tracking.confirmed.status': { $ne: true }
  };
}

function isUnpaidOnlinePlaceholderOrder(order) {
  const paymentMethod = String(order?.payment?.method || '').toLowerCase();
  const paymentStatus = String(order?.payment?.status || '').toLowerCase();
  const isConfirmed = order?.tracking?.confirmed?.status === true;

  return ONLINE_PAYMENT_METHODS.includes(paymentMethod) &&
    paymentStatus === 'pending' &&
    !isConfirmed;
}

async function sendAdminOrderSmsAlertsFromOrders(orders = []) {
  const now = Date.now();
  const candidates = (orders || [])
    .filter((order) => {
      const isEligibleStatus = ['pending', 'confirmed'].includes(String(order?.status || '').toLowerCase());
      const isAlreadySent = !!order?.adminOrderSmsAlertSentAt;
      const createdAtMs = order?.createdAt ? new Date(order.createdAt).getTime() : 0;
      const isRecent = createdAtMs > 0 && now - createdAtMs <= ADMIN_ORDER_SMS_FALLBACK_WINDOW_MS;
      return isEligibleStatus && !isAlreadySent && isRecent;
    })
    .slice(0, 3);

  for (const order of candidates) {
    try {
      await sendAdminOrderSmsAlertForOrder(order);
    } catch (error) {
      console.warn('Admin orders/all SMS fallback failed:', {
        orderId: order?.orderId,
        error: error?.message,
      });
    }
  }
}

/**
 * Get all orders for admin
 * GET /api/admin/orders
 * Query params: status, page, limit, search, fromDate, toDate, restaurant, paymentStatus
 */
export const getOrders = asyncHandler(async (req, res) => {
  try {
    const { 
      status, 
      page = 1, 
      limit = 50,
      search,
      fromDate,
      toDate,
      restaurant,
      paymentStatus,
      zone,
      customer,
      cancelledBy
    } = req.query;

    // Build query
    const query = {};
    const queryAndConditions = [];

    // Status filter
    if (status && status !== 'all') {
      // Map frontend status keys to backend status values
      const statusMap = {
        'scheduled': 'scheduled',
        'pending': 'pending',
        'accepted': 'confirmed',
        'processing': 'preparing',
        'food-on-the-way': 'out_for_delivery',
        'delivered': 'delivered',
        'canceled': 'cancelled',
        'restaurant-cancelled': 'cancelled',
        'payment-failed': 'failed',
        'refunded': 'refunded',
        'dine-in': 'dine_in',
        'offline-payments': null
      };
      
      const mappedStatus = statusMap[status] || status;
      if (mappedStatus) {
        query.status = mappedStatus;
      }
      
      // Restaurant-cancelled should rely on explicit canceller when available.
      if (status === 'restaurant-cancelled') {
        query.cancelledBy = 'restaurant';
      }

      // Payment failed should be filtered by payment status.
      if (status === 'payment-failed') {
        query['payment.status'] = 'failed';
      }

      // Refunded should be filtered by payment status.
      if (status === 'refunded') {
        query['payment.status'] = 'refunded';
      }

      // Offline payments should be based on payment method, not order status.
      if (status === 'offline-payments') {
        query['payment.method'] = { $in: ['cash', 'cod'] };
      }
    }
    
    // Also handle cancelledBy query parameter (if passed separately)
    if (cancelledBy === 'restaurant') {
      query.status = 'cancelled';
      query.cancelledBy = 'restaurant';
    }

    // Payment status filter
    if (paymentStatus) {
      query['payment.status'] = paymentStatus.toLowerCase();
    }

    // Date range filter
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        query.createdAt.$gte = startDate;
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    // Restaurant filter
    if (restaurant && restaurant !== 'All restaurants') {
      // Try to find restaurant by name or ID
      const Restaurant = (await import('../../restaurant/models/Restaurant.js')).default;
      const restaurantDoc = await Restaurant.findOne({
        $or: [
          { name: { $regex: restaurant, $options: 'i' } },
          { _id: mongoose.Types.ObjectId.isValid(restaurant) ? restaurant : null },
          { restaurantId: restaurant }
        ]
      }).select('_id restaurantId').lean();

      if (restaurantDoc) {
        query.restaurantId = restaurantDoc._id?.toString() || restaurantDoc.restaurantId;
      }
    }

    // Zone filter
    if (zone && zone !== 'All Zones') {
      const normalizedZone = String(zone).trim();

      if (mongoose.Types.ObjectId.isValid(normalizedZone)) {
        query['assignmentInfo.zoneId'] = normalizedZone;
      } else {
        // Find zone by name
        const Zone = (await import('../models/Zone.js')).default;
        const zoneDoc = await Zone.findOne({
          $or: [
            { name: { $regex: normalizedZone, $options: 'i' } },
            { zoneName: { $regex: normalizedZone, $options: 'i' } }
          ]
        }).select('_id name').lean();

        if (zoneDoc) {
          query['assignmentInfo.zoneId'] = zoneDoc._id?.toString();
        }
      }
    }

    // Customer filter
    if (customer && customer !== 'All customers') {
      const User = (await import('../../auth/models/User.js')).default;
      const userDoc = await User.findOne({
        name: { $regex: customer, $options: 'i' }
      }).select('_id').lean();

      if (userDoc) {
        query.userId = userDoc._id;
      }
    }

    // Search filter (orderId, customer name, customer phone)
    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } }
      ];

      // If search looks like a phone number, search in customer data
      const phoneRegex = /[\d\s\+\-()]+/;
      if (phoneRegex.test(search)) {
        const User = (await import('../../auth/models/User.js')).default;
        const cleanSearch = search.replace(/\D/g, '');
        const userSearchQuery = { phone: { $regex: cleanSearch, $options: 'i' } };
        if (mongoose.Types.ObjectId.isValid(search)) {
          userSearchQuery._id = search;
        }
        const users = await User.find(userSearchQuery).select('_id').lean();
        const userIds = users.map(u => u._id);
        if (userIds.length > 0) {
          query.$or.push({ userId: { $in: userIds } });
        }
      }

      // Also search by customer name
      const User = (await import('../../auth/models/User.js')).default;
      const usersByName = await User.find({
        name: { $regex: search, $options: 'i' }
      }).select('_id').lean();
      const userIdsByName = usersByName.map(u => u._id);
      if (userIdsByName.length > 0) {
        if (!query.$or) query.$or = [];
        query.$or.push({ userId: { $in: userIdsByName } });
      }

      // Ensure $or array is not empty
      if (query.$or && query.$or.length === 0) {
        delete query.$or;
      }
    }

    // Hide unpaid online placeholder orders from admin lists.
    // These records are created before Cashfree verification, but they should
    // not appear as real admin-manageable orders until payment succeeds or fails.
    queryAndConditions.push({
      $nor: [buildUnpaidOnlinePlaceholderCondition()]
    });

    if (queryAndConditions.length > 0) {
      query.$and = [...(query.$and || []), ...queryAndConditions];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch orders with population
    const orders = await Order.find(query)
      .populate('userId', 'name email phone')
      .populate('restaurantId', 'name slug location address phone restaurantId')
      .populate('deliveryPartnerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    // Fallback path: when admin opens /orders/all, attempt SMS for recent unsent orders.
    // This covers cases where realtime event delivery was missed.
    if (!status || status === 'all') {
      void sendAdminOrderSmsAlertsFromOrders(orders);
    }

    const restaurantMaps = {
      byKey: new Map(),
      byName: new Map(),
    };

    try {
      const Restaurant = (await import('../../restaurant/models/Restaurant.js')).default;
      const restaurantIds = new Set();
      const restaurantObjectIds = new Set();
      const restaurantNames = new Set();

      orders.forEach((order) => {
        const restaurantRef = order?.restaurantId;

        if (restaurantRef && typeof restaurantRef === 'object') {
          buildRestaurantLookupKeys(restaurantRef).forEach((key) => {
            restaurantMaps.byKey.set(key, restaurantRef);
          });
          if (restaurantRef.name) {
            restaurantMaps.byName.set(String(restaurantRef.name).trim().toLowerCase(), restaurantRef);
          }
          return;
        }

        const restaurantIdValue = String(restaurantRef || '').trim();
        if (restaurantIdValue) {
          restaurantIds.add(restaurantIdValue);
          if (mongoose.Types.ObjectId.isValid(restaurantIdValue)) {
            restaurantObjectIds.add(restaurantIdValue);
          }
        }

        const restaurantName = String(order?.restaurantName || '').trim();
        if (restaurantName) restaurantNames.add(restaurantName);
      });

      const restaurantLookupConditions = [];
      if (restaurantObjectIds.size > 0) {
        restaurantLookupConditions.push({ _id: { $in: [...restaurantObjectIds] } });
      }
      if (restaurantIds.size > 0) {
        restaurantLookupConditions.push({ restaurantId: { $in: [...restaurantIds] } });
      }
      if (restaurantNames.size > 0) {
        restaurantLookupConditions.push({ name: { $in: [...restaurantNames] } });
      }

      if (restaurantLookupConditions.length > 0) {
        const restaurants = await Restaurant.find({ $or: restaurantLookupConditions })
          .select('name slug location address phone restaurantId')
          .lean();

        restaurants.forEach((restaurant) => {
          buildRestaurantLookupKeys(restaurant).forEach((key) => {
            restaurantMaps.byKey.set(key, restaurant);
          });
          if (restaurant.name) {
            restaurantMaps.byName.set(String(restaurant.name).trim().toLowerCase(), restaurant);
          }
        });
      }
    } catch (err) {
      console.warn('Could not batch fetch restaurant locations for orders:', err.message);
    }

    // Get total count
    const total = await Order.countDocuments(query);

    // Batch fetch settlements for platform fee and refund status (more efficient than individual queries)
    let settlementMap = new Map();
    let refundStatusMap = new Map();
    try {
      const OrderSettlement = (await import('../../order/models/OrderSettlement.js')).default;
      const orderIds = orders.map(o => o._id);
      const settlements = await OrderSettlement.find({ orderId: { $in: orderIds } })
        .select('orderId userPayment.platformFee cancellationDetails.refundStatus')
        .lean();
      
      // Create maps for quick lookup
      settlements.forEach(s => {
        if (s.orderId) {
          if (s.userPayment?.platformFee !== undefined) {
            settlementMap.set(s.orderId.toString(), s.userPayment.platformFee);
          }
          if (s.cancellationDetails?.refundStatus) {
            refundStatusMap.set(s.orderId.toString(), s.cancellationDetails.refundStatus);
          }
        }
      });
    } catch (err) {
      console.warn('Could not batch fetch settlements:', err.message);
    }

    // Transform orders to match frontend format
    const transformedOrders = orders.map((order, index) => {
      const restaurantDoc = getRestaurantFromMaps(order, restaurantMaps);
      const orderDate = new Date(order.createdAt);
      const dateStr = orderDate.toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      }).toUpperCase();
      const timeStr = orderDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }).toUpperCase();

      // Get customer phone (unmasked - show full number for admin)
      const customerPhone = order.userId?.phone || '';

      // Map payment status
      const paymentStatusMap = {
        completed: 'Paid',
        pending: 'Pending',
        failed: 'Failed',
        refunded: 'Refunded',
        processing: 'Processing',
      };
      const rawPaymentStatus = String(order.payment?.status || '').toLowerCase();
      const paymentStatusDisplay = paymentStatusMap[rawPaymentStatus] || 'Pending';

      // Map order status for display
      // Check if cancelled and determine who cancelled it
      let orderStatusDisplay;
      if (order.status === 'cancelled') {
        // Check cancelledBy field to determine who cancelled
        if (order.cancelledBy === 'restaurant') {
          orderStatusDisplay = 'Cancelled by Restaurant';
        } else if (order.cancelledBy === 'user') {
          orderStatusDisplay = 'Cancelled by User';
        } else {
          // Fallback: check cancellation reason pattern for old orders
          const cancellationReason = order.cancellationReason || '';
          const isRestaurantCancelled = /rejected by restaurant|restaurant rejected|restaurant cancelled|restaurant is too busy|item not available|outside delivery area|kitchen closing|technical issue/i.test(cancellationReason);
          orderStatusDisplay = isRestaurantCancelled ? 'Cancelled by Restaurant' : 'Cancelled by User';
        }
      } else {
        const statusMap = {
          'pending': 'Pending',
          'confirmed': 'Accepted',
          'preparing': 'Processing',
          'ready': 'Ready',
          'out_for_delivery': 'Food On The Way',
          'delivered': 'Delivered',
          'scheduled': 'Scheduled',
          'dine_in': 'Dine In'
        };
        orderStatusDisplay = statusMap[order.status] || order.status;
      }

      // Determine delivery type
      const deliveryType = order.deliveryFleet === 'standard' ? 
        'Home Delivery' : 
        (order.deliveryFleet === 'fast' ? 'Fast Delivery' : 'Home Delivery');

      // Calculate report-specific fields
      const subtotal = order.pricing?.subtotal || 0;
      const discount = order.pricing?.discount || 0;
      const deliveryFee = order.pricing?.deliveryFee || 0;
      const tax = order.pricing?.tax || 0;
      const couponCode = order.pricing?.couponCode || null;
      
      // Get platform fee - check if it exists in pricing, otherwise get from settlement map
      let platformFee = order.pricing?.platformFee;
      if (platformFee === undefined || platformFee === null) {
        // Get from settlement map (batch fetched above)
        platformFee = settlementMap.get(order._id.toString());
        
        // If still not found, calculate from total (fallback for old orders)
        if (platformFee === undefined || platformFee === null) {
          const calculatedTotal = (order.pricing?.subtotal || 0) - (order.pricing?.discount || 0) + (order.pricing?.deliveryFee || 0) + (order.pricing?.tax || 0);
          const actualTotal = order.pricing?.total || 0;
          const difference = actualTotal - calculatedTotal;
          // If difference is positive and reasonable (between 0 and 50), assume it's platform fee
          platformFee = (difference > 0 && difference <= 50) ? difference : 0;
        }
      }
      
      // For report: itemDiscount is the discount applied to items
      const itemDiscount = discount;
      // Discounted amount is subtotal after discount
      const discountedAmount = Math.max(0, subtotal - discount);
      // Coupon discount (if coupon was applied, it's part of discount)
      const couponDiscount = couponCode ? discount : 0;
      // Referral discount (not currently in model, default to 0)
      const referralDiscount = 0;
      // VAT/Tax
      const vatTax = tax;
      // Delivery charge
      const deliveryCharge = deliveryFee;
      // Total item amount (subtotal before discounts)
      const totalItemAmount = subtotal;
      // Order amount (final total)
      const orderAmount = order.pricing?.total || 0;

      return {
        sl: skip + index + 1,
        orderId: order.orderId,
        id: order._id.toString(),
        date: dateStr,
        time: timeStr,
        customerName: order.userId?.name || 'Unknown',
        customerPhone: customerPhone,
        customerEmail: order.userId?.email || '',
        restaurant: order.restaurantName || restaurantDoc?.name || order.restaurantId?.name || 'Unknown Restaurant',
        restaurantId: restaurantDoc?._id?.toString?.()
          || restaurantDoc?.restaurantId
          || (typeof order.restaurantId === 'object'
            ? order.restaurantId?._id?.toString?.()
            : order.restaurantId?.toString?.())
          || '',
        restaurantAddress: restaurantDoc?.location?.formattedAddress
          || restaurantDoc?.location?.address
          || restaurantDoc?.address
          || order.restaurantId?.location?.formattedAddress
          || order.restaurantId?.location?.address
          || order.restaurantId?.address
          || '',
        restaurantLocation: normalizeLocation(restaurantDoc?.location || order.restaurantId?.location),
        // Report-specific fields
        totalItemAmount: totalItemAmount,
        itemDiscount: itemDiscount,
        discountedAmount: discountedAmount,
        couponDiscount: couponDiscount,
        referralDiscount: referralDiscount,
        vatTax: vatTax,
        deliveryCharge: deliveryCharge,
        platformFee: platformFee,
        totalAmount: orderAmount,
        // Original fields
        paymentStatus: paymentStatusDisplay,
        paymentType: (() => {
          const paymentMethod = order.payment?.method;
          if (paymentMethod === 'cash' || paymentMethod === 'cod') {
            return 'Cash on Delivery';
          } else if (paymentMethod === 'wallet') {
            return 'Wallet';
          } else {
            return 'Online';
          }
        })(),
        paymentCollectionStatus: (order.payment?.method === 'cash' || order.payment?.method === 'cod')
          ? (order.status === 'delivered' ? 'Collected' : 'Not Collected')
          : 'Collected',
        orderStatus: orderStatusDisplay,
        status: order.status, // Backend status
        deliveryType: deliveryType,
        items: order.items || [],
        address: order.address || {},
        deliveryPartnerName: order.deliveryPartnerId?.name || null,
        deliveryPartnerPhone: order.deliveryPartnerId?.phone || null,
        estimatedDeliveryTime: order.estimatedDeliveryTime || 30,
        deliveredAt: order.deliveredAt,
        cancellationReason: order.cancellationReason || null,
        cancelledAt: order.cancelledAt || null,
        cancelledBy: order.cancelledBy || null,
        tracking: order.tracking || {},
        deliveryState: order.deliveryState || {},
        orderOtp: order.deliveryVerification?.dropOtp?.code || null,
        billImageUrl: order.billImageUrl || null, // Bill image captured by delivery boy
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        // Zone info from assignmentInfo
        zoneId: order.assignmentInfo?.zoneId || null,
        zoneName: order.assignmentInfo?.zoneName || null,
        // Refund status from settlement
        refundStatus: refundStatusMap.get(order._id.toString()) || null
      };
    });

    return successResponse(res, 200, 'Orders retrieved successfully', {
      orders: transformedOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    return errorResponse(res, 500, 'Failed to fetch orders');
  }
});

/**
 * Get order by ID for admin
 * GET /api/admin/orders/:id
 */
export const getOrderById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    let order = null;
    
    // Try MongoDB _id first
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findById(id)
        .populate('userId', 'name email phone')
        .populate('restaurantId', 'name slug location address phone')
        .populate('deliveryPartnerId', 'name phone availability')
        .lean();
    }
    
    // If not found, try by orderId
    if (!order) {
      order = await Order.findOne({ orderId: id })
        .populate('userId', 'name email phone')
        .populate('restaurantId', 'name slug location address phone')
        .populate('deliveryPartnerId', 'name phone availability')
        .lean();
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    if (isUnpaidOnlinePlaceholderOrder(order)) {
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
 * Delete order as admin (hard delete)
 * DELETE /api/admin/orders/:id
 */
export const deleteOrder = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    let order = null;

    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findById(id).lean();
    }

    if (!order) {
      order = await Order.findOne({ orderId: id }).lean();
    }

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    const orderMongoId = order._id;
    const orderTrackingId = order.orderId || orderMongoId?.toString();

    // Best-effort cleanup for order-linked records and realtime tracking data.
    const [OrderSettlementModule, OrderEventModule, ETALogModule, PaymentModule] = await Promise.all([
      import('../../order/models/OrderSettlement.js'),
      import('../../order/models/OrderEvent.js'),
      import('../../order/models/ETALog.js'),
      import('../../payment/models/Payment.js'),
    ]);

    await Promise.allSettled([
      Order.deleteOne({ _id: orderMongoId }),
      OrderSettlementModule.default.deleteOne({ orderId: orderMongoId }),
      OrderEventModule.default.deleteMany({ orderId: orderMongoId }),
      ETALogModule.default.deleteMany({ orderId: orderMongoId }),
      PaymentModule.default.deleteMany({ orderId: orderMongoId }),
      removeActiveOrderTracking(orderTrackingId),
    ]);

    return successResponse(res, 200, 'Order deleted successfully', {
      orderId: order.orderId,
      id: orderMongoId?.toString(),
    });
  } catch (error) {
    console.error('Error deleting order:', error);
    return errorResponse(res, 500, 'Failed to delete order');
  }
});

const findOrderByIdOrOrderId = async (id) => {
  let order = null;

  if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
    order = await Order.findById(id);
  }

  if (!order) {
    order = await Order.findOne({ orderId: id });
  }

  if (order && isUnpaidOnlinePlaceholderOrder(order)) {
    return null;
  }

  return order;
};

/**
 * Accept order as admin
 * PATCH /api/admin/orders/:id/accept
 */
export const acceptOrder = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const order = await findOrderByIdOrOrderId(id);
    let notifiedDeliveryPartners = 0;

    if (!order) {
      return errorResponse(res, 404, "Order not found");
    }

    if (!["pending", "confirmed"].includes(order.status)) {
      return errorResponse(
        res,
        400,
        `Order cannot be accepted. Current status: ${order.status}`,
      );
    }

    if (order.status === "pending") {
      order.tracking.confirmed = { status: true, timestamp: new Date() };
    }

    // Admin acceptance explicitly moves order into preparation phase.
    order.status = "preparing";
    order.tracking.preparing = { status: true, timestamp: new Date() };
    await order.save();

    // Do not block delivery dispatch on user/restaurant notification latency.
    Promise.allSettled([
      notifyRestaurantOrderUpdate(order._id.toString(), 'preparing'),
      notifyUserOrderUpdate(order._id.toString(), 'preparing'),
    ]).catch((notifError) => {
      console.error('Admin accept: background status notifications failed:', notifError);
    });

    // Immediately broadcast accepted order to all available delivery partners in zone.
    if (!order.deliveryPartnerId) {
      try {
        const Restaurant = (await import('../../restaurant/models/Restaurant.js')).default;

        const restaurantRef = order?.restaurantId;
        const restaurantIdValue = restaurantRef?._id || restaurantRef;
        let restaurantDoc = null;

        if (restaurantRef && typeof restaurantRef === 'object' && restaurantRef.location?.coordinates?.length >= 2) {
          restaurantDoc = restaurantRef;
        } else if (restaurantIdValue && mongoose.Types.ObjectId.isValid(String(restaurantIdValue))) {
          restaurantDoc = await Restaurant.findById(String(restaurantIdValue)).lean();
        }

        if (!restaurantDoc) {
          const restaurantLookupConditions = [];
          if (restaurantIdValue) {
            restaurantLookupConditions.push({ restaurantId: String(restaurantIdValue) });
          }
          if (restaurantIdValue && mongoose.Types.ObjectId.isValid(String(restaurantIdValue))) {
            restaurantLookupConditions.push({ _id: String(restaurantIdValue) });
          }
          if (restaurantLookupConditions.length > 0) {
            restaurantDoc = await Restaurant.findOne({
              $or: restaurantLookupConditions,
            }).lean();
          }
        }

        const coords = restaurantDoc?.location?.coordinates;
        if (coords && coords.length >= 2) {
          const [restaurantLng, restaurantLat] = coords;
          const zoneDeliveryBoys = await findNearestDeliveryBoys(
            restaurantLat,
            restaurantLng,
            order.restaurantId,
            50,
            {
              requiredZoneId: order?.assignmentInfo?.zoneId || null,
              ignoreDistanceLimit: true,
            },
          );

          const zoneDeliveryPartnerIds = Array.from(
            new Set(
              (zoneDeliveryBoys || [])
                .map((d) => d?.deliveryPartnerId)
                .filter(Boolean)
                .map((id) => String(id))
            )
          );

          if (zoneDeliveryPartnerIds.length > 0) {
            order.assignmentInfo = {
              ...(order.assignmentInfo || {}),
              zoneBroadcastNotifiedAt: new Date(),
              zoneBroadcastDeliveryPartnerIds: zoneDeliveryPartnerIds,
              notificationPhase: 'zone_broadcast',
            };
            await order.save();

            const populatedOrder = await Order.findById(order._id)
              .populate('userId', 'name phone')
              .populate('restaurantId', 'name address location phone ownerPhone')
              .lean();
            if (populatedOrder) {
              const notifyResult = await notifyMultipleDeliveryBoys(
                populatedOrder,
                zoneDeliveryPartnerIds,
                'zone_broadcast'
              );
              notifiedDeliveryPartners += Number(
                notifyResult?.notified || zoneDeliveryPartnerIds.length || 0
              );
            }
          } else {
            console.warn(`Admin accept: no available delivery partners found in zone for order ${order.orderId}`);
          }
        } else {
          console.warn(`Admin accept: missing restaurant coordinates for order ${order.orderId}`);
        }
      } catch (notifyErr) {
        console.error('Admin accept notification flow failed:', notifyErr);
      }
    }

    return successResponse(res, 200, "Order accepted successfully", {
      order: {
        id: order._id.toString(),
        orderId: order.orderId,
        status: order.status,
      },
      dispatch: {
        requested: true,
        notifiedDeliveryPartners,
      },
    });
  } catch (error) {
    console.error("Error accepting order by admin:", error);
    return errorResponse(res, 500, "Failed to accept order");
  }
});

/**
 * Reject order as admin
 * PATCH /api/admin/orders/:id/reject
 */
export const rejectOrder = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const order = await findOrderByIdOrOrderId(id);

    if (!order) {
      return errorResponse(res, 404, "Order not found");
    }

    if (!["pending", "confirmed", "preparing", "ready"].includes(order.status)) {
      return errorResponse(
        res,
        400,
        `Order cannot be rejected. Current status: ${order.status}`,
      );
    }

    order.status = "cancelled";
    order.cancelledBy = "admin";
    order.cancellationReason = reason?.trim()
      ? `Rejected by Admin: ${reason.trim()}`
      : "Rejected by Admin";

    await order.save();

    return successResponse(res, 200, "Order rejected successfully", {
      order: {
        id: order._id.toString(),
        orderId: order.orderId,
        status: order.status,
        cancelledBy: order.cancelledBy,
        cancellationReason: order.cancellationReason,
      },
    });
  } catch (error) {
    console.error("Error rejecting order by admin:", error);
    return errorResponse(res, 500, "Failed to reject order");
  }
});

/**
 * Mark order as ready as admin
 * PATCH /api/admin/orders/:id/ready
 */
export const markOrderReady = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const order = await findOrderByIdOrOrderId(id);

    if (!order) {
      return errorResponse(res, 404, "Order not found");
    }

    if (order.status !== "preparing") {
      return errorResponse(
        res,
        400,
        `Order cannot be marked as ready. Current status: ${order.status}`,
      );
    }

    const now = new Date();
    order.status = "ready";
    if (!order.tracking) {
      order.tracking = {};
    }
    order.tracking.ready = {
      status: true,
      timestamp: now,
    };
    await order.save();

    const populatedOrder = await Order.findById(order._id)
      .populate("userId", "name phone")
      .populate("deliveryPartnerId", "name phone")
      .lean();

    let restaurantForNotification = null;
    try {
      const Restaurant = (await import("../../restaurant/models/Restaurant.js")).default;
      if (mongoose.Types.ObjectId.isValid(order.restaurantId)) {
        restaurantForNotification = await Restaurant.findById(order.restaurantId)
          .select("name location address phone")
          .lean();
      }
      if (!restaurantForNotification) {
        restaurantForNotification = await Restaurant.findOne({
          $or: [{ restaurantId: order.restaurantId }, { _id: order.restaurantId }],
        })
          .select("name location address phone")
          .lean();
      }
    } catch (restaurantLookupError) {
      console.error("Admin mark ready: restaurant lookup failed:", restaurantLookupError);
    }

    const notificationOrder = populatedOrder
      ? {
          ...populatedOrder,
          restaurantId: restaurantForNotification || {
            _id: order.restaurantId,
            name: order.restaurantName,
          },
        }
      : order;

    try {
      await notifyRestaurantOrderUpdate(order._id.toString(), "ready");
    } catch (notifError) {
      console.error("Admin mark ready: restaurant notification failed:", notifError);
    }
    try {
      await notifyUserOrderUpdate(order._id.toString(), "ready");
    } catch (notifError) {
      console.error("Admin mark ready: user notification failed:", notifError);
    }

    if (notificationOrder?.deliveryPartnerId) {
      try {
        const { notifyDeliveryBoyOrderReady } = await import("../../order/services/deliveryNotificationService.js");
        const deliveryPartnerId = notificationOrder.deliveryPartnerId._id || notificationOrder.deliveryPartnerId;
        await notifyDeliveryBoyOrderReady(notificationOrder, deliveryPartnerId);
      } catch (deliveryNotifError) {
        console.error("Admin mark ready: delivery notification failed:", deliveryNotifError);
      }
    }

    return successResponse(res, 200, "Order marked as ready", {
      order: {
        id: order._id.toString(),
        orderId: order.orderId,
        status: order.status,
      },
    });
  } catch (error) {
    console.error("Error marking order ready by admin:", error);
    return errorResponse(res, 500, "Failed to mark order as ready");
  }
});

/**
 * Mark order as delivered as admin
 * PATCH /api/admin/orders/:id/delivered
 */
export const markOrderDelivered = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const order = await findOrderByIdOrOrderId(id);

    if (!order) {
      return errorResponse(res, 404, "Order not found");
    }

    if (!["ready", "out_for_delivery"].includes(String(order.status || "").toLowerCase())) {
      return errorResponse(
        res,
        400,
        `Order cannot be marked as delivered. Current status: ${order.status}`,
      );
    }

    const now = new Date();
    order.status = "delivered";
    order.deliveredAt = now;

    if (!order.tracking) {
      order.tracking = {};
    }
    if (!order.tracking.outForDelivery) {
      order.tracking.outForDelivery = { status: false };
    }
    if (!order.tracking.outForDelivery.status) {
      order.tracking.outForDelivery = { status: true, timestamp: now };
    }
    order.tracking.delivered = {
      status: true,
      timestamp: now,
    };

    if (!order.deliveryState) {
      order.deliveryState = {};
    }
    order.deliveryState.status = "delivered";
    order.deliveryState.currentPhase = "completed";

    const deliveryPartnerId = order.deliveryPartnerId ? String(order.deliveryPartnerId) : null;
    const orderTrackingId = order.orderId || order._id?.toString();

    await order.save();

    // Best-effort cleanup so rider becomes immediately available in realtime channels.
    try {
      await removeActiveOrderTracking(orderTrackingId);
    } catch (cleanupError) {
      console.error("Admin mark delivered: active tracking cleanup failed:", cleanupError);
    }

    if (deliveryPartnerId) {
      try {
        const Delivery = (await import("../../delivery/models/Delivery.js")).default;
        const deliveryDoc = await Delivery.findById(deliveryPartnerId).select("availability").lean();
        const coords = deliveryDoc?.availability?.currentLocation?.coordinates || [];
        const lat = coords.length >= 2 ? coords[1] : null;
        const lng = coords.length >= 2 ? coords[0] : null;
        await syncDeliveryPartnerPresence({
          deliveryId: deliveryPartnerId,
          lat,
          lng,
          isOnline: deliveryDoc?.availability?.isOnline || false,
          activeOrderId: null,
        });
      } catch (presenceError) {
        console.error("Admin mark delivered: delivery presence sync failed:", presenceError);
      }
    }

    try {
      await notifyRestaurantOrderUpdate(order._id.toString(), "delivered");
    } catch (notifError) {
      console.error("Admin mark delivered: restaurant notification failed:", notifError);
    }
    try {
      await notifyUserOrderUpdate(order._id.toString(), "delivered");
    } catch (notifError) {
      console.error("Admin mark delivered: user notification failed:", notifError);
    }

    return successResponse(res, 200, "Order marked as delivered", {
      order: {
        id: order._id.toString(),
        orderId: order.orderId,
        status: order.status,
        deliveredAt: order.deliveredAt,
      },
    });
  } catch (error) {
    console.error("Error marking order delivered by admin:", error);
    return errorResponse(res, 500, "Failed to mark order as delivered");
  }
});

/**
 * Get orders searching for deliveryman (ready orders without delivery partner)
 * GET /api/admin/orders/searching-deliveryman
 * Query params: page, limit, search
 */
export const getSearchingDeliverymanOrders = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Fetching searching deliveryman orders...');
    const { 
      page = 1, 
      limit = 50,
      search
    } = req.query;
    
    console.log('📋 Query params:', { page, limit, search });

    // Build base conditions for orders that are ready but don't have delivery partner assigned
    // deliveryPartnerId is ObjectId, so we only check for null or missing
    const baseConditions = {
      status: { $in: ['ready', 'preparing'] },
      $or: [
        { deliveryPartnerId: { $exists: false } },
        { deliveryPartnerId: null }
      ]
    };

    // Build search conditions if search is provided
    let searchConditions = null;
    if (search) {
      const searchOrConditions = [
        { orderId: { $regex: search, $options: 'i' } }
      ];

      // If search looks like a phone number, search in customer data
      const phoneRegex = /[\d\s\+\-()]+/;
      if (phoneRegex.test(search)) {
        const User = (await import('../../auth/models/User.js')).default;
        const cleanSearch = search.replace(/\D/g, '');
        const userSearchQuery = { phone: { $regex: cleanSearch, $options: 'i' } };
        if (mongoose.Types.ObjectId.isValid(search)) {
          userSearchQuery._id = search;
        }
        const users = await User.find(userSearchQuery).select('_id').lean();
        const userIds = users.map(u => u._id);
        if (userIds.length > 0) {
          searchOrConditions.push({ userId: { $in: userIds } });
        }
      }

      // Also search by customer name
      const User = (await import('../../auth/models/User.js')).default;
      const usersByName = await User.find({
        name: { $regex: search, $options: 'i' }
      }).select('_id').lean();
      const userIdsByName = usersByName.map(u => u._id);
      if (userIdsByName.length > 0) {
        searchOrConditions.push({ userId: { $in: userIdsByName } });
      }

      if (searchOrConditions.length > 0) {
        searchConditions = { $or: searchOrConditions };
      }
    }

    // Combine all conditions
    const finalQuery = searchConditions 
      ? { $and: [baseConditions, searchConditions] }
      : baseConditions;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log('🔎 Final query:', JSON.stringify(finalQuery, null, 2));

    // Fetch orders with population
    const orders = await Order.find(finalQuery)
      .populate('userId', 'name email phone')
      .populate('restaurantId', 'name slug')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    // Get total count
    const total = await Order.countDocuments(finalQuery);
    
    console.log(`✅ Found ${orders.length} orders (total: ${total})`);

    // Transform orders to match frontend format
    const transformedOrders = orders.map((order, index) => {
      const orderDate = new Date(order.createdAt);
      const dateStr = orderDate.toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      }).toUpperCase();
      const timeStr = orderDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }).toUpperCase();

      // Get customer phone (masked for display)
      const customerPhone = order.userId?.phone || '';
      let maskedPhone = '';
      if (customerPhone && customerPhone.length > 2) {
        maskedPhone = `+${customerPhone.slice(0, 1)}${'*'.repeat(Math.max(0, customerPhone.length - 2))}${customerPhone.slice(-1)}`;
      } else if (customerPhone) {
        maskedPhone = customerPhone; // If too short, show as is
      }

      // Map payment status
      const paymentStatusMap = {
        'completed': 'Paid',
        'pending': 'Unpaid',
        'failed': 'Failed',
        'refunded': 'Refunded',
        'processing': 'Processing'
      };
      const paymentStatusDisplay = paymentStatusMap[order.payment?.status] || 'Unpaid';

      // Map order status for display
      const statusMap = {
        'pending': 'Pending',
        'confirmed': 'Accepted',
        'preparing': 'Pending',
        'ready': 'Pending',
        'out_for_delivery': 'Food On The Way',
        'delivered': 'Delivered',
        'cancelled': 'Canceled',
        'scheduled': 'Scheduled',
        'dine_in': 'Dine In'
      };
      const orderStatusDisplay = statusMap[order.status] || 'Pending';

      // Determine delivery type
      const deliveryType = order.deliveryFleet === 'standard' ? 
        'Home Delivery' : 
        (order.deliveryFleet === 'fast' ? 'Fast Delivery' : 'Home Delivery');

      // Format total amount
      const totalAmount = order.pricing?.total || 0;
      const formattedTotal = `$ ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      return {
        id: order.orderId || order._id.toString(),
        sl: skip + index + 1,
        date: dateStr,
        time: timeStr,
        customerName: order.userId?.name || 'Unknown',
        customerPhone: maskedPhone,
        restaurant: order.restaurantName || order.restaurantId?.name || 'Unknown Restaurant',
        total: formattedTotal,
        paymentStatus: paymentStatusDisplay,
        orderStatus: orderStatusDisplay,
        deliveryType: deliveryType,
        // Additional fields for view order dialog
        orderId: order.orderId,
        _id: order._id.toString(),
        customerEmail: order.userId?.email || '',
        restaurantId: order.restaurantId?.toString() || order.restaurantId || '',
        items: order.items || [],
        address: order.address || {},
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        status: order.status,
        pricing: order.pricing || {}
      };
    });

    return successResponse(res, 200, 'Searching deliveryman orders retrieved successfully', {
      orders: transformedOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching searching deliveryman orders:', error);
    console.error('Error stack:', error.stack);
    return errorResponse(res, 500, error.message || 'Failed to fetch searching deliveryman orders');
  }
});

/**
 * Get ongoing orders (orders with delivery partner assigned but not delivered)
 * GET /api/admin/orders/ongoing
 * Query params: page, limit, search
 */
export const getOngoingOrders = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Fetching ongoing orders...');
    const { 
      page = 1, 
      limit = 50,
      search
    } = req.query;
    
    console.log('📋 Query params:', { page, limit, search });

    // Build base conditions for ongoing orders
    // Orders that have deliveryPartnerId assigned but are not delivered/cancelled
    const baseConditions = {
      deliveryPartnerId: { $exists: true, $ne: null },
      status: { $nin: ['delivered', 'cancelled'] }
    };

    // Build search conditions if search is provided
    let searchConditions = null;
    if (search) {
      const searchOrConditions = [
        { orderId: { $regex: search, $options: 'i' } }
      ];

      // If search looks like a phone number, search in customer data
      const phoneRegex = /[\d\s\+\-()]+/;
      if (phoneRegex.test(search)) {
        const User = (await import('../../auth/models/User.js')).default;
        const cleanSearch = search.replace(/\D/g, '');
        const userSearchQuery = { phone: { $regex: cleanSearch, $options: 'i' } };
        if (mongoose.Types.ObjectId.isValid(search)) {
          userSearchQuery._id = search;
        }
        const users = await User.find(userSearchQuery).select('_id').lean();
        const userIds = users.map(u => u._id);
        if (userIds.length > 0) {
          searchOrConditions.push({ userId: { $in: userIds } });
        }
      }

      // Also search by customer name
      const User = (await import('../../auth/models/User.js')).default;
      const usersByName = await User.find({
        name: { $regex: search, $options: 'i' }
      }).select('_id').lean();
      const userIdsByName = usersByName.map(u => u._id);
      if (userIdsByName.length > 0) {
        searchOrConditions.push({ userId: { $in: userIdsByName } });
      }

      if (searchOrConditions.length > 0) {
        searchConditions = { $or: searchOrConditions };
      }
    }

    // Combine all conditions
    const finalQuery = searchConditions 
      ? { $and: [baseConditions, searchConditions] }
      : baseConditions;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log('🔎 Final query:', JSON.stringify(finalQuery, null, 2));

    // Fetch orders with population
    const orders = await Order.find(finalQuery)
      .populate('userId', 'name email phone')
      .populate('restaurantId', 'name slug')
      .populate('deliveryPartnerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    // Get total count
    const total = await Order.countDocuments(finalQuery);
    
    console.log(`✅ Found ${orders.length} ongoing orders (total: ${total})`);

    // Transform orders to match frontend format
    const transformedOrders = orders.map((order, index) => {
      const orderDate = new Date(order.createdAt);
      const dateStr = orderDate.toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      }).toUpperCase();
      const timeStr = orderDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }).toUpperCase();

      // Get customer phone (masked for display)
      const customerPhone = order.userId?.phone || '';
      let maskedPhone = '';
      if (customerPhone && customerPhone.length > 2) {
        maskedPhone = `+${customerPhone.slice(0, 1)}${'*'.repeat(Math.max(0, customerPhone.length - 2))}${customerPhone.slice(-1)}`;
      } else if (customerPhone) {
        maskedPhone = customerPhone; // If too short, show as is
      }

      // Map payment status
      const paymentStatusMap = {
        'completed': 'Paid',
        'pending': 'Unpaid',
        'failed': 'Failed',
        'refunded': 'Refunded',
        'processing': 'Processing'
      };
      const paymentStatusDisplay = paymentStatusMap[order.payment?.status] || 'Unpaid';

      // Map order status for display with colors
      const statusMap = {
        'pending': { text: 'Pending', color: 'bg-gray-100 text-gray-600' },
        'confirmed': { text: 'Confirmed', color: 'bg-blue-50 text-blue-600' },
        'preparing': { text: 'Preparing', color: 'bg-yellow-50 text-yellow-600' },
        'ready': { text: 'Ready', color: 'bg-green-50 text-green-600' },
        'out_for_delivery': { text: 'Out For Delivery', color: 'bg-orange-100 text-orange-600' },
        'delivered': { text: 'Delivered', color: 'bg-green-100 text-green-600' },
        'cancelled': { text: 'Cancelled', color: 'bg-red-50 text-red-600' },
        'scheduled': { text: 'Scheduled', color: 'bg-purple-50 text-purple-600' },
        'dine_in': { text: 'Dine In', color: 'bg-indigo-50 text-indigo-600' }
      };
      
      // Check for handover status (when delivery partner has reached pickup)
      let orderStatusDisplay = statusMap[order.status]?.text || 'Pending';
      let orderStatusColor = statusMap[order.status]?.color || 'bg-gray-100 text-gray-600';
      
      // If delivery partner has reached pickup, show as "Handover"
      if (order.deliveryState?.currentPhase === 'at_pickup' || 
          order.deliveryState?.currentPhase === 'en_route_to_delivery' ||
          order.deliveryState?.currentPhase === 'at_delivery') {
        orderStatusDisplay = 'Handover';
        orderStatusColor = 'bg-blue-50 text-blue-600';
      }

      // Determine delivery type
      const deliveryType = order.deliveryFleet === 'standard' ? 
        'Home Delivery' : 
        (order.deliveryFleet === 'fast' ? 'Fast Delivery' : 'Home Delivery');

      // Format total amount
      const totalAmount = order.pricing?.total || 0;
      const formattedTotal = `$ ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      return {
        id: order.orderId || order._id.toString(),
        sl: skip + index + 1,
        date: dateStr,
        time: timeStr,
        customerName: order.userId?.name || 'Unknown',
        customerPhone: maskedPhone,
        restaurant: order.restaurantName || order.restaurantId?.name || 'Unknown Restaurant',
        total: formattedTotal,
        paymentStatus: paymentStatusDisplay,
        orderStatus: orderStatusDisplay,
        orderStatusColor: orderStatusColor,
        deliveryType: deliveryType,
        // Additional fields for view order dialog
        orderId: order.orderId,
        _id: order._id.toString(),
        customerEmail: order.userId?.email || '',
        restaurantId: order.restaurantId?.toString() || order.restaurantId || '',
        items: order.items || [],
        address: order.address || {},
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        status: order.status,
        pricing: order.pricing || {},
        deliveryPartnerName: order.deliveryPartnerId?.name || null,
        deliveryPartnerPhone: order.deliveryPartnerId?.phone || null
      };
    });

    return successResponse(res, 200, 'Ongoing orders retrieved successfully', {
      orders: transformedOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching ongoing orders:', error);
    console.error('Error stack:', error.stack);
    return errorResponse(res, 500, error.message || 'Failed to fetch ongoing orders');
  }
});

/**
 * Get transaction report with summary statistics and order transactions
 * GET /api/admin/orders/transaction-report
 * Query params: page, limit, search, zone, restaurant, fromDate, toDate
 */
export const getTransactionReport = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Fetching transaction report...');
    const { 
      page = 1, 
      limit = 50,
      search,
      zone,
      restaurant,
      fromDate,
      toDate
    } = req.query;
    
    console.log('📋 Query params:', { page, limit, search, zone, restaurant, fromDate, toDate });

    // Build query for orders
    const query = {};

    // Date range filter
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        query.createdAt.$gte = startDate;
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    // Restaurant filter
    if (restaurant && restaurant !== 'All restaurants') {
      const Restaurant = (await import('../../restaurant/models/Restaurant.js')).default;
      const restaurantDoc = await Restaurant.findOne({
        $or: [
          { name: { $regex: restaurant, $options: 'i' } },
          { _id: mongoose.Types.ObjectId.isValid(restaurant) ? restaurant : null },
          { restaurantId: restaurant }
        ]
      }).select('_id restaurantId').lean();

      if (restaurantDoc) {
        query.restaurantId = restaurantDoc._id?.toString() || restaurantDoc.restaurantId;
      }
    }

    // Zone filter
    let zoneDocId = null;
    if (zone && zone !== 'All Zones') {
      const Zone = (await import('../models/Zone.js')).default;
      const zoneDoc = await Zone.findOne({
        name: { $regex: zone, $options: 'i' }
      }).select('_id name').lean();

      if (zoneDoc) {
        query['assignmentInfo.zoneId'] = zoneDoc._id?.toString();
        zoneDocId = zoneDoc._id?.toString();
      }
    }

    // Search filter (orderId)
    if (search) {
      query.orderId = { $regex: search, $options: 'i' };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch orders with population
    const orders = await Order.find(query)
      .populate('userId', 'name email phone')
      .populate('restaurantId', 'name slug')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    // Get total count
    const total = await Order.countDocuments(query);

    // Calculate summary statistics
    const AdminCommission = (await import('../models/AdminCommission.js')).default;
    
    // Build date query for summary stats
    const summaryDateQuery = {};
    if (fromDate || toDate) {
      summaryDateQuery.orderDate = {};
      if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        summaryDateQuery.orderDate.$gte = startDate;
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        summaryDateQuery.orderDate.$lte = endDate;
      }
    }

    // Build restaurant filter for summary
    let summaryRestaurantQuery = {};
    if (restaurant && restaurant !== 'All restaurants') {
      const Restaurant = (await import('../../restaurant/models/Restaurant.js')).default;
      const restaurantDoc = await Restaurant.findOne({
        $or: [
          { name: { $regex: restaurant, $options: 'i' } },
          { _id: mongoose.Types.ObjectId.isValid(restaurant) ? restaurant : null },
          { restaurantId: restaurant }
        ]
      }).select('_id restaurantId').lean();

      if (restaurantDoc) {
        summaryRestaurantQuery.restaurantId = new mongoose.Types.ObjectId(restaurantDoc._id);
      }
    }

    // Get completed transactions and deliveryman earnings using MongoDB aggregation
    const completedStats = await Order.aggregate([
      { $match: { ...query, status: 'delivered', 'payment.status': 'completed' } },
      {
        $group: {
          _id: null,
          completedTransaction: { $sum: { $ifNull: ['$pricing.total', 0] } },
          completedCount: { $sum: 1 },
          deliverymanEarning: { $sum: { $multiply: [{ $ifNull: ['$pricing.deliveryFee', 0] }, 0.8] } }
        }
      }
    ]);

    const completedTransaction = completedStats[0]?.completedTransaction || 0;
    const completedCount = completedStats[0]?.completedCount || 0;
    const deliverymanEarning = completedStats[0]?.deliverymanEarning || 0;

    // Get refunded and cancelled transactions using MongoDB aggregation
    const refundedStats = await Order.aggregate([
      {
        $match: {
          ...query,
          $or: [
            { 'payment.status': 'refunded' },
            { status: 'cancelled' }
          ]
        }
      },
      {
        $group: {
          _id: null,
          refundedTransaction: { $sum: { $ifNull: ['$pricing.total', 0] } }
        }
      }
    ]);

    const refundedTransaction = refundedStats[0]?.refundedTransaction || 0;

    // Get admin and restaurant earnings using MongoDB aggregation
    const adminCommissionQuery = {
      status: 'completed',
      ...summaryDateQuery,
      ...summaryRestaurantQuery
    };

    const commissionPipeline = [];
    
    // If zone filter is active, join orders to filter by zone
    if (zoneDocId) {
      commissionPipeline.push(
        {
          $lookup: {
            from: 'orders',
            localField: 'orderId',
            foreignField: '_id',
            as: 'orderInfo'
          }
        },
        { $unwind: '$orderInfo' },
        {
          $match: {
            ...adminCommissionQuery,
            'orderInfo.assignmentInfo.zoneId': zoneDocId
          }
        }
      );
    } else {
      commissionPipeline.push({ $match: adminCommissionQuery });
    }

    commissionPipeline.push({
      $group: {
        _id: null,
        adminEarning: { $sum: { $ifNull: ['$commissionAmount', 0] } },
        restaurantEarning: { $sum: { $ifNull: ['$restaurantEarning', 0] } }
      }
    });

    const commissionStats = await AdminCommission.aggregate(commissionPipeline);

    const adminEarning = commissionStats[0]?.adminEarning || 0;
    const restaurantEarning = commissionStats[0]?.restaurantEarning || 0;

    // Transform orders to match frontend format
    const transformedTransactions = orders.map((order, index) => {
      const subtotal = order.pricing?.subtotal || 0;
      const discount = order.pricing?.discount || 0;
      const deliveryFee = order.pricing?.deliveryFee || 0;
      const tax = order.pricing?.tax || 0;
      const couponCode = order.pricing?.couponCode || null;
      
      // For report: itemDiscount is the discount applied to items
      const itemDiscount = discount;
      // Discounted amount is subtotal after discount
      const discountedAmount = Math.max(0, subtotal - discount);
      // Coupon discount (if coupon was applied, it's part of discount)
      const couponDiscount = couponCode ? discount : 0;
      // Referral discount (not currently in model, default to 0)
      const referralDiscount = 0;
      // VAT/Tax
      const vatTax = tax;
      // Delivery charge
      const deliveryCharge = deliveryFee;
      // Total item amount (subtotal before discounts)
      const totalItemAmount = subtotal;
      // Order amount (final total)
      const orderAmount = order.pricing?.total || 0;

      return {
        id: order._id.toString(),
        orderId: order.orderId,
        restaurant: order.restaurantName || order.restaurantId?.name || 'Unknown Restaurant',
        customerName: order.userId?.name || 'Invalid Customer Data',
        totalItemAmount: totalItemAmount,
        itemDiscount: itemDiscount,
        couponDiscount: couponDiscount,
        referralDiscount: referralDiscount,
        discountedAmount: discountedAmount,
        vatTax: vatTax,
        deliveryCharge: deliveryCharge,
        orderAmount: orderAmount,
      };
    });

    return successResponse(res, 200, 'Transaction report retrieved successfully', {
      summary: {
        completedTransaction,
        completedCount,
        refundedTransaction,
        adminEarning,
        restaurantEarning,
        deliverymanEarning
      },
      transactions: transformedTransactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching transaction report:', error);
    console.error('Error stack:', error.stack);
    return errorResponse(res, 500, error.message || 'Failed to fetch transaction report');
  }
});

/**
 * Get restaurant report with statistics for each restaurant
 * GET /api/admin/orders/restaurant-report
 * Query params: zone, all (active/inactive), type (commission/subscription), time, search
 */
export const getRestaurantReport = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Fetching restaurant report...');
    const { 
      zone,
      all,
      type,
      time,
      search
    } = req.query;
    
    console.log('📋 Query params:', { zone, all, type, time, search });

    const Restaurant = (await import('../../restaurant/models/Restaurant.js')).default;
    const AdminCommission = (await import('../models/AdminCommission.js')).default;
    const FeedbackExperience = (await import('../models/FeedbackExperience.js')).default;

    // Build restaurant query
    const restaurantQuery = {};
    const andConditions = [];

    // Zone filter
    if (zone && zone !== 'All Zones') {
      const Zone = (await import('../models/Zone.js')).default;
      const zoneDoc = await Zone.findOne({
        name: { $regex: zone, $options: 'i' }
      }).select('_id name').lean();

      if (zoneDoc) {
        // Find restaurants in this zone by checking orders with this zoneId
        const ordersInZone = await Order.find({
          'assignmentInfo.zoneId': zoneDoc._id?.toString()
        }).distinct('restaurantId');

        if (ordersInZone.length > 0) {
          andConditions.push({
            $or: [
            { _id: { $in: ordersInZone } },
            { restaurantId: { $in: ordersInZone } }
            ]
          });
        } else {
          // No restaurants found in this zone
          return successResponse(res, 200, 'Restaurant report retrieved successfully', {
            restaurants: [],
            pagination: {
              page: 1,
              limit: 1000,
              total: 0,
              pages: 0
            }
          });
        }
      }
    }

    // Active/Inactive filter
    if (all && all !== 'All') {
      restaurantQuery.isActive = all === 'Active';
    }

    // Search filter
    if (search) {
      andConditions.push({
        $or: [
        { name: { $regex: search, $options: 'i' } },
        { restaurantId: { $regex: search, $options: 'i' } }
        ]
      });
    }

    if (andConditions.length > 0) {
      restaurantQuery.$and = andConditions;
    }

    // Get all restaurants matching the query
    const restaurants = await Restaurant.find(restaurantQuery)
      .select('_id restaurantId name profileImage rating totalRatings isActive')
      .lean();

    console.log(`📊 Found ${restaurants.length} restaurants`);

    // Date range filter for orders
    let dateQuery = {};
    if (time && time !== 'All Time') {
      const now = new Date();
      dateQuery.createdAt = {};
      
      if (time === 'Today') {
        const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        dateQuery.createdAt.$gte = startDate;
        dateQuery.createdAt.$lte = endDate;
      } else if (time === 'This Week') {
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek;
        const startDate = new Date(now.getFullYear(), now.getMonth(), diff);
        const endDate = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59);
        dateQuery.createdAt.$gte = startDate;
        dateQuery.createdAt.$lte = endDate;
      } else if (time === 'This Month') {
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        dateQuery.createdAt.$gte = startDate;
        dateQuery.createdAt.$lte = endDate;
      } else if (time === 'This Year') {
        const startDate = new Date(now.getFullYear(), 0, 1);
        const endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        dateQuery.createdAt.$gte = startDate;
        dateQuery.createdAt.$lte = endDate;
      }
    }

    // Process each restaurant
    const restaurantReports = await Promise.all(
      restaurants.map(async (restaurant) => {
        const restaurantId = restaurant._id?.toString();
        const restaurantIdField = restaurant.restaurantId;

        // Build order query for this restaurant
        const orderQuery = {
          ...dateQuery,
          $or: []
        };

        if (restaurantId) {
          orderQuery.$or.push({ restaurantId: restaurantId });
          if (mongoose.Types.ObjectId.isValid(restaurantId)) {
            orderQuery.$or.push({ restaurantId: new mongoose.Types.ObjectId(restaurantId) });
          }
        }
        if (restaurantIdField) {
          orderQuery.$or.push({ restaurantId: restaurantIdField });
        }
        if (orderQuery.$or.length === 0) {
          return {
            sl: 0,
            id: restaurantId,
            restaurantName: restaurant.name,
            icon: restaurant.profileImage?.url || restaurant.profileImage || null,
            totalFood: 0,
            totalOrder: 0,
            totalOrderAmount: "₹0.00",
            totalDiscountGiven: "₹0.00",
            totalAdminCommission: "₹0.00",
            totalVATTAX: "₹0.00",
            averageRatings: 0,
            reviews: 0
          };
        }

        // Get orders for this restaurant
        const orders = await Order.find(orderQuery).lean();

        // Calculate statistics
        const totalOrder = orders.length;
        
        // Total order amount
        const totalOrderAmount = orders.reduce((sum, order) => 
          sum + (order.pricing?.total || 0), 0
        );

        // Total discount given
        const totalDiscountGiven = orders.reduce((sum, order) => 
          sum + (order.pricing?.discount || 0), 0
        );

        // Total VAT/TAX
        const totalVATTAX = orders.reduce((sum, order) => 
          sum + (order.pricing?.tax || 0), 0
        );

        // Get unique food items (count distinct itemIds from all orders)
        const uniqueItemIds = new Set();
        orders.forEach(order => {
          if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
              if (item.itemId) {
                uniqueItemIds.add(item.itemId);
              }
            });
          }
        });
        const totalFood = uniqueItemIds.size;

        // Get admin commission for this restaurant
        const restaurantObjectId = restaurant._id instanceof mongoose.Types.ObjectId 
          ? restaurant._id 
          : new mongoose.Types.ObjectId(restaurant._id);

        const commissionQuery = {
          restaurantId: restaurantObjectId,
          status: 'completed'
        };

        if (dateQuery.createdAt) {
          commissionQuery.orderDate = dateQuery.createdAt;
        }

        const commissions = await AdminCommission.find(commissionQuery).lean();
        const totalAdminCommission = commissions.reduce((sum, comm) => 
          sum + (comm.commissionAmount || 0), 0
        );

        // Get ratings from FeedbackExperience
        const ratingStats = await FeedbackExperience.aggregate([
          {
            $match: {
              restaurantId: restaurantObjectId,
              rating: { $exists: true, $ne: null, $gt: 0 }
            }
          },
          {
            $group: {
              _id: null,
              averageRating: { $avg: '$rating' },
              totalRatings: { $sum: 1 }
            }
          }
        ]);

        const averageRatings = ratingStats[0]?.averageRating || restaurant.rating || 0;
        const reviews = ratingStats[0]?.totalRatings || restaurant.totalRatings || 0;

        // Format currency values
        const formatCurrency = (amount) => {
          return `₹${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        };

        return {
          sl: 0, // Will be set in frontend
          id: restaurantId,
          restaurantName: restaurant.name,
          icon: restaurant.profileImage?.url || restaurant.profileImage || null,
          totalFood,
          totalOrder,
          totalOrderAmount: formatCurrency(totalOrderAmount),
          totalDiscountGiven: formatCurrency(totalDiscountGiven),
          totalAdminCommission: formatCurrency(totalAdminCommission),
          totalVATTAX: formatCurrency(totalVATTAX),
          averageRatings: parseFloat(averageRatings.toFixed(1)),
          reviews
        };
      })
    );

    // Filter by type (Commission/Subscription) if needed
    let filteredReports = restaurantReports;
    if (type && type !== 'All types') {
      // This would require checking restaurant subscription status
      // For now, we'll return all restaurants
      // You can add subscription filtering logic here if needed
    }

    // Sort by restaurant name
    filteredReports.sort((a, b) => a.restaurantName.localeCompare(b.restaurantName));

    // Add serial numbers
    filteredReports = filteredReports.map((report, index) => ({
      ...report,
      sl: index + 1
    }));

    return successResponse(res, 200, 'Restaurant report retrieved successfully', {
      restaurants: filteredReports,
      pagination: {
        page: 1,
        limit: 1000,
        total: filteredReports.length,
        pages: 1
      }
    });
  } catch (error) {
    console.error('❌ Error fetching restaurant report:', error);
    console.error('Error stack:', error.stack);
    return errorResponse(res, 500, error.message || 'Failed to fetch restaurant report');
  }
});

/**
 * Get refund requests (restaurant cancelled orders with pending refunds)
 * GET /api/admin/refund-requests
 */
export const getRefundRequests = asyncHandler(async (req, res) => {
  try {
    console.log('✅ getRefundRequests route hit!');
    console.log('Request URL:', req.url);
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    
    const { 
      page = 1, 
      limit = 50,
      search,
      fromDate,
      toDate,
      restaurant
    } = req.query;

    console.log('🔍 Fetching refund requests with params:', { page, limit, search, fromDate, toDate, restaurant });

    // Build query for restaurant cancelled orders with pending refunds
    const query = {
      status: 'cancelled',
      cancellationReason: { 
        $regex: /rejected by restaurant|restaurant rejected|restaurant cancelled|restaurant is too busy|item not available|outside delivery area|kitchen closing|technical issue/i 
      }
    };
    
    console.log('📋 Initial query:', JSON.stringify(query, null, 2));

    // Restaurant filter
    if (restaurant && restaurant !== 'All restaurants') {
      try {
        const Restaurant = (await import('../../restaurant/models/Restaurant.js')).default;
        const restaurantDoc = await Restaurant.findOne({
          $or: [
            { name: { $regex: restaurant, $options: 'i' } },
            ...(mongoose.Types.ObjectId.isValid(restaurant) ? [{ _id: restaurant }] : []),
            { restaurantId: restaurant }
          ]
        }).select('_id restaurantId').lean();

        if (restaurantDoc) {
          query.restaurantId = restaurantDoc._id?.toString() || restaurantDoc.restaurantId;
        }
      } catch (error) {
        console.error('Error filtering by restaurant:', error);
        // Continue without restaurant filter if there's an error
      }
    }

    // Date range filter
    if (fromDate || toDate) {
      query.cancelledAt = {};
      if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        query.cancelledAt.$gte = startDate;
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        query.cancelledAt.$lte = endDate;
      }
    }

    // Search filter - build search conditions separately
    const searchConditions = [];
    if (search) {
      searchConditions.push(
        { orderId: { $regex: search, $options: 'i' } },
        { restaurantName: { $regex: search, $options: 'i' } }
      );
    }

    // Combine search with existing query
    if (searchConditions.length > 0) {
      if (Object.keys(query).length > 0 && !query.$and) {
        // Convert existing query to $and format
        const existingQuery = { ...query };
        query = {
          $and: [
            existingQuery,
            { $or: searchConditions }
          ]
        };
      } else if (query.$and) {
        // Add search to existing $and
        query.$and.push({ $or: searchConditions });
      } else {
        // Simple case - just add $or
        query.$or = searchConditions;
      }
    }

    console.log('📋 Final query:', JSON.stringify(query, null, 2));

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch orders with population
    // Sort by cancelledAt if available, otherwise by createdAt
    let orders = [];
    try {
      orders = await Order.find(query)
        .populate('userId', 'name email phone')
        .populate({
          path: 'restaurantId',
          select: 'name slug',
          match: { _id: { $exists: true } } // Only populate if it's a valid ObjectId
        })
        .sort({ cancelledAt: -1, createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean();
      
      // Filter out orders where restaurantId population failed (null)
      orders = orders.filter(order => order.restaurantId !== null || order.restaurantName);
    } catch (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }

    const total = await Order.countDocuments(query);
    console.log(`✅ Found ${total} restaurant cancelled orders`);

    // Get settlement info for each order to check refund status
    let OrderSettlement;
    try {
      OrderSettlement = (await import('../../order/models/OrderSettlement.js')).default;
    } catch (error) {
      console.error('Error importing OrderSettlement:', error);
      OrderSettlement = null;
    }
    
    const transformedOrders = await Promise.all(orders.map(async (order, index) => {
      let settlement = null;
      if (OrderSettlement) {
        try {
          settlement = await OrderSettlement.findOne({ orderId: order._id }).lean();
        } catch (error) {
          console.error(`Error fetching settlement for order ${order._id}:`, error);
        }
      }
      
      const orderDate = new Date(order.createdAt);
      const dateStr = orderDate.toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      }).toUpperCase();
      const timeStr = orderDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }).toUpperCase();

      const customerPhone = order.userId?.phone || '';
      
      // Check refund status from settlement
      const refundStatus = settlement?.cancellationDetails?.refundStatus || 'pending';
      const refundAmount = settlement?.cancellationDetails?.refundAmount || 0;

      return {
        sl: skip + index + 1,
        orderId: order.orderId,
        id: order._id.toString(),
        date: dateStr,
        time: timeStr,
        customerName: order.userId?.name || 'Unknown',
        customerPhone: customerPhone,
        customerEmail: order.userId?.email || '',
        restaurant: order.restaurantName || order.restaurantId?.name || 'Unknown Restaurant',
        restaurantId: order.restaurantId?.toString() || order.restaurantId || '',
        totalAmount: order.pricing?.total || 0,
        paymentStatus: order.payment?.status === 'completed' ? 'Paid' : 'Pending',
        orderStatus: 'Refund Requested',
        deliveryType: order.deliveryFleet === 'standard' ? 'Home Delivery' : 'Fast Delivery',
        cancellationReason: order.cancellationReason || 'Rejected by restaurant',
        cancelledAt: order.cancelledAt,
        refundStatus: refundStatus,
        refundAmount: refundAmount,
        settlement: settlement ? {
          cancellationStage: settlement.cancellationDetails?.cancellationStage,
          refundAmount: settlement.cancellationDetails?.refundAmount,
          restaurantCompensation: settlement.cancellationDetails?.restaurantCompensation
        } : null
      };
    }));

    console.log(`✅ Returning ${transformedOrders.length} refund requests`);
    
    return successResponse(res, 200, 'Refund requests retrieved successfully', {
      orders: transformedOrders || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total || 0,
        pages: Math.ceil((total || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching refund requests:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    return errorResponse(res, 500, error.message || 'Failed to fetch refund requests');
  }
});

/**
 * Process refund for an order
 * POST /api/admin/orders/:orderId/refund
 */
export const processRefund = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 [processRefund] ========== ROUTE HIT ==========');
    console.log('🔍 [processRefund] Method:', req.method);
    console.log('🔍 [processRefund] URL:', req.url);
    console.log('🔍 [processRefund] Original URL:', req.originalUrl);
    console.log('🔍 [processRefund] Path:', req.path);
    console.log('🔍 [processRefund] Base URL:', req.baseUrl);
    console.log('🔍 [processRefund] Params:', req.params);
    console.log('🔍 [processRefund] Headers:', {
      authorization: req.headers.authorization ? 'Present' : 'Missing',
      'content-type': req.headers['content-type']
    });

    const { orderId } = req.params;
    const { notes, refundAmount } = req.body;
    const adminId = req.user?.id || req.admin?.id || null;

    console.log('🔍 [processRefund] Processing refund request:', {
      orderId,
      orderIdType: typeof orderId,
      orderIdLength: orderId?.length,
      isObjectId: mongoose.Types.ObjectId.isValid(orderId),
      adminId,
      url: req.url,
      method: req.method,
      params: req.params,
      body: req.body,
      refundAmount: refundAmount,
      refundAmountType: typeof refundAmount,
      notes: notes
    });

    // Find order in database - try both MongoDB _id and orderId string
    let order = null;
    
    console.log('🔍 [processRefund] Searching order in database...', {
      searchId: orderId,
      isObjectId: mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24
    });
    
    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
      console.log('🔍 [processRefund] Searching by MongoDB _id:', orderId);
      order = await Order.findById(orderId)
        .populate('userId', 'name email phone _id')
        .lean();
      console.log('🔍 [processRefund] Order found by _id:', order ? 'Yes' : 'No');
    }
    
    // If not found by _id, try orderId string
    if (!order) {
      console.log('🔍 [processRefund] Searching by orderId string:', orderId);
      order = await Order.findOne({ orderId: orderId })
        .populate('userId', 'name email phone _id')
        .lean();
      console.log('🔍 [processRefund] Order found by orderId:', order ? 'Yes' : 'No');
    }

    if (!order) {
      console.error('❌ [processRefund] Order NOT FOUND in database');
      console.error('❌ [processRefund] Searched by:', {
        mongoId: mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24 ? orderId : 'N/A',
        orderIdString: orderId,
        orderIdType: typeof orderId,
        orderIdLength: orderId?.length
      });
      
      // Try to find any order with similar orderId (for debugging)
      try {
        const similarOrders = await Order.find({
          $or: [
            { orderId: { $regex: orderId, $options: 'i' } },
            { orderId: { $regex: orderId.substring(0, 10), $options: 'i' } }
          ]
        })
        .select('_id orderId status')
        .limit(5)
        .lean();
        
        if (similarOrders.length > 0) {
          console.log('💡 [processRefund] Found similar orders:', similarOrders.map(o => ({
            mongoId: o._id.toString(),
            orderId: o.orderId,
            status: o.status
          })));
        }
      } catch (debugError) {
        console.error('Error searching for similar orders:', debugError.message);
      }
      
      // Check total orders count
      try {
        const totalOrders = await Order.countDocuments();
        console.log(`📊 [processRefund] Total orders in database: ${totalOrders}`);
      } catch (countError) {
        console.error('Error counting orders:', countError.message);
      }
      
      return errorResponse(res, 404, `Order not found (ID: ${orderId}). Please check if the order exists.`);
    }
    
    // Verify order exists and log complete details
    console.log('✅✅✅ [processRefund] ORDER FOUND IN DATABASE ✅✅✅');
    console.log('📋 [processRefund] Complete Order Details:', {
      mongoId: order._id.toString(),
      orderId: order.orderId,
      status: order.status,
      paymentMethod: order.payment?.method || 'unknown',
      paymentType: order.paymentType || 'unknown',
      total: order.pricing?.total || 0,
      cancelledBy: order.cancelledBy || 'unknown',
      userId: order.userId?._id?.toString() || order.userId?.toString() || 'unknown',
      userName: order.userId?.name || 'unknown',
      userPhone: order.userId?.phone || 'unknown'
    });

    if (order.status !== 'cancelled') {
      return errorResponse(res, 400, 'Order is not cancelled');
    }

    // Check if it's a cancelled order (by restaurant or user)
    const isRestaurantCancelled = order.cancelledBy === 'restaurant' || 
      (order.cancellationReason && 
       /rejected by restaurant|restaurant rejected|restaurant cancelled|restaurant is too busy|item not available|outside delivery area|kitchen closing|technical issue/i.test(order.cancellationReason));
    
    const isUserCancelled = order.cancelledBy === 'user';

    if (!isRestaurantCancelled && !isUserCancelled) {
      return errorResponse(res, 400, 'This order was not cancelled by restaurant or user');
    }

    // Check payment method - wallet payments don't use an external gateway
    const paymentMethod = order.payment?.method;
    
    if (!paymentMethod) {
      return errorResponse(res, 400, 'Payment method not found for this order');
    }
    
    // For wallet payments, allow refund regardless of delivery type (no external gateway involved)
    // For other payments, only allow refund for Home Delivery orders
    // Note: Order model uses deliveryFleet, not deliveryType
    if (paymentMethod !== 'wallet') {
      // Check deliveryFleet - 'standard' and 'fast' are home delivery types
      const isHomeDelivery = order.deliveryFleet === 'standard' || order.deliveryFleet === 'fast';
      if (!isHomeDelivery) {
        return errorResponse(res, 400, 'Refund can only be processed for Home Delivery orders');
      }
    }

    // Get settlement (for wallet payments, settlement might not exist - create one if needed)
    const OrderSettlement = (await import('../../order/models/OrderSettlement.js')).default;
    let settlement = await OrderSettlement.findOne({ orderId: order._id });

    // For wallet payments, if settlement doesn't exist, create a proper one with all required fields
    if (!settlement && paymentMethod === 'wallet') {
      console.log('📝 [processRefund] Settlement not found for wallet order, creating settlement with order data...');
      
      const pricing = order.pricing || {};
      const subtotal = pricing.subtotal || 0;
      const deliveryFee = pricing.deliveryFee || 0;
      const platformFee = pricing.platformFee || 0;
      const tax = pricing.tax || 0;
      const total = pricing.total || 0;
      
      // Calculate earnings (simplified for wallet refunds - we just need the structure)
      const foodPrice = subtotal;
      const commission = 0; // For wallet refunds, we don't need actual commission
      const netEarning = foodPrice; // Simplified
      
      settlement = new OrderSettlement({
        orderId: order._id,
        orderNumber: order.orderId,
        userId: order.userId?._id || order.userId,
        restaurantId: order.restaurantId,
        restaurantName: order.restaurantName || 'Unknown Restaurant',
        userPayment: {
          subtotal: subtotal,
          discount: pricing.discount || 0,
          deliveryFee: deliveryFee,
          platformFee: platformFee,
          gst: tax,
          packagingFee: 0,
          total: total
        },
        restaurantEarning: {
          foodPrice: foodPrice,
          commission: commission,
          commissionPercentage: 0,
          netEarning: netEarning,
          status: 'cancelled'
        },
        deliveryPartnerEarning: {
          basePayout: 0,
          distance: 0,
          commissionPerKm: 0,
          distanceCommission: 0,
          surgeMultiplier: 1,
          surgeAmount: 0,
          totalEarning: 0,
          status: 'cancelled'
        },
        adminEarning: {
          commission: commission,
          platformFee: platformFee,
          deliveryFee: deliveryFee,
          gst: tax,
          deliveryMargin: 0,
          totalEarning: platformFee + deliveryFee + tax,
          status: 'cancelled'
        },
        escrowStatus: 'refunded',
        escrowAmount: total,
        settlementStatus: 'cancelled',
        cancellationDetails: {
          cancelled: true,
          cancelledAt: order.updatedAt || new Date(),
          refundStatus: 'pending'
        }
      });
      await settlement.save();
      console.log('✅ [processRefund] Settlement created for wallet refund');
    } else if (!settlement) {
      // For non-wallet payments, settlement is required
      return errorResponse(res, 404, 'Settlement not found for this order');
    }

    // Check if refund already processed
    if (settlement.cancellationDetails?.refundStatus === 'processed' || 
        settlement.cancellationDetails?.refundStatus === 'initiated') {
      return errorResponse(res, 400, 'Refund already processed or initiated for this order');
    }

    // Handle wallet refunds differently (paymentMethod already declared above)
    // Wallet payments don't use an external gateway - refund is direct wallet credit
    let refundResult;
    if (paymentMethod === 'wallet') {
      // For wallet payments, use provided refundAmount or calculate from order
      const orderTotal = order.pricing?.total || settlement.userPayment?.total || 0;
      let finalRefundAmount = 0;
      
      // If refundAmount is provided in request body, use it (validate it)
      if (refundAmount !== undefined && refundAmount !== null && refundAmount !== '') {
        const requestedAmount = parseFloat(refundAmount);
        console.log('💰 [processRefund] Validating refund amount:', {
          original: refundAmount,
          parsed: requestedAmount,
          isNaN: isNaN(requestedAmount),
          orderTotal: orderTotal
        });
        
        if (isNaN(requestedAmount) || requestedAmount <= 0) {
          console.error('❌ [processRefund] Invalid refund amount:', requestedAmount);
          return errorResponse(res, 400, `Invalid refund amount provided: ${refundAmount}. Please provide a valid positive number.`);
        }
        if (requestedAmount > orderTotal) {
          console.error('❌ [processRefund] Refund amount exceeds order total:', {
            requestedAmount,
            orderTotal
          });
          return errorResponse(res, 400, `Refund amount (₹${requestedAmount}) cannot exceed order total (₹${orderTotal})`);
        }
        finalRefundAmount = requestedAmount;
        console.log('✅ [processRefund] Wallet payment - using provided refund amount:', finalRefundAmount);
      } else {
        // If no amount provided, use calculated refund or order total
        const calculatedRefund = settlement.cancellationDetails?.refundAmount || 0;
        
        // For wallet, always use order total if calculated refund is 0
        if (calculatedRefund <= 0 && orderTotal > 0) {
          console.log('💰 [processRefund] Wallet payment - using full order total for refund:', orderTotal);
          finalRefundAmount = orderTotal;
        } else if (calculatedRefund > 0) {
          finalRefundAmount = calculatedRefund;
        } else {
          return errorResponse(res, 400, 'No refund amount found for this order');
        }
      }
      
      // Update settlement with refund amount
      if (!settlement.cancellationDetails) {
        settlement.cancellationDetails = {};
      }
      settlement.cancellationDetails.refundAmount = finalRefundAmount;
      await settlement.save();
      
      // Process wallet refund (add to user wallet) with the specified amount
      const { processWalletRefund } = await import('../../order/services/cancellationRefundService.js');
      refundResult = await processWalletRefund(order._id, adminId, finalRefundAmount);
    } else {
      const calculatedRefundAmount = settlement.cancellationDetails?.refundAmount || 0;
      if (calculatedRefundAmount <= 0) {
        return errorResponse(res, 400, 'No refund amount calculated for this order');
      }

      if (paymentMethod === 'cashfree') {
        const { processCashfreeRefund } = await import('../../order/services/cancellationRefundService.js');
        refundResult = await processCashfreeRefund(order._id, adminId);
      } else {
        const { processRazorpayRefund } = await import('../../order/services/cancellationRefundService.js');
        refundResult = await processRazorpayRefund(order._id, adminId);
      }
    }

    // Update settlement with admin notes if provided
    if (notes) {
      settlement.metadata = settlement.metadata || new Map();
      settlement.metadata.set('adminRefundNotes', notes);
      await settlement.save();
    }

    return successResponse(res, 200, refundResult.message || 'Refund processed successfully', {
      orderId: order.orderId,
      refundId: refundResult.refundId,
      refundAmount: refundResult.refundAmount,
      cashfreeRefund: refundResult.cashfreeRefund,
      razorpayRefund: refundResult.razorpayRefund,
      message: refundResult.message
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    return errorResponse(res, 500, error.message || 'Failed to process refund');
  }
});


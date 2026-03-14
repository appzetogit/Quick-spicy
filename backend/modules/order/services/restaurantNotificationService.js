import Order from '../models/Order.js';
import Payment from '../../payment/models/Payment.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import mongoose from 'mongoose';
import admin from 'firebase-admin';
import firebaseAuthService from '../../auth/services/firebaseAuthService.js';

const RESTAURANT_ANDROID_CHANNEL_ID = 'quick_spicy_popup_v2';
const RESTAURANT_ANDROID_SOUND = 'original';

// Dynamic import to avoid circular dependency
let getIO = null;

async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import('../../../server.js');
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

function extractRestaurantTokens(restaurantRecord = null) {
  const tokens = [];
  const addToken = (token) => {
    const normalized = String(token || '').trim();
    if (normalized.length >= 10) tokens.push(normalized);
  };

  addToken(restaurantRecord?.fcmtokenweb);
  addToken(restaurantRecord?.fcmtokenmobile);
  return [...new Set(tokens)];
}

function getRestaurantStatusMessage(status, orderRef) {
  const orderLabel = orderRef ? `Order ${orderRef}` : 'Order';
  const normalizedStatus = String(status || '').toLowerCase();
  const statusMessages = {
    pending: `${orderLabel} created and awaiting confirmation.`,
    confirmed: `${orderLabel} confirmed successfully.`,
    preparing: `${orderLabel} is now being prepared.`,
    ready: `${orderLabel} is ready for pickup.`,
    out_for_delivery: `${orderLabel} is out for delivery.`,
    delivered: `${orderLabel} delivered successfully.`,
    cancelled: `${orderLabel} was cancelled.`
  };

  return statusMessages[normalizedStatus] || `${orderLabel} status updated to ${normalizedStatus || 'updated'}.`;
}

async function sendRestaurantPushNotifications(tokens = [], payload = {}) {
  const uniqueTokens = [...new Set((tokens || []).map((t) => String(t || '').trim()).filter((t) => t.length >= 10))];
  if (uniqueTokens.length === 0) {
    return { success: false, sentCount: 0, failedCount: 0, reason: 'No valid FCM tokens' };
  }

  await firebaseAuthService.init();
  if (!firebaseAuthService.isEnabled()) {
    return { success: false, sentCount: 0, failedCount: uniqueTokens.length, reason: 'Firebase not configured' };
  }

  const targetUrl = String(payload?.targetUrl || '/restaurant/orders');
  const message = {
    notification: {
      title: String(payload?.title || 'Restaurant Order Update'),
      body: String(payload?.body || 'You have an order update')
    },
    data: {
      type: String(payload?.type || 'restaurant_order_update'),
      orderId: String(payload?.orderId || ''),
      orderMongoId: String(payload?.orderMongoId || ''),
      status: String(payload?.status || ''),
      sentAt: new Date().toISOString(),
      targetUrl
    },
    android: {
      priority: 'high',
      ttl: 120000,
      notification: {
        channelId: RESTAURANT_ANDROID_CHANNEL_ID,
        sound: RESTAURANT_ANDROID_SOUND,
        defaultSound: false,
        defaultVibrateTimings: true,
        priority: 'max'
      }
    },
    apns: {
      headers: {
        'apns-priority': '10'
      },
      payload: {
        aps: {
          sound: 'default',
          badge: 1
        }
      }
    },
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '120'
      },
      fcmOptions: {
        link: targetUrl
      },
      notification: {
        icon: '/favicon.ico',
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 300],
        silent: false
      },
    },
    tokens: uniqueTokens
  };

  const response = await admin.messaging().sendEachForMulticast(message);
  return {
    success: (response.successCount || 0) > 0,
    sentCount: response.successCount || 0,
    failedCount: response.failureCount || 0
  };
}

/**
 * Notify restaurant about new order via Socket.IO
 * @param {Object} order - Order document
 * @param {string} restaurantId - Restaurant ID
 * @param {string} [paymentMethodOverride] - Explicit payment method ('cash' | 'razorpay') so restaurant sees correct value
 */
export async function notifyRestaurantNewOrder(order, restaurantId, paymentMethodOverride) {
  try {
    const io = await getIOInstance();

    if (!io) {
      console.warn('Socket.IO not initialized, skipping restaurant notification');
      return;
    }

    // CRITICAL: Validate restaurantId matches order's restaurantId
    const orderRestaurantId = order.restaurantId?.toString() || order.restaurantId;
    const providedRestaurantId = restaurantId?.toString() || restaurantId;
    
    if (orderRestaurantId !== providedRestaurantId) {
      console.error('❌ CRITICAL: RestaurantId mismatch in notification!', {
        orderRestaurantId: orderRestaurantId,
        providedRestaurantId: providedRestaurantId,
        orderId: order.orderId,
        orderRestaurantName: order.restaurantName
      });
      // Use order's restaurantId instead of provided one
      restaurantId = orderRestaurantId;
    }

    // Get restaurant details
    let restaurant = null;
    if (mongoose.Types.ObjectId.isValid(restaurantId)) {
      restaurant = await Restaurant.findById(restaurantId).lean();
    }
    if (!restaurant) {
      restaurant = await Restaurant.findOne({
        $or: [
          { restaurantId: restaurantId },
          { _id: restaurantId }
        ]
      }).lean();
    }
    
    // Validate restaurant name matches order
    if (restaurant && order.restaurantName && restaurant.name !== order.restaurantName) {
      console.warn('⚠️ Restaurant name mismatch:', {
        orderRestaurantName: order.restaurantName,
        foundRestaurantName: restaurant.name,
        restaurantId: restaurantId
      });
      // Still proceed but log warning
    }

    // Resolve payment method: override > order.payment > Payment collection (COD fallback)
    let resolvedPaymentMethod = paymentMethodOverride ?? order.payment?.method ?? 'razorpay';
    if (resolvedPaymentMethod !== 'cash') {
      try {
        const paymentRecord = await Payment.findOne({ orderId: order._id }).select('method').lean();
        if (paymentRecord?.method === 'cash') resolvedPaymentMethod = 'cash';
      } catch (e) { /* ignore */ }
    }

    // Prepare order notification data
    const orderNotification = {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
      restaurantId: restaurantId,
      restaurantName: order.restaurantName,
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
      })),
      total: order.pricing.total,
      customerAddress: {
        label: order.address.label,
        street: order.address.street,
        city: order.address.city,
        location: order.address.location
      },
      status: order.status,
      createdAt: order.createdAt,
      estimatedDeliveryTime: order.estimatedDeliveryTime || 30,
      note: order.note || '',
      sendCutlery: order.sendCutlery,
      paymentMethod: resolvedPaymentMethod
    };
    console.log('📢 Restaurant notification payload paymentMethod:', orderNotification.paymentMethod, { override: paymentMethodOverride, orderPaymentMethod: order.payment?.method });

    // Get restaurant namespace
    const restaurantNamespace = io.of('/restaurant');

    // Normalize restaurantId to string (handle both ObjectId and string)
    const normalizedRestaurantId = restaurantId?.toString() || restaurantId;

    // Try multiple room formats to ensure we find the restaurant
    const roomVariations = [
      `restaurant:${normalizedRestaurantId}`,
      `restaurant:${restaurantId}`,
      ...(mongoose.Types.ObjectId.isValid(normalizedRestaurantId)
        ? [`restaurant:${new mongoose.Types.ObjectId(normalizedRestaurantId).toString()}`]
        : [])
    ];
    const uniqueRoomVariations = [...new Set(roomVariations.filter(Boolean))];

    // Get all connected sockets in the restaurant room
    let socketsInRoom = [];
    for (const room of uniqueRoomVariations) {
      const sockets = await restaurantNamespace.in(room).fetchSockets();
      if (sockets.length > 0) {
        socketsInRoom = sockets;
        console.log(`📢 Found ${sockets.length} socket(s) in room: ${room}`);
        break;
      }
    }

    const primaryRoom = uniqueRoomVariations[0];

    console.log(`📢 CRITICAL: Attempting to notify restaurant about new order:`);
    console.log(`📢 Order ID: ${order.orderId}`);
    console.log(`📢 Order MongoDB ID: ${order._id?.toString()}`);
    console.log(`📢 Restaurant ID (normalized): ${normalizedRestaurantId}`);
    console.log(`📢 Restaurant Name: ${order.restaurantName}`);
    console.log(`📢 Restaurant ID from order: ${order.restaurantId}`);
    console.log(`📢 Room variations to try:`, uniqueRoomVariations);
    console.log(`📢 Connected sockets in primary room ${primaryRoom}: ${socketsInRoom.length}`);

    // CRITICAL: Only emit to the specific restaurant room - NEVER broadcast to all restaurants
    // This ensures orders only go to the correct restaurant
    if (socketsInRoom.length > 0) {
      // Found sockets in the restaurant room - send notification only to that room
      uniqueRoomVariations.forEach(room => {
        restaurantNamespace.to(room).emit('new_order', orderNotification);
        restaurantNamespace.to(room).emit('play_notification_sound', {
          type: 'new_order',
          orderId: order.orderId,
          message: `New order received: ${order.orderId}`
        });
        console.log(`📤 Sent notification to room: ${room}`);
      });
      console.log(`✅ Notified restaurant ${normalizedRestaurantId} about new order ${order.orderId} (${socketsInRoom.length} socket(s) connected)`);
    } else {
      // No sockets found in restaurant room - log error but DO NOT broadcast to all restaurants
      console.error(`❌ CRITICAL: No sockets found for restaurant ${normalizedRestaurantId} in any room!`);
      console.error(`❌ Order ${order.orderId} will NOT be delivered to restaurant ${normalizedRestaurantId}`);
      console.error(`❌ Room variations tried:`, uniqueRoomVariations);
      console.error(`❌ Restaurant name: ${order.restaurantName}`);
      console.error(`❌ Restaurant ID from order: ${order.restaurantId}`);
      console.error(`❌ Normalized restaurant ID: ${normalizedRestaurantId}`);
      
      // Log all connected restaurant sockets for debugging (but don't send to them)
      const allSockets = await restaurantNamespace.fetchSockets();
      console.log(`📊 Total restaurant sockets connected: ${allSockets.length}`);
      if (allSockets.length > 0) {
        // Get room information for each socket
        const socketRooms = [];
        for (const socket of allSockets) {
          const rooms = Array.from(socket.rooms);
          socketRooms.push({
            socketId: socket.id,
            rooms: rooms.filter(r => r.startsWith('restaurant:'))
          });
        }
        console.log(`📊 Connected restaurant sockets and their rooms:`, socketRooms);
      }
      
      // Still try to emit to room variations (in case socket connects later)
      // But DO NOT broadcast to all restaurants
      uniqueRoomVariations.forEach(room => {
        restaurantNamespace.to(room).emit('new_order', orderNotification);
        restaurantNamespace.to(room).emit('play_notification_sound', {
          type: 'new_order',
          orderId: order.orderId,
          message: `New order received: ${order.orderId}`
        });
        console.log(`📤 Emitted to room ${room} (no sockets found, but room exists for future connections)`);
      });
      
      // Return error instead of success
      return {
        success: false,
        restaurantId,
        orderId: order.orderId,
        error: 'Restaurant not connected to Socket.IO',
        message: `Restaurant ${normalizedRestaurantId} (${order.restaurantName}) is not connected. Order notification not sent.`
      };
    }

    try {
      const pushTokens = extractRestaurantTokens(restaurant);
      const pushResult = await sendRestaurantPushNotifications(pushTokens, {
        type: 'new_order',
        title: 'New Order Received',
        body: `Order ${order.orderId} received from ${orderNotification.restaurantName || 'customer'}`,
        orderId: order.orderId,
        orderMongoId: order._id?.toString(),
        status: order.status,
        targetUrl: `/restaurant/orders/${order._id?.toString() || order.orderId || ''}`
      });
      console.log(`📲 Restaurant push result for ${normalizedRestaurantId}:`, pushResult);
    } catch (pushError) {
      console.error(`❌ Restaurant push failed for ${normalizedRestaurantId}:`, pushError.message);
    }

    return {
      success: true,
      restaurantId,
      orderId: order.orderId
    };
  } catch (error) {
    console.error('Error notifying restaurant:', error);
    throw error;
  }
}

/**
 * Notify restaurant about order status update
 * @param {string} orderId - Order ID
 * @param {string} status - New status
 */
export async function notifyRestaurantOrderUpdate(orderId, status) {
  try {
    const io = await getIOInstance();

    if (!io) {
      return;
    }

    const order = await Order.findById(orderId).lean();
    if (!order) {
      throw new Error('Order not found');
    }

    const restaurant = await Restaurant.findOne({
      $or: [
        { _id: order.restaurantId },
        { restaurantId: String(order.restaurantId || '') }
      ]
    })
      .select('fcmtokenweb fcmtokenmobile')
      .lean();

    // Get restaurant namespace
    const restaurantNamespace = io.of('/restaurant');

    restaurantNamespace.to(`restaurant:${order.restaurantId}`).emit('order_status_update', {
      orderId: order.orderId,
      status,
      updatedAt: new Date()
    });

    const room = `restaurant:${order.restaurantId}`;
    const socketsInRoom = await restaurantNamespace.in(room).fetchSockets();
    if (socketsInRoom.length === 0) {
      try {
        const pushTokens = extractRestaurantTokens(restaurant);
        const pushResult = await sendRestaurantPushNotifications(pushTokens, {
          type: 'order_status_update',
          title: 'Order Status Updated',
          body: getRestaurantStatusMessage(status, order.orderId),
          orderId: order.orderId,
          orderMongoId: order._id?.toString(),
          status,
          targetUrl: `/restaurant/orders/${order._id?.toString() || order.orderId || ''}`
        });
        console.log(`📲 Restaurant status push result for ${order.restaurantId}:`, pushResult);
      } catch (pushError) {
        console.error(`❌ Restaurant status push failed for ${order.restaurantId}:`, pushError.message);
      }
    } else {
      console.log(`ℹ️ Skipping restaurant status push for ${order.restaurantId} because socket is connected (${socketsInRoom.length} session(s)).`);
    }

    console.log(`📢 Notified restaurant ${order.restaurantId} about order ${order.orderId} status: ${status}`);
  } catch (error) {
    console.error('Error notifying restaurant about order update:', error);
    throw error;
  }
}


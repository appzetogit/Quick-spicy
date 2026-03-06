import mongoose from 'mongoose';
import admin from 'firebase-admin';
import Order from '../models/Order.js';
import User from '../../auth/models/User.js';
import firebaseAuthService from '../../auth/services/firebaseAuthService.js';

let getIO = null;

async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import('../../../server.js');
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

function extractUserTokens(userRecord = null) {
  const webTokens = [];
  const mobileTokens = [];
  const addToken = (token) => {
    const normalized = String(token || '').trim();
    return normalized.length >= 10 ? normalized : null;
  };

  const webToken = addToken(userRecord?.fcmtokenweb);
  const mobileToken = addToken(userRecord?.fcmtokenmobile);
  if (webToken) webTokens.push(webToken);
  if (mobileToken) mobileTokens.push(mobileToken);

  return {
    webTokens: [...new Set(webTokens)],
    mobileTokens: [...new Set(mobileTokens)],
  };
}

function getUserStatusMessage(status, orderRef) {
  const orderLabel = orderRef ? `Order ${orderRef}` : 'Order';
  const normalizedStatus = String(status || '').toLowerCase();
  const statusMessages = {
    pending: `${orderLabel} is placed and waiting for restaurant confirmation.`,
    confirmed: `${orderLabel} has been confirmed.`,
    preparing: `Restaurant accepted ${orderLabel} and started preparing it.`,
    ready: `${orderLabel} is ready for pickup.`,
    accepted: `Delivery partner accepted ${orderLabel}.`,
    reached_pickup: `Delivery partner reached the restaurant for ${orderLabel}.`,
    out_for_delivery: `${orderLabel} is out for delivery.`,
    at_delivery: `Delivery partner has reached your location for ${orderLabel}.`,
    delivered: `${orderLabel} has been delivered successfully.`,
    cancelled: `${orderLabel} was cancelled.`
  };

  return statusMessages[normalizedStatus] || `${orderLabel} status updated to ${normalizedStatus || 'updated'}.`;
}

async function sendEachMulticast(tokens = [], message = {}) {
  const uniqueTokens = [...new Set((tokens || []).map((t) => String(t || '').trim()).filter((t) => t.length >= 10))];
  if (uniqueTokens.length === 0) {
    return { success: false, sentCount: 0, failedCount: 0, reason: 'No valid FCM tokens' };
  }

  const response = await admin.messaging().sendEachForMulticast({
    ...message,
    tokens: uniqueTokens,
  });

  return {
    success: (response.successCount || 0) > 0,
    sentCount: response.successCount || 0,
    failedCount: response.failureCount || 0
  };
}

async function sendUserPushNotifications(tokenGroups = {}, payload = {}) {
  const webTokens = Array.isArray(tokenGroups?.webTokens) ? tokenGroups.webTokens : [];
  const mobileTokens = Array.isArray(tokenGroups?.mobileTokens) ? tokenGroups.mobileTokens : [];
  if (webTokens.length === 0 && mobileTokens.length === 0) {
    return { success: false, sentCount: 0, failedCount: 0, reason: 'No valid FCM tokens' };
  }

  await firebaseAuthService.init();
  if (!firebaseAuthService.isEnabled()) {
    return { success: false, sentCount: 0, failedCount: webTokens.length + mobileTokens.length, reason: 'Firebase not configured' };
  }

  const targetUrl = payload?.targetUrl || '/orders';
  const notificationId = String(payload?.notificationId || `order-update:${payload?.orderMongoId || payload?.orderId || "unknown"}:${payload?.status || "updated"}:${Date.now()}`);
  const baseData = {
    notificationId,
    type: String(payload?.type || 'order_status_update'),
    orderId: String(payload?.orderId || ''),
    orderMongoId: String(payload?.orderMongoId || ''),
    status: String(payload?.status || ''),
    targetUrl: String(targetUrl),
    sentAt: new Date().toISOString()
  };
  const title = String(payload?.title || 'Order Update');
  const body = String(payload?.body || 'Your order has an update');

  const webMessage = {
    data: {
      ...baseData,
      title,
      body,
    },
    webpush: {
      notification: {
        title,
        body,
        tag: notificationId,
        renotify: false,
        silent: false,
        requireInteraction: false,
        vibrate: [200, 100, 200, 100, 300],
      },
      fcmOptions: {
        link: String(targetUrl)
      }
    },
  };

  const mobileMessage = {
    notification: {
      title,
      body,
    },
    data: baseData,
    android: {
      notification: {
        sound: "default",
        defaultSound: true,
        defaultVibrateTimings: true,
        vibrateTimingsMillis: [200, 100, 200, 100, 300],
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
  };

  const results = await Promise.all([
    sendEachMulticast(webTokens, webMessage),
    sendEachMulticast(mobileTokens, mobileMessage),
  ]);

  const sentCount = results.reduce((sum, result) => sum + (result.sentCount || 0), 0);
  const failedCount = results.reduce((sum, result) => sum + (result.failedCount || 0), 0);

  return {
    success: sentCount > 0,
    sentCount,
    failedCount
  };
}

async function getOrderByIdOrOrderId(orderId) {
  if (!orderId) return null;
  const normalized = String(orderId).trim();
  if (!normalized) return null;

  if (mongoose.Types.ObjectId.isValid(normalized)) {
    const orderByMongoId = await Order.findById(normalized).lean();
    if (orderByMongoId) return orderByMongoId;
  }

  return Order.findOne({ orderId: normalized }).lean();
}

export async function notifyUserOrderUpdate(orderId, status, extra = {}) {
  try {
    const order = await getOrderByIdOrOrderId(orderId);
    if (!order) {
      return { success: false, reason: 'Order not found' };
    }

    const user = await User.findById(order.userId)
      .select('fcmtokenweb fcmtokenmobile')
      .lean();

    const payload = {
      title: 'Order Update',
      message: getUserStatusMessage(status, order.orderId),
      status: String(status || '').toLowerCase(),
      orderId: order.orderId,
      orderMongoId: order._id?.toString() || null,
      updatedAt: new Date().toISOString(),
      ...extra
    };

    const io = await getIOInstance();
    if (io) {
      const trackingIds = [...new Set(
        [order._id?.toString(), order.orderId]
          .filter(Boolean)
          .map((id) => String(id))
      )];

      trackingIds.forEach((trackingId) => {
        io.to(`order:${trackingId}`).emit('order_status_update', payload);
      });

      const userId = order.userId?.toString?.() || String(order.userId || '');
      if (userId) {
        io.to(`user:${userId}`).emit('order_status_update', payload);
      }
    }

    let pushResult = { success: false, sentCount: 0, failedCount: 0, reason: 'No tokens' };
    try {
      const pushTokens = extractUserTokens(user);
      pushResult = await sendUserPushNotifications(pushTokens, {
        notificationId: `order-update:${payload.orderMongoId || payload.orderId}:${payload.status}`,
        type: 'order_status_update',
        title: payload.title,
        body: payload.message,
        orderId: payload.orderId,
        orderMongoId: payload.orderMongoId,
        status: payload.status,
        targetUrl: '/orders'
      });
    } catch (pushError) {
      console.error(`❌ User push failed for order ${order.orderId}:`, pushError.message);
    }

    return {
      success: true,
      orderId: order.orderId,
      userId: order.userId?.toString?.() || order.userId,
      pushSent: pushResult.sentCount || 0
    };
  } catch (error) {
    console.error('Error notifying user about order update:', error);
    throw error;
  }
}

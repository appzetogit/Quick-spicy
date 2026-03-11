import winston from 'winston';

let getIO = null;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import('../../../server.js');
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

export async function notifyAdminNewOrder(order) {
  try {
    const io = await getIOInstance();
    if (!io || !order) return { success: false, reason: 'socket-not-ready' };

    const payload = {
      type: 'new_order',
      orderId: order.orderId,
      orderMongoId: order._id?.toString?.() || '',
      restaurantId: order.restaurantId?.toString?.() || order.restaurantId || '',
      restaurantName: order.restaurantName || '',
      status: order.status || 'confirmed',
      total: order?.pricing?.total ?? 0,
      createdAt: order.createdAt || new Date().toISOString()
    };

    io.to('admin:orders').emit('admin_new_order', payload);
    io.to('admin:orders').emit('play_notification_sound', {
      type: 'new_order',
      orderId: payload.orderId,
      message: `New order received: ${payload.orderId}`
    });

    logger.info('📣 Admin new order event emitted', {
      room: 'admin:orders',
      orderId: payload.orderId,
      orderMongoId: payload.orderMongoId
    });

    return { success: true, orderId: payload.orderId };
  } catch (error) {
    logger.error('❌ Failed to emit admin new order event', {
      error: error?.message,
      stack: error?.stack
    });
    return { success: false, reason: error?.message || 'unknown-error' };
  }
}


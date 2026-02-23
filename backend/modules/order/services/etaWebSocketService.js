import etaCalculationService from './etaCalculationService.js';
import Order from '../models/Order.js';

/**
 * ETA WebSocket Service
 * Handles real-time ETA updates via Socket.IO
 */
class ETAWebSocketService {
  /**
   * Get Socket.IO instance
   */
  async getIOInstance() {
    let getIO;
    try {
      const serverModule = await import('../../../server.js');
      getIO = serverModule.getIO;
    } catch (error) {
      console.error('Error getting IO instance:', error);
    }
    return getIO ? getIO() : null;
  }

  /**
   * Emit ETA update to all connected clients for an order
   * @param {String} orderId - Order ID
   * @param {Object} etaData - ETA data to emit
   */
  async emitETAUpdate(orderId, etaData) {
    try {
      const io = await this.getIOInstance();
      if (!io) {
        console.warn('Socket.IO not initialized, skipping ETA update');
        return;
      }

      const order = await Order.findById(orderId).lean();
      if (!order) {
        console.error('Order not found for ETA update:', orderId);
        return;
      }

      // Prepare ETA update payload
      const etaUpdate = {
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
        eta: {
          min: etaData.minETA || etaData.min,
          max: etaData.maxETA || etaData.max,
          formatted: `${etaData.minETA || etaData.min}-${etaData.maxETA || etaData.max} mins`,
          lastUpdated: new Date()
        },
        status: order.status,
        timestamp: new Date()
      };

      // Emit to order-specific room (for user tracking)
      io.to(`order:${order.orderId}`).emit('ETA_UPDATED', etaUpdate);

      // Emit to user-specific room
      if (order.userId) {
        io.to(`user:${order.userId}`).emit('ETA_UPDATED', etaUpdate);
      }

      // Emit to restaurant room
      io.of('/restaurant')
        .to(`restaurant:${order.restaurantId}`)
        .emit('ETA_UPDATED', etaUpdate);

      // Emit to delivery partner if assigned
      if (order.deliveryPartnerId) {
        io.of('/delivery')
          .to(`delivery:${order.deliveryPartnerId}`)
          .emit('ETA_UPDATED', etaUpdate);
      }

      console.log(`📡 ETA update emitted for order ${order.orderId}:`, etaUpdate.eta.formatted);
    } catch (error) {
      console.error('Error emitting ETA update:', error);
    }
  }

  /**
   * Emit rider assignment event
   * @param {String} orderId - Order ID
   * @param {Object} riderData - Rider assignment data
   */
  async emitRiderAssigned(orderId, riderData) {
    try {
      const io = await this.getIOInstance();
      if (!io) return;

      const order = await Order.findById(orderId).lean();
      if (!order) return;

      const eventData = {
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
        riderId: riderData.riderId,
        riderName: riderData.riderName,
        timestamp: new Date()
      };

      // Emit to order room
      io.to(`order:${order.orderId}`).emit('RIDER_ASSIGNED', eventData);

      // Emit to user
      if (order.userId) {
        io.to(`user:${order.userId}`).emit('RIDER_ASSIGNED', eventData);
      }

      console.log(`📡 Rider assigned event emitted for order ${order.orderId}`);
    } catch (error) {
      console.error('Error emitting rider assigned event:', error);
    }
  }

  /**
   * Emit pickup event
   * @param {String} orderId - Order ID
   */
  async emitPickedUp(orderId) {
    try {
      const io = await this.getIOInstance();
      if (!io) return;

      const order = await Order.findById(orderId).lean();
      if (!order) return;

      const eventData = {
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
        timestamp: new Date()
      };

      io.to(`order:${order.orderId}`).emit('PICKED_UP', eventData);
      
      if (order.userId) {
        io.to(`user:${order.userId}`).emit('PICKED_UP', eventData);
      }

      console.log(`📡 Picked up event emitted for order ${order.orderId}`);
    } catch (error) {
      console.error('Error emitting picked up event:', error);
    }
  }

  /**
   * Emit nearing drop location event
   * @param {String} orderId - Order ID
   * @param {Number} distanceToDrop - Distance to drop in km
   */
  async emitNearby(orderId, distanceToDrop) {
    try {
      const io = await this.getIOInstance();
      if (!io) return;

      const order = await Order.findById(orderId).lean();
      if (!order) return;

      const eventData = {
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
        distanceToDrop,
        timestamp: new Date()
      };

      io.to(`order:${order.orderId}`).emit('NEARBY', eventData);
      
      if (order.userId) {
        io.to(`user:${order.userId}`).emit('NEARBY', eventData);
      }

      console.log(`📡 Nearby event emitted for order ${order.orderId}, distance: ${distanceToDrop}km`);
    } catch (error) {
      console.error('Error emitting nearby event:', error);
    }
  }

  /**
   * Start periodic ETA updates for an order
   * Updates ETA every 30 seconds until delivered
   * @param {String} orderId - Order ID
   */
  startPeriodicETAUpdates(orderId) {
    const intervalId = setInterval(async () => {
      try {
        const order = await Order.findById(orderId);
        if (!order || order.status === 'delivered' || order.status === 'cancelled') {
          clearInterval(intervalId);
          return;
        }

        // Get live ETA
        const liveETA = await etaCalculationService.getLiveETA(orderId);
        
        // Emit update
        await this.emitETAUpdate(orderId, liveETA);
      } catch (error) {
        console.error('Error in periodic ETA update:', error);
        clearInterval(intervalId);
      }
    }, 30000); // Every 30 seconds

    // Store interval ID for cleanup
    if (!this.updateIntervals) {
      this.updateIntervals = new Map();
    }
    this.updateIntervals.set(orderId, intervalId);

    return intervalId;
  }

  /**
   * Stop periodic ETA updates for an order
   * @param {String} orderId - Order ID
   */
  stopPeriodicETAUpdates(orderId) {
    if (this.updateIntervals && this.updateIntervals.has(orderId)) {
      clearInterval(this.updateIntervals.get(orderId));
      this.updateIntervals.delete(orderId);
    }
  }
}

export default new ETAWebSocketService();


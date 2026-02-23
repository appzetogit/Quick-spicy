import etaCalculationService from './etaCalculationService.js';
import etaWebSocketService from './etaWebSocketService.js';
import OrderEvent from '../models/OrderEvent.js';
import Order from '../models/Order.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Delivery from '../../delivery/models/Delivery.js';

/**
 * ETA Event Service
 * Handles events that trigger ETA recalculation
 */
class ETAEventService {
  /**
   * Handle restaurant accepted order event
   * @param {String} orderId - Order ID
   * @param {Date} acceptedAt - When restaurant accepted
   */
  async handleRestaurantAccepted(orderId, acceptedAt) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      // Check if restaurant accepted late
      const orderCreatedAt = order.createdAt;
      const delayMinutes = Math.floor((acceptedAt - orderCreatedAt) / 1000 / 60);
      const expectedAcceptTime = 2; // Expected 2 minutes to accept

      let eventType = 'RESTAURANT_ACCEPTED';
      let eventData = {};

      if (delayMinutes > expectedAcceptTime) {
        eventType = 'RESTAURANT_ACCEPTED_LATE';
        eventData = {
          delayMinutes: delayMinutes - expectedAcceptTime
        };
      }

      // Create event
      const event = await OrderEvent.create({
        orderId: order._id,
        eventType,
        data: {
          ...eventData,
          acceptedAt
        },
        timestamp: acceptedAt
      });

      // Recalculate ETA
      const newETA = await etaCalculationService.recalculateETA(
        orderId,
        eventType,
        eventData
      );

      // Emit WebSocket update
      await etaWebSocketService.emitETAUpdate(orderId, newETA);

      return { event, newETA };
    } catch (error) {
      console.error('Error handling restaurant accepted event:', error);
      throw error;
    }
  }

  /**
   * Handle rider assigned event
   * @param {String} orderId - Order ID
   * @param {String} riderId - Rider ID
   */
  async handleRiderAssigned(orderId, riderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      const rider = await Delivery.findById(riderId);
      if (!rider) {
        throw new Error('Rider not found');
      }

      // Get rider location
      const riderLocation = rider.availability?.currentLocation 
        ? {
            latitude: rider.availability.currentLocation.coordinates[1],
            longitude: rider.availability.currentLocation.coordinates[0]
          }
        : null;

      // Check if assignment was delayed
      const orderCreatedAt = order.createdAt;
      const assignedAt = new Date();
      const delayMinutes = Math.floor((assignedAt - orderCreatedAt) / 1000 / 60);
      const expectedAssignTime = 5; // Expected 5 minutes to assign

      let eventType = 'RIDER_ASSIGNED';
      let eventData = {
        riderId: rider._id,
        riderLocation
      };

      if (delayMinutes > expectedAssignTime) {
        eventType = 'RIDER_ASSIGNED_LATE';
        eventData.delayMinutes = delayMinutes - expectedAssignTime;
      } else if (delayMinutes < 2) {
        eventType = 'RIDER_ASSIGNED_EARLY';
      }

      // Create event
      const event = await OrderEvent.create({
        orderId: order._id,
        eventType,
        data: eventData,
        timestamp: assignedAt
      });

      // Recalculate ETA with actual rider location
      const newETA = await etaCalculationService.recalculateETA(
        orderId,
        'RIDER_ASSIGNED',
        eventData
      );

      // Emit WebSocket updates
      await etaWebSocketService.emitETAUpdate(orderId, newETA);
      await etaWebSocketService.emitRiderAssigned(orderId, {
        riderId: rider._id,
        riderName: rider.name
      });

      return { event, newETA };
    } catch (error) {
      console.error('Error handling rider assigned event:', error);
      throw error;
    }
  }

  /**
   * Handle rider reached restaurant event
   * @param {String} orderId - Order ID
   */
  async handleRiderReachedRestaurant(orderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      const reachedAt = new Date();

      // Create event
      const event = await OrderEvent.create({
        orderId: order._id,
        eventType: 'RIDER_REACHED_RESTAURANT',
        data: {
          reachedAt
        },
        timestamp: reachedAt
      });

      // Recalculate ETA
      const newETA = await etaCalculationService.recalculateETA(
        orderId,
        'RIDER_REACHED_RESTAURANT',
        {}
      );

      // Emit WebSocket update
      await etaWebSocketService.emitETAUpdate(orderId, newETA);

      return { event, newETA };
    } catch (error) {
      console.error('Error handling rider reached restaurant event:', error);
      throw error;
    }
  }

  /**
   * Handle food not ready event (rider waiting)
   * @param {String} orderId - Order ID
   * @param {Number} waitingTime - Waiting time in minutes
   */
  async handleFoodNotReady(orderId, waitingTime) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      // Create event
      const event = await OrderEvent.create({
        orderId: order._id,
        eventType: 'FOOD_NOT_READY',
        data: {
          waitingTime
        },
        timestamp: new Date()
      });

      // Recalculate ETA
      const newETA = await etaCalculationService.recalculateETA(
        orderId,
        'FOOD_NOT_READY',
        { waitingTime }
      );

      // Emit WebSocket update
      await etaWebSocketService.emitETAUpdate(orderId, newETA);

      return { event, newETA };
    } catch (error) {
      console.error('Error handling food not ready event:', error);
      throw error;
    }
  }

  /**
   * Handle rider started delivery event
   * @param {String} orderId - Order ID
   */
  async handleRiderStartedDelivery(orderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      // Create event
      const event = await OrderEvent.create({
        orderId: order._id,
        eventType: 'RIDER_STARTED_DELIVERY',
        data: {
          startedAt: new Date()
        },
        timestamp: new Date()
      });

      // Recalculate ETA
      const newETA = await etaCalculationService.recalculateETA(
        orderId,
        'RIDER_STARTED_DELIVERY',
        {}
      );

      // Emit WebSocket updates
      await etaWebSocketService.emitETAUpdate(orderId, newETA);
      await etaWebSocketService.emitPickedUp(orderId);

      return { event, newETA };
    } catch (error) {
      console.error('Error handling rider started delivery event:', error);
      throw error;
    }
  }

  /**
   * Handle traffic detected event
   * @param {String} orderId - Order ID
   * @param {String} trafficLevel - 'low', 'medium', 'high'
   */
  async handleTrafficDetected(orderId, trafficLevel) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      // Create event
      const event = await OrderEvent.create({
        orderId: order._id,
        eventType: 'TRAFFIC_DETECTED',
        data: {
          trafficLevel,
          trafficMultiplier: etaCalculationService.constructor.TRAFFIC_MULTIPLIERS[trafficLevel] || 1.0
        },
        timestamp: new Date()
      });

      // Recalculate ETA
      const newETA = await etaCalculationService.recalculateETA(
        orderId,
        'TRAFFIC_DETECTED',
        { trafficLevel }
      );

      // Emit WebSocket update
      await etaWebSocketService.emitETAUpdate(orderId, newETA);

      return { event, newETA };
    } catch (error) {
      console.error('Error handling traffic detected event:', error);
      throw error;
    }
  }

  /**
   * Handle rider nearing drop location event
   * @param {String} orderId - Order ID
   * @param {Number} distanceToDrop - Distance to drop in km
   */
  async handleRiderNearby(orderId, distanceToDrop) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      // Only trigger if within 500m
      if (distanceToDrop > 0.5) {
        return null;
      }

      // Create event
      const event = await OrderEvent.create({
        orderId: order._id,
        eventType: 'RIDER_NEARING_DROP',
        data: {
          distanceToDrop
        },
        timestamp: new Date()
      });

      // Recalculate ETA
      const newETA = await etaCalculationService.recalculateETA(
        orderId,
        'RIDER_NEARING_DROP',
        { distanceToDrop }
      );

      // Emit WebSocket updates
      await etaWebSocketService.emitETAUpdate(orderId, newETA);
      await etaWebSocketService.emitNearby(orderId, distanceToDrop);

      return { event, newETA };
    } catch (error) {
      console.error('Error handling rider nearby event:', error);
      throw error;
    }
  }
}

export default new ETAEventService();


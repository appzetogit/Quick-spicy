import googleMapsService from './googleMapsService.js';
import Order from '../models/Order.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Delivery from '../../delivery/models/Delivery.js';
import OrderEvent from '../models/OrderEvent.js';
import ETALog from '../models/ETALog.js';

/**
 * ETA Calculation Service
 * Implements Zomato/Swiggy-like ETA calculation with real-time updates
 */
class ETACalculationService {
  // Constants for ETA calculation
  static TRAFFIC_MULTIPLIERS = {
    low: 1.0,
    medium: 1.2,
    high: 1.4
  };

  static BUFFER_TIMES = {
    short: 4, // minutes for <5km
    long: 7   // minutes for >=5km
  };

  static RIDER_ASSIGNMENT_TIME = {
    min: 3, // minutes
    max: 5  // minutes
  };

  static ETA_RANGE = 3; // ±3 minutes for min/max ETA

  /**
   * Calculate initial ETA when order is created
   * @param {Object} orderData - Order data with restaurant, user location, etc.
   * @returns {Promise<Object>} - { minETA, maxETA, breakdown }
   */
  async calculateInitialETA(orderData) {
    const {
      restaurantId,
      restaurantLocation,
      userLocation,
      riderLocation = null // Optional: if rider is already assigned
    } = orderData;

    try {
      // 1. Get restaurant data
      const restaurant = await Restaurant.findOne({ restaurantId });
      if (!restaurant) {
        throw new Error('Restaurant not found');
      }

      // 2. Calculate restaurant preparation time
      const restaurantPrepTime = await this.getRestaurantPrepTime(restaurantId);
      
      // 3. Calculate restaurant load delay (pending orders)
      const restaurantLoadDelay = await this.getRestaurantLoadDelay(restaurantId);

      // 4. Calculate rider assignment time
      const riderAssignmentTime = riderLocation 
        ? 0 // Already assigned
        : this.getRiderAssignmentTime();

      // 5. Calculate travel times
      let travelTimeRiderToRestaurant = 0;
      let travelTimeRestaurantToUser = 0;
      let totalDistance = 0;
      let trafficLevel = 'low';

      if (riderLocation) {
        // Rider is assigned, calculate actual travel times
        const riderToRestaurant = await googleMapsService.getTravelTime(
          riderLocation,
          restaurantLocation
        );
        travelTimeRiderToRestaurant = riderToRestaurant.duration;
        trafficLevel = riderToRestaurant.trafficLevel;

        const restaurantToUser = await googleMapsService.getTravelTime(
          restaurantLocation,
          userLocation
        );
        travelTimeRestaurantToUser = restaurantToUser.duration;
        totalDistance = riderToRestaurant.distance + restaurantToUser.distance;
        
        // Update traffic level if restaurant-to-user has higher traffic
        if (restaurantToUser.trafficLevel === 'high' || 
            (restaurantToUser.trafficLevel === 'medium' && trafficLevel === 'low')) {
          trafficLevel = restaurantToUser.trafficLevel;
        }
      } else {
        // No rider assigned yet, estimate travel time
        const estimatedTravel = await googleMapsService.getTravelTime(
          restaurantLocation,
          userLocation
        );
        travelTimeRestaurantToUser = estimatedTravel.duration;
        totalDistance = estimatedTravel.distance;
        trafficLevel = estimatedTravel.trafficLevel;
        
        // Estimate rider to restaurant time (assume nearby rider)
        travelTimeRiderToRestaurant = Math.ceil(estimatedTravel.duration * 0.3); // 30% of total
      }

      // 6. Apply traffic multiplier
      const trafficMultiplier = ETACalculationService.TRAFFIC_MULTIPLIERS[trafficLevel] || 1.0;
      const adjustedTravelTime = Math.ceil(
        (travelTimeRiderToRestaurant + travelTimeRestaurantToUser) * trafficMultiplier
      );

      // 7. Calculate buffer time based on distance
      const bufferTime = totalDistance >= 5 
        ? ETACalculationService.BUFFER_TIMES.long
        : ETACalculationService.BUFFER_TIMES.short;

      // 8. Calculate total ETA
      const totalETA = 
        restaurantPrepTime +
        restaurantLoadDelay +
        riderAssignmentTime +
        adjustedTravelTime +
        bufferTime;

      // 9. Calculate min/max ETA range
      const minETA = Math.max(1, totalETA - ETACalculationService.ETA_RANGE);
      const maxETA = totalETA + ETACalculationService.ETA_RANGE;

      const breakdown = {
        restaurantPrepTime,
        restaurantLoadDelay,
        riderAssignmentTime,
        travelTimeRiderToRestaurant,
        travelTimeRestaurantToUser,
        trafficMultiplier,
        bufferTime,
        totalETA,
        totalDistance,
        trafficLevel
      };

      return {
        minETA,
        maxETA,
        breakdown
      };
    } catch (error) {
      console.error('❌ Error calculating initial ETA:', error);
      // Return default ETA on error
      return {
        minETA: 25,
        maxETA: 30,
        breakdown: {
          error: error.message
        }
      };
    }
  }

  /**
   * Recalculate ETA based on order events
   * @param {String} orderId - Order ID
   * @param {String} eventType - Type of event that triggered recalculation
   * @param {Object} eventData - Additional data from the event
   * @returns {Promise<Object>} - Updated ETA
   */
  async recalculateETA(orderId, eventType, eventData = {}) {
    try {
      const order = await Order.findById(orderId)
        .populate('deliveryPartnerId')
        .populate('restaurantId');

      if (!order) {
        throw new Error('Order not found');
      }

      // Get current ETA
      const currentETA = {
        min: order.eta?.min || order.estimatedDeliveryTime - 3,
        max: order.eta?.max || order.estimatedDeliveryTime + 3
      };

      // Calculate new ETA based on event
      let newETA;
      let reason;

      switch (eventType) {
        case 'RESTAURANT_ACCEPTED_LATE':
          // Restaurant accepted late, add delay
          const delayMinutes = eventData.delayMinutes || 0;
          newETA = {
            min: currentETA.min + delayMinutes,
            max: currentETA.max + delayMinutes
          };
          reason = 'RESTAURANT_DELAYED';
          break;

        case 'RIDER_ASSIGNED':
          // Rider assigned, recalculate with actual rider location
          newETA = await this.recalculateWithRider(order, eventData);
          reason = 'RIDER_ASSIGNED';
          break;

        case 'RIDER_ASSIGNED_LATE':
          // Rider assignment delayed
          const assignmentDelay = eventData.delayMinutes || 0;
          newETA = {
            min: currentETA.min + assignmentDelay,
            max: currentETA.max + assignmentDelay
          };
          reason = 'RIDER_ASSIGNMENT_DELAYED';
          break;

        case 'RIDER_REACHED_RESTAURANT':
          // Rider reached restaurant, update remaining time
          newETA = await this.recalculateAfterPickup(order);
          reason = 'RIDER_REACHED_RESTAURANT';
          break;

        case 'FOOD_NOT_READY':
          // Food not ready, add waiting time
          const waitingTime = eventData.waitingTime || 0;
          newETA = {
            min: currentETA.min + waitingTime,
            max: currentETA.max + waitingTime
          };
          reason = 'FOOD_NOT_READY';
          break;

        case 'RIDER_STARTED_DELIVERY':
          // Rider started delivery, recalculate remaining time
          newETA = await this.recalculateAfterPickup(order);
          reason = 'RIDER_STARTED_DELIVERY';
          break;

        case 'TRAFFIC_DETECTED':
          // Traffic detected, apply multiplier
          newETA = await this.recalculateWithTraffic(order, eventData);
          reason = 'TRAFFIC_UPDATE';
          break;

        case 'RIDER_NEARING_DROP':
          // Rider nearing drop location, update to remaining distance
          newETA = await this.recalculateNearingDrop(order, eventData);
          reason = 'RIDER_NEARING_DROP';
          break;

        default:
          // Default: recalculate from scratch
          newETA = await this.calculateInitialETA({
            restaurantId: order.restaurantId,
            restaurantLocation: await this.getRestaurantLocation(order.restaurantId),
            userLocation: {
              latitude: order.address.location.coordinates[1],
              longitude: order.address.location.coordinates[0]
            },
            riderLocation: order.deliveryPartnerId?.availability?.currentLocation 
              ? {
                  latitude: order.deliveryPartnerId.availability.currentLocation.coordinates[1],
                  longitude: order.deliveryPartnerId.availability.currentLocation.coordinates[0]
                }
              : null
          });
          reason = 'MANUAL_UPDATE';
      }

      // Update order with new ETA
      order.eta = {
        min: newETA.minETA || newETA.min,
        max: newETA.maxETA || newETA.max,
        lastUpdated: new Date()
      };
      order.estimatedDeliveryTime = Math.ceil((order.eta.min + order.eta.max) / 2);
      await order.save();

      // Log ETA change
      await ETALog.create({
        orderId: order._id,
        previousETA: currentETA,
        newETA: {
          min: order.eta.min,
          max: order.eta.max
        },
        reason,
        breakdown: newETA.breakdown || {},
        triggeredBy: {
          eventType
        }
      });

      return {
        minETA: order.eta.min,
        maxETA: order.eta.max,
        breakdown: newETA.breakdown || {}
      };
    } catch (error) {
      console.error('❌ Error recalculating ETA:', error);
      throw error;
    }
  }

  /**
   * Recalculate ETA with actual rider location
   */
  async recalculateWithRider(order, eventData) {
    const riderLocation = eventData.riderLocation || 
      (order.deliveryPartnerId?.availability?.currentLocation 
        ? {
            latitude: order.deliveryPartnerId.availability.currentLocation.coordinates[1],
            longitude: order.deliveryPartnerId.availability.currentLocation.coordinates[0]
          }
        : null);

    if (!riderLocation) {
      return await this.calculateInitialETA({
        restaurantId: order.restaurantId,
        restaurantLocation: await this.getRestaurantLocation(order.restaurantId),
        userLocation: {
          latitude: order.address.location.coordinates[1],
          longitude: order.address.location.coordinates[0]
        }
      });
    }

    const restaurantLocation = await this.getRestaurantLocation(order.restaurantId);
    const userLocation = {
      latitude: order.address.location.coordinates[1],
      longitude: order.address.location.coordinates[0]
    };

    return await this.calculateInitialETA({
      restaurantId: order.restaurantId,
      restaurantLocation,
      userLocation,
      riderLocation
    });
  }

  /**
   * Recalculate ETA after rider picks up food
   */
  async recalculateAfterPickup(order) {
    const restaurantLocation = await this.getRestaurantLocation(order.restaurantId);
    const userLocation = {
      latitude: order.address.location.coordinates[1],
      longitude: order.address.location.coordinates[0]
    };

    // Get rider's current location (should be at restaurant)
    const riderLocation = order.deliveryPartnerId?.availability?.currentLocation 
      ? {
          latitude: order.deliveryPartnerId.availability.currentLocation.coordinates[1],
          longitude: order.deliveryPartnerId.availability.currentLocation.coordinates[0]
        }
      : restaurantLocation; // Assume at restaurant

    // Calculate only restaurant to user time
    const travelTime = await googleMapsService.getTravelTime(
      restaurantLocation,
      userLocation
    );

    const bufferTime = travelTime.distance >= 5 
      ? ETACalculationService.BUFFER_TIMES.long
      : ETACalculationService.BUFFER_TIMES.short;

    const trafficMultiplier = ETACalculationService.TRAFFIC_MULTIPLIERS[travelTime.trafficLevel] || 1.0;
    const adjustedTravelTime = Math.ceil(travelTime.duration * trafficMultiplier);

    const totalETA = adjustedTravelTime + bufferTime;
    const minETA = Math.max(1, totalETA - ETACalculationService.ETA_RANGE);
    const maxETA = totalETA + ETACalculationService.ETA_RANGE;

    return {
      minETA,
      maxETA,
      breakdown: {
        travelTimeRestaurantToUser: adjustedTravelTime,
        bufferTime,
        trafficLevel: travelTime.trafficLevel,
        trafficMultiplier,
        totalETA
      }
    };
  }

  /**
   * Recalculate ETA with traffic update
   */
  async recalculateWithTraffic(order, eventData) {
    const trafficLevel = eventData.trafficLevel || 'medium';
    const trafficMultiplier = ETACalculationService.TRAFFIC_MULTIPLIERS[trafficLevel];

    // Get current breakdown and apply traffic multiplier
    const restaurantLocation = await this.getRestaurantLocation(order.restaurantId);
    const userLocation = {
      latitude: order.address.location.coordinates[1],
      longitude: order.address.location.coordinates[0]
    };

    const travelTime = await googleMapsService.getTravelTime(
      restaurantLocation,
      userLocation
    );

    const adjustedTravelTime = Math.ceil(travelTime.duration * trafficMultiplier);
    const bufferTime = travelTime.distance >= 5 
      ? ETACalculationService.BUFFER_TIMES.long
      : ETACalculationService.BUFFER_TIMES.short;

    const totalETA = adjustedTravelTime + bufferTime;
    const minETA = Math.max(1, totalETA - ETACalculationService.ETA_RANGE);
    const maxETA = totalETA + ETACalculationService.ETA_RANGE;

    return {
      minETA,
      maxETA,
      breakdown: {
        travelTimeRestaurantToUser: adjustedTravelTime,
        bufferTime,
        trafficLevel,
        trafficMultiplier,
        totalETA
      }
    };
  }

  /**
   * Recalculate ETA when rider is nearing drop location
   */
  async recalculateNearingDrop(order, eventData) {
    const distanceToDrop = eventData.distanceToDrop || 0.5; // km
    
    // Estimate remaining time based on distance
    // Assume average speed of 30 km/h in city
    const remainingTime = Math.ceil((distanceToDrop / 30) * 60); // minutes
    
    const minETA = Math.max(1, remainingTime - 1);
    const maxETA = remainingTime + 2;

    return {
      minETA,
      maxETA,
      breakdown: {
        distanceToDrop,
        remainingTime,
        totalETA: remainingTime
      }
    };
  }

  /**
   * Get restaurant preparation time
   */
  async getRestaurantPrepTime(restaurantId) {
    const restaurant = await Restaurant.findOne({ restaurantId });
    if (!restaurant) return 15; // Default 15 minutes

    // Parse estimatedDeliveryTime string like "25-30 mins" or use default
    const prepTimeStr = restaurant.estimatedDeliveryTime || "25-30 mins";
    const match = prepTimeStr.match(/(\d+)/);
    return match ? parseInt(match[1]) : 25;
  }

  /**
   * Get restaurant load delay based on pending orders
   */
  async getRestaurantLoadDelay(restaurantId) {
    // Count pending/preparing orders
    const pendingOrders = await Order.countDocuments({
      restaurantId,
      status: { $in: ['confirmed', 'preparing'] }
    });

    // Average prep time per order (assume 15 minutes)
    const avgPrepPerOrder = 15;
    
    // Calculate delay: pending orders * avg prep time / number of parallel orders
    // Assume restaurant can prepare 2-3 orders in parallel
    const parallelCapacity = 2.5;
    const loadDelay = Math.ceil((pendingOrders / parallelCapacity) * avgPrepPerOrder);

    return Math.min(loadDelay, 30); // Cap at 30 minutes
  }

  /**
   * Get rider assignment time
   */
  getRiderAssignmentTime() {
    const { min, max } = ETACalculationService.RIDER_ASSIGNMENT_TIME;
    return Math.ceil((min + max) / 2); // Average
  }

  /**
   * Get restaurant location
   */
  async getRestaurantLocation(restaurantId) {
    const restaurant = await Restaurant.findOne({ restaurantId });
    if (!restaurant || !restaurant.location) {
      throw new Error('Restaurant location not found');
    }

    return {
      latitude: restaurant.location.latitude,
      longitude: restaurant.location.longitude
    };
  }

  /**
   * Get live ETA for an order
   * @param {String} orderId - Order ID
   * @returns {Promise<Object>} - Current ETA
   */
  async getLiveETA(orderId) {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // If order is delivered, return 0
    if (order.status === 'delivered') {
      return {
        minETA: 0,
        maxETA: 0,
        status: 'delivered'
      };
    }

    // Calculate remaining time based on current status
    const now = new Date();
    const createdAt = order.createdAt;
    const elapsedMinutes = Math.floor((now - createdAt) / 1000 / 60);

    const currentETA = order.eta || {
      min: order.estimatedDeliveryTime - 3,
      max: order.estimatedDeliveryTime + 3
    };

    // Calculate remaining time
    const remainingMin = Math.max(0, currentETA.min - elapsedMinutes);
    const remainingMax = Math.max(0, currentETA.max - elapsedMinutes);

    return {
      minETA: remainingMin,
      maxETA: remainingMax,
      elapsedMinutes,
      status: order.status,
      formatted: `${remainingMin}-${remainingMax} mins`
    };
  }
}

export default new ETACalculationService();


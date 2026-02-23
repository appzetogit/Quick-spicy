import mongoose from 'mongoose';

/**
 * ETALog Model
 * Tracks ETA calculation history for analytics and debugging
 */
const etaLogSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  previousETA: {
    min: {
      type: Number, // in minutes
      required: true
    },
    max: {
      type: Number, // in minutes
      required: true
    }
  },
  newETA: {
    min: {
      type: Number, // in minutes
      required: true
    },
    max: {
      type: Number, // in minutes
      required: true
    }
  },
  reason: {
    type: String,
    required: true,
    enum: [
      'ORDER_CREATED',
      'RESTAURANT_ACCEPTED',
      'RESTAURANT_DELAYED',
      'RIDER_ASSIGNED',
      'RIDER_ASSIGNMENT_DELAYED',
      'RIDER_REACHED_RESTAURANT',
      'FOOD_NOT_READY',
      'FOOD_READY',
      'RIDER_STARTED_DELIVERY',
      'TRAFFIC_UPDATE',
      'RIDER_NEARING_DROP',
      'MANUAL_UPDATE'
    ]
  },
  // Breakdown of ETA components for transparency
  breakdown: {
    restaurantPrepTime: Number,
    restaurantLoadDelay: Number,
    riderAssignmentTime: Number,
    travelTimeRiderToRestaurant: Number,
    travelTimeRestaurantToUser: Number,
    trafficMultiplier: Number,
    bufferTime: Number,
    totalETA: Number
  },
  // Event that triggered this ETA update
  triggeredBy: {
    eventType: String,
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrderEvent'
    }
  },
  calculatedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes
etaLogSchema.index({ orderId: 1, calculatedAt: -1 });
etaLogSchema.index({ reason: 1, calculatedAt: -1 });

export default mongoose.model('ETALog', etaLogSchema);


import mongoose from 'mongoose';

/**
 * OrderEvent Model
 * Tracks all events that affect ETA calculation
 */
const orderEventSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  eventType: {
    type: String,
    enum: [
      'ORDER_CREATED',
      'RESTAURANT_ACCEPTED',
      'RESTAURANT_ACCEPTED_LATE', // Restaurant accepted after delay
      'RIDER_ASSIGNED',
      'RIDER_ASSIGNED_EARLY', // Rider assigned quickly
      'RIDER_ASSIGNED_LATE', // Rider assignment delayed
      'RIDER_REACHED_RESTAURANT',
      'FOOD_NOT_READY', // Rider waiting at restaurant
      'FOOD_READY',
      'RIDER_STARTED_DELIVERY',
      'RIDER_NEARING_DROP', // Within 500m of drop location
      'TRAFFIC_DETECTED', // High traffic detected
      'DELIVERY_COMPLETED',
      'ETA_UPDATED' // Manual ETA update
    ],
    required: true,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Store relevant data for ETA recalculation
  data: {
    // For RESTAURANT_ACCEPTED_LATE
    delayMinutes: Number,
    
    // For RIDER_ASSIGNED
    riderId: mongoose.Schema.Types.ObjectId,
    riderLocation: {
      latitude: Number,
      longitude: Number
    },
    
    // For RIDER_REACHED_RESTAURANT
    reachedAt: Date,
    
    // For FOOD_NOT_READY
    waitingTime: Number, // minutes
    
    // For TRAFFIC_DETECTED
    trafficLevel: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    trafficMultiplier: Number,
    
    // For RIDER_NEARING_DROP
    distanceToDrop: Number, // in km
    
    // For ETA_UPDATED
    previousETA: {
      min: Number,
      max: Number
    },
    newETA: {
      min: Number,
      max: Number
    },
    reason: String
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
orderEventSchema.index({ orderId: 1, timestamp: -1 });
orderEventSchema.index({ eventType: 1, timestamp: -1 });

export default mongoose.model('OrderEvent', orderEventSchema);


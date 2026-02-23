import mongoose from 'mongoose';

const orderSettlementSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true,
    index: true
  },
  orderNumber: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  restaurantName: {
    type: String,
    required: true
  },
  deliveryPartnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Delivery',
    sparse: true,
    index: true
  },
  
  // User Payment Breakdown
  userPayment: {
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    platformFee: { type: Number, default: 0, min: 0 },
    gst: { type: Number, default: 0, min: 0 },
    packagingFee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 }
  },
  
  // Restaurant Earnings
  restaurantEarning: {
    foodPrice: { type: Number, required: true, min: 0 },
    commission: { type: Number, required: true, min: 0 },
    commissionPercentage: { type: Number, default: 0 },
    netEarning: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'credited', 'cancelled'],
      default: 'pending'
    },
    creditedAt: Date
  },
  
  // Delivery Partner Earnings
  deliveryPartnerEarning: {
    basePayout: { type: Number, default: 0, min: 0 },
    distance: { type: Number, default: 0, min: 0 }, // in km
    commissionPerKm: { type: Number, default: 0, min: 0 },
    distanceCommission: { type: Number, default: 0, min: 0 },
    surgeMultiplier: { type: Number, default: 1, min: 1 },
    surgeAmount: { type: Number, default: 0, min: 0 },
    totalEarning: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'credited', 'cancelled'],
      default: 'pending'
    },
    creditedAt: Date
  },
  
  // Admin/Platform Earnings
  adminEarning: {
    commission: { type: Number, required: true, min: 0 },
    platformFee: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    gst: { type: Number, required: true, min: 0 },
    deliveryMargin: { type: Number, default: 0, min: 0 }, // deliveryFee - deliveryPartnerEarning
    totalEarning: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'credited', 'cancelled'],
      default: 'pending'
    },
    creditedAt: Date
  },
  
  // Escrow Status
  escrowStatus: {
    type: String,
    enum: ['pending', 'held', 'released', 'refunded'],
    default: 'pending'
  },
  escrowAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  escrowHeldAt: Date,
  escrowReleasedAt: Date,
  
  // Settlement Status
  settlementStatus: {
    type: String,
    enum: ['pending', 'partial', 'completed', 'cancelled'],
    default: 'pending'
  },
  restaurantSettled: {
    type: Boolean,
    default: false
  },
  deliveryPartnerSettled: {
    type: Boolean,
    default: false
  },
  adminSettled: {
    type: Boolean,
    default: false
  },
  
  // Cancellation Details
  cancellationDetails: {
    cancelled: { type: Boolean, default: false },
    cancelledAt: Date,
    cancellationStage: {
      type: String,
      enum: ['pre_accept', 'post_accept_pre_cook', 'post_cook', 'post_pickup'],
      sparse: true
    },
    refundAmount: { type: Number, default: 0, min: 0 },
    restaurantCompensation: { type: Number, default: 0, min: 0 },
    refundStatus: {
      type: String,
      enum: ['pending', 'requested', 'initiated', 'processed', 'failed'],
      sparse: true
    },
    razorpayRefundId: { type: String, sparse: true },
    refundInitiatedAt: Date,
    refundInitiatedBy: { type: mongoose.Schema.Types.ObjectId, sparse: true },
    refundProcessedAt: Date,
    refundFailureReason: { type: String, sparse: true }
  },
  
  // Audit Trail
  calculationSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    comment: 'Snapshot of calculation at time of order'
  },
  
  // Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
orderSettlementSchema.index({ restaurantId: 1, settlementStatus: 1 });
orderSettlementSchema.index({ deliveryPartnerId: 1, settlementStatus: 1 });
orderSettlementSchema.index({ settlementStatus: 1, createdAt: -1 });
orderSettlementSchema.index({ escrowStatus: 1 });
orderSettlementSchema.index({ 'restaurantEarning.status': 1 });
orderSettlementSchema.index({ 'deliveryPartnerEarning.status': 1 });
orderSettlementSchema.index({ createdAt: -1 });

// Static method to find or create settlement for an order
orderSettlementSchema.statics.findOrCreateByOrderId = async function(orderId) {
  let settlement = await this.findOne({ orderId });
  
  if (!settlement) {
    const order = await mongoose.model('Order').findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }
    
    settlement = await this.create({
      orderId,
      orderNumber: order.orderId,
      userId: order.userId,
      restaurantId: order.restaurantId,
      restaurantName: order.restaurantName
    });
  }
  
  return settlement;
};

const OrderSettlement = mongoose.model('OrderSettlement', orderSettlementSchema);

export default OrderSettlement;


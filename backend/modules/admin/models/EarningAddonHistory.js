import mongoose from 'mongoose';

const earningAddonHistorySchema = new mongoose.Schema(
  {
    // Reference to the earning addon offer
    earningAddonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EarningAddon',
      required: true,
      index: true
    },
    // Delivery partner who completed the offer
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      required: true,
      index: true
    },
    // Offer details at time of completion (snapshot)
    offerSnapshot: {
      title: String,
      requiredOrders: Number,
      earningAmount: Number,
      startDate: Date,
      endDate: Date
    },
    // Completion details
    ordersCompleted: {
      type: Number,
      required: true,
      min: 0
    },
    ordersRequired: {
      type: Number,
      required: true,
      min: 1
    },
    earningAmount: {
      type: Number,
      required: true,
      min: 0
    },
    // Completion date
    completedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    // Status of the earning
    status: {
      type: String,
      enum: ['pending', 'credited', 'failed', 'cancelled'],
      default: 'pending'
    },
    // Transaction reference (if credited to wallet)
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryWallet.transactions'
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryWallet'
    },
    // Order IDs that contributed to this completion
    contributingOrders: [{
      type: String, // Order IDs
    }],
    // Additional metadata
    metadata: {
      zone: String,
      deliveryRating: Number,
      completionTime: Number, // Time taken to complete in days
      type: mongoose.Schema.Types.Mixed
    },
    // Processed by
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    processedAt: Date,
    // Notes
    notes: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes for efficient queries
earningAddonHistorySchema.index({ deliveryPartnerId: 1, completedAt: -1 });
earningAddonHistorySchema.index({ earningAddonId: 1, status: 1 });
earningAddonHistorySchema.index({ status: 1, completedAt: -1 });
earningAddonHistorySchema.index({ completedAt: -1 });

// Compound index for common queries
earningAddonHistorySchema.index({ deliveryPartnerId: 1, earningAddonId: 1 });

// Virtual to populate delivery partner details
earningAddonHistorySchema.virtual('deliveryPartner', {
  ref: 'Delivery',
  localField: 'deliveryPartnerId',
  foreignField: '_id',
  justOne: true
});

// Virtual to populate earning addon details
earningAddonHistorySchema.virtual('earningAddon', {
  ref: 'EarningAddon',
  localField: 'earningAddonId',
  foreignField: '_id',
  justOne: true
});

// Method to mark as credited
earningAddonHistorySchema.methods.markAsCredited = function(transactionId, walletId, processedBy) {
  this.status = 'credited';
  this.transactionId = transactionId;
  this.walletId = walletId;
  this.processedBy = processedBy;
  this.processedAt = new Date();
  return this.save();
};

// Static method to get history for a delivery partner
earningAddonHistorySchema.statics.getHistoryByDeliveryPartner = function(deliveryPartnerId, options = {}) {
  const { page = 1, limit = 50, status, earningAddonId } = options;
  const query = { deliveryPartnerId };
  
  if (status) query.status = status;
  if (earningAddonId) query.earningAddonId = earningAddonId;
  
  return this.find(query)
    .populate('earningAddonId', 'title requiredOrders earningAmount')
    .populate('deliveryPartnerId', 'name deliveryId phone')
    .sort({ completedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static method to get statistics
earningAddonHistorySchema.statics.getStatistics = function(earningAddonId = null) {
  const matchStage = earningAddonId ? { earningAddonId: new mongoose.Types.ObjectId(earningAddonId) } : {};
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalEarnings: { $sum: '$earningAmount' }
      }
    }
  ]);
};

const EarningAddonHistory = mongoose.model('EarningAddonHistory', earningAddonHistorySchema);

export default EarningAddonHistory;


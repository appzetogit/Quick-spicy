import mongoose from 'mongoose';

const earningAddonSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    // Offer conditions
    requiredOrders: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Required orders must be an integer'
      }
    },
    earningAmount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value) => value > 0,
        message: 'Earning amount must be greater than 0'
      }
    },
    // Date validation
    startDate: {
      type: Date,
      required: true,
      validate: {
        validator: function(value) {
          return value >= new Date(new Date().setHours(0, 0, 0, 0));
        },
        message: 'Start date must be today or in the future'
      }
    },
    endDate: {
      type: Date,
      required: true,
      validate: {
        validator: function(value) {
          return value > this.startDate;
        },
        message: 'End date must be after start date'
      }
    },
    // Status
    status: {
      type: String,
      enum: ['active', 'inactive', 'expired', 'completed'],
      default: 'active'
    },
    // Additional settings
    maxRedemptions: {
      type: Number,
      default: null, // null means unlimited
      min: 1
    },
    currentRedemptions: {
      type: Number,
      default: 0,
      min: 0
    },
    // Zone restrictions (optional)
    applicableZones: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone'
    }],
    // Eligibility criteria
    minDeliveryRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    // Created by admin
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    },
    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Indexes
earningAddonSchema.index({ status: 1, startDate: 1, endDate: 1 });
earningAddonSchema.index({ createdAt: -1 });
earningAddonSchema.index({ createdBy: 1 });

// Virtual for checking if offer is currently valid
earningAddonSchema.virtual('isValid').get(function() {
  const now = new Date();
  return (
    this.status === 'active' &&
    now >= this.startDate &&
    now <= this.endDate &&
    (this.maxRedemptions === null || this.currentRedemptions < this.maxRedemptions)
  );
});

// Method to check if offer can be redeemed
earningAddonSchema.methods.canBeRedeemed = function() {
  const now = new Date();
  if (this.status !== 'active') return false;
  if (now < this.startDate || now > this.endDate) return false;
  if (this.maxRedemptions !== null && this.currentRedemptions >= this.maxRedemptions) return false;
  return true;
};

// Pre-save hook to update status based on dates
earningAddonSchema.pre('save', function(next) {
  const now = new Date();
  if (this.status === 'active' && now > this.endDate) {
    this.status = 'expired';
  }
  next();
});

// Static method to get active offers
earningAddonSchema.statics.getActiveOffers = function(date = new Date()) {
  return this.find({
    status: 'active',
    startDate: { $lte: date },
    endDate: { $gte: date },
    $or: [
      { maxRedemptions: null },
      { $expr: { $lt: ['$currentRedemptions', '$maxRedemptions'] } }
    ]
  });
};

const EarningAddon = mongoose.model('EarningAddon', earningAddonSchema);

export default EarningAddon;


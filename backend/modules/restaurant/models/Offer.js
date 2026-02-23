import mongoose from 'mongoose';

const offerItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  itemName: { type: String, required: true },
  originalPrice: { type: Number, required: true },
  discountPercentage: { type: Number, required: true, min: 0, max: 100 },
  discountedPrice: { type: Number, required: true },
  couponCode: { type: String, required: true },
  image: { type: String, default: '' },
  isVeg: { type: Boolean, default: false },
}, { _id: false });

const offerSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    goalId: {
      type: String,
      required: true,
      enum: ['grow-customers', 'increase-value', 'mealtime-orders', 'delight-customers'],
    },
    discountType: {
      type: String,
      required: true,
      enum: ['percentage', 'flat-price', 'bogo', 'freebies'],
    },
    // For percentage discounts on specific items
    items: {
      type: [offerItemSchema],
      default: [],
    },
    // Offer settings
    customerGroup: {
      type: String,
      enum: ['all', 'new'],
      default: 'all',
    },
    offerPreference: {
      type: String,
      enum: ['all', 'sensitive', 'premium'],
      default: 'all',
    },
    offerDays: {
      type: String,
      enum: ['all', 'mon-thu', 'fri-sun'],
      default: 'all',
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    targetMealtime: {
      type: String,
      enum: ['all', 'breakfast', 'lunch', 'dinner', 'snacks'],
      default: 'all',
    },
    minOrderValue: {
      type: Number,
      default: 0,
    },
    maxLimit: {
      type: Number,
      default: null,
    },
    // Status
    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'expired', 'cancelled'],
      default: 'draft',
    },
    // Additional fields for different discount types
    discountCards: {
      type: Array,
      default: [],
    },
    priceCards: {
      type: Array,
      default: [],
    },
    discountConstruct: {
      type: String,
      default: '',
    },
    freebieItems: {
      type: Array,
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
offerSchema.index({ restaurant: 1, status: 1 });
offerSchema.index({ restaurant: 1, goalId: 1 });
offerSchema.index({ status: 1, startDate: 1, endDate: 1 });

export default mongoose.model('Offer', offerSchema);


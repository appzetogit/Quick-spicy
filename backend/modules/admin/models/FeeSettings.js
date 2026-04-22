import mongoose from 'mongoose';

const feeSettingsSchema = new mongoose.Schema(
  {
    deliveryFee: {
      type: Number,
      default: 25,
      min: 0,
      comment: 'Fixed delivery fee for the first 2.5 KM'
    },
    deliveryBaseDistanceKm: {
      type: Number,
      default: 2.5,
      min: 0,
      comment: 'Distance covered by the fixed delivery fee'
    },
    deliveryFeePerKm: {
      type: Number,
      default: 6,
      min: 0,
      comment: 'Additional delivery fee charged per KM beyond the base distance'
    },
    freeDeliveryThreshold: {
      type: Number,
      default: 149,
      min: 0,
      comment: 'Legacy field retained for backward compatibility'
    },
    platformFee: {
      type: Number,
      required: [true, 'Platform fee is required'],
      default: 5,
      min: 0,
    },
    gstRate: {
      type: Number,
      required: [true, 'GST rate is required'],
      default: 5,
      min: 0,
      max: 100,
      comment: 'GST rate in percentage (e.g., 5 for 5%)'
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
  },
  {
    timestamps: true,
  }
);

feeSettingsSchema.index({ isActive: 1 });
feeSettingsSchema.index({ createdAt: -1 });

const FeeSettings = mongoose.model('FeeSettings', feeSettingsSchema);

export default FeeSettings;

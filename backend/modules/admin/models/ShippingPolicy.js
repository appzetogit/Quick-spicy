import mongoose from 'mongoose';

const shippingPolicySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: 'Shipping Policy',
      trim: true
    },
    content: {
      type: String,
      required: true,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Indexes
shippingPolicySchema.index({ isActive: 1 });

export default mongoose.model('ShippingPolicy', shippingPolicySchema);


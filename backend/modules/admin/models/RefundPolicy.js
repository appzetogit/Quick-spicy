import mongoose from 'mongoose';

const refundPolicySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: 'Refund Policy',
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
refundPolicySchema.index({ isActive: 1 });

export default mongoose.model('RefundPolicy', refundPolicySchema);


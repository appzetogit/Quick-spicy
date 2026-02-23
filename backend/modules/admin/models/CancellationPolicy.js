import mongoose from 'mongoose';

const cancellationPolicySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: 'Cancellation Policy',
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
cancellationPolicySchema.index({ isActive: 1 });

export default mongoose.model('CancellationPolicy', cancellationPolicySchema);


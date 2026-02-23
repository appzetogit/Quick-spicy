import mongoose from 'mongoose';

const privacyPolicySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: 'Privacy Policy',
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
privacyPolicySchema.index({ isActive: 1 });

export default mongoose.model('PrivacyPolicy', privacyPolicySchema);


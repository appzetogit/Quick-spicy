import mongoose from 'mongoose';

const termsAndConditionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: 'Terms and Conditions',
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
termsAndConditionSchema.index({ isActive: 1 });

export default mongoose.model('TermsAndCondition', termsAndConditionSchema);


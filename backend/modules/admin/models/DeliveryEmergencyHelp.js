import mongoose from 'mongoose';

const deliveryEmergencyHelpSchema = new mongoose.Schema(
  {
    medicalEmergency: {
      type: String,
      default: '',
      trim: true
    },
    accidentHelpline: {
      type: String,
      default: '',
      trim: true
    },
    contactPolice: {
      type: String,
      default: '',
      trim: true
    },
    insurance: {
      type: String,
      default: '',
      trim: true
    },
    // Created by admin
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    },
    // Updated by admin
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    // Status to enable/disable
    status: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
deliveryEmergencyHelpSchema.index({ status: 1 });
deliveryEmergencyHelpSchema.index({ createdAt: -1 });

// Static method to get active emergency help numbers
deliveryEmergencyHelpSchema.statics.getActive = async function() {
  const emergencyHelp = await this.findOne({ status: true })
    .sort({ updatedAt: -1 })
    .lean();
  
  return emergencyHelp || {
    medicalEmergency: '',
    accidentHelpline: '',
    contactPolice: '',
    insurance: ''
  };
};

const DeliveryEmergencyHelp = mongoose.model('DeliveryEmergencyHelp', deliveryEmergencyHelpSchema);

export default DeliveryEmergencyHelp;


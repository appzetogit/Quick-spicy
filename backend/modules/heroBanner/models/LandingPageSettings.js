import mongoose from 'mongoose';

const landingPageSettingsSchema = new mongoose.Schema({
  exploreMoreHeading: {
    type: String,
    default: 'Explore More',
    trim: true
  },
  homePopup: {
    enabled: {
      type: Boolean,
      default: false,
    },
    message: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
  },
  recommendedRestaurants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
  }],
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
landingPageSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = new this({
      exploreMoreHeading: 'Explore More',
      homePopup: {
        enabled: false,
        message: '',
      },
      recommendedRestaurants: [],
    });
    await settings.save();
  }
  return settings;
};

export default mongoose.model('LandingPageSettings', landingPageSettingsSchema);


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
    imageUrl: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    cloudinaryPublicId: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
  },
  // Platform-wide fallback, used for zones that have no list of their own.
  recommendedRestaurants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
  }],
  // Per-zone recommendations. A customer browsing Markapur should be recommended Markapur
  // restaurants; a single global list meant most customers saw places that do not deliver
  // to them. Kept as its own list per zone rather than a flag on the global one so an admin
  // can curate each area independently.
  recommendedRestaurantsByZone: [{
    zone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone',
      required: true,
    },
    restaurants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
    }],
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
        imageUrl: '',
        cloudinaryPublicId: '',
      },
      recommendedRestaurants: [],
    });
    await settings.save();
  }
  return settings;
};

export default mongoose.model('LandingPageSettings', landingPageSettingsSchema);


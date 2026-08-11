import mongoose from 'mongoose';

const heroBannerSchema = new mongoose.Schema({
  imageUrl: {
    type: String,
    required: true,
    trim: true
  },
  cloudinaryPublicId: {
    type: String,
    required: true,
    trim: true
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Optional branch restriction, matching the offer banners. Empty runs the banner
  // everywhere, which stays the common case; set it when a promotion only applies to one
  // branch, so customers are not shown something they cannot order.
  zone: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Zone',
    default: null
  },
  linkedRestaurants: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant'
    }],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for ordering
heroBannerSchema.index({ order: 1, isActive: 1 });
heroBannerSchema.index({ zone: 1, isActive: 1 });

export default mongoose.model('HeroBanner', heroBannerSchema);


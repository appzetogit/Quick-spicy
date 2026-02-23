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

export default mongoose.model('HeroBanner', heroBannerSchema);


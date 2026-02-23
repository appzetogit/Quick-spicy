import mongoose from 'mongoose';

const gourmetRestaurantSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    unique: true,
    index: true
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
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

// Indexes for faster queries
gourmetRestaurantSchema.index({ order: 1, isActive: 1 });
gourmetRestaurantSchema.index({ restaurant: 1, isActive: 1 });

export default mongoose.model('GourmetRestaurant', gourmetRestaurantSchema);


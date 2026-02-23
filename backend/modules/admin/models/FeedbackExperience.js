import mongoose from 'mongoose';

const feedbackExperienceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      default: null
    },
    userName: {
      type: String,
      required: true,
      trim: true
    },
    userEmail: {
      type: String,
      trim: true
    },
    userPhone: {
      type: String,
      trim: true
    },
    rating: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be an integer between 0 and 10'
      }
    },
    experience: {
      type: String,
      enum: ['very_bad', 'bad', 'below_average', 'average', 'above_average', 'good', 'very_good'],
      default: null
    },
    module: {
      type: String,
      enum: ['user', 'restaurant', 'delivery'],
      default: 'user'
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Calculate experience based on rating
feedbackExperienceSchema.pre('save', function(next) {
  if (this.rating !== undefined && !this.experience) {
    if (this.rating <= 2) {
      this.experience = 'very_bad';
    } else if (this.rating <= 3) {
      this.experience = 'bad';
    } else if (this.rating <= 4) {
      this.experience = 'below_average';
    } else if (this.rating <= 5) {
      this.experience = 'average';
    } else if (this.rating <= 6) {
      this.experience = 'above_average';
    } else if (this.rating <= 8) {
      this.experience = 'good';
    } else {
      this.experience = 'very_good';
    }
  }
  next();
});

// Indexes
feedbackExperienceSchema.index({ userId: 1 });
feedbackExperienceSchema.index({ restaurantId: 1 });
feedbackExperienceSchema.index({ rating: 1 });
feedbackExperienceSchema.index({ experience: 1 });
feedbackExperienceSchema.index({ module: 1 });
feedbackExperienceSchema.index({ createdAt: -1 });

export default mongoose.model('FeedbackExperience', feedbackExperienceSchema);


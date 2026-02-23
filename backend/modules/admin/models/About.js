import mongoose from 'mongoose';

const featureSchema = new mongoose.Schema({
  icon: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  color: {
    type: String,
    default: 'text-gray-600'
  },
  bgColor: {
    type: String,
    default: 'bg-gray-100'
  },
  order: {
    type: Number,
    default: 0
  }
}, { _id: true });

const statSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    trim: true
  },
  value: {
    type: String,
    required: true,
    trim: true
  },
  icon: {
    type: String,
    required: true
  },
  order: {
    type: Number,
    default: 0
  }
}, { _id: true });

const aboutSchema = new mongoose.Schema(
  {
    appName: {
      type: String,
      required: true,
      default: 'Appzeto Food',
      trim: true
    },
    version: {
      type: String,
      required: true,
      default: '1.0.0',
      trim: true
    },
    description: {
      type: String,
      required: true,
      default: 'Your trusted food delivery partner, bringing delicious meals right to your doorstep. Experience the convenience of ordering from your favorite restaurants with fast, reliable delivery.',
      trim: true
    },
    logo: {
      type: String,
      default: ''
    },
    features: {
      type: [featureSchema],
      default: []
    },
    stats: {
      type: [statSchema],
      default: []
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
aboutSchema.index({ isActive: 1 });

export default mongoose.model('About', aboutSchema);


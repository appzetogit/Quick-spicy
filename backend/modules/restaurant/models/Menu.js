import mongoose from 'mongoose';

const variationSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, default: 0 },
  stock: { type: mongoose.Schema.Types.Mixed, default: 'Unlimited' }, // Can be number or "Unlimited"
}, { _id: false });

const menuItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  nameArabic: { type: String, default: '' },
  image: { type: String, default: '' },
  category: { type: String, default: 'Varieties' },
  rating: { type: Number, default: 0.0 },
  reviews: { type: Number, default: 0 },
  price: { type: Number, required: true },
  stock: { type: mongoose.Schema.Types.Mixed, default: 'Unlimited' },
  discount: { type: mongoose.Schema.Types.Mixed, default: null }, // Can be number, string, or null
  originalPrice: { type: Number, default: null },
  foodType: { type: String, enum: ['Veg', 'Non-Veg'], default: 'Non-Veg' },
  availabilityTimeStart: { type: String, default: '12:01 AM' },
  availabilityTimeEnd: { type: String, default: '11:57 PM' },
  description: { type: String, default: '' },
  discountType: { type: String, enum: ['Percent', 'Fixed'], default: 'Percent' },
  discountAmount: { type: Number, default: 0.0 },
  isAvailable: { type: Boolean, default: true },
  isRecommended: { type: Boolean, default: false },
  variations: { type: [variationSchema], default: [] },
  tags: { type: [String], default: [] },
  nutrition: { type: [String], default: [] },
  allergies: { type: [String], default: [] },
  photoCount: { type: Number, default: 1 },
  // Additional fields for item details
  subCategory: { type: String, default: '' },
  servesInfo: { type: String, default: '' },
  itemSize: { type: String, default: '' },
  itemSizeQuantity: { type: String, default: '' },
  itemSizeUnit: { type: String, default: 'piece' },
  gst: { type: Number, default: 0 },
  images: { type: [String], default: [] }, // Multiple images support
  preparationTime: { type: String, default: '' }, // Preparation time in minutes (e.g., "15-20 min")
  approvalStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  rejectionReason: { type: String, default: '' },
  requestedAt: { type: Date, default: Date.now },
  approvedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  rejectedAt: { type: Date },
}, { _id: false });

const subsectionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  items: { type: [menuItemSchema], default: [] },
}, { _id: false });

const menuSectionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  items: { type: [menuItemSchema], default: [] },
  subsections: { type: [subsectionSchema], default: [] },
  isEnabled: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, { _id: false });

const addonSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true },
  image: { type: String, default: '' },
  images: { type: [String], default: [] }, // Multiple images support
  isAvailable: { type: Boolean, default: true },
  approvalStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  rejectionReason: { type: String, default: '' },
  requestedAt: { type: Date, default: Date.now },
  approvedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  rejectedAt: { type: Date },
}, { _id: false });

const menuSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    unique: true,
    index: true,
  },
  sections: { type: [menuSectionSchema], default: [] },
  addons: { type: [addonSchema], default: [] }, // Add-ons array
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

// Index for faster queries
menuSchema.index({ restaurant: 1, isActive: 1 });

export default mongoose.model('Menu', menuSchema);


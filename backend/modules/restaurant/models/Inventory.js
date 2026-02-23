import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  inStock: { type: Boolean, default: true },
  isVeg: { type: Boolean, default: true },
  stockQuantity: { type: mongoose.Schema.Types.Mixed, default: 'Unlimited' }, // Can be number or "Unlimited"
  unit: { type: String, default: 'piece' }, // piece, kg, liter, etc.
  expiryDate: { type: Date, default: null },
  lastRestocked: { type: Date, default: null },
}, { _id: false });

const inventoryCategorySchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  itemCount: { type: Number, default: 0 },
  inStock: { type: Boolean, default: true },
  items: { type: [inventoryItemSchema], default: [] },
  order: { type: Number, default: 0 },
}, { _id: false });

const inventorySchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    unique: true,
    index: true,
  },
  categories: { type: [inventoryCategorySchema], default: [] },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

// Index for faster queries
inventorySchema.index({ restaurant: 1, isActive: 1 });

export default mongoose.model('Inventory', inventorySchema);


import mongoose from 'mongoose';

const restaurantCategorySchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: [true, 'Restaurant is required'],
    },
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      maxlength: [100, 'Category name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    icon: {
      type: String,
      default: '',
    },
    color: {
      type: String,
      default: '#000000',
    },
    itemCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for restaurant and order
restaurantCategorySchema.index({ restaurant: 1, order: 1 });
restaurantCategorySchema.index({ restaurant: 1, isActive: 1 });
restaurantCategorySchema.index({ restaurant: 1, name: 1 }, { unique: true });

// Pre-save middleware to update item count
restaurantCategorySchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('name')) {
    // Check for duplicate category name within same restaurant
    const existingCategory = await mongoose.model('RestaurantCategory').findOne({
      restaurant: this.restaurant,
      name: this.name,
      _id: { $ne: this._id },
    });
    
    if (existingCategory) {
      const error = new Error('Category with this name already exists for this restaurant');
      error.name = 'ValidationError';
      return next(error);
    }
  }
  next();
});

// Method to update item count
restaurantCategorySchema.methods.updateItemCount = async function() {
  const Menu = mongoose.model('Menu');
  const menu = await Menu.findOne({ restaurant: this.restaurant });
  
  if (menu && menu.sections) {
    let count = 0;
    menu.sections.forEach(section => {
      if (section.name === this.name) {
        count += (section.items?.length || 0);
        if (section.subsections) {
          section.subsections.forEach(subsection => {
            count += (subsection.items?.length || 0);
          });
        }
      }
    });
    this.itemCount = count;
    await this.save();
  }
};

const RestaurantCategory = mongoose.model('RestaurantCategory', restaurantCategorySchema);

export default RestaurantCategory;


import mongoose from 'mongoose';

const staffManagementSchema = new mongoose.Schema(
  {
    // Reference to the restaurant
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    // Staff/Manager information
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: function() {
        return !this.email;
      },
      trim: true,
      sparse: true,
    },
    email: {
      type: String,
      required: function() {
        return !this.phone;
      },
      lowercase: true,
      trim: true,
      sparse: true,
    },
    role: {
      type: String,
      enum: ['manager', 'staff'],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'removed'],
      default: 'active',
    },
    // Additional fields
    addedAt: {
      type: Date,
      default: Date.now,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
    },
    // Optional: Profile image
    profileImage: {
      url: String,
      publicId: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
staffManagementSchema.index({ restaurantId: 1, role: 1 });
staffManagementSchema.index({ restaurantId: 1, status: 1 });
staffManagementSchema.index({ phone: 1, email: 1 });

// Compound index to ensure unique phone/email per restaurant
staffManagementSchema.index(
  { restaurantId: 1, phone: 1 },
  { unique: true, sparse: true, partialFilterExpression: { phone: { $exists: true, $ne: null } } }
);
staffManagementSchema.index(
  { restaurantId: 1, email: 1 },
  { unique: true, sparse: true, partialFilterExpression: { email: { $exists: true, $ne: null } } }
);

const StaffManagement = mongoose.model('StaffManagement', staffManagementSchema);

export default StaffManagement;


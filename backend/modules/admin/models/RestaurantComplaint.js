import mongoose from 'mongoose';

const restaurantComplaintSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  orderNumber: {
    type: String,
    required: true,
    index: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  customerName: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    default: ''
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  restaurantName: {
    type: String,
    required: true
  },
  complaintType: {
    type: String,
    enum: ['food_quality', 'wrong_item', 'missing_item', 'delivery_issue', 'packaging', 'pricing', 'service', 'other'],
    required: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'resolved', 'rejected'],
    default: 'pending',
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  // Restaurant response
  restaurantResponse: {
    type: String,
    default: ''
  },
  restaurantRespondedAt: {
    type: Date
  },
  // Admin response
  adminResponse: {
    type: String,
    default: ''
  },
  adminRespondedAt: {
    type: Date
  },
  resolvedAt: {
    type: Date
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  // Attachments (images, documents)
  attachments: [{
    url: String,
    publicId: String,
    type: {
      type: String,
      enum: ['image', 'document'],
      default: 'image'
    }
  }],
  // Internal notes (only visible to admin)
  internalNotes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Indexes for better query performance
restaurantComplaintSchema.index({ restaurantId: 1, status: 1 });
restaurantComplaintSchema.index({ customerId: 1, createdAt: -1 });
restaurantComplaintSchema.index({ orderId: 1 });
restaurantComplaintSchema.index({ createdAt: -1 });

export default mongoose.model('RestaurantComplaint', restaurantComplaintSchema);

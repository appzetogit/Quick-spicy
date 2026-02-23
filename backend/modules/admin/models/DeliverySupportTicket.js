import mongoose from 'mongoose';

const deliverySupportTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
      required: false, // Will be generated in pre-save hook
      trim: true
    },
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      required: true
    },
    deliveryName: {
      type: String,
      required: true,
      trim: true
    },
    deliveryPhone: {
      type: String,
      required: true,
      trim: true
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
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open'
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    category: {
      type: String,
      enum: ['payment', 'account', 'technical', 'order', 'other'],
      default: 'other'
    },
    adminResponse: {
      type: String,
      default: '',
      trim: true
    },
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    respondedAt: {
      type: Date,
      default: null
    },
    resolvedAt: {
      type: Date,
      default: null
    },
    closedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Indexes
deliverySupportTicketSchema.index({ deliveryId: 1 });
deliverySupportTicketSchema.index({ status: 1 });
deliverySupportTicketSchema.index({ priority: 1 });
deliverySupportTicketSchema.index({ createdAt: -1 });
deliverySupportTicketSchema.index({ ticketId: 1 });

// Generate unique ticket ID before saving
deliverySupportTicketSchema.pre('save', async function(next) {
  // Only generate ticketId if it doesn't exist (for new documents)
  if (!this.ticketId && this.isNew) {
    let attempts = 0;
    const maxAttempts = 10;
    let ticketId;
    let isUnique = false;

    while (!isUnique && attempts < maxAttempts) {
      // Generate ticket ID: TKT + timestamp + random 4 digits
      const timestamp = Date.now().toString().slice(-8);
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      ticketId = `TKT${timestamp}${random}`;

      // Check if ticketId already exists
      try {
        const existing = await this.constructor.findOne({ ticketId });
        if (!existing) {
          isUnique = true;
        } else {
          // If exists, wait a bit and try again with new timestamp
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } catch (error) {
        // If error checking, assume it's unique and proceed
        console.warn('Error checking ticketId uniqueness:', error);
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return next(new Error('Failed to generate unique ticket ID after multiple attempts'));
    }

    this.ticketId = ticketId;
    console.log('Generated ticketId:', ticketId);
  }
  next();
});

// Validate ticketId after save (ensure it was generated)
deliverySupportTicketSchema.post('save', function(doc, next) {
  if (!doc.ticketId) {
    console.error('Warning: ticketId was not generated for ticket:', doc._id);
  }
  next();
});

const DeliverySupportTicket = mongoose.model('DeliverySupportTicket', deliverySupportTicketSchema);

export default DeliverySupportTicket;


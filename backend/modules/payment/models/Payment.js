import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    required: true,
    unique: true
    // Note: unique: true automatically creates an index, so index: true is redundant
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD', 'EUR']
  },
  method: {
    type: String,
    enum: ['razorpay', 'cash', 'wallet', 'upi', 'card'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending',
    index: true
  },
  // Razorpay specific fields
  razorpay: {
    orderId: {
      type: String
      // Index created explicitly via schema.index() below
    },
    paymentId: {
      type: String
      // Index created explicitly via schema.index() below
    },
    signature: {
      type: String
    },
    receipt: {
      type: String
    },
    notes: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  // Payment method details
  paymentMethodDetails: {
    type: {
      type: String, // 'card', 'upi', 'netbanking', 'wallet'
      enum: ['card', 'upi', 'netbanking', 'wallet', 'cash']
    },
    card: {
      last4: String,
      network: String, // 'Visa', 'Mastercard', etc.
      issuer: String
    },
    upi: {
      vpa: String // Virtual Payment Address
    },
    wallet: {
      provider: String // 'paytm', 'phonepe', etc.
    }
  },
  // Transaction details
  transactionId: {
    type: String,
    index: true
  },
  gatewayResponse: {
    type: mongoose.Schema.Types.Mixed // Store full gateway response
  },
  // Refund details
  refund: {
    amount: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['none', 'partial', 'full']
    },
    refundId: String,
    refundedAt: Date,
    reason: String
  },
  // Timestamps
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  failedAt: {
    type: Date
  },
  failureReason: {
    type: String
  },
  // Logs for audit trail
  logs: [{
    action: {
      type: String,
      enum: ['initiated', 'processing', 'completed', 'failed', 'refunded', 'cancelled']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: {
      type: mongoose.Schema.Types.Mixed
    },
    ipAddress: String,
    userAgent: String
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ 'razorpay.orderId': 1 });
paymentSchema.index({ 'razorpay.paymentId': 1 });

// Add log entry before status change
paymentSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    const newStatus = this.status;
    
    // Determine previous status:
    // - If new document, previous status is null (document is being created)
    // - If existing document, we can't reliably get the original value in pre-save
    //   so we'll use null and let the log show the new status
    const previousStatus = this.isNew ? null : null;
    
    // Initialize logs array if it doesn't exist
    if (!this.logs) {
      this.logs = [];
    }
    
    // Log the status change
    this.logs.push({
      action: newStatus,
      timestamp: new Date(),
      details: {
        previousStatus: previousStatus || (this.isNew ? 'new' : 'unknown'),
        newStatus: newStatus
      }
    });
  }
  next();
});

export default mongoose.model('Payment', paymentSchema);


import mongoose from 'mongoose';

// Transaction Schema for User Wallet
const transactionSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  type: {
    type: String,
    enum: ['addition', 'deduction', 'refund'],
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Cancelled'],
    default: 'Completed'
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    sparse: true // Optional field
  },
  paymentMethod: {
    type: String,
    enum: ['upi', 'card', 'netbanking', 'wallet', 'cash', 'other'],
    sparse: true // Optional field
  },
  paymentGateway: {
    type: String, // e.g., 'razorpay', 'stripe', etc.
    sparse: true
  },
  paymentId: {
    type: String, // Payment gateway transaction ID
    sparse: true
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  processedAt: Date, // When transaction was processed
  failureReason: String // If status is Failed
}, {
  timestamps: true,
  _id: true
});

// User Wallet Schema
const userWalletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  // Balance field
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  // Total amount added to wallet
  totalAdded: {
    type: Number,
    default: 0,
    min: 0
  },
  // Total amount spent from wallet
  totalSpent: {
    type: Number,
    default: 0,
    min: 0
  },
  // Total refunds received
  totalRefunded: {
    type: Number,
    default: 0,
    min: 0
  },
  // Transactions array
  transactions: [transactionSchema],
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  // Last transaction date
  lastTransactionAt: Date
}, {
  timestamps: true
});

// Indexes
userWalletSchema.index({ userId: 1 }, { unique: true });
userWalletSchema.index({ 'transactions.orderId': 1 });
userWalletSchema.index({ 'transactions.status': 1 });
userWalletSchema.index({ 'transactions.type': 1 });
userWalletSchema.index({ 'transactions.createdAt': -1 });
userWalletSchema.index({ lastTransactionAt: -1 });

// Method to add transaction and update balances
userWalletSchema.methods.addTransaction = function(transactionData) {
  const transaction = {
    ...transactionData,
    createdAt: new Date()
  };
  
  this.transactions.push(transaction);
  
  // Update balances based on transaction type and status
  if (transaction.status === 'Completed') {
    if (transaction.type === 'addition' || transaction.type === 'refund') {
      this.balance += transaction.amount;
      
      if (transaction.type === 'addition') {
        this.totalAdded += transaction.amount;
      } else if (transaction.type === 'refund') {
        this.totalRefunded += transaction.amount;
      }
    } else if (transaction.type === 'deduction') {
      // Check if sufficient balance
      if (transaction.amount > this.balance) {
        throw new Error('Insufficient wallet balance');
      }
      this.balance -= transaction.amount;
      this.totalSpent += transaction.amount;
    }
  }
  
  this.lastTransactionAt = new Date();
  
  return transaction;
};

// Method to update transaction status
userWalletSchema.methods.updateTransactionStatus = function(transactionId, status, failureReason = null) {
  const transaction = this.transactions.id(transactionId);
  if (!transaction) {
    throw new Error('Transaction not found');
  }
  
  const oldStatus = transaction.status;
  const oldAmount = transaction.amount;
  
  transaction.status = status;
  transaction.processedAt = new Date();
  
  if (status === 'Failed' && failureReason) {
    transaction.failureReason = failureReason;
  }
  
  // If transaction status changed from Pending to Completed, update balances
  if (oldStatus === 'Pending' && status === 'Completed') {
    if (transaction.type === 'addition' || transaction.type === 'refund') {
      this.balance += oldAmount;
      
      if (transaction.type === 'addition') {
        this.totalAdded += oldAmount;
      } else if (transaction.type === 'refund') {
        this.totalRefunded += oldAmount;
      }
    } else if (transaction.type === 'deduction') {
      if (oldAmount > this.balance) {
        throw new Error('Insufficient wallet balance');
      }
      this.balance -= oldAmount;
      this.totalSpent += oldAmount;
    }
  }
  
  // If transaction status changed from Completed to Failed/Cancelled, reverse balances
  if (oldStatus === 'Completed' && (status === 'Failed' || status === 'Cancelled')) {
    if (transaction.type === 'addition' || transaction.type === 'refund') {
      this.balance = Math.max(0, this.balance - oldAmount);
      
      if (transaction.type === 'addition') {
        this.totalAdded = Math.max(0, this.totalAdded - oldAmount);
      } else if (transaction.type === 'refund') {
        this.totalRefunded = Math.max(0, this.totalRefunded - oldAmount);
      }
    } else if (transaction.type === 'deduction') {
      this.balance += oldAmount;
      this.totalSpent = Math.max(0, this.totalSpent - oldAmount);
    }
  }
  
  return transaction;
};

// Static method to get wallet by user ID or create if doesn't exist
userWalletSchema.statics.findOrCreateByUserId = async function(userId) {
  let wallet = await this.findOne({ userId });
  
  if (!wallet) {
    wallet = await this.create({
      userId,
      balance: 0,
      totalAdded: 0,
      totalSpent: 0,
      totalRefunded: 0
    });
  }
  
  return wallet;
};

export default mongoose.model('UserWallet', userWalletSchema);


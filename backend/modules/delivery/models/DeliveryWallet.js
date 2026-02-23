import mongoose from 'mongoose';

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  type: {
    type: String,
    enum: ['payment', 'withdrawal', 'bonus', 'deduction', 'refund', 'deposit', 'earning_addon'],
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Cancelled'],
    default: 'Pending'
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
    enum: ['bank_transfer', 'upi', 'card', 'cash', 'other'],
    sparse: true // Optional field
  },
  paymentCollected: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  processedAt: Date, // When transaction was processed
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    sparse: true
  },
  failureReason: String // If status is Failed
}, {
  timestamps: true,
  _id: true
});

// Withdrawal Request Schema
const withdrawalRequestSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Processed'],
    default: 'Pending'
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'upi', 'card'],
    required: true
  },
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
    bankName: String
  },
  upiId: String,
  cardDetails: {
    last4Digits: String,
    cardType: String
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  processedAt: Date,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    sparse: true
  },
  rejectionReason: String,
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    sparse: true
  }
}, {
  timestamps: true,
  _id: true
});

// Delivery Wallet Schema
const deliveryWalletSchema = new mongoose.Schema({
  deliveryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Delivery',
    required: true,
    unique: true,
    index: true
  },
  // Balance fields
  totalBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  cashInHand: {
    type: Number,
    default: 0,
    min: 0
  },
  totalWithdrawn: {
    type: Number,
    default: 0,
    min: 0
  },
  totalEarned: {
    type: Number,
    default: 0,
    min: 0
  },
  // Bonus fields
  joiningBonusClaimed: {
    type: Boolean,
    default: false
  },
  joiningBonusAmount: {
    type: Number,
    default: 0
  },
  // Transactions array
  transactions: [transactionSchema],
  // Withdrawal requests
  withdrawalRequests: [withdrawalRequestSchema],
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
deliveryWalletSchema.index({ deliveryId: 1 }, { unique: true });
deliveryWalletSchema.index({ 'transactions.orderId': 1 });
deliveryWalletSchema.index({ 'transactions.status': 1 });
deliveryWalletSchema.index({ 'transactions.type': 1 });
deliveryWalletSchema.index({ 'transactions.createdAt': -1 });
deliveryWalletSchema.index({ lastTransactionAt: -1 });

// Virtual for pocket balance (totalBalance - cashInHand)
deliveryWalletSchema.virtual('pocketBalance').get(function() {
  return this.totalBalance - this.cashInHand;
});

// Virtual for pending withdrawals
deliveryWalletSchema.virtual('pendingWithdrawals').get(function() {
  return this.transactions
    .filter(t => t.type === 'withdrawal' && t.status === 'Pending')
    .reduce((sum, t) => sum + t.amount, 0);
});

// Method to add transaction and update balances
deliveryWalletSchema.methods.addTransaction = function(transactionData) {
  const transaction = {
    ...transactionData,
    createdAt: new Date()
  };
  
  this.transactions.push(transaction);
  
  // Update balances based on transaction type and status
  if (transaction.status === 'Completed') {
    if (transaction.type === 'payment' || transaction.type === 'bonus' || transaction.type === 'refund' || transaction.type === 'earning_addon') {
      const oldBalance = this.totalBalance || 0;
      this.totalBalance += transaction.amount;
      this.totalEarned += transaction.amount;
      
      // Log bonus/earning_addon transaction for debugging
      if (transaction.type === 'bonus' || transaction.type === 'earning_addon') {
        console.log(`💰 ${transaction.type.toUpperCase()} TRANSACTION ADDED:`, {
          amount: transaction.amount,
          oldBalance: oldBalance,
          newBalance: this.totalBalance,
          walletId: this._id
        });
      }
      
      // If payment is collected (COD), add to cash in hand
      if (transaction.paymentCollected) {
        this.cashInHand += transaction.amount;
      }
    } else if (transaction.type === 'withdrawal') {
      this.totalBalance -= transaction.amount;
      this.totalWithdrawn += transaction.amount;
      
      // Deduct from cash in hand if it was collected cash
      if (transaction.paymentCollected) {
        this.cashInHand = Math.max(0, this.cashInHand - transaction.amount);
      }
    } else if (transaction.type === 'deduction') {
      this.totalBalance -= transaction.amount;
      this.cashInHand = Math.max(0, this.cashInHand - transaction.amount);
    } else if (transaction.type === 'deposit') {
      this.cashInHand = Math.max(0, (this.cashInHand || 0) - transaction.amount);
    }
  }
  
  this.lastTransactionAt = new Date();
  
  return transaction;
};

// Method to update transaction status
deliveryWalletSchema.methods.updateTransactionStatus = function(transactionId, status, failureReason = null) {
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
    if (transaction.type === 'payment' || transaction.type === 'bonus' || transaction.type === 'refund' || transaction.type === 'earning_addon') {
      this.totalBalance += oldAmount;
      this.totalEarned += oldAmount;
      
      if (transaction.paymentCollected) {
        this.cashInHand += oldAmount;
      }
    } else if (transaction.type === 'withdrawal') {
      this.totalBalance -= oldAmount;
      this.totalWithdrawn += oldAmount;
      
      if (transaction.paymentCollected) {
        this.cashInHand = Math.max(0, this.cashInHand - oldAmount);
      }
    } else if (transaction.type === 'deduction') {
      this.totalBalance -= oldAmount;
      this.cashInHand = Math.max(0, this.cashInHand - oldAmount);
    }
  }
  
  // If transaction status changed from Completed to Failed/Cancelled, reverse balances
  if (oldStatus === 'Completed' && (status === 'Failed' || status === 'Cancelled')) {
    if (transaction.type === 'payment' || transaction.type === 'bonus' || transaction.type === 'refund' || transaction.type === 'earning_addon') {
      this.totalBalance = Math.max(0, this.totalBalance - oldAmount);
      this.totalEarned = Math.max(0, this.totalEarned - oldAmount);
      
      if (transaction.paymentCollected) {
        this.cashInHand = Math.max(0, this.cashInHand - oldAmount);
      }
    } else if (transaction.type === 'withdrawal') {
      this.totalBalance += oldAmount;
      this.totalWithdrawn = Math.max(0, this.totalWithdrawn - oldAmount);
    } else if (transaction.type === 'deposit') {
      this.cashInHand = (this.cashInHand || 0) + oldAmount;
    }
  }
  
  return transaction;
};

// Method to collect payment (mark payment as collected and update cashInHand)
deliveryWalletSchema.methods.collectPayment = function(orderId, amount) {
  const paymentTransaction = this.transactions.find(
    t => t.orderId && t.orderId.toString() === orderId.toString() && 
         t.type === 'payment' && t.status === 'Completed'
  );
  
  if (!paymentTransaction) {
    throw new Error('Payment transaction not found for this order');
  }
  
  if (paymentTransaction.paymentCollected) {
    throw new Error('Payment already collected');
  }
  
  paymentTransaction.paymentCollected = true;
  this.cashInHand += amount || paymentTransaction.amount;
  
  return paymentTransaction;
};

// Static method to get wallet by delivery ID or create if doesn't exist
deliveryWalletSchema.statics.findOrCreateByDeliveryId = async function(deliveryId) {
  let wallet = await this.findOne({ deliveryId });
  
  if (!wallet) {
    wallet = await this.create({
      deliveryId,
      totalBalance: 0,
      cashInHand: 0,
      totalWithdrawn: 0,
      totalEarned: 0
    });
  }
  
  return wallet;
};

export default mongoose.model('DeliveryWallet', deliveryWalletSchema);


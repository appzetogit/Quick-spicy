import mongoose from 'mongoose';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

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
userWalletSchema.index({ 'transactions.paymentId': 1 });
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
// Fixed: handles race condition where concurrent requests both try to create
userWalletSchema.statics.findOrCreateByUserId = async function(userId) {
  let wallet = await this.findOne({ userId });
  
  if (!wallet) {
    try {
      wallet = await this.create({
        userId,
        balance: 0,
        totalAdded: 0,
        totalSpent: 0,
        totalRefunded: 0
      });
    } catch (err) {
      // Handle duplicate key error — another concurrent request already created it
      if (err.code === 11000) {
        wallet = await this.findOne({ userId });
        if (!wallet) {
          throw new Error(`Wallet creation race condition: duplicate key but wallet not found for userId ${userId}`);
        }
      } else {
        throw err;
      }
    }
  }
  
  return wallet;
};

/**
 * Atomically credit wallet balance using $inc and $push.
 * Prevents race conditions and ensures idempotency via paymentId check.
 * 
 * @param {ObjectId} userId - User ID
 * @param {Object} params - Credit parameters
 * @param {number} params.amount - Amount to credit
 * @param {string} params.paymentId - Unique payment ID (cf_payment_id) for idempotency
 * @param {string} params.cashfreeOrderId - Cashfree order ID
 * @param {string} params.cashfreePaymentId - Cashfree payment ID
 * @param {string} params.paymentMethod - Payment method (upi, card, etc.)
 * @param {string} params.description - Transaction description
 * @param {string} params.source - Source of the credit (webhook, verify, etc.)
 * @returns {Object} { updated: boolean, wallet: document|null, previousBalance: number }
 */
userWalletSchema.statics.atomicCreditWallet = async function(userId, {
  amount,
  paymentId,
  cashfreeOrderId,
  cashfreePaymentId,
  paymentMethod = 'other',
  description = 'Added money via Cashfree',
  source = 'verify'
}) {
  if (!userId || !amount || !paymentId) {
    throw new Error('atomicCreditWallet: userId, amount, and paymentId are required');
  }

  if (amount <= 0 || isNaN(amount)) {
    throw new Error(`atomicCreditWallet: invalid amount ${amount}`);
  }

  // Ensure wallet exists first
  const wallet = await this.findOrCreateByUserId(userId);
  const previousBalance = wallet.balance;

  // Atomic update: only applies if paymentId is NOT already in transactions
  // This prevents double-crediting from duplicate webhooks or retries
  const result = await this.findOneAndUpdate(
    {
      userId,
      'transactions.paymentId': { $ne: paymentId }  // Idempotency guard
    },
    {
      $inc: {
        balance: amount,
        totalAdded: amount
      },
      $push: {
        transactions: {
          _id: new mongoose.Types.ObjectId(),
          amount,
          type: 'addition',
          status: 'Completed',
          description,
          paymentMethod,
          paymentGateway: 'cashfree',
          paymentId,
          metadata: new Map(Object.entries({
            cashfreeOrderId: cashfreeOrderId || '',
            cashfreePaymentId: cashfreePaymentId || '',
            source,
            previousBalance: String(previousBalance)
          })),
          createdAt: new Date(),
          processedAt: new Date()
        }
      },
      $set: {
        lastTransactionAt: new Date()
      }
    },
    {
      new: true,      // Return updated document
      upsert: false   // Don't create new document
    }
  );

  if (!result) {
    // Either wallet doesn't exist or paymentId was already processed (duplicate)
    const existingWallet = await this.findOne({ userId });
    const isDuplicate = existingWallet?.transactions?.some(
      t => t.paymentId === paymentId
    );

    if (isDuplicate) {
      logger.info('atomicCreditWallet: duplicate payment detected, skipping', {
        userId: String(userId),
        paymentId,
        currentBalance: existingWallet.balance
      });
      return { updated: false, wallet: existingWallet, previousBalance, isDuplicate: true };
    }

    logger.error('atomicCreditWallet: update failed but not a duplicate', {
      userId: String(userId),
      paymentId
    });
    return { updated: false, wallet: existingWallet, previousBalance, isDuplicate: false };
  }

  logger.info('atomicCreditWallet: wallet credited successfully', {
    userId: String(userId),
    paymentId,
    amount,
    previousBalance,
    newBalance: result.balance,
    source
  });

  return { updated: true, wallet: result, previousBalance, isDuplicate: false };
};

/**
 * Atomically debit wallet balance using $inc and $push.
 * Prevents race conditions and ensures idempotency via paymentId check.
 * 
 * @param {ObjectId} userId - User ID
 * @param {Object} params - Debit parameters
 * @param {number} params.amount - Amount to deduct
 * @param {string} params.paymentId - Unique payment ID (cf_refund_id) for idempotency
 * @param {string} params.cashfreeOrderId - Cashfree order ID
 * @param {string} params.cashfreeRefundId - Cashfree refund ID
 * @param {string} params.description - Transaction description
 * @param {string} params.source - Source of the debit
 * @returns {Object} { updated: boolean, wallet: document|null, previousBalance: number }
 */
userWalletSchema.statics.atomicDebitWallet = async function(userId, {
  amount,
  paymentId,
  cashfreeOrderId,
  cashfreeRefundId,
  description = 'Wallet refund processed',
  source = 'webhook'
}) {
  if (!userId || !amount || !paymentId) {
    throw new Error('atomicDebitWallet: userId, amount, and paymentId are required');
  }

  if (amount <= 0 || isNaN(amount)) {
    throw new Error(`atomicDebitWallet: invalid amount ${amount}`);
  }

  // Ensure wallet exists first
  const wallet = await this.findOrCreateByUserId(userId);
  const previousBalance = wallet.balance;

  // Capped deduction amount: can't deduct more than the current balance
  // to avoid negative balance.
  const deductionAmount = Math.min(amount, previousBalance);

  // Atomic update: only applies if paymentId is NOT already in transactions
  const result = await this.findOneAndUpdate(
    {
      userId,
      'transactions.paymentId': { $ne: paymentId }  // Idempotency guard
    },
    {
      $inc: {
        balance: -deductionAmount,
        totalSpent: amount // Log the full requested refund amount in totalSpent
      },
      $push: {
        transactions: {
          _id: new mongoose.Types.ObjectId(),
          amount,
          type: 'deduction',
          status: 'Completed',
          description,
          paymentMethod: 'wallet',
          paymentGateway: 'cashfree',
          paymentId,
          metadata: new Map(Object.entries({
            cashfreeOrderId: cashfreeOrderId || '',
            cashfreeRefundId: cashfreeRefundId || '',
            source,
            previousBalance: String(previousBalance),
            actualDeducted: String(deductionAmount)
          })),
          createdAt: new Date(),
          processedAt: new Date()
        }
      },
      $set: {
        lastTransactionAt: new Date()
      }
    },
    {
      new: true,
      upsert: false
    }
  );

  if (!result) {
    const existingWallet = await this.findOne({ userId });
    const isDuplicate = existingWallet?.transactions?.some(
      t => t.paymentId === paymentId
    );

    if (isDuplicate) {
      logger.info('atomicDebitWallet: duplicate transaction detected, skipping', {
        userId: String(userId),
        paymentId,
        currentBalance: existingWallet.balance
      });
      return { updated: false, wallet: existingWallet, previousBalance, isDuplicate: true };
    }

    logger.error('atomicDebitWallet: update failed but not a duplicate', {
      userId: String(userId),
      paymentId
    });
    return { updated: false, wallet: existingWallet, previousBalance, isDuplicate: false };
  }

  logger.info('atomicDebitWallet: wallet debited successfully', {
    userId: String(userId),
    paymentId,
    amount,
    deductionAmount,
    previousBalance,
    newBalance: result.balance,
    source
  });

  return { updated: true, wallet: result, previousBalance, isDuplicate: false };
};

export default mongoose.model('UserWallet', userWalletSchema);



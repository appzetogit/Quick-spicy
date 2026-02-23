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
    enum: ['commission', 'platform_fee', 'delivery_fee', 'gst', 'refund', 'withdrawal', 'bonus', 'deduction'],
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Cancelled'],
    default: 'Completed'
  },
  description: {
    type: String,
    trim: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    sparse: true
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    sparse: true
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  processedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  _id: true
});

// Admin Wallet Schema (Platform Wallet)
const adminWalletSchema = new mongoose.Schema({
  // Platform earnings breakdown
  totalBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCommission: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Total commission from restaurants'
  },
  totalPlatformFee: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Total platform fees collected'
  },
  totalDeliveryFee: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Total delivery fees collected'
  },
  totalGST: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Total GST collected'
  },
  totalWithdrawn: {
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
adminWalletSchema.index({ 'transactions.orderId': 1 });
adminWalletSchema.index({ 'transactions.restaurantId': 1 });
adminWalletSchema.index({ 'transactions.type': 1 });
adminWalletSchema.index({ 'transactions.createdAt': -1 });
adminWalletSchema.index({ lastTransactionAt: -1 });

// Virtual for pending balance
adminWalletSchema.virtual('pendingBalance').get(function() {
  return this.totalBalance - this.totalWithdrawn;
});

// Method to add transaction and update balances
adminWalletSchema.methods.addTransaction = function(transactionData) {
  const transaction = {
    ...transactionData,
    createdAt: new Date(),
    processedAt: transactionData.processedAt || new Date()
  };
  
  this.transactions.push(transaction);
  
  // Update balances based on transaction type and status
  if (transaction.status === 'Completed') {
    if (transaction.type === 'commission') {
      this.totalBalance += transaction.amount;
      this.totalCommission += transaction.amount;
    } else if (transaction.type === 'platform_fee') {
      this.totalBalance += transaction.amount;
      this.totalPlatformFee += transaction.amount;
    } else if (transaction.type === 'delivery_fee') {
      this.totalBalance += transaction.amount;
      this.totalDeliveryFee += transaction.amount;
    } else if (transaction.type === 'gst') {
      this.totalBalance += transaction.amount;
      this.totalGST += transaction.amount;
    } else if (transaction.type === 'withdrawal') {
      this.totalBalance -= transaction.amount;
      this.totalWithdrawn += transaction.amount;
    } else if (transaction.type === 'deduction') {
      this.totalBalance -= transaction.amount;
    } else if (transaction.type === 'refund') {
      // Refunds reduce balance
      this.totalBalance = Math.max(0, this.totalBalance - transaction.amount);
    }
  }
  
  this.lastTransactionAt = new Date();
  
  return transaction;
};

// Static method to get or create admin wallet (singleton)
adminWalletSchema.statics.findOrCreate = async function() {
  let wallet = await this.findOne({});
  
  if (!wallet) {
    wallet = await this.create({
      totalBalance: 0,
      totalCommission: 0,
      totalPlatformFee: 0,
      totalDeliveryFee: 0,
      totalGST: 0,
      totalWithdrawn: 0
    });
  }
  
  return wallet;
};

const AdminWallet = mongoose.model('AdminWallet', adminWalletSchema);

export default AdminWallet;


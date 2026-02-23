import mongoose from 'mongoose';

const deliveryWithdrawalRequestSchema = new mongoose.Schema({
  deliveryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Delivery',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Processed'],
    default: 'Pending',
    index: true
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
    sparse: true
  },
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryWallet',
    sparse: true
  },
  deliveryName: String,
  deliveryIdString: String
}, {
  timestamps: true
});

deliveryWithdrawalRequestSchema.index({ deliveryId: 1, status: 1 });
deliveryWithdrawalRequestSchema.index({ status: 1, createdAt: -1 });
deliveryWithdrawalRequestSchema.index({ createdAt: -1 });

export default mongoose.model('DeliveryWithdrawalRequest', deliveryWithdrawalRequestSchema);

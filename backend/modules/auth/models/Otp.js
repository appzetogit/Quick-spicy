import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: function() {
      return !this.email; // Phone is required if email is not provided
    },
    index: true
  },
  email: {
    type: String,
    required: function() {
      return !this.phone; // Email is required if phone is not provided
    },
    lowercase: true,
    index: true
  },
  otp: {
    type: String,
    required: true
  },
  purpose: {
    type: String,
    enum: ['login', 'register', 'reset-password', 'verify-phone', 'verify-email'],
    default: 'login'
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // Auto-delete expired OTPs
  },
  attempts: {
    type: Number,
    default: 0,
    max: 5
  },
  verified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for faster lookups - phone-based
otpSchema.index({ phone: 1, purpose: 1, verified: 1 });
// Index for faster lookups - email-based
otpSchema.index({ email: 1, purpose: 1, verified: 1 });

// Compound index for either phone or email
otpSchema.index({ phone: 1, email: 1, purpose: 1, verified: 1 });

const Otp = mongoose.model('Otp', otpSchema);

export default Otp;


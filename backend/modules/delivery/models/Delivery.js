import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const locationSchema = new mongoose.Schema({
  latitude: Number,
  longitude: Number,
  addressLine1: String,
  addressLine2: String,
  area: String,
  city: String,
  state: String,
  zipCode: String,
}, { _id: false });

const vehicleSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['bike', 'scooter', 'bicycle', 'car'],
    default: 'bike'
  },
  number: String,
  model: String,
  brand: String,
}, { _id: false });

const documentsSchema = new mongoose.Schema({
  aadhar: {
    number: String,
    document: String, // URL to document
    verified: {
      type: Boolean,
      default: false
    }
  },
  pan: {
    number: String,
    document: String,
    verified: {
      type: Boolean,
      default: false
    }
  },
  drivingLicense: {
    number: String,
    document: String,
    verified: {
      type: Boolean,
      default: false
    },
    expiryDate: Date
  },
  vehicleRC: {
    number: String,
    document: String,
    verified: {
      type: Boolean,
      default: false
    }
  },
  photo: String, // Profile photo URL
  bankDetails: {
    accountNumber: String, // Encrypted
    ifscCode: String,
    accountHolderName: String,
    bankName: String
  }
}, { _id: false });

const availabilitySchema = new mongoose.Schema({
  isOnline: {
    type: Boolean,
    default: false
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    }
  },
  lastLocationUpdate: Date,
  zones: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Zone'
  }]
}, { _id: false });

const earningsSchema = new mongoose.Schema({
  totalEarned: {
    type: Number,
    default: 0
  },
  currentBalance: {
    type: Number,
    default: 0
  },
  pendingPayout: {
    type: Number,
    default: 0
  },
  tips: {
    type: Number,
    default: 0
  }
}, { _id: false });

const metricsSchema = new mongoose.Schema({
  totalOrders: {
    type: Number,
    default: 0
  },
  completedOrders: {
    type: Number,
    default: 0
  },
  cancelledOrders: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  ratingCount: {
    type: Number,
    default: 0
  },
  onTimeDeliveryRate: {
    type: Number,
    default: 0
  },
  averageDeliveryTime: {
    type: Number,
    default: 0 // in minutes
  },
  activeHours: {
    type: Number,
    default: 0
  }
}, { _id: false });

const deliverySchema = new mongoose.Schema(
  {
    deliveryId: {
      type: String,
      unique: true,
      sparse: true
    },
    // Authentication fields
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    phoneVerified: {
      type: Boolean,
      default: false
    },
    password: {
      type: String,
      select: false // Don't return password by default
    },
    googleId: {
      type: String,
      sparse: true
    },
    googleEmail: {
      type: String,
      sparse: true
    },
    signupMethod: {
      type: String,
      enum: ['google', 'phone', 'email'],
      default: 'phone'
    },
    // Basic information
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true
    },
    profileImage: {
      url: String,
      publicId: String
    },
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer-not-to-say']
    },
    // Location
    location: locationSchema,
    // Vehicle information
    vehicle: vehicleSchema,
    // Documents
    documents: documentsSchema,
    // Availability
    availability: availabilitySchema,
    // Earnings
    earnings: earningsSchema,
    // Metrics
    metrics: metricsSchema,
    // Status
    status: {
      type: String,
      enum: ['pending', 'approved', 'active', 'suspended', 'blocked'],
      default: 'pending'
    },
    level: {
      type: String,
      enum: ['bronze', 'silver', 'gold', 'platinum'],
      default: 'bronze'
    },
    // Note: Wallet functionality has been moved to separate DeliveryWallet model
    // Use DeliveryWallet.findOne({ deliveryId: this._id }) to access wallet
    // The embedded wallet schema has been removed in favor of the separate model
    // Refresh token (for JWT)
    refreshToken: {
      type: String,
      select: false
    },
    // Active status
    isActive: {
      type: Boolean,
      default: true
    },
    // Last login
    lastLogin: Date,
    // Verification
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    // Rejection details
    rejectionReason: {
      type: String,
      trim: true
    },
    rejectedAt: Date,
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    }
  },
  {
    timestamps: true
  }
);

// Indexes
deliverySchema.index({ phone: 1 }, { unique: true });
deliverySchema.index({ deliveryId: 1 }, { unique: true, sparse: true });
deliverySchema.index({ 'availability.currentLocation': '2dsphere' });
deliverySchema.index({ status: 1 });
deliverySchema.index({ isActive: 1 });

// Hash password before saving
deliverySchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  if (this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// Generate deliveryId before saving
deliverySchema.pre('save', async function(next) {
  if (!this.deliveryId && this.isNew) {
    try {
      const DeliveryModel = mongoose.model('Delivery');
      let deliveryId;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 100; // Prevent infinite loop
      
      // Keep generating IDs until we find a unique one
      while (!isUnique && attempts < maxAttempts) {
        // Get the highest existing delivery ID number
        // Using aggregation for better performance and atomicity
        const result = await DeliveryModel.aggregate([
          { $match: { deliveryId: { $exists: true, $ne: null } } },
          { $project: { 
              number: { 
                $toInt: { 
                  $substr: ['$deliveryId', 3, 6] 
                } 
              } 
            } 
          },
          { $sort: { number: -1 } },
          { $limit: 1 }
        ]);
        
        let nextNumber = 1;
        if (result.length > 0 && result[0].number) {
          nextNumber = result[0].number + 1;
        }
        
        deliveryId = `DEL${String(nextNumber).padStart(6, '0')}`;
        
        // Check if this ID already exists (handles race conditions)
        const exists = await DeliveryModel.findOne({ deliveryId }).select('_id');
        if (!exists) {
          isUnique = true;
        } else {
          attempts++;
          // If ID exists, increment and try again
          nextNumber++;
          deliveryId = `DEL${String(nextNumber).padStart(6, '0')}`;
          // Small delay to reduce contention
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }
      
      if (!isUnique) {
        // Fallback: use timestamp-based ID if we couldn't find a unique sequential one
        deliveryId = `DEL${Date.now().toString().slice(-6)}`;
      }
      
      this.deliveryId = deliveryId;
    } catch (error) {
      // If model not registered yet or any other error, use timestamp-based ID
      this.deliveryId = `DEL${Date.now().toString().slice(-6)}`;
    }
  }
  next();
});

// Method to compare password
deliverySchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('Delivery', deliverySchema);


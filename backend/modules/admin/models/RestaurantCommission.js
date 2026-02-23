import mongoose from 'mongoose';

const commissionRuleSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['amount', 'percentage'],
    required: true
  },
  value: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function(value) {
        if (this.type === 'percentage') {
          return value >= 0 && value <= 100;
        }
        return value >= 0;
      },
      message: 'Percentage must be between 0-100, amount must be >= 0'
    }
  },
  minOrderAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxOrderAmount: {
    type: Number,
    default: null, // null means unlimited
    validate: {
      validator: function(value) {
        if (value === null || value === undefined) return true;
        return value > this.minOrderAmount;
      },
      message: 'Maximum order amount must be greater than minimum order amount'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 0, // Higher priority rules are checked first
    min: 0
  }
}, { _id: true });

const restaurantCommissionSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      unique: true,
      index: true
    },
    restaurantName: {
      type: String,
      required: true,
      trim: true
    },
    restaurantId: {
      type: String,
      required: true
    },
    // Multiple commission rules
    commissionRules: [commissionRuleSchema],
    // Default commission (fallback if no rules match)
    defaultCommission: {
      type: {
        type: String,
        enum: ['amount', 'percentage'],
        default: 'percentage'
      },
      value: {
        type: Number,
        default: 10, // Default 10% commission
        min: 0,
        validate: {
          validator: function(value) {
            if (this.type === 'percentage') {
              return value >= 0 && value <= 100;
            }
            return value >= 0;
          },
          message: 'Percentage must be between 0-100, amount must be >= 0'
        }
      }
    },
    status: {
      type: Boolean,
      default: true
    },
    // Created by admin
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    },
    // Updated by admin
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    // Notes/remarks
    notes: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Indexes
restaurantCommissionSchema.index({ restaurant: 1 });
restaurantCommissionSchema.index({ restaurantId: 1 });
restaurantCommissionSchema.index({ status: 1 });
restaurantCommissionSchema.index({ createdAt: -1 });
restaurantCommissionSchema.index({ createdBy: 1 });

// Method to calculate commission for an order amount
restaurantCommissionSchema.methods.calculateCommission = function(orderAmount) {
  if (!this.status) {
    return {
      commission: 0,
      type: 'amount',
      value: 0,
      rule: null,
      message: 'Commission is disabled for this restaurant'
    };
  }

  // Sort rules by priority (descending) and then by minOrderAmount (ascending)
  const sortedRules = [...this.commissionRules]
    .filter(rule => rule.isActive)
    .sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.minOrderAmount - b.minOrderAmount;
    });

  // Find matching rule
  let matchingRule = null;
  for (const rule of sortedRules) {
    if (orderAmount >= rule.minOrderAmount) {
      if (rule.maxOrderAmount === null || orderAmount <= rule.maxOrderAmount) {
        matchingRule = rule;
        break;
      }
    }
  }

  // Calculate commission
  let commission = 0;
  let commissionType = 'amount';
  let commissionValue = 0;

  if (matchingRule) {
    commissionType = matchingRule.type;
    commissionValue = matchingRule.value;
    
    if (matchingRule.type === 'percentage') {
      commission = (orderAmount * matchingRule.value) / 100;
    } else {
      commission = matchingRule.value;
    }
  } else {
    // Use default commission
    commissionType = this.defaultCommission.type;
    commissionValue = this.defaultCommission.value;
    
    if (this.defaultCommission.type === 'percentage') {
      commission = (orderAmount * this.defaultCommission.value) / 100;
    } else {
      commission = this.defaultCommission.value;
    }
  }

  return {
    commission: Math.round(commission * 100) / 100, // Round to 2 decimal places
    type: commissionType,
    value: commissionValue,
    orderAmount: orderAmount,
    rule: matchingRule,
    defaultUsed: !matchingRule,
    breakdown: {
      orderAmount: orderAmount,
      commissionType: commissionType,
      commissionValue: commissionValue,
      calculatedCommission: commission
    }
  };
};

// Static method to get commission for a restaurant
restaurantCommissionSchema.statics.getCommissionForRestaurant = async function(restaurantId) {
  const commission = await this.findOne({ 
    restaurant: restaurantId,
    status: true 
  }).populate('restaurant', 'name restaurantId isActive');
  
  return commission;
};

// Static method to calculate commission for a restaurant and order amount
restaurantCommissionSchema.statics.calculateCommissionForOrder = async function(restaurantId, orderAmount) {
  const commission = await this.findOne({ 
    restaurant: restaurantId,
    status: true 
  });
  
  if (!commission) {
    // Return default commission if no commission setup
    return {
      commission: (orderAmount * 10) / 100, // Default 10%
      type: 'percentage',
      value: 10,
      orderAmount: orderAmount,
      rule: null,
      defaultUsed: true,
      message: 'No commission setup found, using default 10%'
    };
  }
  
  return commission.calculateCommission(orderAmount);
};

const RestaurantCommission = mongoose.model('RestaurantCommission', restaurantCommissionSchema);

export default RestaurantCommission;


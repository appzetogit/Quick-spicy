import mongoose from 'mongoose';

const adminCommissionSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true,
    index: true
  },
  orderAmount: {
    type: Number,
    required: true,
    min: 0
  },
  commissionAmount: {
    type: Number,
    required: true,
    min: 0
  },
  commissionPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true
  },
  restaurantName: {
    type: String,
    required: true
  },
  restaurantEarning: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'completed'
  },
  orderDate: {
    type: Date,
    required: true,
    index: true
  }
}, {
  timestamps: true
});

// Indexes
adminCommissionSchema.index({ restaurantId: 1, orderDate: -1 });
adminCommissionSchema.index({ status: 1 });
adminCommissionSchema.index({ orderDate: -1 });

// Static method to get total commission earned
adminCommissionSchema.statics.getTotalCommission = async function(startDate = null, endDate = null) {
  const matchQuery = { status: 'completed' };
  
  if (startDate || endDate) {
    matchQuery.orderDate = {};
    if (startDate) matchQuery.orderDate.$gte = new Date(startDate);
    if (endDate) matchQuery.orderDate.$lte = new Date(endDate);
  }
  
  const result = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalCommission: { $sum: '$commissionAmount' },
        totalOrders: { $sum: 1 },
        totalOrderAmount: { $sum: '$orderAmount' }
      }
    }
  ]);
  
  return result[0] || { totalCommission: 0, totalOrders: 0, totalOrderAmount: 0 };
};

// Static method to get commission by date range
adminCommissionSchema.statics.getCommissionByDateRange = async function(startDate, endDate) {
  return this.find({
    status: 'completed',
    orderDate: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  })
  .populate('orderId', 'orderId')
  .populate('restaurantId', 'name restaurantId')
  .sort({ orderDate: -1 });
};

const AdminCommission = mongoose.model('AdminCommission', adminCommissionSchema);

export default AdminCommission;


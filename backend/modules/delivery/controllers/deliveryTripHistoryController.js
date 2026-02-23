import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Order from '../../order/models/Order.js';
import Payment from '../../payment/models/Payment.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
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

/**
 * Get Delivery Partner Trip History
 * GET /api/delivery/trip-history
 * Query params: period (daily/weekly/monthly), date, status, page, limit
 */
export const getTripHistory = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { 
      period = 'daily', 
      date, 
      status,
      page = 1, 
      limit = 50 
    } = req.query;

    // Build date range based on period
    let startDate, endDate;
    const selectedDate = date ? new Date(date) : new Date();
    
    // Set time to start of day
    selectedDate.setHours(0, 0, 0, 0);

    switch (period) {
      case 'daily':
        startDate = new Date(selectedDate);
        endDate = new Date(selectedDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'weekly':
        // Get start of week (Monday)
        const dayOfWeek = selectedDate.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust for Monday start
        startDate = new Date(selectedDate);
        startDate.setDate(selectedDate.getDate() + diff);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'monthly':
        startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        startDate = new Date(selectedDate);
        endDate = new Date(selectedDate);
        endDate.setHours(23, 59, 59, 999);
    }

    // Build query
    const query = {
      deliveryPartnerId: delivery._id,
      createdAt: {
        $gte: startDate,
        $lte: endDate
      }
    };

    // Status filter
    if (status && status !== 'ALL TRIPS') {
      // Map frontend status to backend status
      const statusMap = {
        'Completed': 'delivered',
        'Cancelled': 'cancelled',
        'Pending': 'pending'
      };
      query.status = statusMap[status] || status.toLowerCase();
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch orders
    const orders = await Order.find(query)
      .populate('userId', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Order.countDocuments(query);

    // Get order IDs for Payment collection lookup
    const orderIds = orders.map(o => o._id);
    
    // Fetch payment records for COD fallback check
    const codOrderIds = new Set();
    try {
      const codPayments = await Payment.find({ 
        orderId: { $in: orderIds }, 
        method: 'cash' 
      }).select('orderId').lean();
      codPayments.forEach(p => codOrderIds.add(p.orderId?.toString()));
    } catch (e) {
      // Ignore payment lookup errors
      logger.warn('Could not fetch payment records for COD check:', e.message);
    }

    // Get unique restaurant IDs that need name lookup (where restaurantName is missing/empty)
    const restaurantIdsToLookup = [...new Set(
      orders
        .filter(o => !o.restaurantName || o.restaurantName === 'Unknown Restaurant' || o.restaurantName.trim() === '')
        .map(o => o.restaurantId)
        .filter(id => id)
    )];

    // Fetch restaurant names for orders missing restaurantName
    const restaurantNameMap = new Map();
    if (restaurantIdsToLookup.length > 0) {
      try {
        // Try to find restaurants by restaurantId (String) or _id (ObjectId)
        const restaurantQueries = restaurantIdsToLookup.map(id => {
          // Check if it's a valid ObjectId
          if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
            return {
              $or: [
                { restaurantId: id },
                { _id: new mongoose.Types.ObjectId(id) }
              ]
            };
          } else {
            return { restaurantId: id };
          }
        });

        const restaurants = await Restaurant.find({
          $or: restaurantQueries
        }).select('restaurantId name _id').lean();

        restaurants.forEach(rest => {
          // Map by restaurantId string
          if (rest.restaurantId) {
            restaurantNameMap.set(rest.restaurantId, rest.name);
          }
          // Also map by _id string
          if (rest._id) {
            restaurantNameMap.set(rest._id.toString(), rest.name);
          }
        });
      } catch (e) {
        logger.warn('Could not fetch restaurant names:', e.message);
      }
    }

    // Format response
    const formattedTrips = orders.map((order, index) => {
      // Map backend status to frontend status
      const statusMap = {
        'delivered': 'Completed',
        'cancelled': 'Cancelled',
        'pending': 'Pending',
        'confirmed': 'Pending',
        'preparing': 'Pending',
        'ready': 'Pending',
        'out_for_delivery': 'Pending'
      };

      const displayStatus = statusMap[order.status] || order.status;

      // Format time
      const orderDate = new Date(order.createdAt);
      const hours = orderDate.getHours();
      const minutes = orderDate.getMinutes();
      const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

      // Get restaurant name - use restaurantName field, fallback to Restaurant collection lookup
      let restaurantName = order.restaurantName;
      if (!restaurantName || restaurantName === 'Unknown Restaurant' || restaurantName.trim() === '') {
        // Try to get from lookup map
        restaurantName = restaurantNameMap.get(order.restaurantId) || 
                        restaurantNameMap.get(order.restaurantId?.toString()) ||
                        'Unknown Restaurant';
      }

      // Get order amount (delivery fee or total)
      const amount = order.pricing?.deliveryFee || order.pricing?.total || 0;

      // Get payment method - check Payment collection as fallback (for COD orders)
      let paymentMethod = order.payment?.method || 'razorpay';
      // If order.payment.method is not 'cash', check Payment collection for COD
      if (paymentMethod !== 'cash' && codOrderIds.has(order._id?.toString())) {
        paymentMethod = 'cash';
      }

      return {
        id: order._id.toString(),
        orderId: order.orderId,
        restaurant: restaurantName,
        restaurantName: restaurantName, // Also include for compatibility
        customer: order.userId?.name || 'Unknown Customer',
        status: displayStatus,
        time,
        amount,
        paymentMethod: paymentMethod,
        payment: {
          method: paymentMethod
        },
        date: order.createdAt,
        createdAt: order.createdAt,
        deliveredAt: order.deliveredAt,
        cancelledAt: order.cancelledAt
      };
    });

    return successResponse(res, 200, 'Trip history retrieved successfully', {
      trips: formattedTrips,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      period,
      dateRange: {
        startDate,
        endDate
      }
    });
  } catch (error) {
    logger.error(`Error fetching trip history: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch trip history');
  }
});


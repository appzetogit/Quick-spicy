import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Delivery from '../models/Delivery.js';
import Order from '../../order/models/Order.js';
import DeliveryWallet from '../models/DeliveryWallet.js';
import EarningAddon from '../../admin/models/EarningAddon.js';
import EarningAddonHistory from '../../admin/models/EarningAddonHistory.js';
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
 * Get Delivery Partner Earnings
 * GET /api/delivery/earnings
 * Query params: period (today, week, month, all), page, limit, date (for specific date/week/month)
 */
export const getEarnings = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { period = 'all', page = 1, limit = 1000, date } = req.query;

    // Calculate date range based on period and optional date parameter
    let startDate = null;
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999); // End of day

    // If date is provided, use it as base date for period calculation
    const baseDate = date ? new Date(date) : new Date();
    
    switch (period) {
      case 'today':
        startDate = new Date(baseDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(baseDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        // Get week range (Monday to Sunday)
        startDate = new Date(baseDate);
        const day = startDate.getDay();
        const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        startDate.setDate(diff);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'month':
        startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'all':
      default:
        startDate = null;
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        break;
    }

    // Get or create wallet for delivery partner
    const wallet = await DeliveryWallet.findOrCreateByDeliveryId(delivery._id);

    // Filter transactions based on period and type
    let transactions = wallet.transactions || [];
    
    // Filter by transaction type (only 'payment' type for earnings)
    transactions = transactions.filter(t => 
      t.type === 'payment' && 
      t.status === 'Completed'
    );

    // Filter by date range if period is specified
    if (startDate) {
      transactions = transactions.filter(t => {
        const transactionDate = t.createdAt || t.processedAt || new Date();
        return transactionDate >= startDate && transactionDate <= endDate;
      });
    }

    // Sort by date (newest first)
    transactions.sort((a, b) => {
      const dateA = a.createdAt || a.processedAt || new Date(0);
      const dateB = b.createdAt || b.processedAt || new Date(0);
      return dateB - dateA;
    });

    // Get order details for each transaction
    const orderIds = transactions
      .filter(t => t.orderId)
      .map(t => t.orderId);

    // Fetch orders in batch
    const orders = await Order.find({
      _id: { $in: orderIds }
    })
      .select('orderId restaurantName deliveredAt createdAt')
      .lean();

    // Create order map for quick lookup
    const orderMap = {};
    orders.forEach(order => {
      orderMap[order._id.toString()] = order;
    });

    // Combine transaction and order data
    const earnings = transactions.map(transaction => {
      const order = transaction.orderId ? orderMap[transaction.orderId.toString()] : null;
      return {
        transactionId: transaction._id?.toString(),
        orderId: order?.orderId || transaction.orderId?.toString() || 'Unknown',
        restaurantName: order?.restaurantName || 'Unknown Restaurant',
        amount: transaction.amount || 0,
        description: transaction.description || '',
        deliveredAt: order?.deliveredAt || transaction.createdAt || transaction.processedAt,
        createdAt: transaction.createdAt || transaction.processedAt,
        paymentCollected: transaction.paymentCollected || false
      };
    });

    // Calculate pagination
    const totalEarnings = earnings.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedEarnings = earnings.slice(skip, skip + parseInt(limit));

    // Calculate summary statistics
    const totalAmount = earnings.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalOrders = earnings.length;
    
    // Calculate time on orders (difference between order creation and delivery)
    let totalTimeMinutes = 0;
    earnings.forEach(e => {
      // Find order by orderId string (e.orderId is string like "ORD-123-456")
      const order = orders.find(o => o.orderId === e.orderId);
      if (order && order.createdAt && order.deliveredAt) {
        const timeDiff = new Date(order.deliveredAt) - new Date(order.createdAt);
        totalTimeMinutes += Math.floor(timeDiff / (1000 * 60));
      }
    });

    const totalHours = Math.floor(totalTimeMinutes / 60);
    const totalMinutesRemainder = totalTimeMinutes % 60;

    // Calculate breakdown
    const orderEarning = totalAmount; // All payments are order earnings
    const incentive = 0; // Can be added from bonus transactions separately if needed
    const otherEarnings = 0; // Can include tips, bonuses, etc.

    return successResponse(res, 200, 'Earnings retrieved successfully', {
      earnings: paginatedEarnings,
      summary: {
        period,
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
        totalOrders,
        totalEarnings: totalAmount,
        totalHours,
        totalMinutes: totalMinutesRemainder,
        orderEarning,
        incentive,
        otherEarnings
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalEarnings,
        pages: Math.ceil(totalEarnings / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching delivery earnings: ${error.message}`, { stack: error.stack });
    return errorResponse(res, 500, 'Failed to fetch earnings');
  }
});

/**
 * Get Active Earning Addon Offers for Delivery Partner
 * GET /api/delivery/earnings/active-offers
 */
export const getActiveEarningAddons = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const now = new Date();

    // Get ALL active earning addons (not just those currently valid)
    // This includes offers that haven't started yet but are active
    const activeAddons = await EarningAddon.find({
      status: 'active',
      endDate: { $gte: now }, // Only show offers that haven't ended yet
      $or: [
        { maxRedemptions: null },
        { $expr: { $lt: ['$currentRedemptions', '$maxRedemptions'] } }
      ]
    })
      .select('title description requiredOrders earningAmount startDate endDate status maxRedemptions currentRedemptions createdAt')
      .sort({ createdAt: -1 }) // Get most recent first
      .lean();

    logger.info(`Found ${activeAddons.length} active earning addons for delivery partner ${delivery._id}`);

    // Check validity for each addon and add delivery partner's progress
    const addonsWithProgress = await Promise.all(
      activeAddons.map(async (addon) => {
        try {
          // Use the later of: offer creation date or offer start date
          const offerStartDate = new Date(addon.startDate);
          const offerCreatedAt = addon.createdAt ? new Date(addon.createdAt) : offerStartDate;
          // Count orders from when offer was created (or start date, whichever is later)
          const countFromDate = offerCreatedAt > offerStartDate ? offerCreatedAt : offerStartDate;
          const endDate = new Date(addon.endDate);
          
          // Calculate delivery partner's order count AFTER offer creation
          // Count orders from offer creation/start date to now (or end date if offer hasn't started)
          const countStartDate = now > countFromDate ? countFromDate : now;
          const orderCount = await Order.countDocuments({
            deliveryPartnerId: delivery._id,
            status: 'delivered',
            deliveredAt: {
              $gte: countStartDate,
              $lte: now > endDate ? endDate : now
            }
          }).catch(err => {
            logger.error(`Error counting orders for addon ${addon._id}:`, err);
            return 0;
          });

          // Check if delivery boy already redeemed this offer
          const redeemed = await EarningAddonHistory.findOne({
            earningAddonId: addon._id,
            deliveryPartnerId: delivery._id,
            status: 'credited'
          }).catch(err => {
            logger.error(`Error checking redemption for addon ${addon._id}:`, err);
            return null;
          });

          // Check if offer is currently valid (started and not ended)
          const isValid = addon.status === 'active' &&
            now >= offerStartDate &&
            now <= endDate &&
            (addon.maxRedemptions === null || addon.currentRedemptions < addon.maxRedemptions);

          // Check if offer is upcoming (not started yet)
          const isUpcoming = addon.status === 'active' && now < offerStartDate;

          return {
            ...addon,
            isValid,
            isUpcoming,
            currentOrders: orderCount || 0,
            progress: addon.requiredOrders > 0 ? Math.min((orderCount || 0) / addon.requiredOrders, 1) : 0,
            redeemed: !!redeemed,
            canRedeem: !redeemed && (orderCount || 0) >= addon.requiredOrders && isValid
          };
        } catch (addonError) {
          logger.error(`Error processing addon ${addon._id}:`, addonError);
          // Return addon with default values if processing fails
          return {
            ...addon,
            isValid: false,
            isUpcoming: false,
            currentOrders: 0,
            progress: 0,
            redeemed: false,
            canRedeem: false,
            error: 'Failed to process addon'
          };
        }
      })
    );

    logger.info(`Returning ${addonsWithProgress.length} offers with progress data`);

    return successResponse(res, 200, 'Active earning addons retrieved successfully', {
      activeOffers: addonsWithProgress
    });
  } catch (error) {
    logger.error(`Error fetching active earning addons: ${error.message}`, { stack: error.stack });
    return errorResponse(res, 500, 'Failed to fetch active earning addons');
  }
});


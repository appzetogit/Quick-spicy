import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Delivery from '../models/Delivery.js';
import DeliveryWallet from '../models/DeliveryWallet.js';
import Order from '../../order/models/Order.js';
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
 * Get Delivery Boy Dashboard Data
 * Returns wallet balance, stats, joining bonus status, and recent orders
 */
export const getDashboard = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery; // From authenticate middleware

    // Get order statistics
    // Note: deliveryPartnerId in Order model references User, but we'll use delivery._id
    // In future, this should be updated to reference Delivery model
    let totalOrders = 0;
    let completedOrders = 0;
    let pendingOrders = 0;

    try {
      totalOrders = await Order.countDocuments({ 
        deliveryPartnerId: delivery._id 
      });
    } catch (error) {
      logger.warn(`Error counting total orders for delivery ${delivery._id}:`, error);
    }

    try {
      completedOrders = await Order.countDocuments({ 
        deliveryPartnerId: delivery._id,
        status: 'delivered'
      });
    } catch (error) {
      logger.warn(`Error counting completed orders for delivery ${delivery._id}:`, error);
    }

    try {
      pendingOrders = await Order.countDocuments({ 
        deliveryPartnerId: delivery._id,
        status: { $in: ['out_for_delivery', 'ready'] }
      });
    } catch (error) {
      logger.warn(`Error counting pending orders for delivery ${delivery._id}:`, error);
    }

    // Calculate joining bonus status
    // Joining bonus: ₹100, unlocked after completing 1 order
    const joiningBonusAmount = 100;
    const joiningBonusUnlockThreshold = 1; // Complete 1 order to unlock
    const joiningBonusUnlocked = completedOrders >= joiningBonusUnlockThreshold;
    
    // Get wallet data (using new DeliveryWallet model)
    let wallet = null;
    try {
      wallet = await DeliveryWallet.findOne({ deliveryId: delivery._id });
    } catch (error) {
      logger.warn(`Error fetching wallet for dashboard:`, error);
    }
    
    const joiningBonusClaimed = wallet?.joiningBonusClaimed || false;
    const joiningBonusValidTill = new Date('2025-12-10'); // Valid till 10 December 2025

    // Calculate wallet balance (using new DeliveryWallet model)
    const walletBalance = wallet?.totalBalance || 0;
    const totalEarned = wallet?.totalEarned || delivery.earnings?.totalEarned || 0;
    const currentBalance = wallet?.totalBalance || delivery.earnings?.currentBalance || 0;
    const pendingPayout = wallet?.transactions
      ?.filter(t => t.type === 'withdrawal' && t.status === 'Pending')
      .reduce((sum, t) => sum + t.amount, 0) || delivery.earnings?.pendingPayout || 0;
    const tips = wallet?.transactions
      ?.filter(t => t.type === 'payment' && t.description?.toLowerCase().includes('tip'))
      .reduce((sum, t) => sum + t.amount, 0) || delivery.earnings?.tips || 0;

    // Calculate weekly earnings (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    let weeklyOrders = [];
    try {
      weeklyOrders = await Order.find({
        deliveryPartnerId: delivery._id,
        status: 'delivered',
        deliveredAt: { $gte: sevenDaysAgo }
      }).select('pricing.deliveryFee');
    } catch (error) {
      logger.warn(`Error fetching weekly orders for delivery ${delivery._id}:`, error);
    }

    const weeklyEarnings = weeklyOrders.reduce((sum, order) => {
      return sum + (order.pricing?.deliveryFee || 0);
    }, 0);

    // Get recent orders (last 5)
    let recentOrders = [];
    try {
      recentOrders = await Order.find({
        deliveryPartnerId: delivery._id
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('orderId status createdAt deliveredAt pricing.deliveryFee restaurantName')
        .lean();
    } catch (error) {
      logger.warn(`Error fetching recent orders for delivery ${delivery._id}:`, error);
    }

    // Calculate today's earnings
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    let todayOrders = [];
    try {
      todayOrders = await Order.find({
        deliveryPartnerId: delivery._id,
        status: 'delivered',
        deliveredAt: { $gte: todayStart }
      }).select('pricing.deliveryFee');
    } catch (error) {
      logger.warn(`Error fetching today's orders for delivery ${delivery._id}:`, error);
    }

    const todayEarnings = todayOrders.reduce((sum, order) => {
      return sum + (order.pricing?.deliveryFee || 0);
    }, 0);

    // Prepare dashboard data
    const dashboardData = {
      profile: {
        id: delivery._id,
        deliveryId: delivery.deliveryId,
        name: delivery.name,
        phone: delivery.phone,
        email: delivery.email,
        profileImage: delivery.profileImage?.url || null,
        status: delivery.status,
        level: delivery.level,
        rating: delivery.metrics?.rating || 0,
        ratingCount: delivery.metrics?.ratingCount || 0,
      },
      wallet: {
        balance: walletBalance,
        totalEarned: totalEarned,
        currentBalance: currentBalance,
        pendingPayout: pendingPayout,
        tips: tips,
        todayEarnings: todayEarnings,
        weeklyEarnings: weeklyEarnings,
      },
      stats: {
        totalOrders: totalOrders,
        completedOrders: completedOrders,
        pendingOrders: pendingOrders,
        cancelledOrders: delivery.metrics?.cancelledOrders || 0,
        onTimeDeliveryRate: delivery.metrics?.onTimeDeliveryRate || 0,
        averageDeliveryTime: delivery.metrics?.averageDeliveryTime || 0,
      },
      joiningBonus: {
        amount: joiningBonusAmount,
        unlocked: joiningBonusUnlocked,
        claimed: joiningBonusClaimed,
        unlockThreshold: joiningBonusUnlockThreshold,
        ordersCompleted: completedOrders,
        ordersRequired: joiningBonusUnlockThreshold,
        validTill: joiningBonusValidTill,
        message: joiningBonusUnlocked 
          ? (joiningBonusClaimed ? 'Bonus claimed' : 'Complete 1 order to unlock')
          : 'Complete 1 order to unlock',
      },
      recentOrders: recentOrders.map(order => ({
        orderId: order.orderId,
        status: order.status,
        restaurantName: order.restaurantName,
        deliveryFee: order.pricing?.deliveryFee || 0,
        createdAt: order.createdAt,
        deliveredAt: order.deliveredAt,
      })),
      availability: {
        isOnline: delivery.availability?.isOnline || false,
        lastLocationUpdate: delivery.availability?.lastLocationUpdate || null,
      }
    };

    logger.info(`Dashboard data retrieved for delivery: ${delivery._id}`, {
      deliveryId: delivery.deliveryId,
      totalOrders,
      completedOrders,
    });

    return successResponse(res, 200, 'Dashboard data retrieved successfully', dashboardData);
  } catch (error) {
    logger.error('Error fetching delivery dashboard:', error);
    return errorResponse(res, 500, 'Failed to fetch dashboard data');
  }
});

/**
 * Get Wallet Balance (DEPRECATED - Use /api/delivery/wallet instead)
 * Returns detailed wallet information
 * This endpoint is kept for backward compatibility
 */
export const getWalletBalance = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;

    // Use new DeliveryWallet model
    let wallet = await DeliveryWallet.findOne({ deliveryId: delivery._id });

    if (!wallet) {
      // Create wallet if doesn't exist
      wallet = await DeliveryWallet.create({
        deliveryId: delivery._id,
        totalBalance: 0,
        cashInHand: 0,
        totalWithdrawn: 0,
        totalEarned: 0
      });
    }

    const walletData = {
      balance: wallet.totalBalance || 0,
      totalEarned: wallet.totalEarned || 0,
      currentBalance: wallet.totalBalance || 0,
      pendingPayout: wallet.transactions
        .filter(t => t.type === 'withdrawal' && t.status === 'Pending')
        .reduce((sum, t) => sum + t.amount, 0),
      tips: wallet.transactions
        .filter(t => t.type === 'payment' && t.description?.toLowerCase().includes('tip'))
        .reduce((sum, t) => sum + t.amount, 0),
      transactions: wallet.transactions.slice(0, 10).map(t => ({
        id: t._id,
        amount: t.amount,
        type: t.type,
        status: t.status,
        description: t.description,
        date: t.createdAt
      })),
      joiningBonusClaimed: wallet.joiningBonusClaimed || false,
    };

    return successResponse(res, 200, 'Wallet balance retrieved successfully', walletData);
  } catch (error) {
    logger.error('Error fetching wallet balance:', error);
    return errorResponse(res, 500, 'Failed to fetch wallet balance');
  }
});

/**
 * Claim Joining Bonus (DEPRECATED - Use /api/delivery/wallet/claim-joining-bonus instead)
 * Claims the ₹100 joining bonus after completing first order
 * This endpoint is kept for backward compatibility and uses the new DeliveryWallet model
 */
export const claimJoiningBonus = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;

    // Use new DeliveryWallet model
    let wallet = await DeliveryWallet.findOrCreateByDeliveryId(delivery._id);

    // Check if already claimed
    if (wallet.joiningBonusClaimed) {
      return errorResponse(res, 400, 'Joining bonus already claimed');
    }

    // Check if bonus is unlocked (completed at least 1 order)
    let completedOrders = 0;
    try {
      completedOrders = await Order.countDocuments({ 
        deliveryPartnerId: delivery._id,
        status: 'delivered'
      });
    } catch (error) {
      logger.warn(`Error counting completed orders for joining bonus:`, error);
    }

    if (completedOrders < 1) {
      return errorResponse(res, 400, 'Complete at least 1 order to unlock joining bonus');
    }

    // Check if bonus is still valid
    const joiningBonusValidTill = new Date('2025-12-10');
    if (new Date() > joiningBonusValidTill) {
      return errorResponse(res, 400, 'Joining bonus has expired');
    }

    // Add bonus amount
    const bonusAmount = 100;

    // Add bonus transaction
    const transaction = wallet.addTransaction({
      amount: bonusAmount,
      type: 'bonus',
      status: 'Completed',
      description: 'Joining bonus - Complete first order reward'
    });

    // Update wallet
    wallet.joiningBonusClaimed = true;
    wallet.joiningBonusAmount = bonusAmount;
    await wallet.save();

    logger.info(`Joining bonus claimed for delivery: ${delivery._id}`, {
      deliveryId: delivery.deliveryId,
      bonusAmount,
      transactionId: transaction._id
    });

    return successResponse(res, 200, 'Joining bonus claimed successfully', {
      bonusAmount,
      wallet: {
        totalBalance: wallet.totalBalance,
        totalEarned: wallet.totalEarned,
        joiningBonusClaimed: wallet.joiningBonusClaimed
      },
      transaction: {
        id: transaction._id,
        amount: transaction.amount,
        type: transaction.type,
        status: transaction.status
      }
    });
  } catch (error) {
    logger.error('Error claiming joining bonus:', error);
    return errorResponse(res, 500, 'Failed to claim joining bonus');
  }
});

/**
 * Get Order Statistics
 * Returns detailed order statistics
 */
export const getOrderStats = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { period = 'all' } = req.query; // 'today', 'week', 'month', 'all'

    // Calculate date range based on period
    let startDate = null;
    const now = new Date();

    switch (period) {
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      default:
        startDate = null; // All time
    }

    // Build query
    const query = { deliveryPartnerId: delivery._id };
    if (startDate) {
      query.createdAt = { $gte: startDate };
    }

    // Get order counts
    const totalOrders = await Order.countDocuments(query);
    const completedOrders = await Order.countDocuments({ ...query, status: 'delivered' });
    const pendingOrders = await Order.countDocuments({ 
      ...query, 
      status: { $in: ['out_for_delivery', 'ready'] } 
    });
    const cancelledOrders = await Order.countDocuments({ ...query, status: 'cancelled' });

    // Calculate earnings
    let orders = [];
    try {
      orders = await Order.find({
        ...query,
        status: 'delivered'
      }).select('pricing.deliveryFee deliveredAt');
    } catch (error) {
      logger.warn(`Error fetching orders for stats:`, error);
    }

    const totalEarnings = orders.reduce((sum, order) => {
      return sum + (order.pricing?.deliveryFee || 0);
    }, 0);

    const stats = {
      period,
      totalOrders,
      completedOrders,
      pendingOrders,
      cancelledOrders,
      totalEarnings,
      averageEarningsPerOrder: completedOrders > 0 ? totalEarnings / completedOrders : 0,
      completionRate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0,
    };

    return successResponse(res, 200, 'Order statistics retrieved successfully', stats);
  } catch (error) {
    logger.error('Error fetching order statistics:', error);
    return errorResponse(res, 500, 'Failed to fetch order statistics');
  }
});


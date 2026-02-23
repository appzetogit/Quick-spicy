import RestaurantWallet from '../models/RestaurantWallet.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
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
 * Get Restaurant Wallet
 * GET /api/restaurant/wallet
 */
export const getWallet = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    
    if (!restaurant || !restaurant._id) {
      return errorResponse(res, 401, 'Restaurant authentication required');
    }

    // Find or create wallet
    const wallet = await RestaurantWallet.findOrCreateByRestaurantId(restaurant._id);

    // Get recent transactions (last 50)
    const recentTransactions = wallet.transactions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50)
      .map(t => ({
        id: t._id,
        amount: t.amount,
        type: t.type,
        status: t.status,
        description: t.description,
        orderId: t.orderId,
        createdAt: t.createdAt,
        processedAt: t.processedAt
      }));

    return successResponse(res, 200, 'Wallet retrieved successfully', {
      wallet: {
        totalBalance: wallet.totalBalance || 0,
        totalEarned: wallet.totalEarned || 0,
        totalWithdrawn: wallet.totalWithdrawn || 0,
        pendingBalance: (wallet.totalEarned || 0) - (wallet.totalWithdrawn || 0),
        isActive: wallet.isActive,
        lastTransactionAt: wallet.lastTransactionAt
      },
      transactions: recentTransactions
    });
  } catch (error) {
    logger.error(`Error fetching restaurant wallet: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch wallet');
  }
});

/**
 * Get Restaurant Wallet Transactions
 * GET /api/restaurant/wallet/transactions
 * Query params: page, limit, type, status
 */
export const getWalletTransactions = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { page = 1, limit = 20, type, status } = req.query;

    if (!restaurant || !restaurant._id) {
      return errorResponse(res, 401, 'Restaurant authentication required');
    }

    const wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id });

    if (!wallet) {
      return successResponse(res, 200, 'No transactions found', {
        transactions: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0
        }
      });
    }

    // Filter transactions
    let transactions = wallet.transactions || [];
    
    if (type) {
      transactions = transactions.filter(t => t.type === type);
    }
    
    if (status) {
      transactions = transactions.filter(t => t.status === status);
    }

    // Sort by date (newest first)
    transactions = transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Paginate
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedTransactions = transactions.slice(skip, skip + parseInt(limit));

    return successResponse(res, 200, 'Transactions retrieved successfully', {
      transactions: paginatedTransactions.map(t => ({
        id: t._id,
        amount: t.amount,
        type: t.type,
        status: t.status,
        description: t.description,
        orderId: t.orderId,
        createdAt: t.createdAt,
        processedAt: t.processedAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: transactions.length,
        pages: Math.ceil(transactions.length / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching wallet transactions: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch transactions');
  }
});

/**
 * Get Restaurant Wallet Stats
 * GET /api/restaurant/wallet/stats
 * Query params: startDate, endDate
 */
export const getWalletStats = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { startDate, endDate } = req.query;

    if (!restaurant || !restaurant._id) {
      return errorResponse(res, 401, 'Restaurant authentication required');
    }

    const wallet = await RestaurantWallet.findOne({ restaurantId: restaurant._id });

    if (!wallet) {
      return successResponse(res, 200, 'Wallet stats retrieved successfully', {
        totalEarned: 0,
        totalWithdrawn: 0,
        totalBalance: 0,
        periodEarnings: 0,
        periodWithdrawals: 0,
        periodOrders: 0
      });
    }

    // Filter transactions by date range if provided
    let transactions = wallet.transactions || [];
    
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      
      transactions = transactions.filter(t => {
        const tDate = new Date(t.createdAt);
        if (start && tDate < start) return false;
        if (end && tDate > end) return false;
        return true;
      });
    }

    // Calculate period stats
    const periodEarnings = transactions
      .filter(t => t.type === 'payment' && t.status === 'Completed')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const periodWithdrawals = transactions
      .filter(t => t.type === 'withdrawal' && t.status === 'Completed')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const periodOrders = transactions
      .filter(t => t.type === 'payment' && t.status === 'Completed')
      .length;

    return successResponse(res, 200, 'Wallet stats retrieved successfully', {
      totalEarned: wallet.totalEarned || 0,
      totalWithdrawn: wallet.totalWithdrawn || 0,
      totalBalance: wallet.totalBalance || 0,
      pendingBalance: (wallet.totalEarned || 0) - (wallet.totalWithdrawn || 0),
      periodEarnings,
      periodWithdrawals,
      periodOrders
    });
  } catch (error) {
    logger.error(`Error fetching wallet stats: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch wallet stats');
  }
});


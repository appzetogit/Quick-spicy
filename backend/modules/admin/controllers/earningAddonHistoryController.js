import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import EarningAddonHistory from '../models/EarningAddonHistory.js';
import EarningAddon from '../models/EarningAddon.js';
import Delivery from '../../delivery/models/Delivery.js';
import DeliveryWallet from '../../delivery/models/DeliveryWallet.js';
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
 * Get Earning Addon History
 * GET /api/admin/earning-addon-history
 */
export const getEarningAddonHistory = asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      deliveryPartnerId,
      earningAddonId,
      search,
      startDate,
      endDate,
      sortBy = 'completedAt',
      sortOrder = 'desc',
      debug = false
    } = req.query;

    // Debug: Check total records in database
    if (debug === 'true' || debug === '1') {
      const totalRecords = await EarningAddonHistory.countDocuments({});
      const recordsByStatus = await EarningAddonHistory.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);
      
      logger.info('🔍 DEBUG: Earning Addon History Statistics', {
        totalRecords,
        recordsByStatus,
        sampleRecords: await EarningAddonHistory.find({}).limit(3).lean()
      });
    }

    const query = {};

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by delivery partner
    if (deliveryPartnerId) {
      if (!mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        return errorResponse(res, 400, 'Invalid delivery partner ID');
      }
      query.deliveryPartnerId = deliveryPartnerId;
    }

    // Filter by earning addon
    if (earningAddonId) {
      if (!mongoose.Types.ObjectId.isValid(earningAddonId)) {
        return errorResponse(res, 400, 'Invalid earning addon ID');
      }
      query.earningAddonId = earningAddonId;
    }

    // Date range filter
    if (startDate || endDate) {
      query.completedAt = {};
      if (startDate) {
        query.completedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.completedAt.$lte = end;
      }
    }

    // Search filter (will be applied after population)
    let searchQuery = query;

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get total count first (before population for accurate count)
    const total = await EarningAddonHistory.countDocuments(query);
    
    logger.info(`Fetching earning addon history:`, {
      query,
      total,
      page,
      limit,
      skip
    });

    // Get history with population
    let history = await EarningAddonHistory.find(searchQuery)
      .populate('earningAddonId', 'title requiredOrders earningAmount startDate endDate')
      .populate('deliveryPartnerId', 'name deliveryId phone email')
      .populate('processedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    logger.info(`Found ${history.length} history records after query`);

    // Log if any records have null populated fields
    history.forEach((item, idx) => {
      if (!item.earningAddonId || !item.deliveryPartnerId) {
        logger.warn(`History record ${idx} has null populated fields:`, {
          _id: item._id,
          earningAddonId: item.earningAddonId,
          deliveryPartnerId: item.deliveryPartnerId,
          offerSnapshot: item.offerSnapshot
        });
      }
    });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      history = history.filter(item => {
        const deliveryName = item.deliveryPartnerId?.name || '';
        const deliveryId = item.deliveryPartnerId?.deliveryId || '';
        const phone = item.deliveryPartnerId?.phone || '';
        const offerTitle = item.earningAddonId?.title || '';
        return (
          deliveryName.toLowerCase().includes(searchLower) ||
          deliveryId.toLowerCase().includes(searchLower) ||
          phone.includes(search) ||
          offerTitle.toLowerCase().includes(searchLower)
        );
      });
    }

    // Format response - handle cases where populate might fail
    const formattedHistory = history.map((item, index) => {
      // Use offerSnapshot if earningAddonId is not populated
      const offerTitle = item.earningAddonId?.title || item.offerSnapshot?.title || 'Unknown Offer';
      const earningAddonId = item.earningAddonId?._id?.toString() || item.earningAddonId?.toString() || '';
      
      // Use delivery partner data or fallback
      const deliveryName = item.deliveryPartnerId?.name || 'Unknown Delivery Partner';
      const deliveryId = item.deliveryPartnerId?.deliveryId || 'N/A';
      const deliveryPhone = item.deliveryPartnerId?.phone || 'N/A';
      const deliveryPartnerId = item.deliveryPartnerId?._id?.toString() || item.deliveryPartnerId?.toString() || '';

      return {
        sl: skip + index + 1,
        _id: item._id,
        deliveryman: deliveryName,
        deliveryPartnerId: deliveryPartnerId,
        deliveryId: deliveryId,
        deliveryPhone: deliveryPhone,
        zone: item.metadata?.zone || 'N/A',
        totalEarning: item.earningAmount || 0,
        earningAmount: item.earningAmount || 0,
        incentive: item.earningAmount || 0, // For compatibility with frontend
        ordersCompleted: item.ordersCompleted || 0,
        ordersRequired: item.ordersRequired || 0,
        offerTitle: offerTitle,
        earningAddonId: earningAddonId,
        date: item.completedAt ? new Date(item.completedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        completedAt: item.completedAt,
        status: item.status || 'pending',
        transactionId: item.transactionId?.toString() || null,
        contributingOrders: item.contributingOrders || [],
        processedBy: item.processedBy?.name || null,
        processedAt: item.processedAt || null,
        notes: item.notes || null
      };
    });

    logger.info(`Formatted ${formattedHistory.length} history records for response`);

    logger.info(`Returning ${formattedHistory.length} history records (total: ${total})`);

    return successResponse(res, 200, 'Earning addon history retrieved successfully', {
      history: formattedHistory,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching earning addon history: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch earning addon history');
  }
});

/**
 * Get Earning Addon History by ID
 * GET /api/admin/earning-addon-history/:id
 */
export const getEarningAddonHistoryById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid history ID');
    }

    const history = await EarningAddonHistory.findById(id)
      .populate('earningAddonId')
      .populate('deliveryPartnerId', 'name deliveryId phone email profileImage')
      .populate('processedBy', 'name email')
      .lean();

    if (!history) {
      return errorResponse(res, 404, 'History record not found');
    }

    return successResponse(res, 200, 'History record retrieved successfully', {
      history
    });
  } catch (error) {
    logger.error(`Error fetching history record: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch history record');
  }
});

/**
 * Credit Earning to Delivery Partner Wallet
 * POST /api/admin/earning-addon-history/:id/credit
 */
export const creditEarningToWallet = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const adminId = req.user?._id || req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid history ID');
    }

    const history = await EarningAddonHistory.findById(id);
    if (!history) {
      return errorResponse(res, 404, 'History record not found');
    }

    if (history.status === 'credited') {
      return errorResponse(res, 400, 'Earning already credited');
    }

    if (history.status === 'cancelled') {
      return errorResponse(res, 400, 'Cannot credit cancelled earning');
    }

    // Find or create wallet
    let wallet = await DeliveryWallet.findOne({ deliveryId: history.deliveryPartnerId });
    if (!wallet) {
      wallet = await DeliveryWallet.create({
        deliveryId: history.deliveryPartnerId,
        totalBalance: 0,
        cashInHand: 0,
        totalWithdrawn: 0,
        totalEarned: 0
      });
    }

    // Add transaction to wallet
    wallet.addTransaction({
      amount: history.earningAmount,
      type: 'earning_addon',
      status: 'Completed',
      description: `Earning Addon: ${history.offerSnapshot?.title || 'Offer'}`,
      processedAt: new Date(),
      processedBy: adminId,
      metadata: {
        earningAddonId: history.earningAddonId.toString(),
        earningAddonHistoryId: history._id.toString(),
        ordersCompleted: history.ordersCompleted,
        ordersRequired: history.ordersRequired
      }
    });

    await wallet.save();

    // Get the last transaction
    const transactionsArray = wallet.transactions || [];
    const transaction = transactionsArray.length > 0 ? transactionsArray[transactionsArray.length - 1] : null;

    // Update history record
    history.status = 'credited';
    history.transactionId = transaction?._id;
    history.walletId = wallet._id;
    history.processedBy = adminId;
    history.processedAt = new Date();
    if (notes) {
      history.notes = notes;
    }
    await history.save();

    logger.info(`Earning credited to wallet: ${id} for delivery partner ${history.deliveryPartnerId}`);

    return successResponse(res, 200, 'Earning credited successfully', {
      history,
      transaction,
      wallet: {
        totalBalance: wallet.totalBalance,
        totalEarned: wallet.totalEarned
      }
    });
  } catch (error) {
    logger.error(`Error crediting earning: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, `Failed to credit earning: ${error.message}`);
  }
});

/**
 * Cancel Earning Addon History
 * PATCH /api/admin/earning-addon-history/:id/cancel
 */
export const cancelEarningAddonHistory = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user?._id || req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid history ID');
    }

    const history = await EarningAddonHistory.findById(id);
    if (!history) {
      return errorResponse(res, 404, 'History record not found');
    }

    if (history.status === 'credited') {
      return errorResponse(res, 400, 'Cannot cancel already credited earning');
    }

    if (history.status === 'cancelled') {
      return errorResponse(res, 400, 'Earning already cancelled');
    }

    history.status = 'cancelled';
    history.processedBy = adminId;
    history.processedAt = new Date();
    if (reason) {
      history.notes = reason;
    }
    await history.save();

    logger.info(`Earning addon history cancelled: ${id}`);

    return successResponse(res, 200, 'Earning cancelled successfully', {
      history
    });
  } catch (error) {
    logger.error(`Error cancelling earning: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to cancel earning');
  }
});

/**
 * Get Statistics for Earning Addon History
 * GET /api/admin/earning-addon-history/statistics
 */
export const getEarningAddonHistoryStatistics = asyncHandler(async (req, res) => {
  try {
    const { earningAddonId, startDate, endDate } = req.query;

    const matchStage = {};

    if (earningAddonId) {
      if (!mongoose.Types.ObjectId.isValid(earningAddonId)) {
        return errorResponse(res, 400, 'Invalid earning addon ID');
      }
      matchStage.earningAddonId = new mongoose.Types.ObjectId(earningAddonId);
    }

    if (startDate || endDate) {
      matchStage.completedAt = {};
      if (startDate) {
        matchStage.completedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchStage.completedAt.$lte = end;
      }
    }

    const [statusStats, totalEarnings, totalCompletions, recentCompletions] = await Promise.all([
      // Status statistics
      EarningAddonHistory.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$earningAmount' }
          }
        }
      ]),
      // Total earnings
      EarningAddonHistory.aggregate([
        { $match: { ...matchStage, status: 'credited' } },
        {
          $group: {
            _id: null,
            total: { $sum: '$earningAmount' }
          }
        }
      ]),
      // Total completions
      EarningAddonHistory.countDocuments(matchStage),
      // Recent completions (last 30 days)
      EarningAddonHistory.countDocuments({
        ...matchStage,
        completedAt: {
          $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      })
    ]);

    return successResponse(res, 200, 'Statistics retrieved successfully', {
      statistics: {
        statusBreakdown: statusStats,
        totalEarnings: totalEarnings[0]?.total || 0,
        totalCompletions,
        recentCompletions
      }
    });
  } catch (error) {
    logger.error(`Error fetching statistics: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch statistics');
  }
});


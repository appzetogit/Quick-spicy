import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import {
  getPendingRestaurantSettlements,
  getPendingDeliverySettlements,
  generateRestaurantSettlementReport,
  generateDeliverySettlementReport,
  markSettlementsAsProcessed
} from '../../order/services/settlementService.js';
import { getOrderSettlement } from '../../order/services/orderSettlementService.js';
import OrderSettlement from '../../order/models/OrderSettlement.js';
import AdminWallet from '../models/AdminWallet.js';
import AuditLog from '../models/AuditLog.js';

/**
 * Get order settlement details
 * GET /api/admin/settlements/order/:orderId
 */
export const getOrderSettlementDetails = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.params;
    const settlement = await getOrderSettlement(orderId);

    return successResponse(res, 200, 'Settlement details retrieved', {
      settlement
    });
  } catch (error) {
    console.error('Error getting settlement details:', error);
    return errorResponse(res, 500, 'Failed to get settlement details');
  }
});

/**
 * Get pending restaurant settlements
 * GET /api/admin/settlements/restaurants
 * Query params: restaurantId, startDate, endDate
 */
export const getRestaurantSettlements = asyncHandler(async (req, res) => {
  try {
    const { restaurantId, startDate, endDate } = req.query;
    
    const settlements = await getPendingRestaurantSettlements(
      restaurantId || null,
      startDate || null,
      endDate || null
    );

    // Calculate totals
    const totals = settlements.reduce((acc, s) => {
      acc.totalOrders += 1;
      acc.totalEarnings += s.restaurantEarning.netEarning;
      acc.totalCommission += s.restaurantEarning.commission;
      return acc;
    }, {
      totalOrders: 0,
      totalEarnings: 0,
      totalCommission: 0
    });

    return successResponse(res, 200, 'Restaurant settlements retrieved', {
      settlements,
      totals
    });
  } catch (error) {
    console.error('Error getting restaurant settlements:', error);
    return errorResponse(res, 500, 'Failed to get restaurant settlements');
  }
});

/**
 * Get pending delivery partner settlements
 * GET /api/admin/settlements/delivery
 * Query params: deliveryId, startDate, endDate
 */
export const getDeliverySettlements = asyncHandler(async (req, res) => {
  try {
    const { deliveryId, startDate, endDate } = req.query;
    
    const settlements = await getPendingDeliverySettlements(
      deliveryId || null,
      startDate || null,
      endDate || null
    );

    // Calculate totals
    const totals = settlements.reduce((acc, s) => {
      acc.totalOrders += 1;
      acc.totalEarnings += s.deliveryPartnerEarning.totalEarning;
      acc.totalDistance += s.deliveryPartnerEarning.distance || 0;
      return acc;
    }, {
      totalOrders: 0,
      totalEarnings: 0,
      totalDistance: 0
    });

    return successResponse(res, 200, 'Delivery settlements retrieved', {
      settlements,
      totals
    });
  } catch (error) {
    console.error('Error getting delivery settlements:', error);
    return errorResponse(res, 500, 'Failed to get delivery settlements');
  }
});

/**
 * Generate restaurant settlement report
 * GET /api/admin/settlements/restaurants/:restaurantId/report
 * Query params: startDate, endDate
 */
export const getRestaurantSettlementReport = asyncHandler(async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return errorResponse(res, 400, 'startDate and endDate are required');
    }

    const report = await generateRestaurantSettlementReport(
      restaurantId,
      startDate,
      endDate
    );

    return successResponse(res, 200, 'Settlement report generated', {
      report
    });
  } catch (error) {
    console.error('Error generating restaurant settlement report:', error);
    return errorResponse(res, 500, 'Failed to generate settlement report');
  }
});

/**
 * Generate delivery partner settlement report
 * GET /api/admin/settlements/delivery/:deliveryId/report
 * Query params: startDate, endDate
 */
export const getDeliverySettlementReport = asyncHandler(async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return errorResponse(res, 400, 'startDate and endDate are required');
    }

    const report = await generateDeliverySettlementReport(
      deliveryId,
      startDate,
      endDate
    );

    return successResponse(res, 200, 'Settlement report generated', {
      report
    });
  } catch (error) {
    console.error('Error generating delivery settlement report:', error);
    return errorResponse(res, 500, 'Failed to generate settlement report');
  }
});

/**
 * Mark settlements as processed (after payout)
 * POST /api/admin/settlements/mark-processed
 * Body: { settlementIds: [], actorType: 'admin', actorId: '' }
 */
export const markSettlementsProcessed = asyncHandler(async (req, res) => {
  try {
    const { settlementIds, actorType, actorId } = req.body;
    const adminId = req.admin?._id || actorId;

    if (!settlementIds || !Array.isArray(settlementIds) || settlementIds.length === 0) {
      return errorResponse(res, 400, 'settlementIds array is required');
    }

    const settlements = await markSettlementsAsProcessed(
      settlementIds,
      actorType || 'admin',
      adminId
    );

    // Create audit log
    await AuditLog.createLog({
      entityType: 'settlement',
      entityId: adminId,
      action: 'mark_settlements_processed',
      actionType: 'update',
      performedBy: {
        type: 'admin',
        userId: adminId,
        name: req.admin?.name || 'Admin'
      },
      description: `Marked ${settlementIds.length} settlements as processed`,
      metadata: {
        settlementIds: settlementIds
      }
    });

    return successResponse(res, 200, 'Settlements marked as processed', {
      count: settlements.length,
      settlements
    });
  } catch (error) {
    console.error('Error marking settlements as processed:', error);
    return errorResponse(res, 500, 'Failed to mark settlements as processed');
  }
});

/**
 * Get admin wallet summary
 * GET /api/admin/settlements/admin-wallet
 */
export const getAdminWalletSummary = asyncHandler(async (req, res) => {
  try {
    const wallet = await AdminWallet.findOrCreate();

    // Get recent transactions
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
        createdAt: t.createdAt
      }));

    return successResponse(res, 200, 'Admin wallet summary retrieved', {
      wallet: {
        totalBalance: wallet.totalBalance,
        totalCommission: wallet.totalCommission,
        totalPlatformFee: wallet.totalPlatformFee,
        totalDeliveryFee: wallet.totalDeliveryFee,
        totalGST: wallet.totalGST,
        totalWithdrawn: wallet.totalWithdrawn,
        pendingBalance: wallet.totalBalance - wallet.totalWithdrawn
      },
      recentTransactions
    });
  } catch (error) {
    console.error('Error getting admin wallet summary:', error);
    return errorResponse(res, 500, 'Failed to get admin wallet summary');
  }
});

/**
 * Get settlement statistics
 * GET /api/admin/settlements/statistics
 * Query params: startDate, endDate
 */
export const getSettlementStatistics = asyncHandler(async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const query = {
      settlementStatus: 'completed'
    };

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const settlements = await OrderSettlement.find(query).lean();

    const stats = {
      totalOrders: settlements.length,
      totalUserPayments: settlements.reduce((sum, s) => sum + s.userPayment.total, 0),
      totalRestaurantEarnings: settlements.reduce((sum, s) => sum + s.restaurantEarning.netEarning, 0),
      totalDeliveryEarnings: settlements.reduce((sum, s) => sum + (s.deliveryPartnerEarning.totalEarning || 0), 0),
      totalAdminEarnings: settlements.reduce((sum, s) => sum + s.adminEarning.totalEarning, 0),
      totalCommission: settlements.reduce((sum, s) => sum + s.restaurantEarning.commission, 0),
      totalPlatformFee: settlements.reduce((sum, s) => sum + s.userPayment.platformFee, 0),
      totalDeliveryFee: settlements.reduce((sum, s) => sum + s.userPayment.deliveryFee, 0),
      totalGST: settlements.reduce((sum, s) => sum + s.userPayment.gst, 0)
    };

    return successResponse(res, 200, 'Settlement statistics retrieved', {
      statistics: stats,
      period: startDate && endDate ? { startDate, endDate } : 'all_time'
    });
  } catch (error) {
    console.error('Error getting settlement statistics:', error);
    return errorResponse(res, 500, 'Failed to get settlement statistics');
  }
});


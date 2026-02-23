import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import AuditLog from '../models/AuditLog.js';

/**
 * Get audit logs
 * GET /api/admin/audit-logs
 * Query params: entityType, entityId, actionType, startDate, endDate, page, limit
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  try {
    const {
      entityType,
      entityId,
      actionType,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const query = {};

    if (entityType) {
      query.entityType = entityType;
    }

    if (entityId) {
      query.entityId = entityId;
    }

    if (actionType) {
      query.actionType = actionType;
    }

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AuditLog.countDocuments(query)
    ]);

    return successResponse(res, 200, 'Audit logs retrieved', {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting audit logs:', error);
    return errorResponse(res, 500, 'Failed to get audit logs');
  }
});

/**
 * Get audit log by ID
 * GET /api/admin/audit-logs/:id
 */
export const getAuditLogById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const log = await AuditLog.findById(id).lean();

    if (!log) {
      return errorResponse(res, 404, 'Audit log not found');
    }

    return successResponse(res, 200, 'Audit log retrieved', {
      log
    });
  } catch (error) {
    console.error('Error getting audit log:', error);
    return errorResponse(res, 500, 'Failed to get audit log');
  }
});

/**
 * Get audit logs for an entity
 * GET /api/admin/audit-logs/entity/:entityType/:entityId
 */
export const getEntityAuditLogs = asyncHandler(async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find({
        entityType,
        entityId
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AuditLog.countDocuments({
        entityType,
        entityId
      })
    ]);

    return successResponse(res, 200, 'Entity audit logs retrieved', {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting entity audit logs:', error);
    return errorResponse(res, 500, 'Failed to get entity audit logs');
  }
});

/**
 * Get commission change audit logs
 * GET /api/admin/audit-logs/commission-changes
 * Query params: restaurantId, startDate, endDate
 */
export const getCommissionChangeLogs = asyncHandler(async (req, res) => {
  try {
    const { restaurantId, startDate, endDate } = req.query;

    const query = {
      actionType: 'commission_change'
    };

    if (restaurantId) {
      query['commissionChange.restaurantId'] = restaurantId;
    }

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return successResponse(res, 200, 'Commission change logs retrieved', {
      logs
    });
  } catch (error) {
    console.error('Error getting commission change logs:', error);
    return errorResponse(res, 500, 'Failed to get commission change logs');
  }
});


import BusinessSettings from '../models/BusinessSettings.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';

/**
 * Get Delivery Partner global cash limit and withdrawal limit
 * GET /api/admin/delivery-cash-limit
 */
export const getDeliveryCashLimit = asyncHandler(async (req, res) => {
  try {
    const settings = await BusinessSettings.getSettings();
    return successResponse(res, 200, 'Delivery cash limit retrieved successfully', {
      deliveryCashLimit: Number(settings?.deliveryCashLimit) || 0,
      deliveryWithdrawalLimit: Number(settings?.deliveryWithdrawalLimit) ?? 100
    });
  } catch (error) {
    console.error('Error fetching delivery cash limit:', error);
    return errorResponse(res, 500, 'Failed to fetch delivery cash limit');
  }
});

/**
 * Update Delivery Partner global cash limit and/or withdrawal limit
 * PUT /api/admin/delivery-cash-limit
 * Body: { deliveryCashLimit?: number, deliveryWithdrawalLimit?: number }
 */
export const updateDeliveryCashLimit = asyncHandler(async (req, res) => {
  try {
    const { deliveryCashLimit, deliveryWithdrawalLimit } = req.body;

    let settings = await BusinessSettings.findOne();
    if (!settings) settings = await BusinessSettings.getSettings();

    if (deliveryCashLimit !== undefined) {
      const parsed = Number(deliveryCashLimit);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return errorResponse(res, 400, 'deliveryCashLimit must be a number (>= 0)');
      }
      settings.deliveryCashLimit = parsed;
    }

    if (deliveryWithdrawalLimit !== undefined) {
      const parsed = Number(deliveryWithdrawalLimit);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return errorResponse(res, 400, 'deliveryWithdrawalLimit must be a number (>= 0)');
      }
      settings.deliveryWithdrawalLimit = parsed;
    }

    if (req.admin && req.admin._id) {
      settings.updatedBy = req.admin._id;
    }

    await settings.save();

    return successResponse(res, 200, 'Delivery cash limit updated successfully', {
      deliveryCashLimit: Number(settings.deliveryCashLimit) || 0,
      deliveryWithdrawalLimit: Number(settings.deliveryWithdrawalLimit) ?? 100
    });
  } catch (error) {
    console.error('Error updating delivery cash limit:', error);
    return errorResponse(res, 500, 'Failed to update delivery cash limit');
  }
});


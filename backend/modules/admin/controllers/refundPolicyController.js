import RefundPolicy from '../models/RefundPolicy.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

/**
 * Get Refund Policy (Public)
 * GET /api/refund/public
 */
export const getRefundPublic = asyncHandler(async (req, res) => {
  try {
    const refund = await RefundPolicy.findOne({ isActive: true })
      .select('-updatedBy -createdAt -updatedAt -__v')
      .lean();

    if (!refund) {
      return successResponse(res, 200, 'Refund policy retrieved successfully', {
        title: 'Refund Policy',
        content: '<p>No refund policy available at the moment.</p>'
      });
    }

    return successResponse(res, 200, 'Refund policy retrieved successfully', refund);
  } catch (error) {
    console.error('Error fetching refund policy:', error);
    return errorResponse(res, 500, 'Failed to fetch refund policy');
  }
});

/**
 * Get Refund Policy (Admin)
 * GET /api/admin/refund
 */
export const getRefund = asyncHandler(async (req, res) => {
  try {
    let refund = await RefundPolicy.findOne({ isActive: true }).lean();

    if (!refund) {
      refund = await RefundPolicy.create({
        title: 'Refund Policy',
        content: '<p>Stack Food is a complete Multi-vendor Food products delivery system developed with powerful admin panel will help you to control your business smartly.</p>',
        updatedBy: req.admin._id
      });
    }

    return successResponse(res, 200, 'Refund policy retrieved successfully', refund);
  } catch (error) {
    console.error('Error fetching refund policy:', error);
    return errorResponse(res, 500, 'Failed to fetch refund policy');
  }
});

/**
 * Update Refund Policy
 * PUT /api/admin/refund
 */
export const updateRefund = asyncHandler(async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!content) {
      return errorResponse(res, 400, 'Content is required');
    }

    let refund = await RefundPolicy.findOne({ isActive: true });

    if (!refund) {
      refund = new RefundPolicy({
        title: title || 'Refund Policy',
        content,
        updatedBy: req.admin._id
      });
    } else {
      if (title !== undefined) refund.title = title;
      refund.content = content;
      refund.updatedBy = req.admin._id;
    }

    await refund.save();

    return successResponse(res, 200, 'Refund policy updated successfully', refund);
  } catch (error) {
    console.error('Error updating refund policy:', error);
    return errorResponse(res, 500, 'Failed to update refund policy');
  }
});


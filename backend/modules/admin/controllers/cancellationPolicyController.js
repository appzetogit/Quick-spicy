import CancellationPolicy from '../models/CancellationPolicy.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

/**
 * Get Cancellation Policy (Public)
 * GET /api/cancellation/public
 */
export const getCancellationPublic = asyncHandler(async (req, res) => {
  try {
    const cancellation = await CancellationPolicy.findOne({ isActive: true })
      .select('-updatedBy -createdAt -updatedAt -__v')
      .lean();

    if (!cancellation) {
      return successResponse(res, 200, 'Cancellation policy retrieved successfully', {
        title: 'Cancellation Policy',
        content: '<p>No cancellation policy available at the moment.</p>'
      });
    }

    return successResponse(res, 200, 'Cancellation policy retrieved successfully', cancellation);
  } catch (error) {
    console.error('Error fetching cancellation policy:', error);
    return errorResponse(res, 500, 'Failed to fetch cancellation policy');
  }
});

/**
 * Get Cancellation Policy (Admin)
 * GET /api/admin/cancellation
 */
export const getCancellation = asyncHandler(async (req, res) => {
  try {
    let cancellation = await CancellationPolicy.findOne({ isActive: true }).lean();

    if (!cancellation) {
      cancellation = await CancellationPolicy.create({
        title: 'Cancellation Policy',
        content: '<p>This is a demo cancellation policy. Please update with your actual cancellation terms and conditions.</p>',
        updatedBy: req.admin._id
      });
    }

    return successResponse(res, 200, 'Cancellation policy retrieved successfully', cancellation);
  } catch (error) {
    console.error('Error fetching cancellation policy:', error);
    return errorResponse(res, 500, 'Failed to fetch cancellation policy');
  }
});

/**
 * Update Cancellation Policy
 * PUT /api/admin/cancellation
 */
export const updateCancellation = asyncHandler(async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!content) {
      return errorResponse(res, 400, 'Content is required');
    }

    let cancellation = await CancellationPolicy.findOne({ isActive: true });

    if (!cancellation) {
      cancellation = new CancellationPolicy({
        title: title || 'Cancellation Policy',
        content,
        updatedBy: req.admin._id
      });
    } else {
      if (title !== undefined) cancellation.title = title;
      cancellation.content = content;
      cancellation.updatedBy = req.admin._id;
    }

    await cancellation.save();

    return successResponse(res, 200, 'Cancellation policy updated successfully', cancellation);
  } catch (error) {
    console.error('Error updating cancellation policy:', error);
    return errorResponse(res, 500, 'Failed to update cancellation policy');
  }
});


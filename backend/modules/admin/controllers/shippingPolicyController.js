import ShippingPolicy from '../models/ShippingPolicy.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

/**
 * Get Shipping Policy (Public)
 * GET /api/shipping/public
 */
export const getShippingPublic = asyncHandler(async (req, res) => {
  try {
    const shipping = await ShippingPolicy.findOne({ isActive: true })
      .select('-updatedBy -createdAt -updatedAt -__v')
      .lean();

    if (!shipping) {
      return successResponse(res, 200, 'Shipping policy retrieved successfully', {
        title: 'Shipping Policy',
        content: '<p>No shipping policy available at the moment.</p>'
      });
    }

    return successResponse(res, 200, 'Shipping policy retrieved successfully', shipping);
  } catch (error) {
    console.error('Error fetching shipping policy:', error);
    return errorResponse(res, 500, 'Failed to fetch shipping policy');
  }
});

/**
 * Get Shipping Policy (Admin)
 * GET /api/admin/shipping
 */
export const getShipping = asyncHandler(async (req, res) => {
  try {
    let shipping = await ShippingPolicy.findOne({ isActive: true }).lean();

    if (!shipping) {
      shipping = await ShippingPolicy.create({
        title: 'Shipping Policy',
        content: '<p>This is a demo shipping policy. Please update with your actual shipping terms and conditions.</p>',
        updatedBy: req.admin._id
      });
    }

    return successResponse(res, 200, 'Shipping policy retrieved successfully', shipping);
  } catch (error) {
    console.error('Error fetching shipping policy:', error);
    return errorResponse(res, 500, 'Failed to fetch shipping policy');
  }
});

/**
 * Update Shipping Policy
 * PUT /api/admin/shipping
 */
export const updateShipping = asyncHandler(async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!content) {
      return errorResponse(res, 400, 'Content is required');
    }

    let shipping = await ShippingPolicy.findOne({ isActive: true });

    if (!shipping) {
      shipping = new ShippingPolicy({
        title: title || 'Shipping Policy',
        content,
        updatedBy: req.admin._id
      });
    } else {
      if (title !== undefined) shipping.title = title;
      shipping.content = content;
      shipping.updatedBy = req.admin._id;
    }

    await shipping.save();

    return successResponse(res, 200, 'Shipping policy updated successfully', shipping);
  } catch (error) {
    console.error('Error updating shipping policy:', error);
    return errorResponse(res, 500, 'Failed to update shipping policy');
  }
});


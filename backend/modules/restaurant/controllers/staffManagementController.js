import StaffManagement from '../models/StaffManagement.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import { uploadToCloudinary } from '../../../shared/utils/cloudinaryService.js';

/**
 * Add a new staff/manager
 * POST /api/restaurant/staff
 */
export const addStaff = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const { name, phone, email, role } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return errorResponse(res, 400, 'Name is required');
    }

    if (!phone && !email) {
      return errorResponse(res, 400, 'Either phone or email is required');
    }

    if (!role || !['manager', 'staff'].includes(role)) {
      return errorResponse(res, 400, 'Valid role (manager or staff) is required');
    }

    // Check if user already exists for this restaurant
    const existingStaff = await StaffManagement.findOne({
      restaurantId,
      $or: [
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email: email.toLowerCase() }] : [])
      ],
      status: { $ne: 'removed' }
    });

    if (existingStaff) {
      return errorResponse(res, 409, 'A staff member with this phone or email already exists');
    }

    // Handle profile image upload if provided
    let profileImage = null;
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, {
          folder: `appzeto/restaurant/staff/${restaurantId}`,
          resource_type: 'image',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' }
          ]
        });

        profileImage = {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id
        };
      } catch (uploadError) {
        console.error('Error uploading profile image:', uploadError);
        return errorResponse(res, 500, 'Failed to upload profile image');
      }
    }

    // Create new staff member
    const staff = new StaffManagement({
      restaurantId,
      name: name.trim(),
      phone: phone || null,
      email: email ? email.toLowerCase().trim() : null,
      role,
      addedBy: restaurantId,
      status: 'active',
      profileImage: profileImage
    });

    await staff.save();

    return successResponse(res, 201, 'Staff member added successfully', {
      staff: {
        id: staff._id,
        name: staff.name,
        phone: staff.phone,
        email: staff.email,
        role: staff.role,
        status: staff.status,
        profileImage: staff.profileImage,
        addedAt: staff.addedAt
      }
    });
  } catch (error) {
    console.error('Error adding staff:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return errorResponse(res, 409, 'A staff member with this phone or email already exists');
    }
    
    return errorResponse(res, 500, 'Failed to add staff member');
  }
});

/**
 * Get all staff/manager for a restaurant
 * GET /api/restaurant/staff
 */
export const getStaff = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const { role } = req.query; // Optional filter by role

    const query = {
      restaurantId,
      status: { $ne: 'removed' } // Only get active and inactive, not removed
    };

    if (role && ['manager', 'staff'].includes(role)) {
      query.role = role;
    }

    const staff = await StaffManagement.find(query)
      .select('-__v')
      .sort({ addedAt: -1 })
      .lean();

    return successResponse(res, 200, 'Staff retrieved successfully', {
      staff,
      total: staff.length
    });
  } catch (error) {
    console.error('Error fetching staff:', error);
    return errorResponse(res, 500, 'Failed to fetch staff');
  }
});

/**
 * Get a single staff member by ID
 * GET /api/restaurant/staff/:id
 */
export const getStaffById = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const { id } = req.params;

    const staff = await StaffManagement.findOne({
      _id: id,
      restaurantId,
      status: { $ne: 'removed' }
    }).lean();

    if (!staff) {
      return errorResponse(res, 404, 'Staff member not found');
    }

    return successResponse(res, 200, 'Staff member retrieved successfully', {
      staff
    });
  } catch (error) {
    console.error('Error fetching staff member:', error);
    return errorResponse(res, 500, 'Failed to fetch staff member');
  }
});

/**
 * Update a staff member
 * PUT /api/restaurant/staff/:id
 */
export const updateStaff = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const { id } = req.params;
    const { name, phone, email, role, status } = req.body;

    const staff = await StaffManagement.findOne({
      _id: id,
      restaurantId
    });

    if (!staff) {
      return errorResponse(res, 404, 'Staff member not found');
    }

    // Update fields if provided
    if (name !== undefined) {
      staff.name = name.trim();
    }
    if (phone !== undefined) {
      staff.phone = phone || null;
    }
    if (email !== undefined) {
      staff.email = email ? email.toLowerCase().trim() : null;
    }
    if (role !== undefined && ['manager', 'staff'].includes(role)) {
      staff.role = role;
    }
    if (status !== undefined && ['active', 'inactive', 'removed'].includes(status)) {
      staff.status = status;
    }

    await staff.save();

    return successResponse(res, 200, 'Staff member updated successfully', {
      staff: {
        id: staff._id,
        name: staff.name,
        phone: staff.phone,
        email: staff.email,
        role: staff.role,
        status: staff.status
      }
    });
  } catch (error) {
    console.error('Error updating staff member:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return errorResponse(res, 409, 'A staff member with this phone or email already exists');
    }
    
    return errorResponse(res, 500, 'Failed to update staff member');
  }
});

/**
 * Delete/Remove a staff member
 * DELETE /api/restaurant/staff/:id
 */
export const deleteStaff = asyncHandler(async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const { id } = req.params;

    const staff = await StaffManagement.findOne({
      _id: id,
      restaurantId
    });

    if (!staff) {
      return errorResponse(res, 404, 'Staff member not found');
    }

    // Soft delete - set status to 'removed'
    staff.status = 'removed';
    await staff.save();

    return successResponse(res, 200, 'Staff member removed successfully');
  } catch (error) {
    console.error('Error deleting staff member:', error);
    return errorResponse(res, 500, 'Failed to remove staff member');
  }
});


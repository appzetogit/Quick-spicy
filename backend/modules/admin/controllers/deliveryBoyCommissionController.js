import DeliveryBoyCommission from '../models/DeliveryBoyCommission.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import mongoose from 'mongoose';

/**
 * Get all commission rules
 * GET /api/admin/delivery-boy-commission
 * Query params: status, search, page, limit
 */
export const getCommissionRules = asyncHandler(async (req, res) => {
  try {
    const { 
      status,
      search,
      page = 1,
      limit = 100
    } = req.query;

    // Build query
    const query = {};

    // Status filter
    if (status !== undefined) {
      query.status = status === 'true' || status === true;
    }

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } }
      ];
      
      // Also search by distance if it's a number
      const searchNumber = parseFloat(search);
      if (!isNaN(searchNumber)) {
        query.$or.push(
          { minDistance: searchNumber },
          { maxDistance: searchNumber }
        );
      }
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Get total count
    const total = await DeliveryBoyCommission.countDocuments(query);

    // Get commission rules sorted by minDistance
    const commissions = await DeliveryBoyCommission.find(query)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ minDistance: 1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Add serial numbers
    const commissionsWithSl = commissions.map((commission, index) => ({
      ...commission,
      sl: skip + index + 1
    }));

    return successResponse(res, 200, 'Commission rules retrieved successfully', {
      commissions: commissionsWithSl,
      pagination: {
        total,
        page: parseInt(page),
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching commission rules:', error);
    return errorResponse(res, 500, 'Failed to fetch commission rules');
  }
});

/**
 * Get commission rule by ID
 * GET /api/admin/delivery-boy-commission/:id
 */
export const getCommissionRuleById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid commission rule ID');
    }

    const commission = await DeliveryBoyCommission.findById(id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .lean();

    if (!commission) {
      return errorResponse(res, 404, 'Commission rule not found');
    }

    return successResponse(res, 200, 'Commission rule retrieved successfully', { commission });
  } catch (error) {
    console.error('Error fetching commission rule:', error);
    return errorResponse(res, 500, 'Failed to fetch commission rule');
  }
});

/**
 * Create new commission rule
 * POST /api/admin/delivery-boy-commission
 */
export const createCommissionRule = asyncHandler(async (req, res) => {
  try {
    const { name, minDistance, maxDistance, commissionPerKm, basePayout, status } = req.body;
    
    // Check if admin is authenticated
    if (!req.admin || !req.admin._id) {
      console.error('Admin authentication missing:', { hasAdmin: !!req.admin, hasId: !!req.admin?._id });
      return errorResponse(res, 401, 'Admin authentication required');
    }
    
    const adminId = req.admin._id;
    
    // Validate adminId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      console.error('Invalid admin ID:', adminId);
      return errorResponse(res, 400, 'Invalid admin ID');
    }

    // Validation
    if (!name || !name.trim()) {
      return errorResponse(res, 400, 'Name is required');
    }

    if (minDistance === undefined || minDistance < 0) {
      return errorResponse(res, 400, 'Minimum distance must be 0 or greater');
    }

    if (maxDistance !== null && maxDistance !== undefined) {
      if (maxDistance <= minDistance) {
        return errorResponse(res, 400, 'Maximum distance must be greater than minimum distance');
      }
    }

    if (commissionPerKm === undefined || commissionPerKm === null || commissionPerKm < 0) {
      return errorResponse(res, 400, 'Commission per km must be 0 or greater');
    }

    if (basePayout === undefined || basePayout < 0) {
      return errorResponse(res, 400, 'Base payout must be 0 or greater');
    }

    // Check for overlapping ranges
    const existingRules = await DeliveryBoyCommission.find({ status: true });
    const newMinDist = parseFloat(minDistance);
    const newMaxDist = maxDistance === null || maxDistance === undefined ? null : parseFloat(maxDistance);

    console.log('Checking for overlaps:', {
      newRange: { min: newMinDist, max: newMaxDist },
      existingRulesCount: existingRules.length
    });

    for (const rule of existingRules) {
      const ruleMin = parseFloat(rule.minDistance);
      const ruleMax = rule.maxDistance === null ? null : parseFloat(rule.maxDistance);

      console.log('Comparing with rule:', {
        name: rule.name,
        ruleRange: { min: ruleMin, max: ruleMax },
        newRange: { min: newMinDist, max: newMaxDist }
      });

      // Check for overlap - two ranges overlap if they share any common distance
      // Range A: [newMinDist, newMaxDist] (or [newMinDist, Infinity) if newMaxDist is null)
      // Range B: [ruleMin, ruleMax] (or [ruleMin, Infinity) if ruleMax is null)
      
      let overlaps = false;
      
      if (newMaxDist === null && ruleMax === null) {
        // Both are unlimited - they overlap if min distances are compatible
        overlaps = true; // Both cover everything from their min, so they overlap
      } else if (newMaxDist === null) {
        // New range is unlimited, overlaps if it starts before or at rule's end
        overlaps = newMinDist <= ruleMax;
      } else if (ruleMax === null) {
        // Existing rule is unlimited, overlaps if it starts before or at new range's end
        overlaps = ruleMin <= newMaxDist;
      } else {
        // Both have finite ranges - check if they overlap
        // Ranges overlap if: newMinDist < ruleMax && ruleMin < newMaxDist
        // But we want to allow adjacent ranges (e.g., 0-2 and 2-5 should NOT overlap)
        // So we use <= for one side to allow exact boundaries
        overlaps = newMinDist < ruleMax && ruleMin < newMaxDist;
      }

      if (overlaps) {
        const ruleRangeStr = ruleMax === null 
          ? `${ruleMin}km - Unlimited` 
          : `${ruleMin}km - ${ruleMax}km`;
        const newRangeStr = newMaxDist === null 
          ? `${newMinDist}km - Unlimited` 
          : `${newMinDist}km - ${newMaxDist}km`;
        
        console.log('Overlap detected!', {
          existingRule: rule.name,
          existingRange: ruleRangeStr,
          newRange: newRangeStr
        });
        
        return errorResponse(
          res,
          400,
          `Distance range overlaps with existing rule "${rule.name}" (${ruleRangeStr}). Your range: ${newRangeStr}`
        );
      }
    }

    // Create commission rule
    const commissionData = {
      name: name.trim(),
      minDistance: parseFloat(minDistance),
      maxDistance: newMaxDist,
      commissionPerKm: parseFloat(commissionPerKm),
      basePayout: parseFloat(basePayout),
      status: status !== undefined ? status : true,
      createdBy: new mongoose.Types.ObjectId(adminId)
    };
    
    console.log('Creating commission with data:', {
      ...commissionData,
      createdBy: commissionData.createdBy.toString()
    });
    
    const commission = new DeliveryBoyCommission(commissionData);

    try {
      await commission.save();
      console.log('Commission saved successfully:', commission._id);
    } catch (saveError) {
      console.error('Error saving commission to database:', saveError);
      console.error('Save error details:', {
        name: saveError.name,
        message: saveError.message,
        errors: saveError.errors,
        code: saveError.code
      });
      throw saveError; // Re-throw to be caught by outer catch
    }

    // Try to populate, but handle errors gracefully
    let populatedCommission;
    try {
      populatedCommission = await DeliveryBoyCommission.findById(commission._id)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .lean();
    } catch (populateError) {
      console.warn('Error populating commission:', populateError);
      // If populate fails, return the commission without populated fields
      populatedCommission = commission.toObject ? commission.toObject() : commission;
    }

    return successResponse(res, 201, 'Commission rule created successfully', { commission: populatedCommission });
  } catch (error) {
    console.error('❌ Error creating commission rule:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    console.error('Admin ID:', req.admin?._id);
    console.error('Admin object:', req.admin ? { _id: req.admin._id, name: req.admin.name, email: req.admin.email } : 'null');
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(e => e.message).join(', ');
      console.error('Validation errors:', validationErrors);
      return errorResponse(res, 400, `Validation error: ${validationErrors}`);
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      console.error('Duplicate key error:', error.keyPattern);
      return errorResponse(res, 400, 'A commission rule with this name already exists');
    }
    
    // Handle cast errors
    if (error.name === 'CastError') {
      console.error('Cast error:', error.path, error.value);
      return errorResponse(res, 400, `Invalid value for ${error.path}: ${error.value}`);
    }
    
    // Generic error - return detailed message in development
    const errorMsg = process.env.NODE_ENV === 'development' 
      ? `Failed to create commission rule: ${error.message}` 
      : 'Failed to create commission rule. Please check server logs for details.';
    
    console.error('Returning error response:', errorMsg);
    return errorResponse(res, 500, errorMsg);
  }
});

/**
 * Update commission rule
 * PUT /api/admin/delivery-boy-commission/:id
 */
export const updateCommissionRule = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, minDistance, maxDistance, commissionPerKm, basePayout, status } = req.body;
    const adminId = req.admin._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid commission rule ID');
    }

    const commission = await DeliveryBoyCommission.findById(id);
    if (!commission) {
      return errorResponse(res, 404, 'Commission rule not found');
    }

    // Validation
    if (name !== undefined && !name.trim()) {
      return errorResponse(res, 400, 'Name cannot be empty');
    }

    const newMinDist = minDistance !== undefined ? parseFloat(minDistance) : commission.minDistance;
    const newMaxDist = maxDistance !== undefined 
      ? (maxDistance === null ? null : parseFloat(maxDistance))
      : commission.maxDistance;

    if (minDistance !== undefined && newMinDist < 0) {
      return errorResponse(res, 400, 'Minimum distance must be 0 or greater');
    }

    if (maxDistance !== undefined && newMaxDist !== null && newMaxDist <= newMinDist) {
      return errorResponse(res, 400, 'Maximum distance must be greater than minimum distance');
    }

    if (commissionPerKm !== undefined && commissionPerKm < 0) {
      return errorResponse(res, 400, 'Commission per km must be 0 or greater');
    }

    if (basePayout !== undefined && basePayout < 0) {
      return errorResponse(res, 400, 'Base payout must be 0 or greater');
    }

    // Check for overlapping ranges (excluding current rule)
    const existingRules = await DeliveryBoyCommission.find({ 
      status: true,
      _id: { $ne: id }
    });

    for (const rule of existingRules) {
      const ruleMin = parseFloat(rule.minDistance);
      const ruleMax = rule.maxDistance === null ? null : parseFloat(rule.maxDistance);

      // Check for overlap - two ranges overlap if they share any common distance
      let overlaps = false;
      
      if (newMaxDist === null && ruleMax === null) {
        // Both are unlimited - they overlap if min distances are compatible
        overlaps = true;
      } else if (newMaxDist === null) {
        // New range is unlimited, overlaps if it starts before or at rule's end
        overlaps = newMinDist <= ruleMax;
      } else if (ruleMax === null) {
        // Existing rule is unlimited, overlaps if it starts before or at new range's end
        overlaps = ruleMin <= newMaxDist;
      } else {
        // Both have finite ranges - check if they overlap
        // Ranges overlap if: newMinDist < ruleMax && ruleMin < newMaxDist
        overlaps = newMinDist < ruleMax && ruleMin < newMaxDist;
      }

      if (overlaps) {
        const ruleRangeStr = ruleMax === null 
          ? `${ruleMin}km - Unlimited` 
          : `${ruleMin}km - ${ruleMax}km`;
        const newRangeStr = newMaxDist === null 
          ? `${newMinDist}km - Unlimited` 
          : `${newMinDist}km - ${newMaxDist}km`;
        
        return errorResponse(
          res,
          400,
          `Distance range overlaps with existing rule "${rule.name}" (${ruleRangeStr}). Your range: ${newRangeStr}`
        );
      }
    }

    // Update fields
    if (name !== undefined) commission.name = name.trim();
    if (minDistance !== undefined) commission.minDistance = newMinDist;
    if (maxDistance !== undefined) commission.maxDistance = newMaxDist;
    if (commissionPerKm !== undefined) commission.commissionPerKm = parseFloat(commissionPerKm);
    if (basePayout !== undefined) commission.basePayout = parseFloat(basePayout);
    if (status !== undefined) commission.status = status;
    commission.updatedBy = adminId;

    await commission.save();

    const populatedCommission = await DeliveryBoyCommission.findById(commission._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .lean();

    return successResponse(res, 200, 'Commission rule updated successfully', { commission: populatedCommission });
  } catch (error) {
    console.error('Error updating commission rule:', error);
    if (error.name === 'ValidationError') {
      return errorResponse(res, 400, error.message);
    }
    return errorResponse(res, 500, 'Failed to update commission rule');
  }
});

/**
 * Delete commission rule
 * DELETE /api/admin/delivery-boy-commission/:id
 */
export const deleteCommissionRule = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid commission rule ID');
    }

    const commission = await DeliveryBoyCommission.findById(id);
    if (!commission) {
      return errorResponse(res, 404, 'Commission rule not found');
    }

    await DeliveryBoyCommission.findByIdAndDelete(id);

    return successResponse(res, 200, 'Commission rule deleted successfully');
  } catch (error) {
    console.error('Error deleting commission rule:', error);
    return errorResponse(res, 500, 'Failed to delete commission rule');
  }
});

/**
 * Toggle commission rule status
 * PATCH /api/admin/delivery-boy-commission/:id/status
 */
export const toggleCommissionRuleStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const adminId = req.admin._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid commission rule ID');
    }

    const commission = await DeliveryBoyCommission.findById(id);
    if (!commission) {
      return errorResponse(res, 404, 'Commission rule not found');
    }

    commission.status = status !== undefined ? status : !commission.status;
    commission.updatedBy = adminId;
    await commission.save();

    const populatedCommission = await DeliveryBoyCommission.findById(commission._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .lean();

    return successResponse(res, 200, 'Commission rule status updated successfully', { commission: populatedCommission });
  } catch (error) {
    console.error('Error toggling commission rule status:', error);
    return errorResponse(res, 500, 'Failed to update commission rule status');
  }
});

/**
 * Calculate commission for a given distance
 * POST /api/admin/delivery-boy-commission/calculate
 */
export const calculateCommission = asyncHandler(async (req, res) => {
  try {
    const { distance } = req.body;

    if (distance === undefined || distance < 0) {
      return errorResponse(res, 400, 'Valid distance is required');
    }

    const result = await DeliveryBoyCommission.calculateCommission(parseFloat(distance));

    return successResponse(res, 200, 'Commission calculated successfully', result);
  } catch (error) {
    console.error('Error calculating commission:', error);
    return errorResponse(res, 500, error.message || 'Failed to calculate commission');
  }
});


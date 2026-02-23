import RestaurantCommission from '../models/RestaurantCommission.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import AuditLog from '../models/AuditLog.js';
import mongoose from 'mongoose';

/**
 * Get all restaurant commissions
 * GET /api/admin/restaurant-commission
 * Query params: status, search, page, limit
 */
export const getRestaurantCommissions = asyncHandler(async (req, res) => {
  try {
    const { 
      status,
      search,
      page = 1,
      limit = 50
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
        { restaurantName: { $regex: search, $options: 'i' } },
        { restaurantId: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Get total count
    const total = await RestaurantCommission.countDocuments(query);

    // Get commissions
    const commissions = await RestaurantCommission.find(query)
      .populate('restaurant', 'name restaurantId isActive email phone')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Add serial numbers
    const commissionsWithSl = commissions.map((commission, index) => ({
      ...commission,
      sl: skip + index + 1
    }));

    return successResponse(res, 200, 'Restaurant commissions retrieved successfully', {
      commissions: commissionsWithSl,
      pagination: {
        total,
        page: parseInt(page),
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching restaurant commissions:', error);
    return errorResponse(res, 500, 'Failed to fetch restaurant commissions');
  }
});

/**
 * Get approved restaurants (for commission setup)
 * GET /api/admin/restaurant-commission/approved-restaurants
 */
export const getApprovedRestaurants = asyncHandler(async (req, res) => {
  try {
    const { 
      search,
      page = 1,
      limit = 100
    } = req.query;

    // Build query - only approved restaurants
    const query = {
      isActive: true
    };

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { restaurantId: { $regex: search, $options: 'i' } },
        { ownerName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Get total count
    const total = await Restaurant.countDocuments(query);

    // Get restaurants
    const restaurants = await Restaurant.find(query)
      .select('_id name restaurantId ownerName email phone isActive approvedAt businessModel')
      .sort({ approvedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Check which restaurants already have commission setup
    const restaurantIds = restaurants.map(r => r._id);
    const existingCommissions = await RestaurantCommission.find({
      restaurant: { $in: restaurantIds }
    }).select('restaurant').lean();
    
    const commissionRestaurantIds = new Set(
      existingCommissions.map(c => c.restaurant.toString())
    );

    // Add commission setup status
    const restaurantsWithStatus = restaurants.map(restaurant => ({
      ...restaurant,
      hasCommissionSetup: commissionRestaurantIds.has(restaurant._id.toString())
    }));

    return successResponse(res, 200, 'Approved restaurants retrieved successfully', {
      restaurants: restaurantsWithStatus,
      pagination: {
        total,
        page: parseInt(page),
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching approved restaurants:', error);
    return errorResponse(res, 500, 'Failed to fetch approved restaurants');
  }
});

/**
 * Get commission by ID
 * GET /api/admin/restaurant-commission/:id
 */
export const getRestaurantCommissionById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid commission ID');
    }

    const commission = await RestaurantCommission.findById(id)
      .populate('restaurant', 'name restaurantId isActive email phone ownerName businessModel')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .lean();

    if (!commission) {
      return errorResponse(res, 404, 'Restaurant commission not found');
    }

    return successResponse(res, 200, 'Restaurant commission retrieved successfully', {
      commission
    });
  } catch (error) {
    console.error('Error fetching restaurant commission:', error);
    return errorResponse(res, 500, 'Failed to fetch restaurant commission');
  }
});

/**
 * Get commission by restaurant ID
 * GET /api/admin/restaurant-commission/restaurant/:restaurantId
 */
export const getCommissionByRestaurantId = asyncHandler(async (req, res) => {
  try {
    const { restaurantId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return errorResponse(res, 400, 'Invalid restaurant ID');
    }

    const commission = await RestaurantCommission.findOne({ restaurant: restaurantId })
      .populate('restaurant', 'name restaurantId isActive email phone ownerName businessModel')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .lean();

    if (!commission) {
      return errorResponse(res, 404, 'Commission not found for this restaurant');
    }

    return successResponse(res, 200, 'Restaurant commission retrieved successfully', {
      commission
    });
  } catch (error) {
    console.error('Error fetching restaurant commission:', error);
    return errorResponse(res, 500, 'Failed to fetch restaurant commission');
  }
});

/**
 * Create restaurant commission
 * POST /api/admin/restaurant-commission
 */
export const createRestaurantCommission = asyncHandler(async (req, res) => {
  try {
    const {
      restaurantId,
      commissionRules,
      defaultCommission,
      status,
      notes
    } = req.body;

    const adminId = req.user._id;

    // Validate restaurant ID
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return errorResponse(res, 400, 'Invalid restaurant ID');
    }

    // Check if restaurant exists and is approved
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    if (!restaurant.isActive) {
      return errorResponse(res, 400, 'Restaurant is not approved. Please approve the restaurant first.');
    }

    // Check if commission already exists
    const existingCommission = await RestaurantCommission.findOne({ restaurant: restaurantId });
    if (existingCommission) {
      return errorResponse(res, 400, 'Commission already exists for this restaurant. Use update instead.');
    }

    // Validate default commission
    if (!defaultCommission || !defaultCommission.type || defaultCommission.value === undefined) {
      return errorResponse(res, 400, 'Default commission is required');
    }

    if (defaultCommission.type === 'percentage' && (defaultCommission.value < 0 || defaultCommission.value > 100)) {
      return errorResponse(res, 400, 'Percentage must be between 0-100');
    }

    if (defaultCommission.type === 'amount' && defaultCommission.value < 0) {
      return errorResponse(res, 400, 'Amount must be >= 0');
    }

    // Validate commission rules
    if (commissionRules && Array.isArray(commissionRules)) {
      for (const rule of commissionRules) {
        if (!rule.type || rule.value === undefined) {
          return errorResponse(res, 400, 'Each commission rule must have type and value');
        }

        if (rule.type === 'percentage' && (rule.value < 0 || rule.value > 100)) {
          return errorResponse(res, 400, 'Percentage in commission rules must be between 0-100');
        }

        if (rule.type === 'amount' && rule.value < 0) {
          return errorResponse(res, 400, 'Amount in commission rules must be >= 0');
        }

        if (rule.minOrderAmount === undefined || rule.minOrderAmount < 0) {
          return errorResponse(res, 400, 'minOrderAmount is required and must be >= 0');
        }

        if (rule.maxOrderAmount !== null && rule.maxOrderAmount !== undefined) {
          if (rule.maxOrderAmount <= rule.minOrderAmount) {
            return errorResponse(res, 400, 'maxOrderAmount must be greater than minOrderAmount');
          }
        }
      }
    }

    // Create commission
    const commission = new RestaurantCommission({
      restaurant: restaurantId,
      restaurantName: restaurant.name,
      restaurantId: restaurant.restaurantId,
      commissionRules: commissionRules || [],
      defaultCommission: {
        type: defaultCommission.type,
        value: defaultCommission.value
      },
      status: status !== undefined ? status : true,
      notes: notes || '',
      createdBy: adminId
    });

    await commission.save();

    // Create audit log
    try {
      await AuditLog.createLog({
        entityType: 'commission',
        entityId: commission._id,
        action: 'create_restaurant_commission',
        actionType: 'create',
        performedBy: {
          type: 'admin',
          userId: adminId,
          name: req.user?.name || 'Admin'
        },
        commissionChange: {
          restaurantId: restaurantId,
          newValue: defaultCommission.value,
          newType: defaultCommission.type,
          reason: 'Commission created'
        },
        description: `Restaurant commission created for ${restaurant.name}`
      });
    } catch (auditError) {
      console.error('Error creating audit log:', auditError);
      // Don't fail commission creation if audit log fails
    }

    // Populate and return
    const populatedCommission = await RestaurantCommission.findById(commission._id)
      .populate('restaurant', 'name restaurantId isActive email phone')
      .populate('createdBy', 'name email')
      .lean();

    return successResponse(res, 201, 'Restaurant commission created successfully', {
      commission: populatedCommission
    });
  } catch (error) {
    console.error('Error creating restaurant commission:', error);
    
    if (error.code === 11000) {
      return errorResponse(res, 400, 'Commission already exists for this restaurant');
    }
    
    return errorResponse(res, 500, 'Failed to create restaurant commission');
  }
});

/**
 * Update restaurant commission
 * PUT /api/admin/restaurant-commission/:id
 */
export const updateRestaurantCommission = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const {
      commissionRules,
      defaultCommission,
      status,
      notes
    } = req.body;

    const adminId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid commission ID');
    }

    const commission = await RestaurantCommission.findById(id);
    if (!commission) {
      return errorResponse(res, 404, 'Restaurant commission not found');
    }

    // Validate default commission if provided
    if (defaultCommission) {
      if (!defaultCommission.type || defaultCommission.value === undefined) {
        return errorResponse(res, 400, 'Default commission must have type and value');
      }

      if (defaultCommission.type === 'percentage' && (defaultCommission.value < 0 || defaultCommission.value > 100)) {
        return errorResponse(res, 400, 'Percentage must be between 0-100');
      }

      if (defaultCommission.type === 'amount' && defaultCommission.value < 0) {
        return errorResponse(res, 400, 'Amount must be >= 0');
      }

      commission.defaultCommission = {
        type: defaultCommission.type,
        value: defaultCommission.value
      };
    }

    // Validate and update commission rules if provided
    if (commissionRules !== undefined) {
      if (!Array.isArray(commissionRules)) {
        return errorResponse(res, 400, 'Commission rules must be an array');
      }

      for (const rule of commissionRules) {
        if (!rule.type || rule.value === undefined) {
          return errorResponse(res, 400, 'Each commission rule must have type and value');
        }

        if (rule.type === 'percentage' && (rule.value < 0 || rule.value > 100)) {
          return errorResponse(res, 400, 'Percentage in commission rules must be between 0-100');
        }

        if (rule.type === 'amount' && rule.value < 0) {
          return errorResponse(res, 400, 'Amount in commission rules must be >= 0');
        }

        if (rule.minOrderAmount === undefined || rule.minOrderAmount < 0) {
          return errorResponse(res, 400, 'minOrderAmount is required and must be >= 0');
        }

        if (rule.maxOrderAmount !== null && rule.maxOrderAmount !== undefined) {
          if (rule.maxOrderAmount <= rule.minOrderAmount) {
            return errorResponse(res, 400, 'maxOrderAmount must be greater than minOrderAmount');
          }
        }
      }

      commission.commissionRules = commissionRules;
    }

    // Update other fields
    if (status !== undefined) {
      commission.status = status;
    }

    if (notes !== undefined) {
      commission.notes = notes;
    }

    // Store old values for audit log
    const oldDefaultCommission = {
      type: commission.defaultCommission.type,
      value: commission.defaultCommission.value
    };

    commission.updatedBy = adminId;

    await commission.save();

    // Create audit log for commission change
    if (defaultCommission && (
      oldDefaultCommission.value !== defaultCommission.value ||
      oldDefaultCommission.type !== defaultCommission.type
    )) {
      try {
        await AuditLog.createLog({
          entityType: 'commission',
          entityId: commission._id,
          action: 'update_restaurant_commission',
          actionType: 'commission_change',
          performedBy: {
            type: 'admin',
            userId: adminId,
            name: req.user?.name || 'Admin'
          },
          changes: {
            before: oldDefaultCommission,
            after: defaultCommission
          },
          commissionChange: {
            restaurantId: commission.restaurant,
            oldValue: oldDefaultCommission.value,
            newValue: defaultCommission.value,
            oldType: oldDefaultCommission.type,
            newType: defaultCommission.type,
            reason: notes || 'Commission updated'
          },
          description: `Restaurant commission updated for ${commission.restaurantName}`
        });
      } catch (auditError) {
        console.error('Error creating audit log:', auditError);
        // Don't fail commission update if audit log fails
      }
    }

    // Populate and return
    const populatedCommission = await RestaurantCommission.findById(commission._id)
      .populate('restaurant', 'name restaurantId isActive email phone')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .lean();

    return successResponse(res, 200, 'Restaurant commission updated successfully', {
      commission: populatedCommission
    });
  } catch (error) {
    console.error('Error updating restaurant commission:', error);
    return errorResponse(res, 500, 'Failed to update restaurant commission');
  }
});

/**
 * Delete restaurant commission
 * DELETE /api/admin/restaurant-commission/:id
 */
export const deleteRestaurantCommission = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid commission ID');
    }

    const commission = await RestaurantCommission.findById(id);
    if (!commission) {
      return errorResponse(res, 404, 'Restaurant commission not found');
    }

    await RestaurantCommission.findByIdAndDelete(id);

    return successResponse(res, 200, 'Restaurant commission deleted successfully');
  } catch (error) {
    console.error('Error deleting restaurant commission:', error);
    return errorResponse(res, 500, 'Failed to delete restaurant commission');
  }
});

/**
 * Toggle commission status
 * PATCH /api/admin/restaurant-commission/:id/status
 */
export const toggleRestaurantCommissionStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid commission ID');
    }

    const commission = await RestaurantCommission.findById(id);
    if (!commission) {
      return errorResponse(res, 404, 'Restaurant commission not found');
    }

    commission.status = !commission.status;
    commission.updatedBy = adminId;

    await commission.save();

    return successResponse(res, 200, `Commission ${commission.status ? 'enabled' : 'disabled'} successfully`, {
      commission: {
        _id: commission._id,
        status: commission.status
      }
    });
  } catch (error) {
    console.error('Error toggling commission status:', error);
    return errorResponse(res, 500, 'Failed to toggle commission status');
  }
});

/**
 * Calculate commission for an order
 * POST /api/admin/restaurant-commission/calculate
 */
export const calculateCommission = asyncHandler(async (req, res) => {
  try {
    const { restaurantId, orderAmount } = req.body;

    if (!restaurantId || !orderAmount) {
      return errorResponse(res, 400, 'Restaurant ID and order amount are required');
    }

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return errorResponse(res, 400, 'Invalid restaurant ID');
    }

    const orderAmountNum = parseFloat(orderAmount);
    if (isNaN(orderAmountNum) || orderAmountNum < 0) {
      return errorResponse(res, 400, 'Order amount must be a valid positive number');
    }

    const result = await RestaurantCommission.calculateCommissionForOrder(restaurantId, orderAmountNum);

    return successResponse(res, 200, 'Commission calculated successfully', {
      calculation: result
    });
  } catch (error) {
    console.error('Error calculating commission:', error);
    return errorResponse(res, 500, 'Failed to calculate commission');
  }
});


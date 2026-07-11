import Delivery from '../../delivery/models/Delivery.js';
import Zone from '../models/Zone.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { escapeRegex } from '../../../shared/utils/regex.js';
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

const getZoneIdString = (zone) => zone?._id?.toString?.() || zone?.toString?.() || String(zone || '');

const getZoneDisplayName = (zone) => zone?.name || zone?.zoneName || zone?.serviceLocation || 'Unnamed Zone';

const getAssignedZoneIds = (delivery) => (
  Array.isArray(delivery?.availability?.zones)
    ? delivery.availability.zones.map(getZoneIdString).filter(Boolean)
    : []
);

const buildZoneMapForDeliveries = async (deliveries = []) => {
  const zoneIds = [
    ...new Set(
      deliveries
        .flatMap((delivery) => getAssignedZoneIds(delivery))
        .filter((zoneId) => mongoose.Types.ObjectId.isValid(zoneId))
    )
  ];

  if (zoneIds.length === 0) {
    return new Map();
  }

  const zones = await Zone.find({ _id: { $in: zoneIds } })
    .select('_id name zoneName serviceLocation isActive')
    .lean();

  return new Map(zones.map((zone) => [getZoneIdString(zone), zone]));
};

const getDeliveryZoneSummary = (delivery, zoneMap) => {
  const zoneIds = getAssignedZoneIds(delivery);
  const assignedZones = zoneIds
    .map((zoneId) => zoneMap.get(zoneId))
    .filter(Boolean)
    .map((zone) => ({
      _id: getZoneIdString(zone),
      name: getZoneDisplayName(zone),
      isActive: zone.isActive !== false
    }));

  return {
    zoneIds,
    assignedZones,
    zone: zoneIds.length === 0
      ? 'Not assigned'
      : assignedZones.length > 0
        ? assignedZones.map((zone) => zone.name).join(', ')
        : 'Assigned'
  };
};

/**
 * Get Delivery Partner Join Requests
 * GET /api/admin/delivery-partners/requests
 * Query params: status (pending, denied), page, limit, search, zone, jobType, vehicleType
 */
export const getJoinRequests = asyncHandler(async (req, res) => {
  try {
    const { 
      status = 'pending', 
      page = 1, 
      limit = 50,
      search,
      zone,
      jobType,
      vehicleType
    } = req.query;

    // Build query
    const query = {};
    
    // Status filter
    if (status === 'pending') {
      query.status = 'pending';
    } else if (status === 'denied') {
      query.status = 'blocked'; // Assuming 'blocked' is used for denied/rejected
    }

    // Search filter
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { phone: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    // Zone filter (if zones are stored in availability.zones)
    if (zone) {
      // This might need adjustment based on how zones are stored
      query['availability.zones'] = zone;
    }

    // Vehicle type filter
    if (vehicleType) {
      query['vehicle.type'] = vehicleType.toLowerCase();
    }

    // Job type filter - assuming this might be stored in a field or derived
    // For now, we'll skip this as it's not clear from the Delivery model
    // You might need to add a jobType field to the Delivery model

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch delivery partners
    const deliveries = await Delivery.find(query)
      .select('-password -refreshToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Delivery.countDocuments(query);

    // Format response to match frontend expectations
    const formattedRequests = deliveries.map((delivery, index) => {
      // Determine job type (you may need to add this field to Delivery model)
      // For now, using a default or derived value
      const jobType = 'Freelance'; // Default or derive from delivery data

      // Get zone from location (city, state, country)
      let zone = 'All over the World'; // Default
      
      if (delivery.location) {
        const locationParts = [];
        
        // Add city if available
        if (delivery.location.city) {
          locationParts.push(delivery.location.city);
        }
        
        // Add state if available
        if (delivery.location.state) {
          locationParts.push(delivery.location.state);
        }
        
        // Add country (default to India if not specified)
        const country = delivery.location.country || 'India';
        locationParts.push(country);
        
        // If we have location parts, join them
        if (locationParts.length > 0) {
          zone = locationParts.join(', ');
        } else if (delivery.availability?.zones?.length > 0) {
          // Fallback to zones if location not available
          zone = 'Multiple Zones';
        }
      } else if (delivery.availability?.zones?.length > 0) {
        zone = 'Multiple Zones';
      }

      // Get vehicle type
      const vehicleType = delivery.vehicle?.type 
        ? delivery.vehicle.type.charAt(0).toUpperCase() + delivery.vehicle.type.slice(1)
        : 'N/A';

      return {
        _id: delivery._id.toString(),
        sl: skip + index + 1,
        name: delivery.name || 'N/A',
        email: delivery.email || 'N/A',
        phone: delivery.phone || 'N/A',
        zone: zone,
        jobType: jobType,
        vehicleType: vehicleType,
        status: delivery.status === 'blocked' ? 'Rejected' : delivery.status.charAt(0).toUpperCase() + delivery.status.slice(1),
        rejectionReason: delivery.rejectionReason || null,
        createdAt: delivery.createdAt,
        // Include full data for view/details
        fullData: {
          ...delivery,
          _id: delivery._id.toString()
        }
      };
    });

    return successResponse(res, 200, 'Join requests retrieved successfully', {
      requests: formattedRequests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching join requests: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch join requests');
  }
});

/**
 * Get Delivery Partner by ID
 * GET /api/admin/delivery-partners/:id
 */
export const getDeliveryPartnerById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const delivery = await Delivery.findById(id)
      .select('-password -refreshToken')
      .lean();

    if (!delivery) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    const zoneMap = await buildZoneMapForDeliveries([delivery]);
    const zoneSummary = getDeliveryZoneSummary(delivery, zoneMap);

    return successResponse(res, 200, 'Delivery partner retrieved successfully', {
      delivery: {
        ...delivery,
        ...zoneSummary
      }
    });
  } catch (error) {
    logger.error(`Error fetching delivery partner: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch delivery partner');
  }
});

/**
 * Approve Delivery Partner Join Request
 * POST /api/admin/delivery-partners/:id/approve
 */
export const approveDeliveryPartner = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id; // Admin who is approving

    const delivery = await Delivery.findById(id);

    if (!delivery) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    if (delivery.status === 'approved' || delivery.status === 'active') {
      return errorResponse(res, 400, 'Delivery partner is already approved');
    }

    // Update status to approved
    delivery.status = 'approved';
    delivery.verifiedAt = new Date();
    delivery.verifiedBy = adminId;
    delivery.isActive = true;

    await delivery.save();

    logger.info(`Delivery partner approved: ${id}`, {
      approvedBy: adminId,
      deliveryId: delivery.deliveryId
    });

    return successResponse(res, 200, 'Delivery partner approved successfully', {
      delivery: {
        _id: delivery._id.toString(),
        name: delivery.name,
        status: delivery.status,
        verifiedAt: delivery.verifiedAt
      }
    });
  } catch (error) {
    logger.error(`Error approving delivery partner: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to approve delivery partner');
  }
});

/**
 * Reject/Deny Delivery Partner Join Request
 * POST /api/admin/delivery-partners/:id/reject
 */
export const rejectDeliveryPartner = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body; // Rejection reason/note (required)
    const adminId = req.user._id; // Admin who is rejecting

    // Validate reason is provided
    if (!reason || !reason.trim()) {
      return errorResponse(res, 400, 'Rejection reason is required');
    }

    const delivery = await Delivery.findById(id);

    if (!delivery) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    if (delivery.status === 'blocked') {
      return errorResponse(res, 400, 'Delivery partner is already rejected');
    }

    // Update status to blocked (rejected) and store rejection details
    // Note: isActive is NOT set to false - denied partners can still login to see rejection reason
    delivery.status = 'blocked';
    delivery.rejectionReason = reason.trim();
    delivery.rejectedAt = new Date();
    delivery.rejectedBy = adminId;

    await delivery.save();

    logger.info(`Delivery partner rejected: ${id}`, {
      rejectedBy: adminId,
      reason: reason,
      deliveryId: delivery.deliveryId
    });

    return successResponse(res, 200, 'Delivery partner rejected successfully', {
      delivery: {
        _id: delivery._id.toString(),
        name: delivery.name,
        status: delivery.status,
        rejectionReason: delivery.rejectionReason
      }
    });
  } catch (error) {
    logger.error(`Error rejecting delivery partner: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to reject delivery partner');
  }
});

/**
 * Get All Delivery Partners (for listing)
 * GET /api/admin/delivery-partners
 * Query params: status, page, limit, search
 */
export const getDeliveryPartners = asyncHandler(async (req, res) => {
  try {
    const { 
      status, 
      page = 1, 
      limit = 50,
      search,
      isActive,
      includeAvailability
    } = req.query;

    // Build query - only get approved/active delivery partners for list
    const query = {
      status: { $in: ['approved', 'active'] } // Only show approved/active partners
    };
    
    // Status filter (if provided, override default)
    if (status) {
      query.status = status;
    }

    // isActive filter (if provided)
    if (isActive !== undefined) {
      query.isActive = isActive === 'true' || isActive === true;
    }

    // Search filter
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { phone: { $regex: safeSearch, $options: 'i' } },
        { deliveryId: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build select fields - always include availability when requested
    // Note: In Mongoose, if a field is not explicitly excluded, it's included by default
    // So we just need to make sure we're not excluding availability
    let selectFields = '-password -refreshToken';
    
    // Fetch delivery partners
    const deliveries = await Delivery.find(query)
      .select(selectFields)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Log for debugging
    if (includeAvailability === 'true' || includeAvailability === true) {
      console.log(`📦 Fetching ${deliveries.length} delivery partners with availability data`);
      deliveries.forEach((d, idx) => {
        const hasLocation = d.availability?.currentLocation?.coordinates;
        console.log(`  ${idx + 1}. ${d.name}: online=${d.availability?.isOnline}, hasLocation=${!!hasLocation}`);
      });
    }

    // Import Order model for order counts
    const Order = (await import('../../order/models/Order.js')).default;

    // Get order statistics for each delivery partner
    const deliveryIds = deliveries.map(d => d._id);
    
    // Get order counts for each delivery partner
    const orderStats = await Order.aggregate([
      {
        $match: {
          deliveryPartnerId: { $in: deliveryIds }
        }
      },
      {
        $group: {
          _id: '$deliveryPartnerId',
          totalOrders: { $sum: 1 },
          assignedOrders: {
            $sum: {
              $cond: [
                { $in: ['$status', ['out_for_delivery', 'ready', 'preparing']] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Create a map of deliveryId -> stats
    const statsMap = {};
    orderStats.forEach(stat => {
      statsMap[stat._id.toString()] = {
        totalOrders: stat.totalOrders || 0,
        assignedOrders: stat.assignedOrders || 0
      };
    });

    const zoneMap = await buildZoneMapForDeliveries(deliveries);

    // Format response with order stats and zone info
    const formattedPartners = deliveries.map((delivery, index) => {
      const stats = statsMap[delivery._id.toString()] || { totalOrders: 0, assignedOrders: 0 };
      const zoneSummary = getDeliveryZoneSummary(delivery, zoneMap);

      // Get availability status
      const isOnline = delivery.availability?.isOnline || false;
      const availabilityStatus = isOnline ? 'Online' : 'Offline';

      return {
        _id: delivery._id.toString(),
        sl: skip + index + 1,
        name: delivery.name || 'N/A',
        email: delivery.email || 'N/A',
        phone: delivery.phone || 'N/A',
        zone: zoneSummary.zone,
        zoneIds: zoneSummary.zoneIds,
        assignedZones: zoneSummary.assignedZones,
        totalOrders: stats.totalOrders,
        assignedOrders: stats.assignedOrders,
        status: availabilityStatus,
        rating: delivery.metrics?.rating || 0,
        deliveryId: delivery.deliveryId || 'N/A',
        isActive: delivery.isActive !== false,
        profileImage: delivery.profileImage?.url || null,
        // Include availability data when requested
        ...(includeAvailability === 'true' || includeAvailability === true ? {
          availability: delivery.availability || null
        } : {}),
        // Include full data
        fullData: {
          ...delivery,
          _id: delivery._id.toString(),
          ...zoneSummary
        }
      };
    });

    // Get total count
    const total = await Delivery.countDocuments(query);

    return successResponse(res, 200, 'Delivery partners retrieved successfully', {
      deliveryPartners: formattedPartners,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching delivery partners: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to fetch delivery partners');
  }
});

/**
 * Update Delivery Partner Zone
 * PATCH /api/admin/delivery-partners/:id/zone
 */
export const updateDeliveryPartnerZone = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { zoneId, zoneIds } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid delivery partner ID');
    }

    const nextZoneIds = Array.isArray(zoneIds)
      ? zoneIds
      : zoneId
        ? [zoneId]
        : [];

    const normalizedZoneIds = [
      ...new Set(nextZoneIds.map((item) => String(item || '').trim()).filter(Boolean))
    ];

    if (normalizedZoneIds.length > 10) {
      return errorResponse(res, 400, 'A delivery partner can be assigned to at most 10 zones');
    }

    const hasInvalidZoneId = normalizedZoneIds.some((item) => !mongoose.Types.ObjectId.isValid(item));
    if (hasInvalidZoneId) {
      return errorResponse(res, 400, 'Invalid zone ID');
    }

    if (normalizedZoneIds.length > 0) {
      const activeZoneCount = await Zone.countDocuments({
        _id: { $in: normalizedZoneIds },
        isActive: true
      });

      if (activeZoneCount !== normalizedZoneIds.length) {
        return errorResponse(res, 400, 'Invalid or inactive zone selected');
      }
    }

    const delivery = await Delivery.findByIdAndUpdate(
      id,
      { $set: { 'availability.zones': normalizedZoneIds } },
      { new: true, runValidators: true }
    ).select('-password -refreshToken').lean();

    if (!delivery) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    const zoneMap = await buildZoneMapForDeliveries([delivery]);
    const zoneSummary = getDeliveryZoneSummary(delivery, zoneMap);

    logger.info(`Delivery partner zone updated: ${id}`, {
      updatedBy: req.user._id,
      deliveryId: delivery.deliveryId,
      zoneIds: normalizedZoneIds
    });

    return successResponse(res, 200, 'Delivery partner zone updated successfully', {
      delivery: {
        ...delivery,
        ...zoneSummary
      }
    });
  } catch (error) {
    logger.error(`Error updating delivery partner zone: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to update delivery partner zone');
  }
});

/**
 * Delete Delivery Partner
 * DELETE /api/admin/delivery-partners/:id
 * Soft-deactivates the delivery partner and logs them out.
 */
export const deleteDeliveryPartner = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const delivery = await Delivery.findById(id);

    if (!delivery) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    await Delivery.updateOne(
      { _id: id },
      {
        status: 'blocked',
        'availability.isOnline': false,
        $unset: { refreshToken: 1 }
      }
    );

    logger.info(`Delivery partner soft-deactivated: ${id}`, {
      deletedBy: req.user._id,
      deliveryId: delivery.deliveryId
    });

    return successResponse(
      res,
      200,
      'Delivery partner deactivated successfully. Profile, wallet, and history were preserved.'
    );
  } catch (error) {
    logger.error(`Error deleting delivery partner: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to delete delivery partner');
  }
});

/**
 * Reverify Delivery Partner (Resubmit for approval)
 * POST /api/admin/delivery-partners/:id/reverify
 */
export const reverifyDeliveryPartner = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const delivery = await Delivery.findById(id);

    if (!delivery) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    if (delivery.status !== 'blocked') {
      return errorResponse(res, 400, 'Only rejected delivery partners can be reverted');
    }

    // Reset to pending status and clear rejection details
    delivery.status = 'pending';
    delivery.isActive = true; // Allow login to see verification message
    delivery.rejectionReason = undefined;
    delivery.rejectedAt = undefined;
    delivery.rejectedBy = undefined;

    await delivery.save();

    logger.info(`Delivery partner reverted for reverification: ${id}`, {
      deliveryId: delivery.deliveryId
    });

    return successResponse(res, 200, 'Delivery partner request resubmitted for verification', {
      delivery: {
        _id: delivery._id.toString(),
        name: delivery.name,
        status: delivery.status
      }
    });
  } catch (error) {
    logger.error(`Error reverifying delivery partner: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to reverify delivery partner');
  }
});

/**
 * Update Delivery Partner Status
 * PATCH /api/admin/delivery-partners/:id/status
 */
export const updateDeliveryPartnerStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status, isActive } = req.body;

    const delivery = await Delivery.findById(id);

    if (!delivery) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    // Update status if provided
    if (status) {
      const validStatuses = ['pending', 'approved', 'active', 'suspended', 'blocked'];
      if (!validStatuses.includes(status)) {
        return errorResponse(res, 400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }
      delivery.status = status;
    }

    // Update isActive if provided
    if (typeof isActive === 'boolean') {
      delivery.isActive = isActive;
    }

    await delivery.save();

    logger.info(`Delivery partner status updated: ${id}`, {
      status: delivery.status,
      isActive: delivery.isActive,
      updatedBy: req.user._id
    });

    return successResponse(res, 200, 'Delivery partner status updated successfully', {
      delivery: {
        _id: delivery._id.toString(),
        name: delivery.name,
        status: delivery.status,
        isActive: delivery.isActive
      }
    });
  } catch (error) {
    logger.error(`Error updating delivery partner status: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to update delivery partner status');
  }
});


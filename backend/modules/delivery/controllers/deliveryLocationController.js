import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Delivery from '../models/Delivery.js';
import Zone from '../../admin/models/Zone.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';
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

/**
 * Update Delivery Partner Location
 * POST /api/delivery/location
 * Can update location and/or online status
 */
const updateLocationSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  isOnline: Joi.boolean().optional()
}).min(1); // At least one field must be provided

export const updateLocation = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { latitude, longitude, isOnline } = req.body;

    // Manual validation: at least one field must be provided
    const hasLatitude = latitude !== undefined && latitude !== null;
    const hasLongitude = longitude !== undefined && longitude !== null;
    const hasIsOnline = isOnline !== undefined && isOnline !== null;
    
    if (!hasLatitude && !hasLongitude && !hasIsOnline) {
      return errorResponse(res, 400, 'At least one field (latitude, longitude, or isOnline) must be provided');
    }
    
    // If latitude or longitude is provided, both must be provided
    if ((hasLatitude && !hasLongitude) || (!hasLatitude && hasLongitude)) {
      return errorResponse(res, 400, 'Both latitude and longitude must be provided together');
    }

    // Validate individual fields if provided
    if (hasLatitude || hasLongitude) {
      const locationSchema = Joi.object({
        latitude: Joi.number().min(-90).max(90).required(),
        longitude: Joi.number().min(-180).max(180).required()
      });
      const { error: locationError } = locationSchema.validate({ latitude, longitude });
      if (locationError) {
        return errorResponse(res, 400, locationError.details[0].message);
      }
    }
    
    if (hasIsOnline && typeof isOnline !== 'boolean') {
      return errorResponse(res, 400, 'isOnline must be a boolean');
    }

    const updateData = {};

    // Update location only if both latitude and longitude are provided
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      updateData['availability.currentLocation'] = {
        type: 'Point',
        coordinates: [longitude, latitude] // MongoDB uses [longitude, latitude]
      };
      updateData['availability.lastLocationUpdate'] = new Date();
    }

    // Update online status if provided
    if (typeof isOnline === 'boolean') {
      updateData['availability.isOnline'] = isOnline;
    }

    // If no updates, return error
    if (Object.keys(updateData).length === 0) {
      return errorResponse(res, 400, 'At least one field (latitude, longitude, or isOnline) must be provided');
    }

    const updatedDelivery = await Delivery.findByIdAndUpdate(
      delivery._id,
      { $set: updateData },
      { new: true }
    ).select('-password -refreshToken');

    if (!updatedDelivery) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    const currentLocation = updatedDelivery.availability?.currentLocation;

    return successResponse(res, 200, 'Status updated successfully', {
      location: currentLocation ? {
        latitude: currentLocation.coordinates[1],
        longitude: currentLocation.coordinates[0],
        isOnline: updatedDelivery.availability?.isOnline || false,
        lastUpdate: updatedDelivery.availability?.lastLocationUpdate
      } : null,
      isOnline: updatedDelivery.availability?.isOnline || false
    });
  } catch (error) {
    logger.error(`Error updating delivery location: ${error.message}`);
    return errorResponse(res, 500, 'Failed to update status');
  }
});

/**
 * Get Delivery Partner Current Location
 * GET /api/delivery/location
 */
export const getLocation = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;

    const deliveryData = await Delivery.findById(delivery._id)
      .select('availability')
      .lean();

    if (!deliveryData) {
      return errorResponse(res, 404, 'Delivery partner not found');
    }

    const location = deliveryData.availability?.currentLocation;
    
    return successResponse(res, 200, 'Location retrieved successfully', {
      location: location ? {
        latitude: location.coordinates[1],
        longitude: location.coordinates[0],
        isOnline: deliveryData.availability?.isOnline || false,
        lastUpdate: deliveryData.availability?.lastLocationUpdate
      } : null
    });
  } catch (error) {
    logger.error(`Error fetching delivery location: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch location');
  }
});

/**
 * Get zones within a radius of delivery boy's location
 * GET /api/delivery/zones/in-radius
 * Query params: latitude, longitude, radius (in km, default 70)
 */
export const getZonesInRadius = asyncHandler(async (req, res) => {
  try {
    const { latitude, longitude, radius = 70 } = req.query;

    // Validate required parameters
    if (!latitude || !longitude) {
      return errorResponse(res, 400, 'Latitude and longitude are required');
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radiusKm = parseFloat(radius);

    // Validate coordinates
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return errorResponse(res, 400, 'Invalid latitude or longitude');
    }

    // Validate radius
    if (isNaN(radiusKm) || radiusKm <= 0) {
      return errorResponse(res, 400, 'Radius must be a positive number');
    }

    // Fetch all active zones
    const zones = await Zone.find({ isActive: true })
      .populate('restaurantId', 'name email phone')
      .lean();

    // Calculate distance from delivery boy's location to each zone center
    const calculateDistance = (lat1, lng1, lat2, lng2) => {
      const R = 6371; // Earth's radius in kilometers
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c; // Distance in kilometers
    };

    // Calculate zone center from coordinates
    const getZoneCenter = (coordinates) => {
      if (!coordinates || coordinates.length === 0) return null;
      let sumLat = 0, sumLng = 0;
      let count = 0;
      coordinates.forEach(coord => {
        const coordLat = typeof coord === 'object' ? (coord.latitude || coord.lat) : null;
        const coordLng = typeof coord === 'object' ? (coord.longitude || coord.lng) : null;
        if (coordLat !== null && coordLng !== null) {
          sumLat += coordLat;
          sumLng += coordLng;
          count++;
        }
      });
      return count > 0 ? { lat: sumLat / count, lng: sumLng / count } : null;
    };

    // Filter zones within radius
    const nearbyZones = zones.filter(zone => {
      if (!zone.coordinates || zone.coordinates.length < 3) return false;
      const center = getZoneCenter(zone.coordinates);
      if (!center) return false;
      const distance = calculateDistance(lat, lng, center.lat, center.lng);
      return distance <= radiusKm;
    });

    return successResponse(res, 200, 'Zones retrieved successfully', {
      zones: nearbyZones,
      count: nearbyZones.length,
      radius: radiusKm,
      location: { latitude: lat, longitude: lng }
    });
  } catch (error) {
    logger.error(`Error fetching zones in radius: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch zones');
  }
});


import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Delivery from '../models/Delivery.js';
import Order from '../../order/models/Order.js';
import Zone from '../../admin/models/Zone.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';
import winston from 'winston';
import {
  syncDeliveryPartnerPresence,
  updateActiveOrderLocation
} from '../services/firebaseRealtimeTrackingService.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const socketSyncStateByDelivery = new Map();
const firebasePresenceSyncStateByDelivery = new Map();
const firebaseTrackingSyncStateByDelivery = new Map();
const SOCKET_SYNC_INTERVAL_MS = 3000;
const FIREBASE_SYNC_INTERVAL_MS = 10000;

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getActiveRoutePayload(order) {
  const phase = String(order?.deliveryState?.currentPhase || '').toLowerCase();
  const status = String(order?.deliveryState?.status || '').toLowerCase();
  const routeCoordinates =
    phase === 'en_route_to_delivery' ||
    phase === 'at_delivery' ||
    status === 'order_confirmed' ||
    status === 'en_route_to_delivery' ||
    order?.status === 'out_for_delivery'
      ? order?.deliveryState?.routeToDelivery?.coordinates
      : order?.deliveryState?.routeToPickup?.coordinates;

  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    return { route_coordinates: [] };
  }

  const normalized = routeCoordinates
    .map((coord) => {
      const lat = Number(coord?.[0]);
      const lng = Number(coord?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return [lat, lng];
    })
    .filter(Boolean);

  return { route_coordinates: normalized };
}

function shouldSyncRealtime(stateMap, deliveryId, lat, lng, phase, intervalMs, extraState = {}) {
  const key = String(deliveryId || '');
  const now = Date.now();
  const previous = stateMap.get(key);
  if (!previous) {
    stateMap.set(key, { lat, lng, phase, ts: now, ...extraState });
    return true;
  }

  const distanceMeters = calculateDistanceKm(previous.lat, previous.lng, lat, lng) * 1000;
  const elapsedMs = now - previous.ts;
  const phaseChanged = previous.phase !== phase;
  const coordinatesChanged = previous.lat !== lat || previous.lng !== lng;
  const extraStateChanged = Object.entries(extraState).some(([key, value]) => previous[key] !== value);
  const shouldSync =
    phaseChanged ||
    extraStateChanged ||
    (coordinatesChanged && distanceMeters >= 0.5) ||
    elapsedMs >= intervalMs;

  if (shouldSync) {
    stateMap.set(key, { lat, lng, phase, ts: now, ...extraState });
  }
  return shouldSync;
}

/**
 * Update Delivery Partner Location
 * POST /api/delivery/location
 * Can update location and/or online status
 */
const updateLocationSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  isOnline: Joi.boolean().optional(),
  heading: Joi.number().min(0).max(360).optional(),
  speed: Joi.number().min(0).max(200).optional(),
  accuracy: Joi.number().min(0).max(5000).optional()
}).min(1); // At least one field must be provided

export const updateLocation = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { latitude, longitude, isOnline, heading, speed, accuracy } = req.body;

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
    const lat = toFiniteNumber(currentLocation?.coordinates?.[1]);
    const lng = toFiniteNumber(currentLocation?.coordinates?.[0]);
    const normalizedHeading = toFiniteNumber(heading);
    const normalizedSpeed = toFiniteNumber(speed);
    const normalizedAccuracy = toFiniteNumber(accuracy);

    // Resolve current active order for this rider so user tracking always has latest location.
    const activeOrder = await Order.findOne({
      deliveryPartnerId: updatedDelivery._id,
      status: { $nin: ['delivered', 'cancelled'] },
      $or: [
        { 'deliveryState.currentPhase': { $ne: 'completed' } },
        { 'deliveryState.currentPhase': { $exists: false } }
      ]
    })
      .select('_id orderId status deliveryState.currentPhase deliveryState.status deliveryState.routeToPickup.coordinates deliveryState.routeToDelivery.coordinates address.location.coordinates')
      .sort({ updatedAt: -1 })
      .lean();

    const currentOrderId = activeOrder?.orderId || activeOrder?._id?.toString() || null;

    // Best-effort Firebase sync for online/offline + coordinates.
    const deliveryId = updatedDelivery._id?.toString();
    const isOnlineNow = updatedDelivery.availability?.isOnline || false;
    const shouldSyncFirebasePresence =
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      shouldSyncRealtime(
        firebasePresenceSyncStateByDelivery,
        deliveryId,
        Number.isFinite(lat) ? lat : 0,
        Number.isFinite(lng) ? lng : 0,
        currentOrderId || 'idle',
        FIREBASE_SYNC_INTERVAL_MS,
        {
          isOnline: isOnlineNow,
          activeOrderId: currentOrderId || null
        }
      );

    if (shouldSyncFirebasePresence) {
      await syncDeliveryPartnerPresence({
        deliveryId,
        lat,
        lng,
        isOnline: isOnlineNow,
        activeOrderId: currentOrderId
      });
    }

    // Keep order tracking location fresh for customer map + realtime socket feed.
    if (
      activeOrder &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      const phase = String(activeOrder?.deliveryState?.currentPhase || '').toLowerCase();
      const deliveryStateStatus = String(activeOrder?.deliveryState?.status || '').toLowerCase();
      const trackingStatus =
        phase === 'en_route_to_delivery' ||
        deliveryStateStatus === 'order_confirmed' ||
        deliveryStateStatus === 'en_route_to_delivery' ||
        activeOrder.status === 'out_for_delivery'
          ? 'out_for_delivery'
          : 'en_route_to_pickup';

      await Order.findByIdAndUpdate(activeOrder._id, {
        $set: {
          'deliveryState.currentLocation': {
            lat,
            lng,
            bearing: normalizedHeading ?? 0,
            speed: normalizedSpeed ?? 0,
            accuracy: normalizedAccuracy ?? null,
            timestamp: new Date()
          }
        }
      });

      const customerLat = toFiniteNumber(activeOrder?.address?.location?.coordinates?.[1]);
      const customerLng = toFiniteNumber(activeOrder?.address?.location?.coordinates?.[0]);
      const distanceToCustomerKm =
        Number.isFinite(customerLat) && Number.isFinite(customerLng)
          ? calculateDistanceKm(lat, lng, customerLat, customerLng)
          : null;

      const shouldSyncSocket = shouldSyncRealtime(
        socketSyncStateByDelivery,
        deliveryId,
        lat,
        lng,
        phase || trackingStatus,
        SOCKET_SYNC_INTERVAL_MS,
        { status: trackingStatus }
      );

      const shouldSyncFirebaseTracking = shouldSyncRealtime(
        firebaseTrackingSyncStateByDelivery,
        deliveryId,
        lat,
        lng,
        phase || trackingStatus,
        FIREBASE_SYNC_INTERVAL_MS,
        {
          status: trackingStatus,
          activeOrderId: currentOrderId || null,
          isOnline: isOnlineNow
        }
      );

      if (shouldSyncSocket || shouldSyncFirebaseTracking) {
        const activeRoutePayload = getActiveRoutePayload(activeOrder);
        const trackingPayload = {
          boy_id: updatedDelivery._id?.toString(),
          boy_lat: lat,
          boy_lng: lng,
          heading: normalizedHeading ?? 0,
          speed: normalizedSpeed ?? 0,
          status: trackingStatus,
          timestamp: Date.now(),
          distance_to_customer_km: distanceToCustomerKm,
          distance_to_customer_m: distanceToCustomerKm !== null ? Math.round(distanceToCustomerKm * 1000) : null,
          ...activeRoutePayload
        };

        const trackingIds = [...new Set([
          activeOrder.orderId ? String(activeOrder.orderId) : null,
          activeOrder._id?.toString?.()
        ].filter(Boolean))];

        if (shouldSyncFirebaseTracking) {
          await Promise.allSettled(
            trackingIds.map((trackingId) => updateActiveOrderLocation(trackingId, trackingPayload))
          );
        }

        const io = req.app.get('io');
        if (io && shouldSyncSocket) {
          const locationData = {
            orderId: activeOrder.orderId || activeOrder._id?.toString(),
            lat,
            lng,
            heading: normalizedHeading ?? 0,
            bearing: normalizedHeading ?? 0,
            speed: normalizedSpeed ?? 0,
            ...activeRoutePayload,
            distanceToCustomerKm,
            distanceToCustomerM: distanceToCustomerKm !== null ? Math.round(distanceToCustomerKm * 1000) : null,
            timestamp: Date.now()
          };

          trackingIds.forEach((trackingId) => {
            io.to(`order:${trackingId}`).emit(`location-receive-${trackingId}`, locationData);
          });
        }
      }
    }

    return successResponse(res, 200, 'Status updated successfully', {
      location: currentLocation ? {
        latitude: currentLocation.coordinates[1],
        longitude: currentLocation.coordinates[0],
        heading: normalizedHeading ?? 0,
        speed: normalizedSpeed ?? 0,
        accuracy: normalizedAccuracy ?? null,
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


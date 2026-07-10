import Order from '../models/Order.js';
import Payment from '../../payment/models/Payment.js';
import { createCashfreeOrder, verifyCashfreeOrderPayment, mapCashfreePaymentMethod } from '../../payment/services/cashfreeService.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Zone from '../../admin/models/Zone.js';
import User from '../../auth/models/User.js';
import mongoose from 'mongoose';
import winston from 'winston';
import { calculateOrderPricing } from '../services/orderCalculationService.js';
import { getCashfreeCredentials } from '../../../shared/utils/envService.js';
import { notifyRestaurantNewOrder } from '../services/restaurantNotificationService.js';
import { notifyAdminNewOrder } from '../services/adminNotificationService.js';
import { calculateOrderSettlement } from '../services/orderSettlementService.js';
import { holdEscrow } from '../services/escrowWalletService.js';
import { processCancellationRefund } from '../services/cancellationRefundService.js';
import etaCalculationService from '../services/etaCalculationService.js';
import etaWebSocketService from '../services/etaWebSocketService.js';
import OrderEvent from '../models/OrderEvent.js';
import UserWallet from '../../user/models/UserWallet.js';
import DeliveryWallet from '../../delivery/models/DeliveryWallet.js';
import OutletTimings from '../../restaurant/models/OutletTimings.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const generateDropDeliveryOtp = () => {
  // 4-digit OTP for handover confirmation at drop.
  return String(Math.floor(1000 + Math.random() * 9000));
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeRestaurantLocation(location = {}) {
  if (!location || typeof location !== 'object') return location;
  const normalized = { ...location };

  if (
    Array.isArray(normalized.coordinates) &&
    normalized.coordinates.length >= 2
  ) {
    if (!Number.isFinite(Number(normalized.longitude))) {
      normalized.longitude = Number(normalized.coordinates[0]);
    }
    if (!Number.isFinite(Number(normalized.latitude))) {
      normalized.latitude = Number(normalized.coordinates[1]);
    }
  } else if (
    Number.isFinite(Number(normalized.longitude)) &&
    Number.isFinite(Number(normalized.latitude))
  ) {
    normalized.coordinates = [Number(normalized.longitude), Number(normalized.latitude)];
  }

  return normalized;
}

function extractRestaurantCoordinates(restaurant = {}) {
  const resolvedLocation = normalizeRestaurantLocation(
    restaurant?.location || restaurant?.onboarding?.step1?.location
  );

  const latitude = Number(
    resolvedLocation?.latitude ?? resolvedLocation?.coordinates?.[1]
  );
  const longitude = Number(
    resolvedLocation?.longitude ?? resolvedLocation?.coordinates?.[0]
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    (latitude === 0 && longitude === 0)
  ) {
    return {
      location: resolvedLocation,
      latitude: null,
      longitude: null
    };
  }

  return {
    location: resolvedLocation,
    latitude,
    longitude
  };
}

function normalizeRestaurantNameValue(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveRestaurantForOrder(restaurantId) {
  if (!restaurantId) return null;
  const restaurantIdStr = String(restaurantId);
  const query = mongoose.Types.ObjectId.isValid(restaurantIdStr)
    ? { _id: restaurantIdStr }
    : {
        $or: [
          { restaurantId: restaurantIdStr },
          { slug: restaurantIdStr }
        ]
      };

  const restaurant = await Restaurant.findOne(query)
    .select('name slug profileImage address location phone ownerPhone restaurantId zoneId zoneName onboarding.step1.location')
    .lean();

  if (!restaurant) return null;
  const { location } = extractRestaurantCoordinates(restaurant);

  return {
    ...restaurant,
    location
  };
}

async function resolveRestaurantByNameForOrder(restaurantName) {
  const trimmedRestaurantName = String(restaurantName || '').trim();
  if (!trimmedRestaurantName) return null;

  const exactNameRegex = new RegExp(`^${escapeRegex(trimmedRestaurantName)}$`, 'i');
  const restaurant = await Restaurant.findOne({
    name: exactNameRegex
  })
    .sort({ isActive: -1, isAcceptingOrders: -1, updatedAt: -1 })
    .select('name slug profileImage address location phone ownerPhone restaurantId zoneId zoneName onboarding.step1.location isActive isAcceptingOrders')
    .lean();

  if (!restaurant) return null;
  const { location } = extractRestaurantCoordinates(restaurant);

  return {
    ...restaurant,
    location
  };
}

async function resolveActiveRestaurantByNameForOrder(restaurantName) {
  const trimmedRestaurantName = String(restaurantName || '').trim();
  if (!trimmedRestaurantName) return null;

  const exactNameRegex = new RegExp(`^${escapeRegex(trimmedRestaurantName)}$`, 'i');
  const restaurant = await Restaurant.findOne({
    name: exactNameRegex,
    isActive: true
  })
    .sort({ isAcceptingOrders: -1, updatedAt: -1 })
    .select('name slug profileImage address location phone ownerPhone restaurantId zoneId zoneName onboarding.step1.location isActive isAcceptingOrders')
    .lean();

  if (!restaurant) return null;
  const { location } = extractRestaurantCoordinates(restaurant);

  return {
    ...restaurant,
    location
  };
}

function normalizeZoneCoordinate(coord) {
  if (!coord) return { lat: null, lng: null };

  if (Array.isArray(coord) && coord.length >= 2) {
    const lng = parseFloat(coord[0]);
    const lat = parseFloat(coord[1]);
    return {
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null
    };
  }

  if (typeof coord === 'object') {
    const latRaw = coord.latitude ?? coord.lat;
    const lngRaw = coord.longitude ?? coord.lng;
    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);
    return {
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null
    };
  }

  return { lat: null, lng: null };
}

function extractZonePolygon(zone) {
  if (!zone) return null;

  if (Array.isArray(zone.boundary?.coordinates?.[0]) && zone.boundary.coordinates[0].length >= 3) {
    return zone.boundary.coordinates[0];
  }

  if (!Array.isArray(zone.coordinates) || zone.coordinates.length < 3) return null;

  const polygon = zone.coordinates
    .map((coord) => normalizeZoneCoordinate(coord))
    .filter((coord) => coord.lat !== null && coord.lng !== null)
    .map((coord) => [coord.lng, coord.lat]);

  if (polygon.length < 3) return null;

  const [firstLng, firstLat] = polygon[0];
  const [lastLng, lastLat] = polygon[polygon.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) {
    polygon.push([firstLng, firstLat]);
  }

  return polygon;
}

const isPointInsideZone = (lat, lng, zone) => {
  const polygonCoords = extractZonePolygon(zone);
  if (!Array.isArray(polygonCoords) || polygonCoords.length < 3) return false;

  let inside = false;
  const epsilon = 1e-10;

  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const xi = polygonCoords[i][0];
    const yi = polygonCoords[i][1];
    const xj = polygonCoords[j][0];
    const yj = polygonCoords[j][1];

    // Treat boundary points as inside so cart validation matches public zone detection.
    const cross = (lng - xi) * (yj - yi) - (lat - yi) * (xj - xi);
    if (Math.abs(cross) < epsilon) {
      const minX = Math.min(xi, xj) - epsilon;
      const maxX = Math.max(xi, xj) + epsilon;
      const minY = Math.min(yi, yj) - epsilon;
      const maxY = Math.max(yi, yj) + epsilon;
      if (lng >= minX && lng <= maxX && lat >= minY && lat <= maxY) {
        return true;
      }
    }

    const intersects = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || epsilon) + xi);

    if (intersects) inside = !inside;
  }

  return inside;
};

const calculateZoneArea = (zone) => {
  const polygonCoords = extractZonePolygon(zone);
  if (!Array.isArray(polygonCoords) || polygonCoords.length < 3) {
    return Number.POSITIVE_INFINITY;
  }

  let area = 0;
  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const [xi, yi] = polygonCoords[i];
    const [xj, yj] = polygonCoords[j];
    area += (xj * yi) - (xi * yj);
  }

  return Math.abs(area / 2);
};

/**
 * Find active zone containing a point
 * @param {Array} activeZones
 * @param {number} lat
 * @param {number} lng
 * @returns {Object|null}
 */
const findActiveZoneForPoint = (activeZones, lat, lng) => {
  if (!Array.isArray(activeZones)) return null;

  let bestZone = null;
  let bestArea = Number.POSITIVE_INFINITY;

  for (const zone of activeZones) {
    if (isPointInsideZone(lat, lng, zone)) {
      const area = calculateZoneArea(zone);
      if (area < bestArea) {
        bestArea = area;
        bestZone = zone;
      }
    }
  }
  return bestZone;
};

const findMappedZoneForRestaurant = (activeZones, restaurant = {}) => {
  if (!Array.isArray(activeZones) || !restaurant) return null;

  const explicitZoneId = restaurant?.zoneId?.toString?.() || String(restaurant?.zoneId || '');
  if (explicitZoneId) {
    const explicitZone = activeZones.find((zone) => {
      const zoneId = zone?._id?.toString?.() || String(zone?._id || '');
      return zoneId && zoneId === explicitZoneId;
    });
    if (explicitZone) return explicitZone;
  }

  const restaurantMongoId = restaurant?._id?.toString?.() || String(restaurant?._id || '');
  const restaurantPublicId = restaurant?.restaurantId ? String(restaurant.restaurantId) : null;

  for (const zone of activeZones) {
    const zoneRestaurantId = zone?.restaurantId?.toString?.() || String(zone?.restaurantId || '');
    if (!zoneRestaurantId) continue;
    if (restaurantMongoId && zoneRestaurantId === restaurantMongoId) return zone;
    if (restaurantPublicId && zoneRestaurantId === restaurantPublicId) return zone;
  }

  return null;
};

const resolveRestaurantZone = (activeZones, restaurant, restaurantLat, restaurantLng) => {
  const mappedZone = findMappedZoneForRestaurant(activeZones, restaurant);
  if (mappedZone) return mappedZone;
  return findActiveZoneForPoint(activeZones, restaurantLat, restaurantLng);
};

/**
 * Create a new order and initiate Razorpay payment
 */
export const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      items,
      address,
      addressId,
      restaurantId,
      restaurantName,
      pricing,
      deliveryFleet,
      note,
      sendCutlery,
      paymentMethod: bodyPaymentMethod,
      tipAmount: bodyTipAmount,
      returnUrl
    } = req.body;
    // Support both camelCase and snake_case from client
    const paymentMethod = bodyPaymentMethod ?? req.body.payment_method;

    // Normalize payment method: 'cod' / 'COD' / 'Cash on Delivery' → 'cash', 'wallet' → 'wallet'
    const normalizedPaymentMethod = (() => {
      const m = (paymentMethod && String(paymentMethod).toLowerCase().trim()) || '';
      if (m === 'cash' || m === 'cod' || m === 'cash on delivery') return 'cash';
      if (m === 'wallet') return 'wallet';
      return paymentMethod || 'cashfree';
    })();
    logger.info('Order create paymentMethod:', { raw: paymentMethod, normalized: normalizedPaymentMethod, bodyKeys: Object.keys(req.body || {}).filter(k => k.toLowerCase().includes('payment')) });

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must have at least one item'
      });
    }

    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address is required'
      });
    }

    let resolvedAddress = address;
    const normalizedAddressId = String(addressId || '').trim();
    if (normalizedAddressId) {
      const user = await User.findById(userId).select('addresses').lean();
      const matchedSavedAddress = (user?.addresses || []).find(
        (savedAddress) => savedAddress?._id?.toString?.() === normalizedAddressId
      );

      if (matchedSavedAddress) {
        resolvedAddress = {
          ...matchedSavedAddress,
          id: matchedSavedAddress._id?.toString?.() || normalizedAddressId
        };
      }
    }

    // Validate and assign restaurant - order goes to the restaurant whose food was ordered
    if (!restaurantId || restaurantId === 'unknown') {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required. Please select a restaurant.'
      });
    }

    let assignedRestaurantId = restaurantId;
    let assignedRestaurantName = restaurantName;

    // Log incoming restaurant data for debugging
    logger.info('🔍 Order creation - Restaurant lookup:', {
      incomingRestaurantId: restaurantId,
      incomingRestaurantName: restaurantName,
      restaurantIdType: typeof restaurantId,
      restaurantIdLength: restaurantId?.length
    });

    // Find and validate the restaurant
    let restaurant = await resolveRestaurantForOrder(restaurantId);
    // Try to find restaurant by restaurantId, _id, or slug
    if (mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
      restaurant = await Restaurant.findById(restaurantId);
      logger.info('🔍 Restaurant lookup by _id:', {
        restaurantId: restaurantId,
        found: !!restaurant,
        restaurantName: restaurant?.name
      });
    }
    if (!restaurant) {
      restaurant = await Restaurant.findOne({
        $or: [
          { restaurantId: restaurantId },
          { slug: restaurantId }
        ]
      });
      logger.info('🔍 Restaurant lookup by restaurantId/slug:', {
        restaurantId: restaurantId,
        found: !!restaurant,
        restaurantName: restaurant?.name,
        restaurant_restaurantId: restaurant?.restaurantId,
        restaurant__id: restaurant?._id?.toString()
      });
    }

    const normalizedIncomingRestaurantName = normalizeRestaurantNameValue(restaurantName);
    const normalizedFoundRestaurantName = normalizeRestaurantNameValue(restaurant?.name);

    if (
      normalizedIncomingRestaurantName &&
      (!restaurant || normalizedFoundRestaurantName !== normalizedIncomingRestaurantName)
    ) {
      const restaurantByName = await resolveRestaurantByNameForOrder(restaurantName);
      logger.info('Order restaurant lookup by incoming name:', {
        restaurantName,
        found: !!restaurantByName,
        restaurantIdFromName: restaurantByName?.restaurantId,
        restaurantMongoIdFromName: restaurantByName?._id?.toString(),
        restaurantIdFromIncomingId: restaurant?._id?.toString() || restaurant?.restaurantId
      });

      if (restaurantByName) {
        restaurant = restaurantByName;
        assignedRestaurantId =
          restaurant.restaurantId ||
          restaurant._id?.toString() ||
          assignedRestaurantId;
        assignedRestaurantName = restaurant.name || assignedRestaurantName;
      }
    }

    if (!restaurant) {
      logger.error('❌ Restaurant not found:', {
        searchedRestaurantId: restaurantId,
        searchedRestaurantName: restaurantName
      });
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // CRITICAL: Validate restaurant name matches
    if (restaurantName && normalizeRestaurantNameValue(restaurant.name) !== normalizedIncomingRestaurantName) {
      logger.warn('⚠️ Restaurant name mismatch:', {
        incomingName: restaurantName,
        foundRestaurantName: restaurant.name,
        incomingRestaurantId: restaurantId,
        foundRestaurantId: restaurant._id?.toString() || restaurant.restaurantId
      });
      // Still proceed but log the mismatch
    }

    // Block orders when restaurant has explicitly toggled offline
    if (restaurant.isAcceptingOrders === false) {
      logger.warn('⚠️ Restaurant not accepting orders:', {
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        restaurantName: restaurant.name
      });
      return res.status(403).json({
        success: false,
        message: 'Restaurant is currently not accepting orders. Please try again later.'
      });
    }

    // Block orders outside the restaurant's configured operating hours
    try {
      const outletTimings = await OutletTimings.findOne({
        restaurantId: restaurant._id,
        isActive: true
      }).lean();

      if (outletTimings && Array.isArray(outletTimings.timings)) {
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const nowIST = new Date(Date.now() + IST_OFFSET_MS);
        const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayName = DAY_NAMES[nowIST.getUTCDay()];
        const todayTiming = outletTimings.timings.find(t => t.day === todayName);

        if (todayTiming && todayTiming.isOpen === false) {
          logger.warn('⚠️ Restaurant is closed today:', {
            restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
            restaurantName: restaurant.name,
            day: todayName
          });
          return res.status(403).json({
            success: false,
            message: `Restaurant is closed on ${todayName}. Please try again on an open day.`
          });
        }

        if (todayTiming && todayTiming.openingTime && todayTiming.closingTime) {
          const parseTime = (timeStr) => {
            if (!timeStr) return null;
            const normalized = timeStr.trim().toLowerCase();
            const meridiemMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/);
            if (meridiemMatch) {
              let h = Number(meridiemMatch[1]);
              const m = Number(meridiemMatch[2]);
              if (meridiemMatch[3] === 'pm' && h < 12) h += 12;
              if (meridiemMatch[3] === 'am' && h === 12) h = 0;
              return h * 60 + m;
            }
            const h24Match = normalized.match(/^(\d{1,2}):(\d{2})$/);
            if (h24Match) return Number(h24Match[1]) * 60 + Number(h24Match[2]);
            return null;
          };

          const openMin = parseTime(todayTiming.openingTime);
          const closeMin = parseTime(todayTiming.closingTime);
          const nowMin = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes();

          if (openMin !== null && closeMin !== null) {
            let isWithin;
            if (closeMin > openMin) {
              isWithin = nowMin >= openMin && nowMin <= closeMin;
            } else {
              // Overnight window (e.g., 8 PM – 2 AM)
              isWithin = nowMin >= openMin || nowMin <= closeMin;
            }

            if (!isWithin) {
              logger.warn('⚠️ Restaurant is outside operating hours:', {
                restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
                restaurantName: restaurant.name,
                openingTime: todayTiming.openingTime,
                closingTime: todayTiming.closingTime,
                currentTimeIST: `${nowIST.getUTCHours()}:${String(nowIST.getUTCMinutes()).padStart(2, '0')}`
              });
              return res.status(403).json({
                success: false,
                message: `Restaurant is currently closed. Operating hours: ${todayTiming.openingTime} - ${todayTiming.closingTime}.`
              });
            }
          }
        }
      }
    } catch (timingsError) {
      // Non-blocking: if timings check fails, allow the order through
      logger.warn('⚠️ Failed to validate outlet timings, proceeding with order:', {
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        error: timingsError.message
      });
    }

    if (!restaurant.isActive && normalizedIncomingRestaurantName) {
      const activeRestaurantByName = await resolveActiveRestaurantByNameForOrder(restaurantName);
      logger.info('Order inactive restaurant recovery by name:', {
        incomingRestaurantName: restaurantName,
        currentRestaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        recoveredRestaurantId: activeRestaurantByName?._id?.toString() || activeRestaurantByName?.restaurantId,
        recoveredRestaurantName: activeRestaurantByName?.name
      });

      if (activeRestaurantByName) {
        restaurant = activeRestaurantByName;
        assignedRestaurantId =
          restaurant.restaurantId ||
          restaurant._id?.toString() ||
          assignedRestaurantId;
        assignedRestaurantName = restaurant.name || assignedRestaurantName;
      }
    }

    if (!restaurant.isActive) {
      logger.warn('⚠️ Restaurant is inactive:', {
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        restaurantName: restaurant.name,
        location: restaurant.location,
        onboardingLocation: restaurant.onboarding?.step1?.location
      });
      return res.status(403).json({
        success: false,
        message: 'Restaurant is currently inactive'
      });
    }

    // CRITICAL: Validate that restaurant's location (pin) is within an active zone
    const {
      location: normalizedRestaurantLocation,
      latitude: restaurantLat,
      longitude: restaurantLng
    } = extractRestaurantCoordinates(restaurant);
    restaurant.location = normalizedRestaurantLocation;
    
    if (!Number.isFinite(restaurantLat) || !Number.isFinite(restaurantLng)) {
      logger.error('❌ Restaurant location not found:', {
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        restaurantName: restaurant.name
      });
      return res.status(400).json({
        success: false,
        message: 'Restaurant location is not set. Please contact support.'
      });
    }

    // Check if restaurant is within any active zone
    const activeZones = await Zone.find({ isActive: true }).lean();
    const restaurantZone = resolveRestaurantZone(activeZones, restaurant, restaurantLat, restaurantLng);
    if (!restaurantZone) {
      logger.warn('⚠️ Restaurant location is not within any active zone:', {
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        restaurantName: restaurant.name,
        restaurantLat,
        restaurantLng
      });
      return res.status(403).json({
        success: false,
        message: 'This restaurant is not available in your area. Only restaurants within active delivery zones can receive orders.'
      });
    }

    logger.info('✅ Restaurant validated - location is within active zone:', {
      restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
      restaurantName: restaurant.name,
      zoneId: restaurantZone?._id?.toString(),
      zoneName: restaurantZone?.name || restaurantZone?.zoneName
    });

    // CRITICAL: User must be in an active zone and it must match the restaurant zone
    const addressLng = Number(resolvedAddress?.location?.coordinates?.[0]);
    const addressLat = Number(resolvedAddress?.location?.coordinates?.[1]);
    const hasValidAddressCoordinates = Number.isFinite(addressLat) &&
      Number.isFinite(addressLng) &&
      !(addressLat === 0 && addressLng === 0);

    if (!hasValidAddressCoordinates) {
      logger.warn('⚠️ Order blocked: invalid customer location coordinates', {
        userId,
        addressLocation: address?.location
      });
      return res.status(400).json({
        success: false,
        message: 'Valid delivery location is required to place an order.'
      });
    }

    const providedZoneId = String(req.body?.zoneId || '').trim();
    const userDetectedZone = findActiveZoneForPoint(activeZones, addressLat, addressLng);
    const providedZoneMatchesRestaurantZone = providedZoneId && providedZoneId === restaurantZone._id.toString();
    const effectiveUserZone = userDetectedZone || (providedZoneMatchesRestaurantZone ? restaurantZone : null);

    if (!effectiveUserZone) {
      logger.warn('⚠️ Order blocked: customer is outside active service zones', {
        userId,
        addressLat,
        addressLng,
        providedZoneId: providedZoneId || null,
        restaurantZoneId: restaurantZone._id.toString()
      });
      return res.status(403).json({
        success: false,
        message: 'Your delivery address is outside our active service zones.'
      });
    }

    const restaurantZoneId = restaurantZone._id.toString();
    const userDetectedZoneId = effectiveUserZone._id.toString();
    if (restaurantZoneId !== userDetectedZoneId) {
      logger.warn('⚠️ Zone mismatch - customer and restaurant are in different zones:', {
        userId,
        userDetectedZoneId,
        restaurantZoneId,
        providedZoneId: providedZoneId || null,
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        restaurantName: restaurant.name
      });
      return res.status(403).json({
        success: false,
        message: 'This restaurant is not available in your current delivery zone.'
      });
    }

    // Optional cross-check if frontend sends zoneId
    if (req.body?.zoneId && req.body.zoneId !== userDetectedZoneId) {
      logger.warn('⚠️ Frontend zoneId differs from detected customer zoneId', {
        providedZoneId: req.body.zoneId,
        detectedZoneId: userDetectedZoneId,
        userId
      });
    }

    logger.info('✅ Customer zone validated and matched with restaurant zone:', {
      zoneId: userDetectedZoneId,
      zoneName: effectiveUserZone?.name || effectiveUserZone?.zoneName,
      usedRestaurantZoneFallback: !userDetectedZone && providedZoneMatchesRestaurantZone,
      userId,
      restaurantId: restaurant._id?.toString() || restaurant.restaurantId
    });

    assignedRestaurantId = restaurant._id?.toString() || restaurant.restaurantId;
    assignedRestaurantName = restaurant.name;

    // Log restaurant assignment for debugging
    logger.info('✅ Restaurant assigned to order:', {
      assignedRestaurantId: assignedRestaurantId,
      assignedRestaurantName: assignedRestaurantName,
      restaurant_id: restaurant._id?.toString(),
      restaurant_restaurantId: restaurant.restaurantId,
      incomingRestaurantId: restaurantId,
      incomingRestaurantName: restaurantName
    });

    // Generate order ID before creating order
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const generatedOrderId = `ORD-${timestamp}-${random}`;
    const generatedDropOtp = generateDropDeliveryOtp();
    const dropOtpExpiresAt = new Date(Date.now() + (12 * 60 * 60 * 1000)); // 12 hours

    const couponCode =
      req.body?.couponCode ||
      pricing?.couponCode ||
      pricing?.appliedCoupon?.code ||
      null;
    const tipAmount = Math.max(
      0,
      Number(bodyTipAmount ?? pricing?.tipAmount ?? pricing?.tip ?? 0) || 0
    );
    const authoritativePricing = await calculateOrderPricing({
      items,
      restaurantId: assignedRestaurantId,
      deliveryAddress: resolvedAddress,
      couponCode,
      deliveryFleet: deliveryFleet || 'standard',
      tipAmount
    });

    if (!authoritativePricing || !authoritativePricing.total) {
      return res.status(400).json({
        success: false,
        message: 'Unable to calculate order pricing'
      });
    }

    const authoritativeItems = Array.isArray(authoritativePricing.items) && authoritativePricing.items.length > 0
      ? authoritativePricing.items
      : items;

    // Create order in database with pending status
    const order = new Order({
      orderId: generatedOrderId,
      userId,
      restaurantId: assignedRestaurantId,
      restaurantName: assignedRestaurantName,
      items: authoritativeItems,
      address: resolvedAddress,
      pricing: {
        ...authoritativePricing,
        couponCode
      },
      deliveryFleet: deliveryFleet || 'standard',
      note: note || '',
      sendCutlery: sendCutlery !== false,
      status: 'pending',
      payment: {
        method: normalizedPaymentMethod,
        status: 'pending'
      },
      assignmentInfo: {
        restaurantId: assignedRestaurantId,
        zoneId: userDetectedZoneId,
        zoneName: userDetectedZone?.name || userDetectedZone?.zoneName,
        assignedBy: 'zone_match'
      },
      deliveryVerification: {
        dropOtp: {
          code: generatedDropOtp,
          expiresAt: dropOtpExpiresAt,
          verifiedAt: null,
          verifiedBy: null,
          attempts: 0
        }
      }
    });

    // Parse preparation time from order items
    // Extract maximum preparation time from items (e.g., "20-25 mins" -> 25)
    let maxPreparationTime = 0;
    if (authoritativeItems && Array.isArray(authoritativeItems)) {
      authoritativeItems.forEach(item => {
        if (item.preparationTime) {
          const prepTimeStr = String(item.preparationTime).trim();
          // Parse formats like "20-25 mins", "20-25", "25 mins", "25"
          const match = prepTimeStr.match(/(\d+)(?:\s*-\s*(\d+))?/);
          if (match) {
            const minTime = parseInt(match[1], 10);
            const maxTime = match[2] ? parseInt(match[2], 10) : minTime;
            maxPreparationTime = Math.max(maxPreparationTime, maxTime);
          }
        }
      });
    }
    order.preparationTime = maxPreparationTime;
    logger.info('📋 Preparation time extracted from items:', {
      maxPreparationTime,
      itemsCount: items?.length || 0
    });

    // Calculate initial ETA
    try {
      const restaurantLocation = Number.isFinite(restaurantLat) && Number.isFinite(restaurantLng)
        ? {
            latitude: restaurantLat,
            longitude: restaurantLng
          }
        : null;

      const userLocation = address.location?.coordinates
        ? {
            latitude: address.location.coordinates[1],
            longitude: address.location.coordinates[0]
          }
        : null;

      if (restaurantLocation && userLocation) {
        const etaResult = await etaCalculationService.calculateInitialETA({
          restaurantId: assignedRestaurantId,
          restaurantLocation,
          userLocation
        });

        // Keep customer ETA as: item preparation time + delivery ETA
        // (eta service also carries restaurant-configured prep in breakdown.restaurantPrepTime)
        const restaurantConfiguredPrep = etaResult?.breakdown?.restaurantPrepTime || 0;
        const deliveryMinETA = Math.max(1, etaResult.minETA - restaurantConfiguredPrep);
        const deliveryMaxETA = Math.max(deliveryMinETA, etaResult.maxETA - restaurantConfiguredPrep);
        const finalMinETA = deliveryMinETA + maxPreparationTime;
        const finalMaxETA = deliveryMaxETA + maxPreparationTime;

        // Update order with ETA (including preparation time)
        order.eta = {
          min: finalMinETA,
          max: finalMaxETA,
          lastUpdated: new Date(),
          additionalTime: 0 // Will be updated when restaurant adds time
        };
        order.estimatedDeliveryTime = Math.ceil((finalMinETA + finalMaxETA) / 2);

        // Create order created event
        await OrderEvent.create({
          orderId: order._id,
          eventType: 'ORDER_CREATED',
          data: {
            initialETA: {
              min: finalMinETA,
              max: finalMaxETA
            },
            preparationTime: maxPreparationTime
          },
          timestamp: new Date()
        });

        logger.info('✅ ETA calculated for order:', {
          orderId: order.orderId,
          eta: `${finalMinETA}-${finalMaxETA} mins`,
          preparationTime: maxPreparationTime,
          deliveryETA: `${deliveryMinETA}-${deliveryMaxETA} mins`
        });
      } else {
        logger.warn('⚠️ Could not calculate ETA - missing location data');
      }
    } catch (etaError) {
      logger.error('❌ Error calculating ETA:', etaError);
      // Continue with order creation even if ETA calculation fails
    }

    await order.save();

    // Log order creation for debugging
    logger.info('Order created successfully:', {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
      restaurantId: order.restaurantId,
      userId: order.userId,
      status: order.status,
      total: order.pricing.total,
      eta: order.eta ? `${order.eta.min}-${order.eta.max} mins` : 'N/A',
      paymentMethod: normalizedPaymentMethod
    });

    // For wallet payments, check balance and deduct before creating order
    if (normalizedPaymentMethod === 'wallet') {
      try {
        // Find or create wallet
        const wallet = await UserWallet.findOrCreateByUserId(userId);
        
        // Check if sufficient balance
        if (order.pricing.total > wallet.balance) {
          return res.status(400).json({
            success: false,
            message: 'Insufficient wallet balance',
            data: {
              required: order.pricing.total,
              available: wallet.balance,
              shortfall: order.pricing.total - wallet.balance
            }
          });
        }

        // Check if transaction already exists for this order (prevent duplicate)
        const existingTransaction = wallet.transactions.find(
          t => t.orderId && t.orderId.toString() === order._id.toString() && t.type === 'deduction'
        );

        if (existingTransaction) {
          logger.warn('⚠️ Wallet payment already processed for this order', {
            orderId: order.orderId,
            transactionId: existingTransaction._id
          });
        } else {
          // Deduct money from wallet
          const transaction = wallet.addTransaction({
            amount: order.pricing.total,
            type: 'deduction',
            status: 'Completed',
            description: `Order payment - Order #${order.orderId}`,
            orderId: order._id
          });

          await wallet.save();

          // Update user's wallet balance in User model (for backward compatibility)
          const User = (await import('../../auth/models/User.js')).default;
          await User.findByIdAndUpdate(userId, {
            'wallet.balance': wallet.balance,
            'wallet.currency': wallet.currency
          });

          logger.info('✅ Wallet payment deducted for order:', {
            orderId: order.orderId,
            userId: userId,
            amount: order.pricing.total,
            transactionId: transaction._id,
            newBalance: wallet.balance
          });
        }

        // Create payment record
        try {
          const payment = new Payment({
            paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            orderId: order._id,
            userId,
            amount: order.pricing.total,
            currency: 'INR',
            method: 'wallet',
            status: 'completed',
            logs: [{
              action: 'completed',
              timestamp: new Date(),
              details: {
                previousStatus: 'new',
                newStatus: 'completed',
                note: 'Wallet payment completed'
              }
            }]
          });
          await payment.save();
        } catch (paymentError) {
          logger.error('❌ Error creating wallet payment record:', paymentError);
        }

        // Mark order as confirmed and payment as completed
        order.payment.method = 'wallet';
        order.payment.status = 'completed';
        order.status = 'confirmed';
        order.tracking.confirmed = {
          status: true,
          timestamp: new Date()
        };
        await order.save();

        // Notify restaurant about new wallet payment order
        try {
          const notifyRestaurantResult = await notifyRestaurantNewOrder(order, assignedRestaurantId, 'wallet');
          logger.info('✅ Wallet payment order notification sent to restaurant', {
            orderId: order.orderId,
            restaurantId: assignedRestaurantId,
            notifyRestaurantResult
          });
        } catch (notifyError) {
          logger.error('❌ Error notifying restaurant about wallet payment order:', notifyError);
        }

        try {
          const notifyAdminResult = await notifyAdminNewOrder(order);
          logger.info('✅ Wallet payment order notification sent to admin', {
            orderId: order.orderId,
            notifyAdminResult
          });
        } catch (adminNotifyError) {
          logger.error('❌ Error notifying admin about wallet payment order:', adminNotifyError);
        }

        // Respond to client
        return res.status(201).json({
          success: true,
          data: {
            order: {
              id: order._id.toString(),
              orderId: order.orderId,
              status: order.status,
              total: order.pricing.total,
              deliveryDropOtp: order.deliveryVerification?.dropOtp?.code || null
            },
            cashfree: null,
            wallet: {
              balance: wallet.balance,
              deducted: order.pricing.total
            }
          }
        });
      } catch (walletError) {
        logger.error('❌ Error processing wallet payment:', walletError);
        return res.status(500).json({
          success: false,
          message: 'Failed to process wallet payment',
          error: walletError.message
        });
      }
    }

    // For cash-on-delivery orders, confirm immediately and notify restaurant.
    // Online (Cashfree) orders follow the existing verifyOrderPayment flow.
    if (normalizedPaymentMethod === 'cash') {
      // Best-effort payment record; even if it fails we still proceed with order.
      try {
        const payment = new Payment({
          paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          orderId: order._id,
          userId,
          amount: order.pricing.total,
          currency: 'INR',
          method: 'cash',
          status: 'pending',
          logs: [{
            action: 'pending',
            timestamp: new Date(),
            details: {
              previousStatus: 'new',
              newStatus: 'pending',
              note: 'Cash on delivery order created'
            }
          }]
        });
        await payment.save();
      } catch (paymentError) {
        logger.error('❌ Error creating COD payment record (continuing without blocking order):', {
          error: paymentError.message,
          stack: paymentError.stack
        });
      }

      // Mark order as confirmed so restaurant can prepare it (ensure payment.method is cash for notification)
      order.payment.method = 'cash';
      order.payment.status = 'pending';
      order.status = 'confirmed';
      order.tracking.confirmed = {
        status: true,
        timestamp: new Date()
      };
      await order.save();

      // Notify restaurant about new COD order via Socket.IO (non-blocking)
      try {
        const notifyRestaurantResult = await notifyRestaurantNewOrder(order, assignedRestaurantId, 'cash');
        logger.info('✅ COD order notification sent to restaurant', {
          orderId: order.orderId,
          restaurantId: assignedRestaurantId,
          notifyRestaurantResult
        });
      } catch (notifyError) {
        logger.error('❌ Error notifying restaurant about COD order (order still created):', {
          error: notifyError.message,
          stack: notifyError.stack
        });
      }

      try {
        const notifyAdminResult = await notifyAdminNewOrder(order);
        logger.info('✅ COD order notification sent to admin', {
          orderId: order.orderId,
          notifyAdminResult
        });
      } catch (adminNotifyError) {
        logger.error('❌ Error notifying admin about COD order (order still created):', {
          error: adminNotifyError.message,
          stack: adminNotifyError.stack
        });
      }

      // Respond to client (no online payment details for COD)
      return res.status(201).json({
        success: true,
        data: {
          order: {
            id: order._id.toString(),
            orderId: order.orderId,
            status: order.status,
            total: order.pricing.total,
            deliveryDropOtp: order.deliveryVerification?.dropOtp?.code || null
          },
          cashfree: null
        }
      });
    }

    // Note: For online payments, restaurant notification will be sent
    // after payment verification in verifyOrderPayment. This ensures restaurant
    // only receives prepaid orders after successful payment.

    // Create Cashfree order for online payments
    let cashfreeOrder = null;
    if (normalizedPaymentMethod === 'cashfree' || !normalizedPaymentMethod) {
      try {
        const userCustomer = req.user || {};
        cashfreeOrder = await createCashfreeOrder({
          orderId: order.orderId,
          orderAmount: Number(order.pricing.total.toFixed(2)),
          customerDetails: {
            customerId: String(userId),
            customerName: userCustomer.name || 'Customer',
            customerEmail: userCustomer.email || 'customer@example.com',
            customerPhone: userCustomer.phone || ''
          },
          orderMeta: {
            payment_methods: 'upi,cc,dc,nb,wallet',
            ...(returnUrl ? { return_url: returnUrl } : {})
          },
          orderNote: `Order ${order.orderId}`,
          orderTags: {
            orderId: order.orderId,
            userId: userId.toString(),
            restaurantId: restaurantId || 'unknown'
          }
        });

        order.payment.cashfreeOrderId = cashfreeOrder.order_id;
        order.payment.cashfreePaymentSessionId = cashfreeOrder.payment_session_id;
        await order.save();
      } catch (cashfreeError) {
        const gatewayMessage =
          cashfreeError?.response?.data?.message ||
          cashfreeError?.response?.data?.type ||
          cashfreeError.message ||
          'Unable to initialize online payment';

        logger.error(`Error creating Cashfree order: ${gatewayMessage}`, {
          status: cashfreeError?.response?.status,
          data: cashfreeError?.response?.data
        });

        return res.status(502).json({
          success: false,
          message: gatewayMessage
        });
      }
    }

    logger.info(`Order created: ${order.orderId}`, {
      orderId: order.orderId,
      userId,
      amount: order.pricing.total,
      cashfreeOrderId: cashfreeOrder?.order_id
    });

    const cashfreeCredentials = cashfreeOrder ? await getCashfreeCredentials().catch(() => null) : null;

    res.status(201).json({
      success: true,
      data: {
        order: {
          id: order._id.toString(),
          orderId: order.orderId,
          status: order.status,
          total: order.pricing.total,
          deliveryDropOtp: order.deliveryVerification?.dropOtp?.code || null
        },
        cashfree: cashfreeOrder ? {
          orderId: cashfreeOrder.order_id,
          paymentSessionId: cashfreeOrder.payment_session_id,
          amount: cashfreeOrder.order_amount,
          currency: cashfreeOrder.order_currency || 'INR',
          environment: cashfreeCredentials?.environment || 'sandbox'
        } : null
      }
    });
  } catch (error) {
    logger.error(`Error creating order: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Verify payment and confirm order
 */
export const verifyOrderPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, cashfreeOrderId } = req.body;

    if (!orderId || !cashfreeOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment verification fields'
      });
    }

    // Find order (support both MongoDB ObjectId and orderId string)
    let order;
    try {
      // Try to find by MongoDB ObjectId first
      const mongoose = (await import('mongoose')).default;
      if (mongoose.Types.ObjectId.isValid(orderId)) {
        order = await Order.findOne({
          _id: orderId,
          userId
        });
      }
      
      // If not found, try by orderId string
      if (!order) {
        order = await Order.findOne({
          orderId: orderId,
          userId
        });
      }
    } catch (error) {
      // Fallback: try both
      order = await Order.findOne({
        $or: [
          { _id: orderId },
          { orderId: orderId }
        ],
        userId
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!order.payment?.cashfreeOrderId || cashfreeOrderId !== order.payment.cashfreeOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Payment session mismatch detected'
      });
    }

    // Idempotent success path: if this order is already confirmed after Cashfree payment,
    // return success instead of creating duplicate payment records or flipping status again.
    if (
      order.payment?.method === 'cashfree' &&
      order.payment?.status === 'completed' &&
      order.status === 'confirmed'
    ) {
      const existingPayment = await Payment.findOne({
        orderId: order._id,
        method: 'cashfree',
        status: 'completed'
      })
        .sort({ completedAt: -1, createdAt: -1 })
        .lean();

      return res.json({
        success: true,
        data: {
          order: {
            id: order._id.toString(),
            orderId: order.orderId,
            status: order.status
          },
          payment: existingPayment ? {
            id: existingPayment._id.toString(),
            paymentId: existingPayment.paymentId,
            status: existingPayment.status
          } : {
            id: null,
            paymentId: order.payment?.cashfreePaymentId || null,
            status: order.payment?.status || 'completed'
          }
        }
      });
    }

    // Cashfree may take a moment to expose the payment as SUCCESS after checkout closes.
    // Retry briefly before treating it as still pending.
    let verification = null;
    const verificationAttempts = 5;
    for (let attempt = 1; attempt <= verificationAttempts; attempt += 1) {
      verification = await verifyCashfreeOrderPayment(cashfreeOrderId);
      if (verification?.isPaid && verification?.payment) {
        break;
      }
      if (attempt < verificationAttempts) {
        await wait(1500);
      }
    }

    if (!verification?.isPaid || !verification?.payment) {
      const cashfreeOrderStatus = verification?.order?.order_status || null;
      const latestPaymentStatus = verification?.payment?.payment_status || null;
      const normalizedOrderStatus = String(cashfreeOrderStatus || '').toUpperCase();
      const normalizedPaymentStatus = String(latestPaymentStatus || '').toUpperCase();
      const isDefinitelyFailed =
        normalizedOrderStatus === 'FAILED' ||
        normalizedPaymentStatus === 'FAILED' ||
        normalizedPaymentStatus === 'USER_DROPPED' ||
        normalizedPaymentStatus === 'CANCELLED';

      order.payment.method = 'cashfree';
      order.payment.cashfreeOrderId = cashfreeOrderId;
      order.payment.cashfreeOrderStatus = cashfreeOrderStatus;
      order.payment.cashfreePaymentStatus = latestPaymentStatus;
      order.payment.status = isDefinitelyFailed ? 'failed' : 'pending';
      await order.save();

      return res.status(isDefinitelyFailed ? 400 : 202).json({
        success: false,
        pending: !isDefinitelyFailed,
        message: isDefinitelyFailed
          ? 'Online payment failed or was cancelled'
          : 'Payment confirmation is still pending. Please wait a moment and try again.',
        data: {
          order: {
            id: order._id.toString(),
            orderId: order.orderId,
            status: order.status,
            paymentStatus: order.payment.status
          },
          cashfree: {
            orderId: cashfreeOrderId,
            orderStatus: cashfreeOrderStatus,
            paymentStatus: latestPaymentStatus
          }
        }
      });
    }

    const cashfreePaymentId = verification.payment.cf_payment_id;
    const verificationUserId = String(
      verification.order?.order_tags?.userId ||
      verification.order?.customer_details?.customer_id ||
      ''
    );
    if (verificationUserId !== String(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Payment session does not belong to this user'
      });
    }

    if (String(verification.order?.order_id || '') !== order.payment.cashfreeOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Payment session mismatch detected'
      });
    }

    const verifiedAmount = Number(verification.order?.order_amount || 0);
    if (!verifiedAmount || Math.abs(verifiedAmount - Number(order.pricing?.total || 0)) > 0.01) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount mismatch detected'
      });
    }

    const existingCompletedPayment = await Payment.findOne({
      orderId: order._id,
      method: 'cashfree',
      $or: [
        { transactionId: cashfreePaymentId },
        { 'cashfree.paymentId': cashfreePaymentId },
        { 'cashfree.orderId': cashfreeOrderId }
      ]
    })
      .sort({ completedAt: -1, createdAt: -1 });

    let payment = existingCompletedPayment;

    if (!payment) {
      payment = new Payment({
        paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        orderId: order._id,
        userId,
        amount: order.pricing.total,
        currency: 'INR',
        method: 'cashfree',
        status: 'completed',
        cashfree: {
          orderId: cashfreeOrderId,
          paymentId: cashfreePaymentId,
          paymentSessionId: order.payment?.cashfreePaymentSessionId || null,
          orderStatus: verification.order?.order_status || null,
          paymentStatus: verification.payment?.payment_status || null,
          notes: {
            orderId: order.orderId
          }
        },
        transactionId: cashfreePaymentId,
        gatewayResponse: {
          order: verification.order,
          payment: verification.payment
        },
        completedAt: new Date(),
        logs: [{
          action: 'completed',
          timestamp: new Date(),
          details: {
            cashfreeOrderId,
            cashfreePaymentId
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        }]
      });

      await payment.save();
    } else {
      payment.status = 'completed';
      payment.cashfree = {
        ...(payment.cashfree || {}),
        orderId: cashfreeOrderId,
        paymentId: cashfreePaymentId,
        paymentSessionId: order.payment?.cashfreePaymentSessionId || payment.cashfree?.paymentSessionId || null,
        orderStatus: verification.order?.order_status || null,
        paymentStatus: verification.payment?.payment_status || null,
        notes: {
          ...(payment.cashfree?.notes || {}),
          orderId: order.orderId
        }
      };
      payment.transactionId = cashfreePaymentId;
      payment.gatewayResponse = {
        order: verification.order,
        payment: verification.payment
      };
      payment.completedAt = payment.completedAt || new Date();
      await payment.save();
    }

    // Update order status
    order.payment.status = 'completed';
    order.payment.method = 'cashfree';
    order.payment.cashfreeOrderId = cashfreeOrderId;
    order.payment.cashfreePaymentId = cashfreePaymentId;
    order.payment.cashfreeOrderStatus = verification.order?.order_status || null;
    order.payment.cashfreePaymentStatus = verification.payment?.payment_status || null;
    order.payment.transactionId = cashfreePaymentId;
    order.status = 'confirmed';
    order.tracking.confirmed = { status: true, timestamp: new Date() };
    await order.save();

    // Calculate order settlement and hold escrow
    try {
      // Calculate settlement breakdown
      await calculateOrderSettlement(order._id);
      
      // Hold funds in escrow
      await holdEscrow(order._id, userId, order.pricing.total);
      
      logger.info(`✅ Order settlement calculated and escrow held for order ${order.orderId}`);
    } catch (settlementError) {
      logger.error(`❌ Error calculating settlement for order ${order.orderId}:`, settlementError);
      // Don't fail payment verification if settlement calculation fails
      // But log it for investigation
    }

    // Notify restaurant about confirmed order (payment verified)
    try {
      const restaurantId = order.restaurantId?.toString() || order.restaurantId;
      const restaurantName = order.restaurantName;
      
      // CRITICAL: Log detailed info before notification
      logger.info('🔔 CRITICAL: Attempting to notify restaurant about confirmed order:', {
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
        restaurantId: restaurantId,
        restaurantName: restaurantName,
        restaurantIdType: typeof restaurantId,
        orderRestaurantId: order.restaurantId,
        orderRestaurantIdType: typeof order.restaurantId,
        orderStatus: order.status,
        orderCreatedAt: order.createdAt,
        orderItems: order.items.map(item => ({ name: item.name, quantity: item.quantity }))
      });
      
      // Verify order has restaurantId before notifying
      if (!restaurantId) {
        logger.error('❌ CRITICAL: Cannot notify restaurant - order.restaurantId is missing!', {
          orderId: order.orderId,
          order: {
            _id: order._id?.toString(),
            restaurantId: order.restaurantId,
            restaurantName: order.restaurantName
          }
        });
        throw new Error('Order restaurantId is missing');
      }
      
      // Verify order has restaurantName before notifying
      if (!restaurantName) {
        logger.warn('⚠️ Order restaurantName is missing:', {
          orderId: order.orderId,
          restaurantId: restaurantId
        });
      }
      
      const notificationResult = await notifyRestaurantNewOrder(order, restaurantId);
      
      logger.info(`✅ Successfully notified restaurant about confirmed order:`, {
        orderId: order.orderId,
        restaurantId: restaurantId,
        restaurantName: restaurantName,
        notificationResult: notificationResult
      });
    } catch (notificationError) {
      logger.error(`❌ CRITICAL: Error notifying restaurant after payment verification:`, {
        error: notificationError.message,
        stack: notificationError.stack,
        orderId: order.orderId,
        orderMongoId: order._id?.toString(),
        restaurantId: order.restaurantId,
        restaurantName: order.restaurantName,
        orderStatus: order.status
      });
      // Don't fail payment verification if notification fails
      // Order is still saved and restaurant can fetch it via API
      // But log it as critical for debugging
    }

    try {
      const notifyAdminResult = await notifyAdminNewOrder(order);
      logger.info('✅ Online payment verified order notification sent to admin', {
        orderId: order.orderId,
        notifyAdminResult
      });
    } catch (adminNotifyError) {
      logger.error('❌ Error notifying admin after payment verification:', {
        error: adminNotifyError.message,
        stack: adminNotifyError.stack,
        orderId: order.orderId,
        orderMongoId: order._id?.toString()
      });
    }

    logger.info(`Order payment verified: ${order.orderId}`, {
      orderId: order.orderId,
      paymentId: payment.paymentId,
      cashfreePaymentId
    });

    res.json({
      success: true,
      data: {
        order: {
          id: order._id.toString(),
          orderId: order.orderId,
          status: order.status
        },
        payment: {
          id: payment._id.toString(),
          paymentId: payment.paymentId,
          status: payment.status
        }
      }
    });
  } catch (error) {
    logger.error(`Error verifying order payment: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create Cashfree order for post-delivery tip payment
 * POST /api/order/:id/tip/create-order
 */
export const createOrderTipPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const tipAmount = Math.max(0, Number(req.body?.amount) || 0);

    if (!tipAmount || tipAmount < 1) {
      return res.status(400).json({
        success: false,
        message: 'Tip amount must be at least 1'
      });
    }

    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({ _id: id, userId });
    }
    if (!order) {
      order = await Order.findOne({ orderId: id, userId });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!order.deliveryPartnerId) {
      return res.status(400).json({
        success: false,
        message: 'Delivery partner not assigned for this order'
      });
    }

    const cashfreeOrderId = `TIP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const cashfreeOrder = await createCashfreeOrder({
      orderId: cashfreeOrderId,
      orderAmount: Number(tipAmount.toFixed(2)),
      customerDetails: {
        customerId: String(userId),
        customerName: req.user?.name || 'Customer',
        customerEmail: req.user?.email || 'customer@example.com',
        customerPhone: req.user?.phone || ''
      },
      orderNote: `Tip for order ${order.orderId}`,
      orderTags: {
        type: 'delivery_tip',
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
        userId: String(userId),
        deliveryPartnerId: String(order.deliveryPartnerId),
        tipAmount: String(tipAmount)
      }
    });

    order.tipPayments = Array.isArray(order.tipPayments) ? order.tipPayments : [];
    order.tipPayments.push({
      amount: tipAmount,
      status: 'pending',
      cashfreeOrderId: cashfreeOrder.order_id,
      cashfreePaymentSessionId: cashfreeOrder.payment_session_id
    });
    await order.save();

    const credentials = await getCashfreeCredentials().catch(() => null);

    return res.status(201).json({
      success: true,
      data: {
        orderId: order.orderId,
        tipAmount,
        cashfree: {
          orderId: cashfreeOrder.order_id,
          paymentSessionId: cashfreeOrder.payment_session_id,
          amount: cashfreeOrder.order_amount,
          currency: cashfreeOrder.order_currency || 'INR',
          environment: credentials?.environment || 'sandbox'
        }
      }
    });
  } catch (error) {
    logger.error(`Error creating tip payment order: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to initiate tip payment'
    });
  }
};

/**
 * Verify post-delivery tip payment and credit delivery wallet
 * POST /api/order/:id/tip/verify-payment
 */
export const verifyOrderTipPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { cashfreeOrderId } = req.body || {};

    if (!cashfreeOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment verification fields'
      });
    }

    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({ _id: id, userId });
    }
    if (!order) {
      order = await Order.findOne({ orderId: id, userId });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!order.deliveryPartnerId) {
      return res.status(400).json({
        success: false,
        message: 'Delivery partner not found for this order'
      });
    }

    const tipEntry = (order.tipPayments || []).find(t => t.cashfreeOrderId === cashfreeOrderId);
    if (!tipEntry) {
      return res.status(400).json({
        success: false,
        message: 'Tip payment session not found'
      });
    }

    const existingPayment = await Payment.findOne({
      orderId: order._id,
      method: 'cashfree',
      status: 'completed',
      'cashfree.orderId': cashfreeOrderId
    });

    if (existingPayment) {
      return res.json({
        success: true,
        message: 'Tip payment already processed',
        data: {
          orderId: order.orderId,
          paymentId: existingPayment.paymentId
        }
      });
    }

    const verification = await verifyCashfreeOrderPayment(cashfreeOrderId);
    if (!verification?.isPaid || !verification?.payment) {
      if (tipEntry) {
        tipEntry.status = 'failed';
        await order.save();
      }

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    const cashfreePaymentId = verification.payment.cf_payment_id;
    const verificationUserId = String(
      verification.order?.order_tags?.userId ||
      verification.order?.customer_details?.customer_id ||
      ''
    );
    if (verificationUserId !== String(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Payment session does not belong to this user'
      });
    }

    if (String(verification.order?.order_id || '') !== tipEntry.cashfreeOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Tip payment session mismatch detected'
      });
    }

    if (tipEntry.status === 'completed') {
      return res.json({
        success: true,
        message: 'Tip payment already processed',
        data: {
          orderId: order.orderId
        }
      });
    }

    const tipAmount = Math.max(0, Number(tipEntry.amount) || 0);
    if (!tipAmount) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tip amount'
      });
    }

    const verifiedTipAmount = Number(verification.order?.order_amount || 0);
    if (!verifiedTipAmount || Math.abs(verifiedTipAmount - tipAmount) > 0.01) {
      return res.status(400).json({
        success: false,
        message: 'Tip payment amount mismatch detected'
      });
    }

    const payment = new Payment({
      paymentId: `TIP-PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      orderId: order._id,
      userId,
      amount: tipAmount,
      currency: 'INR',
      method: 'cashfree',
      status: 'completed',
      cashfree: {
        orderId: cashfreeOrderId,
        paymentId: cashfreePaymentId,
        paymentSessionId: tipEntry.cashfreePaymentSessionId || null,
        orderStatus: verification.order?.order_status || null,
        paymentStatus: verification.payment?.payment_status || null,
        notes: {
          type: 'delivery_tip',
          orderId: order.orderId
        }
      },
      transactionId: cashfreePaymentId,
      gatewayResponse: {
        order: verification.order,
        payment: verification.payment
      },
      completedAt: new Date(),
      logs: [{
        action: 'completed',
        timestamp: new Date(),
        details: {
          type: 'delivery_tip',
          orderId: order.orderId,
          cashfreeOrderId,
          cashfreePaymentId
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }]
    });
    await payment.save();

    const wallet = await DeliveryWallet.findOrCreateByDeliveryId(order.deliveryPartnerId);
    wallet.addTransaction({
      amount: tipAmount,
      type: 'tip',
      status: 'Completed',
      description: `Customer tip for order ${order.orderId}`,
      orderId: order._id,
      paymentMethod: 'upi',
      paymentCollected: false,
      metadata: {
        source: 'post_delivery_tip',
        cashfreeOrderId,
        cashfreePaymentId,
        paymentRecordId: payment._id.toString()
      },
      processedAt: new Date()
    });
    await wallet.save();

    tipEntry.status = 'completed';
    tipEntry.cashfreePaymentId = cashfreePaymentId;
    tipEntry.cashfreeOrderStatus = verification.order?.order_status || null;
    tipEntry.cashfreePaymentStatus = verification.payment?.payment_status || null;
    tipEntry.paymentRecordId = payment._id;
    tipEntry.paidAt = new Date();
    order.additionalTip = Math.max(0, Number(order.additionalTip) || 0) + tipAmount;
    await order.save();

    logger.info(`Order tip payment verified: ${order.orderId}`, {
      orderId: order.orderId,
      tipAmount,
      cashfreePaymentId,
      deliveryPartnerId: String(order.deliveryPartnerId)
    });

    return res.json({
      success: true,
      data: {
        order: {
          id: order._id.toString(),
          orderId: order.orderId,
          additionalTip: order.additionalTip
        },
        payment: {
          id: payment._id.toString(),
          paymentId: payment.paymentId,
          status: payment.status,
          amount: tipAmount
        }
      }
    });
  } catch (error) {
    logger.error(`Error verifying tip payment: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to verify tip payment'
    });
  }
};

/**
 * Get user orders
 */
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { status, limit = 20, page = 1 } = req.query;

    if (!userId) {
      logger.error('User ID not found in request');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Build query - MongoDB should handle string/ObjectId conversion automatically
    // But we'll try both formats to be safe
    const mongoose = (await import('mongoose')).default;
    const query = { userId };
    
    // If userId is a string that looks like ObjectId, also try ObjectId format
    if (typeof userId === 'string' && mongoose.Types.ObjectId.isValid(userId)) {
      query.$or = [
        { userId: userId },
        { userId: new mongoose.Types.ObjectId(userId) }
      ];
      delete query.userId; // Remove direct userId since we're using $or
    }
    
    // Add status filter if provided
    if (status) {
      if (query.$or) {
        // Add status to each $or condition
        query.$or = query.$or.map(condition => ({ ...condition, status }));
      } else {
        query.status = status;
      }
    }
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    logger.info(`Fetching orders for user: ${userId}, query: ${JSON.stringify(query)}`);

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .select('-__v')
      .populate('restaurantId', 'name slug profileImage address location phone ownerPhone')
      .populate('userId', 'name phone email')
      .lean();

    const total = await Order.countDocuments(query);

    logger.info(`Found ${orders.length} orders for user ${userId} (total: ${total})`);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error(`Error fetching user orders: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

/**
 * Get order details
 */
export const getOrderDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;
    
    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        userId
      })
        .populate('deliveryPartnerId', 'name email phone')
        .populate('userId', 'name fullName phone email')
        .lean();
    }
    
    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        userId
      })
        .populate('deliveryPartnerId', 'name email phone')
        .populate('userId', 'name fullName phone email')
        .lean();
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Ensure user tracking always gets actual restaurant location (zone-setup pin).
    const restaurantDoc = await resolveRestaurantForOrder(order.restaurantId);
    if (restaurantDoc) {
      order.restaurantId = restaurantDoc;
      order.restaurant = restaurantDoc;
    }

    // Get payment details
    const payment = await Payment.findOne({
      orderId: order._id
    }).lean();

    res.json({
      success: true,
      data: {
        order,
        payment
      }
    });
  } catch (error) {
    logger.error(`Error fetching order details: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
};

/**
 * Submit user review for an order
 * PATCH /api/order/:id/review
 */
export const submitOrderReview = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    const { restaurantRating, deliveryRating, comment } = req.body || {};

    const parseRating = (value) => {
      if (value === undefined || value === null || value === '') return null;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) return null;
      return Math.round(parsed);
    };

    const parsedRestaurantRating = parseRating(restaurantRating);
    const parsedDeliveryRating = parseRating(deliveryRating);
    const normalizedComment = comment ? String(comment).trim() : '';

    if (!parsedRestaurantRating && !parsedDeliveryRating) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one valid rating between 1 and 5'
      });
    }

    // Find order by MongoDB _id or custom orderId and ensure ownership
    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({ _id: id, userId });
    }
    if (!order) {
      order = await Order.findOne({ orderId: id, userId });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const normalizedStatus = String(order.status || '').toLowerCase();
    if (normalizedStatus !== 'delivered' && normalizedStatus !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'You can submit a review only after delivery'
      });
    }

    // Keep existing behavior (single rating) while extending with delivery/restaurant ratings.
    const effectiveRestaurantRating =
      parsedRestaurantRating ||
      order.review?.restaurantRating ||
      order.review?.rating ||
      null;
    const effectiveDeliveryRating =
      parsedDeliveryRating ||
      order.review?.deliveryRating ||
      null;

    const reviewRatings = [effectiveRestaurantRating, effectiveDeliveryRating]
      .filter((value) => Number.isFinite(value));
    const overallRating = reviewRatings.length > 0
      ? Math.round(reviewRatings.reduce((sum, value) => sum + value, 0) / reviewRatings.length)
      : null;

    order.review = {
      ...order.review,
      rating: overallRating,
      restaurantRating: effectiveRestaurantRating,
      deliveryRating: effectiveDeliveryRating,
      comment: normalizedComment || order.review?.comment || '',
      submittedAt: new Date(),
      reviewedBy: userId
    };

    await order.save();

    return res.json({
      success: true,
      message: 'Review submitted successfully',
      data: {
        review: {
          rating: order.review?.rating || null,
          restaurantRating: order.review?.restaurantRating || null,
          deliveryRating: order.review?.deliveryRating || null,
          comment: order.review?.comment || '',
          submittedAt: order.review?.submittedAt || null
        }
      }
    });
  } catch (error) {
    logger.error(`Error submitting order review: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit review'
    });
  }
};

/**
 * Cancel order by user
 * PATCH /api/order/:id/cancel
 */
export const cancelOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason is required'
      });
    }

    // Find order by MongoDB _id or orderId
    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        userId
      });
    }

    if (!order) {
      order = await Order.findOne({
        orderId: id,
        userId
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    if (order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Order is already cancelled'
      });
    }

    if (order.status === 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a delivered order'
      });
    }

    // Get payment method from order or payment record
    const paymentMethod = order.payment?.method;
    const payment = await Payment.findOne({ orderId: order._id });
    const paymentMethodFromPayment = payment?.method || payment?.paymentMethod;

    // Determine the actual payment method
    const actualPaymentMethod = paymentMethod || paymentMethodFromPayment;

    // Allow cancellation for all payment methods (Cashfree, COD, Wallet)
    // Only restrict if order is already cancelled or delivered (checked above)

    // Update order status
    order.status = 'cancelled';
    order.cancellationReason = reason.trim();
    order.cancelledBy = 'user';
    order.cancelledAt = new Date();
    await order.save();

    // Calculate refunds for online payments (Cashfree/Razorpay) and wallet.
    // Additionally: if wallet money was used as a partial payment, refund that wallet deduction instantly.
    let refundMessage = '';
    if (actualPaymentMethod === 'cashfree' || actualPaymentMethod === 'razorpay' || actualPaymentMethod === 'wallet') {
      try {
        const {
          calculateCancellationRefund,
          processWalletRefund,
          refundWalletDeductionsForCancelledOrder
        } = await import('../services/cancellationRefundService.js');

        // Mixed payment support: if user used wallet partially but main method is NOT wallet,
        // credit back the wallet deduction immediately.
        if (actualPaymentMethod !== 'wallet') {
          try {
            const walletRefund = await refundWalletDeductionsForCancelledOrder(order._id, null);
            if (walletRefund?.refunded && walletRefund?.amount > 0) {
              refundMessage += ` Wallet amount ₹${walletRefund.amount} has been credited back instantly.`;
            }
          } catch (walletRefundError) {
            logger.error(`Wallet partial refund failed for order ${order.orderId}:`, walletRefundError);
          }
        }

        if (actualPaymentMethod === 'wallet') {
          // Wallet-paid orders must be auto-refunded instantly.
          // IMPORTANT: Do NOT depend on OrderSettlement here because many wallet orders may not have one.
          // `processWalletRefund` will create a settlement if missing.
          const refundAmount = Number(order.pricing?.total) || 0;
          await processWalletRefund(order._id, null, refundAmount);
          logger.info(`Automatic wallet refund processed for order ${order.orderId} of amount ${refundAmount}`);
          if (refundAmount > 0) {
            refundMessage += ` Refund of ₹${refundAmount} has been automatically credited back to your wallet.`;
          } else {
            refundMessage += ' Refund has been initiated to your wallet.';
          }
        } else {
          const refundDetails = await calculateCancellationRefund(order._id, reason);
          logger.info(`Cancellation refund calculated for order ${order.orderId}`);
          refundMessage += ' Refund will be processed after admin approval.';
        }
      } catch (refundError) {
        logger.error(`Error calculating/processing cancellation refund for order ${order.orderId}:`, refundError);
        // Don't fail the cancellation if refund calculation fails
      }
    } else if (actualPaymentMethod === 'cash') {
      refundMessage = ' No refund required as payment was not made.';
    }

    res.json({
      success: true,
      message: `Order cancelled successfully.${refundMessage}`,
      data: {
        order: {
          orderId: order.orderId,
          status: order.status,
          cancellationReason: order.cancellationReason,
          cancelledAt: order.cancelledAt
        }
      }
    });
  } catch (error) {
    logger.error(`Error cancelling order: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel order'
    });
  }
};

/**
 * Calculate order pricing
 */
export const calculateOrder = async (req, res) => {
  try {
    const { items, restaurantId, deliveryAddress, couponCode, deliveryFleet, tipAmount } = req.body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must have at least one item'
      });
    }

    // Calculate pricing
    const pricing = await calculateOrderPricing({
      items,
      restaurantId,
      deliveryAddress,
      couponCode,
      deliveryFleet: deliveryFleet || 'standard',
      tipAmount: Math.max(0, Number(tipAmount) || 0)
    });

    res.json({
      success: true,
      data: {
        pricing
      }
    });
  } catch (error) {
    logger.error(`Error calculating order pricing: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to calculate order pricing',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


import Delivery from '../../delivery/models/Delivery.js';
import Order from '../models/Order.js';
import Zone from '../../admin/models/Zone.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import BusinessSettings from '../../admin/models/BusinessSettings.js';
import DeliveryWallet from '../../delivery/models/DeliveryWallet.js';
import mongoose from 'mongoose';

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

function isPointInsideZone(lat, lng, coordinates = []) {
  if (!Array.isArray(coordinates) || coordinates.length < 3) return false;

  let inside = false;
  for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
    const pointI = coordinates[i] || {};
    const pointJ = coordinates[j] || {};
    const yi = Number(pointI.latitude);
    const xi = Number(pointI.longitude);
    const yj = Number(pointJ.latitude);
    const xj = Number(pointJ.longitude);

    if (
      Number.isNaN(yi) ||
      Number.isNaN(xi) ||
      Number.isNaN(yj) ||
      Number.isNaN(xj)
    ) {
      continue;
    }

    const intersects = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }

  return inside;
}

async function resolveRestaurantZone(restaurantId, restaurantLat, restaurantLng) {
  // First try direct restaurantId mapping
  if (restaurantId) {
    const restaurantIdObj = restaurantId.toString ? restaurantId.toString() : restaurantId;
    const mappedZone = await Zone.findOne({
      restaurantId: restaurantIdObj,
      isActive: true
    }).lean();
    if (mappedZone) return mappedZone;
  }

  // Fallback to location-based zone lookup
  const activeZones = await Zone.find({ isActive: true }).lean();
  for (const zone of activeZones) {
    if (isPointInsideZone(restaurantLat, restaurantLng, zone?.coordinates)) {
      return zone;
    }
  }

  return null;
}

async function resolveRequiredZone(requiredZoneId, restaurantId, restaurantLat, restaurantLng) {
  if (requiredZoneId && mongoose.Types.ObjectId.isValid(String(requiredZoneId))) {
    const explicitZone = await Zone.findOne({
      _id: String(requiredZoneId),
      isActive: true
    }).lean();
    if (explicitZone) return explicitZone;
    console.warn(`Required zone ${requiredZoneId} is missing/inactive, falling back to restaurant zone resolution`);
  }

  return resolveRestaurantZone(restaurantId, restaurantLat, restaurantLng);
}

function isPartnerInsideRequiredZone(partner, zone, lat, lng) {
  if (!zone) return false;
  const requiredZoneId = zone?._id?.toString();

  if (partner?.zoneId && String(partner.zoneId) === requiredZoneId) {
    return true;
  }

  const assignedZones = Array.isArray(partner?.availability?.zones)
    ? partner.availability.zones.map((z) => z?.toString?.() || String(z))
    : [];
  if (assignedZones.length > 0) {
    return assignedZones.includes(requiredZoneId);
  }

  if (zone.coordinates && zone.coordinates.length >= 3) {
    return isPointInsideZone(lat, lng, zone.coordinates);
  }

  return false;
}

async function getGlobalDeliveryCashLimit() {
  try {
    const settings = await BusinessSettings.getSettings();
    const configured = Number(settings?.deliveryCashLimit);
    if (Number.isFinite(configured) && configured >= 0) {
      return { enforce: true, limit: configured };
    }
  } catch (error) {
    console.warn(`⚠️ Failed to load delivery cash limit settings: ${error.message}`);
  }
  return { enforce: false, limit: null };
}

async function filterPartnersByAvailableCashLimit(deliveryPartners = []) {
  if (!Array.isArray(deliveryPartners) || deliveryPartners.length === 0) {
    return [];
  }

  const { enforce, limit } = await getGlobalDeliveryCashLimit();
  if (!enforce) {
    return deliveryPartners;
  }

  if (limit <= 0) {
    console.warn('⚠️ Global delivery cash limit is 0; no delivery partner is eligible for new order assignment');
    return [];
  }

  const partnerIds = deliveryPartners
    .map((partner) => partner?._id)
    .filter((id) => mongoose.Types.ObjectId.isValid(String(id)));

  if (partnerIds.length === 0) {
    return [];
  }

  const wallets = await DeliveryWallet.find({ deliveryId: { $in: partnerIds } })
    .select('deliveryId cashInHand')
    .lean();
  const walletByDeliveryId = new Map(
    wallets.map((wallet) => [String(wallet.deliveryId), Number(wallet.cashInHand) || 0])
  );

  const eligiblePartners = deliveryPartners.filter((partner) => {
    const deliveryId = String(partner?._id || '');
    const cashInHand = Math.max(0, Number(walletByDeliveryId.get(deliveryId)) || 0);
    const availableCashLimit = Math.max(0, limit - cashInHand);
    return availableCashLimit > 0;
  });

  if (eligiblePartners.length !== deliveryPartners.length) {
    console.log(`🚫 Filtered ${deliveryPartners.length - eligiblePartners.length} delivery partner(s) due to exhausted available cash limit`);
  }

  return eligiblePartners;
}

/**
 * Find all nearest available delivery boys within priority distance (for priority notification)
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {string} restaurantId - Restaurant ID (for zone lookup)
 * @param {number} priorityDistance - Priority distance in km (default: 5km)
 * @returns {Promise<Array>} Array of delivery boys within priority distance
 */
export async function findNearestDeliveryBoys(restaurantLat, restaurantLng, restaurantId = null, priorityDistance = 5, options = {}) {
  try {
    console.log(`🔍 Searching for priority delivery partners within ${priorityDistance}km of restaurant: ${restaurantLat}, ${restaurantLng}`);
    
    // Use the same logic as findNearestDeliveryBoy but return all within priority distance
    let zone = null;
    let deliveryQuery = {
      'availability.isOnline': true,
      status: { $in: ['approved', 'active'] },
      isActive: true,
      'availability.currentLocation.coordinates': {
        $exists: true,
        $ne: [0, 0]
      }
    };

    const optionsObj = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const requiredZoneId = optionsObj.requiredZoneId || null;

    try {
      zone = await resolveRequiredZone(requiredZoneId, restaurantId, restaurantLat, restaurantLng);
      if (zone) {
        console.log(`✅ Found zone: ${zone.name || zone.zoneName} for restaurant ${restaurantId || 'location'}`);
      } else {
        console.warn(`⚠️ No active zone found for restaurant location; skipping delivery notification`);
        return [];
      }
    } catch (zoneError) {
      console.warn(`⚠️ Error finding zone:`, zoneError.message);
      return [];
    }

    const deliveryPartners = await Delivery.find(deliveryQuery)
      .select('_id name phone availability.currentLocation availability.lastLocationUpdate availability.zones status isActive zoneId')
      .lean();

    console.log(`📊 Found ${deliveryPartners?.length || 0} online delivery partners`);

    const cashEligibleDeliveryPartners = await filterPartnersByAvailableCashLimit(deliveryPartners);
    console.log(`💰 Cash-limit eligible delivery partners: ${cashEligibleDeliveryPartners.length}`);

    if (!cashEligibleDeliveryPartners || cashEligibleDeliveryPartners.length === 0) {
      return [];
    }

    // Calculate distance and filter
    const deliveryPartnersWithDistance = cashEligibleDeliveryPartners
      .map(partner => {
        const location = partner.availability?.currentLocation;
        if (!location || !location.coordinates || location.coordinates.length < 2) {
          return null;
        }

        const [lng, lat] = location.coordinates;
        if (lat === 0 && lng === 0) {
          return null;
        }

        if (zone && !isPartnerInsideRequiredZone(partner, zone, lat, lng)) {
          return null;
        }

        const distance = calculateDistance(restaurantLat, restaurantLng, lat, lng);
        return {
          ...partner,
          distance,
          latitude: lat,
          longitude: lng,
          zoneId: partner.zoneId || null
        };
      })
      .filter(partner => partner !== null && partner.distance <= priorityDistance)
      .sort((a, b) => a.distance - b.distance);

    console.log(`✅ Found ${deliveryPartnersWithDistance.length} priority delivery partners within ${priorityDistance}km`);
    return deliveryPartnersWithDistance.map(partner => ({
      deliveryPartnerId: partner._id.toString(),
      name: partner.name,
      phone: partner.phone,
      distance: partner.distance,
      location: {
        latitude: partner.latitude,
        longitude: partner.longitude
      }
    }));
  } catch (error) {
    console.error('❌ Error finding nearest delivery boys:', error);
    return [];
  }
}

/**
 * Find the nearest available delivery boy to a restaurant location (with zone-based filtering)
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {string} restaurantId - Restaurant ID (for zone lookup)
 * @param {number} maxDistance - Maximum distance in km (default: 50km)
 * @param {Array} excludeIds - Array of delivery partner IDs to exclude (already notified)
 * @returns {Promise<Object|null>} Nearest delivery boy or null
 */
export async function findNearestDeliveryBoy(restaurantLat, restaurantLng, restaurantId = null, maxDistance = 50, excludeIds = [], options = {}) {
  try {
    console.log(`🔍 Searching for nearest delivery partner near restaurant: ${restaurantLat}, ${restaurantLng} (Restaurant ID: ${restaurantId})`);
    
    // Step 1: Find zone for restaurant (if restaurantId provided)
    let zone = null;
    let deliveryQuery = {
      'availability.isOnline': true,
      status: { $in: ['approved', 'active'] },
      isActive: true,
      'availability.currentLocation.coordinates': {
        $exists: true,
        $ne: [0, 0] // Exclude default/null coordinates
      }
    };

    const optionsObj = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const requiredZoneId = optionsObj.requiredZoneId || null;

    try {
      zone = await resolveRequiredZone(requiredZoneId, restaurantId, restaurantLat, restaurantLng);
      if (zone) {
        console.log(`✅ Found zone: ${zone.name || zone.zoneName} for restaurant ${restaurantId || 'location'}`);
      } else {
        console.warn(`⚠️ No active zone found for restaurant location; skipping delivery assignment`);
        return null;
      }
    } catch (zoneError) {
      console.warn(`⚠️ Error finding zone for restaurant ${restaurantId}:`, zoneError.message);
      return null;
    }

    // Exclude already notified delivery partners
    if (excludeIds && excludeIds.length > 0) {
      const excludeObjectIds = excludeIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));
      if (excludeObjectIds.length > 0) {
        deliveryQuery._id = { $nin: excludeObjectIds };
        console.log(`🚫 Excluding ${excludeObjectIds.length} already notified delivery partners`);
      }
    }

    // Find all online delivery partners (with zone filter if applicable)
    const deliveryPartners = await Delivery.find(deliveryQuery)
      .select('_id name phone availability.currentLocation availability.lastLocationUpdate availability.zones status isActive zoneId')
      .lean();

    console.log(`📊 Found ${deliveryPartners?.length || 0} online delivery partners in database`);

    const cashEligibleDeliveryPartners = await filterPartnersByAvailableCashLimit(deliveryPartners);
    console.log(`💰 Cash-limit eligible delivery partners: ${cashEligibleDeliveryPartners.length}`);

    if (!cashEligibleDeliveryPartners || cashEligibleDeliveryPartners.length === 0) {
      console.log('⚠️ No online delivery partners found');
      console.log('⚠️ Checking all delivery partners to see why...');
      
      // Debug: Check all delivery partners to see their status
      const allPartners = await Delivery.find({})
        .select('_id name availability.isOnline status isActive availability.currentLocation')
        .lean();
      
      console.log(`📊 Total delivery partners in database: ${allPartners.length}`);
      allPartners.forEach(partner => {
        console.log(`  - ${partner.name} (${partner._id}): online=${partner.availability?.isOnline}, status=${partner.status}, active=${partner.isActive}, hasLocation=${!!partner.availability?.currentLocation?.coordinates}`);
      });
      
      return null;
    }

    // Calculate distance for each delivery partner and filter by zone if applicable
    const deliveryPartnersWithDistance = cashEligibleDeliveryPartners
      .map(partner => {
        const location = partner.availability?.currentLocation;
        if (!location || !location.coordinates || location.coordinates.length < 2) {
          return null;
        }

        const [lng, lat] = location.coordinates; // GeoJSON format: [longitude, latitude]
        
        // Skip if coordinates are invalid
        if (lat === 0 && lng === 0) {
          return null;
        }

        if (zone && !isPartnerInsideRequiredZone(partner, zone, lat, lng)) {
          console.log(`⚠️ Delivery partner ${partner._id} rejected due to zone mismatch`);
          return null;
        }


        const distance = calculateDistance(restaurantLat, restaurantLng, lat, lng);
        
        return {
          ...partner,
          distance,
          latitude: lat,
          longitude: lng,
          zoneId: partner.zoneId || null
        };
      })
      .filter(partner => partner !== null && partner.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance); // Sort by distance (nearest first)

    if (deliveryPartnersWithDistance.length === 0) {
      console.log(`⚠️ No delivery partners found within ${maxDistance}km`);
      return null;
    }

    // Get the nearest delivery partner
    const nearestPartner = deliveryPartnersWithDistance[0];
    
    console.log(`✅ Found nearest delivery partner: ${nearestPartner.name} (ID: ${nearestPartner._id})`);
    console.log(`✅ Distance: ${nearestPartner.distance.toFixed(2)}km away`);
    console.log(`✅ Location: ${nearestPartner.latitude}, ${nearestPartner.longitude}`);
    console.log(`✅ Phone: ${nearestPartner.phone}`);

    return {
      deliveryPartnerId: nearestPartner._id.toString(),
      name: nearestPartner.name,
      phone: nearestPartner.phone,
      distance: nearestPartner.distance,
      location: {
        latitude: nearestPartner.latitude,
        longitude: nearestPartner.longitude
      }
    };
  } catch (error) {
    console.error('❌ Error finding nearest delivery boy:', error);
    throw error;
  }
}

/**
 * Assign order to nearest delivery boy
 * @param {Object} order - Order document
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @returns {Promise<Object|null>} Assignment result or null
 */
export async function assignOrderToDeliveryBoy(order, restaurantLat, restaurantLng, restaurantId = null) {
  try {
    // CRITICAL: Don't assign if order is cancelled
    if (order.status === 'cancelled') {
      console.log(`⚠️ Order ${order.orderId} is cancelled. Cannot assign to delivery partner.`);
      return null;
    }
    
    // CRITICAL: Don't assign if order is already delivered/completed
    if (order.status === 'delivered' || 
        order.deliveryState?.currentPhase === 'completed' ||
        order.deliveryState?.status === 'delivered') {
      console.log(`⚠️ Order ${order.orderId} is already delivered/completed. Cannot assign.`);
      return null;
    }
    
    // Only assign after restaurant has accepted and moved order to preparing/ready.
    if (!['preparing', 'ready'].includes(String(order.status || '').toLowerCase())) {
      console.log(`Order ${order.orderId} is in status '${order.status}'. Assignment is allowed only after restaurant acceptance.`);
      return null;
    }

    // Check if order already has a delivery partner assigned
    if (order.deliveryPartnerId) {
      console.log(`⚠️ Order ${order.orderId} already has delivery partner assigned`);
      return null;
    }

    // Get restaurantId from order if not provided
    const orderRestaurantId = restaurantId || order.restaurantId;
    
    // Find nearest delivery boy (strict same-zone filtering)
    const requiredZoneId = order?.assignmentInfo?.zoneId || null;
    const nearestDeliveryBoy = await findNearestDeliveryBoy(
      restaurantLat,
      restaurantLng,
      orderRestaurantId,
      50,
      [],
      { requiredZoneId }
    );

    if (!nearestDeliveryBoy) {
      console.log(`⚠️ No delivery boy found for order ${order.orderId}`);
      return null;
    }

    // Update order with delivery partner assignment
    // Note: Don't set outForDelivery yet - that should happen when delivery boy picks up the order
    order.deliveryPartnerId = nearestDeliveryBoy.deliveryPartnerId;
    order.assignmentInfo = {
      ...(order.assignmentInfo || {}),
      deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
      distance: nearestDeliveryBoy.distance,
      assignedAt: new Date(),
      assignedBy: 'nearest_available'
    };
    // Don't set outForDelivery status here - that should be set when delivery boy picks up the order
    // order.tracking.outForDelivery = {
    //   status: true,
    //   timestamp: new Date()
    // };
    
    await order.save();

    // Trigger ETA recalculation for rider assigned event
    try {
      const etaEventService = (await import('./etaEventService.js')).default;
      await etaEventService.handleRiderAssigned(order._id.toString(), nearestDeliveryBoy.deliveryPartnerId);
      console.log(`✅ ETA updated after rider assigned to order ${order.orderId}`);
    } catch (etaError) {
      console.error('Error updating ETA after rider assignment:', etaError);
      // Continue even if ETA update fails
    }

    console.log(`✅ Assigned order ${order.orderId} to delivery partner ${nearestDeliveryBoy.name}`);

    return {
      success: true,
      deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
      deliveryPartnerName: nearestDeliveryBoy.name,
      distance: nearestDeliveryBoy.distance,
      orderId: order.orderId
    };
  } catch (error) {
    console.error('❌ Error assigning order to delivery boy:', error);
    throw error;
  }
}


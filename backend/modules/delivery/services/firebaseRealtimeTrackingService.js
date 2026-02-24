import { getFirebaseRealtimeDb } from '../../../config/firebaseRealtime.js';

const DELIVERY_BOYS_NODE = 'delivery_boys';
const ACTIVE_ORDERS_NODE = 'active_orders';

function sanitizeFirebaseKey(key) {
  return String(key || '').replace(/[.#$/[\]]/g, '_');
}

function toNumberOrNull(value) {
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

export async function syncDeliveryPartnerPresence({
  deliveryId,
  lat,
  lng,
  isOnline,
  activeOrderId = null
}) {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db || !deliveryId) return false;

    const safeDeliveryId = sanitizeFirebaseKey(deliveryId);
    const payload = {
      lat: toNumberOrNull(lat),
      lng: toNumberOrNull(lng),
      isOnline: Boolean(isOnline),
      status: isOnline ? (activeOrderId ? 'busy' : 'online') : 'offline',
      activeOrderId: activeOrderId ? String(activeOrderId) : null,
      last_updated: Date.now()
    };

    await db.ref(`${DELIVERY_BOYS_NODE}/${safeDeliveryId}`).update(payload);
    return true;
  } catch (error) {
    console.warn(`⚠️ Failed to sync delivery partner presence to Firebase: ${error.message}`);
    return false;
  }
}

export async function upsertActiveOrderTracking({
  orderId,
  deliveryBoyId,
  boyLat,
  boyLng,
  status,
  polyline = null,
  routeCoordinates = null,
  restaurant = null,
  customer = null
}) {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db || !orderId) return false;

    const safeOrderId = sanitizeFirebaseKey(orderId);
    const payload = {
      boy_id: deliveryBoyId ? String(deliveryBoyId) : null,
      boy_lat: toNumberOrNull(boyLat),
      boy_lng: toNumberOrNull(boyLng),
      status: status || 'assigned',
      updated_at: Date.now()
    };

    if (polyline) payload.polyline = polyline;
    if (Array.isArray(routeCoordinates) && routeCoordinates.length > 0) payload.route_coordinates = routeCoordinates;
    if (restaurant) payload.restaurant = restaurant;
    if (customer) payload.customer = customer;

    await db.ref(`${ACTIVE_ORDERS_NODE}/${safeOrderId}`).update(payload);
    return true;
  } catch (error) {
    console.warn(`⚠️ Failed to upsert active order tracking in Firebase: ${error.message}`);
    return false;
  }
}

export async function updateActiveOrderLocation(orderId, locationPayload) {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db || !orderId) return false;

    const safeOrderId = sanitizeFirebaseKey(orderId);
    await db.ref(`${ACTIVE_ORDERS_NODE}/${safeOrderId}`).update({
      ...locationPayload,
      updated_at: Date.now()
    });
    return true;
  } catch (error) {
    console.warn(`⚠️ Failed to update active order location in Firebase: ${error.message}`);
    return false;
  }
}

export async function removeActiveOrderTracking(orderId) {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db || !orderId) return false;

    const safeOrderId = sanitizeFirebaseKey(orderId);
    await db.ref(`${ACTIVE_ORDERS_NODE}/${safeOrderId}`).remove();
    return true;
  } catch (error) {
    console.warn(`⚠️ Failed to remove active order tracking from Firebase: ${error.message}`);
    return false;
  }
}

export async function findNearestOnlineDeliveryBoys({
  restaurantLat,
  restaurantLng,
  maxDistanceKm = 5,
  limit = 5
}) {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) return [];

    const lat = toNumberOrNull(restaurantLat);
    const lng = toNumberOrNull(restaurantLng);
    if (lat === null || lng === null) return [];

    const snapshot = await db.ref(DELIVERY_BOYS_NODE).once('value');
    const boysMap = snapshot.val() || {};

    const nearby = Object.entries(boysMap)
      .map(([deliveryId, value]) => {
        const boyLat = toNumberOrNull(value?.lat);
        const boyLng = toNumberOrNull(value?.lng);
        if (!value?.isOnline || boyLat === null || boyLng === null) return null;

        const distanceKm = calculateDistanceKm(lat, lng, boyLat, boyLng);
        return { deliveryId, ...value, distanceKm };
      })
      .filter(Boolean)
      .filter((boy) => boy.distanceKm <= maxDistanceKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return nearby;
  } catch (error) {
    console.warn(`⚠️ Failed to find nearest delivery boys from Firebase: ${error.message}`);
    return [];
  }
}

import { getFirebaseRealtimeDb } from '../../../config/firebaseRealtime.js';

const DELIVERY_BOYS_NODE = 'delivery_boys';
const ACTIVE_ORDERS_NODE = 'active_orders';
const ORDER_TRACKING_HISTORY_NODE = 'order_tracking_history';
const DEFAULT_ACTIVE_ORDER_STALE_MINUTES = 180; // 3 hours
const DEFAULT_DELIVERY_STALE_MINUTES = 20; // 20 minutes
const MALFORMED_ORDER_GRACE_MINUTES = 30;
const knownActiveOrderKeys = new Set();

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

function normalizeLocationPayload(payload = {}) {
  const normalized = { ...payload };
  const numericFields = [
    'boy_lat',
    'boy_lng',
    'heading',
    'speed',
    'progress',
    'distance_covered',
    'remaining_distance',
    'timestamp',
    'distance_to_customer_km',
    'distance_to_customer_m'
  ];

  numericFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      normalized[field] = toNumberOrNull(normalized[field]);
    }
  });

  return normalized;
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
  customer = null,
  distance = null,
  duration = null
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
      last_updated: Date.now()
    };

    if (polyline) payload.polyline = polyline;
    if (Array.isArray(routeCoordinates) && routeCoordinates.length > 0 && routeCoordinates.length <= 50) {
      payload.route_coordinates = routeCoordinates;
    }
    if (restaurant) {
      payload.restaurant_lat = toNumberOrNull(restaurant.lat);
      payload.restaurant_lng = toNumberOrNull(restaurant.lng);
    }
    if (customer) {
      payload.customer_lat = toNumberOrNull(customer.lat);
      payload.customer_lng = toNumberOrNull(customer.lng);
    }
    if (distance !== null && distance !== undefined) payload.distance = toNumberOrNull(distance);
    if (duration !== null && duration !== undefined) payload.duration = toNumberOrNull(duration);

    const orderRef = db.ref(`${ACTIVE_ORDERS_NODE}/${safeOrderId}`);
    await orderRef.update(payload);
    await orderRef.child('created_at').transaction((current) => current || Date.now());
    knownActiveOrderKeys.add(safeOrderId);
    return true;
  } catch (error) {
    console.warn(`⚠️ Failed to upsert active order tracking in Firebase: ${error.message}`);
    return false;
  }
}

export async function updateActiveOrderLocation(orderId, locationPayload, options = {}) {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db || !orderId) return false;

    const safeOrderId = sanitizeFirebaseKey(orderId);
    const ensureExists = options.ensureExists !== false;

    if (ensureExists && !knownActiveOrderKeys.has(safeOrderId)) {
      const orderRef = db.ref(`${ACTIVE_ORDERS_NODE}/${safeOrderId}`);
      const existing = await orderRef.once('value');
      if (!existing.exists()) {
        // Avoid creating malformed partial nodes from location-only updates.
        return false;
      }
      knownActiveOrderKeys.add(safeOrderId);
    }

    await db.ref(`${ACTIVE_ORDERS_NODE}/${safeOrderId}`).update({
      ...normalizeLocationPayload(locationPayload),
      last_updated: Date.now()
    });
    return true;
  } catch (error) {
    console.warn(`⚠️ Failed to update active order location in Firebase: ${error.message}`);
    return false;
  }
}

export async function getActiveOrderTracking(orderId) {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db || !orderId) return null;

    const safeOrderId = sanitizeFirebaseKey(orderId);
    const snapshot = await db.ref(`${ACTIVE_ORDERS_NODE}/${safeOrderId}`).once('value');
    if (!snapshot.exists()) return null;

    const value = snapshot.val() || {};
    return normalizeLocationPayload(value);
  } catch (error) {
    console.warn(`⚠️ Failed to read active order tracking from Firebase: ${error.message}`);
    return null;
  }
}

export async function removeActiveOrderTracking(orderId) {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db || !orderId) return false;

    const safeOrderId = sanitizeFirebaseKey(orderId);
    const activeRef = db.ref(`${ACTIVE_ORDERS_NODE}/${safeOrderId}`);
    const snapshot = await activeRef.once('value');
    if (snapshot.exists()) {
      const existing = snapshot.val();
      const archivedAt = Date.now();
      await db.ref(`${ORDER_TRACKING_HISTORY_NODE}/${safeOrderId}/${archivedAt}`).set({
        ...existing,
        archived_at: archivedAt
      });
    }
    await activeRef.remove();
    knownActiveOrderKeys.delete(safeOrderId);
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
        const isOnline = value?.isOnline === true || value?.status === 'online' || value?.status === 'busy';
        if (!isOnline || boyLat === null || boyLng === null) return null;

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

export async function pruneStaleActiveOrders({
  staleMinutes = DEFAULT_ACTIVE_ORDER_STALE_MINUTES,
  maxRemovals = 1000
} = {}) {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) return { removed: 0 };

    const now = Date.now();
    const staleBefore = now - (staleMinutes * 60 * 1000);
    const malformedGraceBefore = now - (MALFORMED_ORDER_GRACE_MINUTES * 60 * 1000);
    const snapshot = await db.ref(ACTIVE_ORDERS_NODE).once('value');
    const orders = snapshot.val() || {};

    const removals = [];
    let removed = 0;

    for (const [orderId, value] of Object.entries(orders)) {
      if (removed >= maxRemovals) break;
      const ts = Number(value?.last_updated || value?.updated_at || value?.created_at || 0);
      const status = String(value?.status || '').toLowerCase();
      const isTerminal = ['delivered', 'cancelled', 'completed'].includes(status);
      const isMalformed =
        value?.boy_id == null ||
        value?.restaurant_lat == null ||
        value?.restaurant_lng == null ||
        value?.customer_lat == null ||
        value?.customer_lng == null;
      const malformedAndOld = isMalformed && ts > 0 && ts < malformedGraceBefore;

      if ((ts > 0 && ts < staleBefore) || isTerminal || malformedAndOld) {
        removals.push(db.ref(`${ACTIVE_ORDERS_NODE}/${orderId}`).remove());
        knownActiveOrderKeys.delete(orderId);
        removed += 1;
      }
    }

    if (removals.length > 0) {
      await Promise.allSettled(removals);
    }
    return { removed };
  } catch (error) {
    console.warn(`⚠️ Failed to prune stale active orders: ${error.message}`);
    return { removed: 0 };
  }
}

export async function markOfflineStaleDeliveryBoys({
  staleMinutes = DEFAULT_DELIVERY_STALE_MINUTES
} = {}) {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) return { markedOffline: 0 };

    const staleBefore = Date.now() - (staleMinutes * 60 * 1000);
    const snapshot = await db.ref(DELIVERY_BOYS_NODE).once('value');
    const boys = snapshot.val() || {};

    const updates = [];
    let markedOffline = 0;

    for (const [deliveryId, value] of Object.entries(boys)) {
      const ts = Number(value?.last_updated || 0);
      const isOnline = value?.isOnline === true || value?.status === 'online' || value?.status === 'busy';
      if (isOnline && ts > 0 && ts < staleBefore) {
        updates.push(
          db.ref(`${DELIVERY_BOYS_NODE}/${deliveryId}`).update({
            isOnline: false,
            status: 'offline',
            activeOrderId: null,
            last_updated: Date.now()
          })
        );
        markedOffline += 1;
      }
    }

    if (updates.length > 0) {
      await Promise.allSettled(updates);
    }

    return { markedOffline };
  } catch (error) {
    console.warn(`⚠️ Failed to mark stale delivery boys offline: ${error.message}`);
    return { markedOffline: 0 };
  }
}

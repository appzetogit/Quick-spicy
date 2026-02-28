import { onValue, ref, set, update } from 'firebase/database';
import { firebaseRealtimeDb, ensureFirebaseInitialized } from '@/lib/firebase';

function sanitizeRealtimeKey(value) {
  return String(value || '').trim().replace(/[.#$/[\]]/g, '_');
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getDeliveryLocationPath(deliveryId) {
  return `delivery/${sanitizeRealtimeKey(deliveryId)}/location`;
}

function getRestaurantLocationPath(restaurantId) {
  return `restaurant/${sanitizeRealtimeKey(restaurantId)}/location`;
}

function getOrderTrackingPath(orderId) {
  return `orders/${sanitizeRealtimeKey(orderId)}/tracking`;
}

export function subscribeOrderTracking(orderId, onChange, onError) {
  if (!orderId || typeof onChange !== 'function') return () => {};
  ensureFirebaseInitialized();
  const path = getOrderTrackingPath(orderId);
  const unsub = onValue(
    ref(firebaseRealtimeDb, path),
    (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      onChange(data, path);
    },
    (error) => {
      if (typeof onError === 'function') onError(error, path);
    },
  );
  return unsub;
}

export function subscribeDeliveryLocation(deliveryId, onChange, onError) {
  if (!deliveryId || typeof onChange !== 'function') return () => {};
  ensureFirebaseInitialized();
  const path = getDeliveryLocationPath(deliveryId);
  const unsub = onValue(
    ref(firebaseRealtimeDb, path),
    (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      onChange(data, path);
    },
    (error) => {
      if (typeof onError === 'function') onError(error, path);
    },
  );
  return unsub;
}

export function subscribeAllDeliveryLocations(onChange, onError) {
  if (typeof onChange !== 'function') return () => {};
  ensureFirebaseInitialized();
  const path = 'delivery';
  const unsub = onValue(
    ref(firebaseRealtimeDb, path),
    (snapshot) => {
      onChange(snapshot.val() || {}, path);
    },
    (error) => {
      if (typeof onError === 'function') onError(error, path);
    },
  );
  return unsub;
}

export function subscribeRestaurantLocation(restaurantId, onChange, onError) {
  if (!restaurantId || typeof onChange !== 'function') return () => {};
  ensureFirebaseInitialized();
  const path = getRestaurantLocationPath(restaurantId);
  const unsub = onValue(
    ref(firebaseRealtimeDb, path),
    (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      onChange(data, path);
    },
    (error) => {
      if (typeof onError === 'function') onError(error, path);
    },
  );
  return unsub;
}

export async function writeDeliveryLocation({
  deliveryId,
  lat,
  lng,
  heading = 0,
  speed = 0,
  isOnline = true,
  activeOrderId = null,
  accuracy = null,
  timestamp = Date.now(),
}) {
  if (!deliveryId) return false;
  ensureFirebaseInitialized();
  const payload = {
    lat: toFiniteNumber(lat),
    lng: toFiniteNumber(lng),
    heading: toFiniteNumber(heading) || 0,
    speed: toFiniteNumber(speed) || 0,
    accuracy: toFiniteNumber(accuracy),
    timestamp: toFiniteNumber(timestamp) || Date.now(),
    last_updated: Date.now(),
    isOnline: Boolean(isOnline),
    activeOrderId: activeOrderId ? String(activeOrderId) : null,
  };
  await set(ref(firebaseRealtimeDb, getDeliveryLocationPath(deliveryId)), payload);
  return true;
}

export async function writeOrderTracking(orderId, payload = {}) {
  if (!orderId) return false;
  ensureFirebaseInitialized();
  await update(ref(firebaseRealtimeDb, getOrderTrackingPath(orderId)), {
    ...payload,
    last_updated: Date.now(),
  });
  return true;
}

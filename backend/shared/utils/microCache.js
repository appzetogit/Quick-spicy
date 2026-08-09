/**
 * A tiny read-through cache for queries whose cost is bandwidth, not computation.
 *
 * The VPS-to-Atlas link is throttled to roughly 96KB/s (measured: fetch time is linearly
 * proportional to bytes, to the millisecond), so the restaurant listing spent 4.4 seconds
 * pulling the same 96 documents on every homepage view. The set changes a few times a day;
 * fetching it fresh per request bought nothing but the wait.
 *
 * Deliberately in-process rather than Redis: entries here are live mongoose lean docs, and
 * a Redis round-trip means JSON serialisation, which silently turns ObjectIds and Dates
 * into strings and changes downstream behaviour. Under pm2 fork mode one process IS the
 * cache; under cluster mode each worker warms its own copy for ttlMs, which is exactly the
 * staleness already accepted. Redis stays what it is here: the Socket.IO fan-out bus.
 *
 * In-flight dedupe matters as much as the TTL on a throttled link: without it, ten
 * customers arriving during one 4-second fetch would start ten 4-second fetches.
 */

const store = new Map();
const MAX_KEYS = 50;

/**
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<any[]>} fetchFn
 * @returns {Promise<any[]>} shallow-cloned rows, so callers mutating top-level fields
 *   cannot poison the cached copy.
 */
export async function getCachedOrFetch(key, ttlMs, fetchFn) {
  const now = Date.now();
  const hit = store.get(key);

  if (hit && hit.expiresAt > now) {
    const rows = await hit.value; // may still be the in-flight promise
    return Array.isArray(rows) ? rows.map((r) => ({ ...r })) : rows;
  }

  const pending = fetchFn().catch((error) => {
    // A failed fetch must not be cached as a result for ttlMs.
    store.delete(key);
    throw error;
  });

  if (store.size >= MAX_KEYS) {
    // Bounded by eviction of the oldest entry; distinct filter combinations are few.
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(key, { value: pending, expiresAt: now + ttlMs });

  const rows = await pending;
  return Array.isArray(rows) ? rows.map((r) => ({ ...r })) : rows;
}

export function invalidateCachePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export default getCachedOrFetch;

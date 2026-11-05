/**
 * Plain rules about whether a rider is really there, kept free of the database so they
 * can be tested. availability.isOnline only says the rider once switched on and never
 * switched off. The position heartbeat is the evidence that their app is running.
 */

/** Minutes since the rider's app last reported, or null if it never has. */
export const positionAgeMinutes = (rider, now = Date.now()) => {
  const last = rider?.availability?.lastLocationUpdate;
  if (!last) return null;
  const age = Math.floor((now - new Date(last).getTime()) / 60000);
  return Number.isFinite(age) ? Math.max(0, age) : null;
};

/**
 * The real reason an order found nobody, from riders removed at each stage. The stages
 * run in order, so the last one that removed anybody is the one that emptied the pool.
 * This used to be one label, "zone-or-distance", which also covered stale positions and
 * sent the diagnosis looking at zone config when the riders had simply gone quiet.
 */
export const describeEmptyPool = ({ stale = 0, wrongZone = 0, tooFar = 0 } = {}) => {
  if (tooFar > 0) return 'too-far';
  if (wrongZone > 0) return 'wrong-zone';
  if (stale > 0) return 'stale-position';
  return 'no-position';
};

const rank = (rider) => [
  rider.inZone ? 0 : 1,
  rider.live ? 0 : 1,
  rider.activeOrders > 0 ? 1 : 0,
  rider.overCashLimit ? 1 : 0,
  rider.distanceKm ?? Number.POSITIVE_INFINITY,
];

/** Best choice first: in this zone, app live, free, under the cash limit, nearest. */
export const sortDispatchCandidates = (riders = []) =>
  [...riders].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i += 1) {
      if (ra[i] !== rb[i]) return ra[i] - rb[i];
    }
    return 0;
  });

/**
 * Which online riders the offline sweep may switch off: quiet past the cutoff, and not
 * in the middle of an order. A rider navigating in Google Maps has the app in the
 * background and may stop reporting, and must not be dropped mid-delivery.
 */
export const ridersToMarkOffline = (riders = [], busyIds = new Set(), now = Date.now(), maxQuietMinutes = 120) =>
  riders.filter((rider) => {
    if (busyIds.has(String(rider._id))) return false;
    const age = positionAgeMinutes(rider, now);
    return age === null || age > maxQuietMinutes;
  });

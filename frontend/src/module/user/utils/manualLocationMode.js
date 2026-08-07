/**
 * When a manually picked location stops being believable.
 *
 * Picking an address in the location sheet sets userLocationPreference to "manual", which
 * pins the app to that spot and switches auto-detect off. Nothing ever switched it back, so
 * the pin outlived the reason for it: customers who used the picker once to correct a stale
 * location were then permanently opted out of the very detection that would have kept it
 * right, and travelling hundreds of kilometres changed nothing.
 *
 * A manual pick is a "show me here for now", not a permanent setting. It expires when:
 *   - it is older than MANUAL_MODE_TTL_MS, or
 *   - the device is now further than MANUAL_MODE_MAX_DRIFT_KM from the picked spot.
 *
 * The drift rule is the one that matters in practice: it is what catches Giddalur to
 * Khammam on the same day.
 */

// Long enough to cover an evening of browsing, short enough that tomorrow starts fresh.
export const MANUAL_MODE_TTL_MS = 12 * 60 * 60 * 1000

// Comfortably beyond any single delivery zone, so ordering to the far side of your own city
// still holds, while genuinely leaving the area does not.
// ponytail: one flat threshold. Per-zone radii would be better if zones ever vary wildly.
export const MANUAL_MODE_MAX_DRIFT_KM = 20

export function distanceKm(a, b) {
  const lat1 = Number(a?.latitude)
  const lng1 = Number(a?.longitude)
  const lat2 = Number(b?.latitude)
  const lng2 = Number(b?.longitude)
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null

  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/**
 * @returns {{expired: boolean, reason: string|null}}
 */
export function evaluateManualMode({
  setAtMs = null,
  now = Date.now(),
  manualCoords = null,
  liveCoords = null,
} = {}) {
  // No timestamp means the pin predates this rule. Treat it as expired rather than
  // grandfathering it forever - those are exactly the customers stuck right now.
  const setAt = Number(setAtMs)
  if (!Number.isFinite(setAt) || setAt <= 0) {
    return { expired: true, reason: "no-timestamp" }
  }

  if (now - setAt > MANUAL_MODE_TTL_MS) {
    return { expired: true, reason: "too-old" }
  }

  const drift = distanceKm(manualCoords, liveCoords)
  if (drift !== null && drift > MANUAL_MODE_MAX_DRIFT_KM) {
    return { expired: true, reason: "moved-away" }
  }

  return { expired: false, reason: null }
}

export default evaluateManualMode

/**
 * The single source of truth for "arriving in".
 *
 * Three screens used to answer this three different ways: the tracking page started at a
 * hardcoded 29 and decremented once a minute regardless of where the rider actually was,
 * the order card computed a different number from the order's own estimate against a
 * hardcoded 35 minute fallback, and a third screen printed "80 mins" as a literal. A
 * customer could see two different arrival times for one order.
 *
 * Order of preference, most truthful first:
 *   1. How far the rider still has to travel, once live tracking is reporting it.
 *   2. The order's own estimate, counted down from when the order was placed.
 *   3. Nothing. Returning null is honest; inventing a number is what caused this.
 */

// Urban two-wheeler average including lights and turns. Deliberately not the free-flow
// speed, which produces confidently early arrivals.
export const AVERAGE_SPEED_KMPH = 18

// The distance we get is straight-line between the rider's and the customer's coordinates.
// Nobody rides in a straight line: roads bend, one-ways divert, rivers and railways force
// detours. Real road distance in Indian towns runs roughly a third longer than the crow
// flies, so without this the arrival time is optimistic by about the same margin and the
// customer is always told a number that then slips.
// ponytail: one flat factor. If a branch's road network is unusually bad, this is the knob.
export const ROAD_WINDING_FACTOR = 1.3

// Handing over at the door, finding the flat, lifts.
export const HANDOVER_MINUTES = 3

// Never promise "arriving in 0 minutes" while the rider is still moving.
export const MIN_REPORTED_MINUTES = 1

/**
 * @param {object} input
 * @param {number|null} input.distanceToCustomerM  live remaining distance in metres
 * @param {number|null} input.orderEstimatedMinutes  the order's own promised window
 * @param {number|string|Date|null} input.orderPlacedAt
 * @param {number} input.now  epoch ms, passed in so this stays pure and testable
 * @returns {number|null} whole minutes, or null when we genuinely do not know
 */
export function estimateArrivalMinutes({
  distanceToCustomerM = null,
  orderEstimatedMinutes = null,
  orderPlacedAt = null,
  now = Date.now(),
} = {}) {
  // Guarded before Number(), because Number(null) and Number("") are both 0 - which would
  // read as "the rider is at the door" every time live tracking had reported nothing yet.
  const hasLiveDistance =
    distanceToCustomerM !== null && distanceToCustomerM !== undefined && distanceToCustomerM !== ""
  const distanceM = hasLiveDistance ? Number(distanceToCustomerM) : NaN
  if (Number.isFinite(distanceM) && distanceM >= 0) {
    const roadKm = (distanceM / 1000) * ROAD_WINDING_FACTOR
    const travelMinutes = (roadKm / AVERAGE_SPEED_KMPH) * 60
    return Math.max(MIN_REPORTED_MINUTES, Math.round(travelMinutes + HANDOVER_MINUTES))
  }

  const promised = Number(orderEstimatedMinutes)
  const placedAtMs = orderPlacedAt ? new Date(orderPlacedAt).getTime() : NaN
  if (Number.isFinite(promised) && promised > 0 && Number.isFinite(placedAtMs)) {
    const elapsedMinutes = (now - placedAtMs) / 60000
    // Once the promise has run out we are late, not arriving in zero minutes. Report the
    // floor rather than a negative or a fresh guess.
    return Math.max(MIN_REPORTED_MINUTES, Math.round(promised - elapsedMinutes))
  }

  return null
}

/** "12 mins" / "1 min", or null so callers can omit the line entirely. */
export function formatArrivalMinutes(minutes) {
  if (!Number.isFinite(minutes)) return null
  return `${minutes} ${minutes === 1 ? "min" : "mins"}`
}

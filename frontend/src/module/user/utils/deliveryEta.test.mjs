// Run: node src/module/user/utils/deliveryEta.test.mjs
//
// Pins the rule that caused the complaint: one order, one arrival time, and never a number
// we invented.
import assert from "node:assert/strict"
import {
  estimateArrivalMinutes,
  formatArrivalMinutes,
  AVERAGE_SPEED_KMPH,
  HANDOVER_MINUTES,
} from "./deliveryEta.js"

const NOW = 1_700_000_000_000

// Live distance wins over the order's promise: it is the only input that reflects where the
// rider actually is.
const live = estimateArrivalMinutes({
  distanceToCustomerM: 3000,
  orderEstimatedMinutes: 45,
  orderPlacedAt: NOW,
  now: NOW,
})
assert.equal(live, Math.round((3 / AVERAGE_SPEED_KMPH) * 60 + HANDOVER_MINUTES))
assert.ok(live > 0 && live < 45, "live distance must not echo the 45 minute promise")

// Closer rider, sooner arrival. This is the bit that "was not reducing".
const far = estimateArrivalMinutes({ distanceToCustomerM: 5000, now: NOW })
const near = estimateArrivalMinutes({ distanceToCustomerM: 500, now: NOW })
assert.ok(near < far, "arrival must fall as the rider closes in")

// At the door we still say 1 min, never 0 while they are moving.
assert.equal(estimateArrivalMinutes({ distanceToCustomerM: 0, now: NOW }), HANDOVER_MINUTES)
assert.ok(estimateArrivalMinutes({ distanceToCustomerM: 1, now: NOW }) >= 1)

// No live distance: count the order's own promise down from when it was placed.
assert.equal(
  estimateArrivalMinutes({ orderEstimatedMinutes: 40, orderPlacedAt: NOW, now: NOW + 10 * 60000 }),
  30,
)

// Past the promised window we report the floor, not a negative and not a fresh guess.
assert.equal(
  estimateArrivalMinutes({ orderEstimatedMinutes: 30, orderPlacedAt: NOW, now: NOW + 90 * 60000 }),
  1,
)

// Nothing to go on: say nothing. Returning a number here is exactly what produced a
// hardcoded 29 counting down beside a rider who had not moved.
assert.equal(estimateArrivalMinutes({ now: NOW }), null)
assert.equal(estimateArrivalMinutes({ orderEstimatedMinutes: 30, now: NOW }), null)
assert.equal(estimateArrivalMinutes({ distanceToCustomerM: "abc", now: NOW }), null)
assert.equal(estimateArrivalMinutes({ distanceToCustomerM: -5, now: NOW }), null)

// Formatting, including the singular.
assert.equal(formatArrivalMinutes(12), "12 mins")
assert.equal(formatArrivalMinutes(1), "1 min")
assert.equal(formatArrivalMinutes(null), null)

console.log("deliveryEta: all assertions passed")

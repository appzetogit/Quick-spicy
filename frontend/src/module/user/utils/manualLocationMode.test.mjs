// Run: node src/module/user/utils/manualLocationMode.test.mjs
import assert from "node:assert/strict"
import {
  evaluateManualMode,
  distanceKm,
  MANUAL_MODE_TTL_MS,
  MANUAL_MODE_MAX_DRIFT_KM,
} from "./manualLocationMode.js"

const NOW = 1_700_000_000_000
const GIDDALUR = { latitude: 15.3776, longitude: 78.9254 }
const KHAMMAM = { latitude: 17.2473, longitude: 80.1514 }
const NEARBY = { latitude: 15.3901, longitude: 78.9377 } // ~2km from Giddalur

// Sanity on the distance itself before trusting the rules built on it.
assert.ok(distanceKm(GIDDALUR, KHAMMAM) > 200, "Giddalur to Khammam is a long way")
assert.ok(distanceKm(GIDDALUR, NEARBY) < 5, "same town stays small")
assert.equal(distanceKm(GIDDALUR, null), null)
assert.equal(distanceKm({ latitude: "x" }, KHAMMAM), null)

// A fresh pin, customer still in the same town: keep it. Ordering across your own city must
// not fight the person who chose it.
assert.deepEqual(
  evaluateManualMode({ setAtMs: NOW, now: NOW + 60_000, manualCoords: GIDDALUR, liveCoords: NEARBY }),
  { expired: false, reason: null },
)

// The reported case: picked in Giddalur, now in Khammam, same day.
assert.equal(
  evaluateManualMode({
    setAtMs: NOW,
    now: NOW + 3 * 60 * 60 * 1000,
    manualCoords: GIDDALUR,
    liveCoords: KHAMMAM,
  }).reason,
  "moved-away",
)

// Age alone expires it even if they never moved.
assert.equal(
  evaluateManualMode({
    setAtMs: NOW,
    now: NOW + MANUAL_MODE_TTL_MS + 1000,
    manualCoords: GIDDALUR,
    liveCoords: GIDDALUR,
  }).reason,
  "too-old",
)

// Just inside the TTL survives, so the boundary is not off by one.
assert.equal(
  evaluateManualMode({
    setAtMs: NOW,
    now: NOW + MANUAL_MODE_TTL_MS - 1000,
    manualCoords: GIDDALUR,
    liveCoords: GIDDALUR,
  }).expired,
  false,
)

// No live fix yet: age is the only thing we can judge on, and a fresh pin must survive.
// Getting this wrong would drop the pin the instant the app opened, before GPS answered.
assert.equal(
  evaluateManualMode({ setAtMs: NOW, now: NOW + 60_000, manualCoords: GIDDALUR, liveCoords: null })
    .expired,
  false,
)

// Pins written before this rule existed carry no timestamp. Those are the customers stuck
// right now, so they expire rather than being grandfathered forever.
assert.equal(evaluateManualMode({ now: NOW }).reason, "no-timestamp")
assert.equal(evaluateManualMode({ setAtMs: 0, now: NOW }).reason, "no-timestamp")
assert.equal(evaluateManualMode({ setAtMs: "nonsense", now: NOW }).reason, "no-timestamp")

// Right at the drift threshold it still holds; comfortably past it does not.
const justInside = { latitude: GIDDALUR.latitude + 0.1, longitude: GIDDALUR.longitude } // ~11km
assert.ok(distanceKm(GIDDALUR, justInside) < MANUAL_MODE_MAX_DRIFT_KM)
assert.equal(
  evaluateManualMode({ setAtMs: NOW, now: NOW, manualCoords: GIDDALUR, liveCoords: justInside })
    .expired,
  false,
)

console.log("manualLocationMode: all assertions passed")

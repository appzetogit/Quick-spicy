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

// The reported failure: CUMBUM and B.PETA are 9km apart - inside the 20km drift allowance -
// so distance alone kept the pin. Zones differ, so the pin must expire.
const CUMBUM_LIKE = { latitude: 15.58646, longitude: 79.11406 }
const BPETA_LIKE = { latitude: 15.50774, longitude: 79.09312 }
assert.ok(distanceKm(CUMBUM_LIKE, BPETA_LIKE) < MANUAL_MODE_MAX_DRIFT_KM, "premise: adjacent zones sit inside the drift allowance")
assert.equal(
  evaluateManualMode({
    setAtMs: NOW, now: NOW + 60_000,
    manualCoords: CUMBUM_LIKE, liveCoords: BPETA_LIKE,
    zoneComparison: { resolved: true, pinnedZoneId: "zone-cumbum", liveZoneId: "zone-bpeta" },
  }).reason,
  "zone-changed",
)

// Same zone: keep the pin no matter the in-town distance. Deliberate picks across your own
// town must survive - that mistake was already made once in the cart warning.
assert.equal(
  evaluateManualMode({
    setAtMs: NOW, now: NOW,
    manualCoords: CUMBUM_LIKE, liveCoords: BPETA_LIKE,
    zoneComparison: { resolved: true, pinnedZoneId: "zone-x", liveZoneId: "zone-x" },
  }).expired,
  false,
)

// Pinned inside a zone, now standing outside every zone (or the reverse): both are stale.
assert.equal(
  evaluateManualMode({
    setAtMs: NOW, now: NOW, manualCoords: CUMBUM_LIKE, liveCoords: BPETA_LIKE,
    zoneComparison: { resolved: true, pinnedZoneId: "zone-x", liveZoneId: null },
  }).reason,
  "zone-changed",
)
assert.equal(
  evaluateManualMode({
    setAtMs: NOW, now: NOW, manualCoords: CUMBUM_LIKE, liveCoords: BPETA_LIKE,
    zoneComparison: { resolved: true, pinnedZoneId: null, liveZoneId: "zone-x" },
  }).reason,
  "zone-changed",
)

// Zone lookup failed entirely: fall back to the distance rule, in both directions.
assert.equal(
  evaluateManualMode({
    setAtMs: NOW, now: NOW, manualCoords: CUMBUM_LIKE, liveCoords: BPETA_LIKE,
    zoneComparison: { resolved: false, pinnedZoneId: null, liveZoneId: null },
  }).expired,
  false,
  "9km with no zone answer keeps the pin - distance fallback",
)
assert.equal(
  evaluateManualMode({
    setAtMs: NOW, now: NOW, manualCoords: GIDDALUR, liveCoords: KHAMMAM,
    zoneComparison: { resolved: false, pinnedZoneId: null, liveZoneId: null },
  }).reason,
  "moved-away",
)

console.log("manualLocationMode: all assertions passed")

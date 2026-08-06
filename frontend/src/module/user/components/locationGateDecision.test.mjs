// Run: node src/module/user/components/locationGateDecision.test.mjs
import assert from "node:assert/strict"
import { decideGate } from "./locationGateDecision.js"

const granted = { permission: "granted", hasCoords: true }

// The flash: zoneStatus is "loading" on first paint for everyone.
assert.equal(decideGate({ ...granted, zoneStatus: "loading" }), "wait")
assert.equal(decideGate({ permission: "granted", hasCoords: false }), "wait")
assert.equal(decideGate({ permission: null }), "wait")

// Real out-of-zone, and a denial, both say unavailable.
assert.equal(decideGate({ ...granted, zoneStatus: "OUT_OF_SERVICE" }), "unavailable")
assert.equal(decideGate({ permission: "denied" }), "unavailable")

// Normal path.
assert.equal(decideGate({ ...granted, zoneStatus: "IN_SERVICE" }), "allow")
assert.equal(decideGate({ permission: "prompt" }), "ask")

// Granted but the fix never arrived: offer a retry, do not claim we do not deliver there.
assert.equal(decideGate({ permission: "granted", hasCoords: false, fixTimedOut: true }), "retry")

// A failed zone lookup fails open rather than locking everyone out.
assert.equal(decideGate({ ...granted, zoneStatus: "loading", zoneError: "Network Error" }), "allow")

// A chosen branch wins over everything, including a denial - otherwise the escape hatch
// leads to restaurants the customer cannot open.
assert.equal(decideGate({ browseZoneId: "69aaf9f7a29b8688c705f3f1", permission: "denied" }), "allow")
assert.equal(
  decideGate({ browseZoneId: "69aaf9f7a29b8688c705f3f1", ...granted, zoneStatus: "OUT_OF_SERVICE" }),
  "allow",
)

console.log("locationGateDecision: all assertions passed")

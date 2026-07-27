// Run: node modules/delivery/controllers/locationFix.test.js   (from backend/)
// Guards the GPS filter behind the rider marker. Getting this wrong either lets the marker
// teleport again or freezes a moving rider in place, and neither is visible from the server.
import assert from "node:assert";
import { evaluateLocationFix } from "./deliveryLocationController.js";

const INDORE = [75.8844, 22.7282]; // [lng, lat]

// A poor fix must never move the rider, however far it claims they went.
assert.strictEqual(
  evaluateLocationFix({ accuracy: 500, latitude: 22.75, longitude: 75.9, previousCoordinates: INDORE }).accept,
  false,
  "500m-accuracy fix must be rejected",
);

// A confident fix that actually moved must be accepted.
const moved = evaluateLocationFix({ accuracy: 12, latitude: 22.7382, longitude: 75.8844, previousCoordinates: INDORE });
assert.strictEqual(moved.accept, true, "confident fix ~1.1km away must be accepted");
assert.ok(moved.movedMeters > 900, `expected >900m, got ${moved.movedMeters}`);

// A confident fix that barely moved is GPS noise, not travel.
assert.strictEqual(
  evaluateLocationFix({ accuracy: 8, latitude: 22.72822, longitude: 75.88441, previousCoordinates: INDORE }).accept,
  false,
  "sub-10m movement must be treated as noise",
);

// First fix has nothing to compare against and must be stored.
assert.strictEqual(
  evaluateLocationFix({ accuracy: 20, latitude: 22.7282, longitude: 75.8844, previousCoordinates: undefined }).accept,
  true,
  "first fix must be accepted",
);

// Phones that omit accuracy must not be locked out entirely.
assert.strictEqual(
  evaluateLocationFix({ accuracy: undefined, latitude: 22.7382, longitude: 75.8844, previousCoordinates: INDORE }).accept,
  true,
  "missing accuracy must not reject an otherwise valid move",
);

console.log("locationFix: ok");

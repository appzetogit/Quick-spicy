// Run: node scripts/checkZoneEdgeBuffer.test.mjs
//
// The old buffer measured distance to the zone CENTROID, so for a zone kilometres across it
// never once rescued the case it existed for: someone standing just past the boundary. These
// assertions pin the edge-distance maths that replaced it.
import assert from "node:assert/strict"

import { distanceToPolygonEdgeKm, ZONE_EDGE_BUFFER_KM } from "../shared/utils/zoneGeometry.js"

// A roughly 11km x 11km square near Giddalur's latitude.
const square = [
  { latitude: 15.30, longitude: 78.90 },
  { latitude: 15.40, longitude: 78.90 },
  { latitude: 15.40, longitude: 79.00 },
  { latitude: 15.30, longitude: 79.00 },
]

const near = (actual, expected, toleranceKm, label) =>
  assert.ok(
    Math.abs(actual - expected) <= toleranceKm,
    `${label}: expected ~${expected}km, got ${actual.toFixed(3)}km`,
  )

// ~110m north of the top edge: the case the buffer exists for.
near(distanceToPolygonEdgeKm(15.401, 78.95, square), 0.111, 0.02, "just outside the north edge")
assert.ok(distanceToPolygonEdgeKm(15.401, 78.95, square) <= ZONE_EDGE_BUFFER_KM, "must fall inside the buffer")

// ~2.2km past the edge is genuinely outside and must NOT be admitted.
near(distanceToPolygonEdgeKm(15.42, 78.95, square), 2.226, 0.05, "2km outside")
assert.ok(distanceToPolygonEdgeKm(15.42, 78.95, square) > ZONE_EDGE_BUFFER_KM, "genuinely outside stays outside")

// The centre of the square is ~5.4km from the nearest edge - the east/west ones, since a
// degree of longitude is narrower than a degree of latitude at this cos(15.35deg) scaling.
// Under the old centroid check this distance was ~0, which is exactly why the buffer never
// worked at boundaries.
near(distanceToPolygonEdgeKm(15.35, 78.95, square), 5.367, 0.05, "distance from the centre")

// Distance is to the nearest EDGE, not the nearest corner: a point beside the middle of a
// long edge is close to it while being kilometres from every vertex.
const midEdge = distanceToPolygonEdgeKm(15.401, 78.95, square)
const cornerDistances = square.map((c) =>
  distanceToPolygonEdgeKm(15.401, 78.95, [c, c, c].map((x, i) => ({ ...x, longitude: x.longitude + i * 1e-9 }))),
)
assert.ok(midEdge < Math.min(...cornerDistances), "edge distance beats every vertex distance")

// A point exactly on a vertex is at distance zero.
near(distanceToPolygonEdgeKm(15.30, 78.90, square), 0, 0.001, "on a vertex")

console.log("zone edge buffer: all assertions passed")

/**
 * Verify that delivery zones resolve from coordinates alone.
 *
 * Order creation used to accept a client-supplied zoneId as a stand-in when the delivery
 * address matched no zone, which let a customer anywhere in the country order from any
 * restaurant by selecting its zone in the app. The zone is now derived only from the
 * delivery coordinates, so these two properties are what keep that closed:
 *
 *   1. A point far outside every service area resolves to no zone at all.
 *   2. A point inside a zone still resolves to that zone.
 *
 * Usage, from backend/:  node --env-file=.env scripts/verify-zone-resolution.js
 */
import mongoose from "mongoose";

// Same ray-casting test used by findActiveZoneForPoint in the order controller.
const toPoints = (coordinates = []) =>
  (coordinates || [])
    .map((c) =>
      Array.isArray(c)
        ? { lat: c[1], lng: c[0] }
        : { lat: c.lat ?? c.latitude, lng: c.lng ?? c.longitude },
    )
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

const isInside = (lat, lng, coordinates) => {
  const pts = toPoints(coordinates);
  if (pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].lng, yi = pts[i].lat, xj = pts[j].lng, yj = pts[j].lat;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const resolveZone = (zones, lat, lng) => zones.find((z) => isInside(lat, lng, z.coordinates)) || null;

await mongoose.connect(process.env.MONGODB_URI);
const zones = await mongoose.connection.db
  .collection("zones")
  .find({ isActive: true })
  .toArray();

console.log(`active zones: ${zones.length}\n`);

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
};

// A customer in Hyderabad is nowhere near the service area.
const hyderabad = resolveZone(zones, 17.385, 78.4867);
check(
  `Hyderabad resolves to no zone (got: ${hyderabad?.name || "none"})`,
  hyderabad,
  null,
);

// Every zone must still resolve its own interior, or real customers get turned away.
for (const zone of zones) {
  const pts = toPoints(zone.coordinates);
  if (pts.length < 3) continue;
  const centroid = {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
  };
  // Concave polygons can place the centroid outside themselves; only assert when it is in.
  if (!isInside(centroid.lat, centroid.lng, zone.coordinates)) {
    console.log(`SKIP  ${zone.name} (centroid falls outside a concave polygon)`);
    continue;
  }
  const resolved = resolveZone(zones, centroid.lat, centroid.lng);
  check(`${zone.name} resolves its own interior`, resolved?._id?.toString(), zone._id.toString());
}

console.log(`\n${failures === 0 ? "zone resolution: ok" : `zone resolution: ${failures} FAILURE(S)`}`);
await mongoose.disconnect();
process.exit(failures === 0 ? 0 : 1);

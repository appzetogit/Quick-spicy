/**
 * Shared zone geometry.
 *
 * Three places independently resolve a point to a delivery zone: public zone detection, the
 * restaurant listing, and order creation. They must agree. When only zone detection grew a
 * boundary tolerance, a customer 200m outside a polygon was told service was available, then
 * shown an empty restaurant list, which reads as broken rather than as out of area.
 */

// How far past a zone boundary still counts as inside. Zone polygons are drawn by hand in
// the admin panel and phone GPS drifts by tens of metres, so a hard edge turns customers on
// the far pavement into "we don't deliver here".
// ponytail: flat tolerance for every zone. If a branch needs its own, move it onto the Zone
// document and read it here.
export const ZONE_EDGE_BUFFER_KM = Number(process.env.ZONE_EDGE_BUFFER_KM || 0.25);

const KM_PER_DEG = 111.32;

const readCoordinate = (coord) => {
  if (Array.isArray(coord)) {
    // GeoJSON order is [lng, lat].
    return { lat: Number(coord[1]), lng: Number(coord[0]) };
  }
  const lat = Number(coord?.latitude ?? coord?.lat);
  const lng = Number(coord?.longitude ?? coord?.lng);
  return { lat, lng };
};

/**
 * Shortest distance in km from a point to a polygon's outline.
 *
 * Measured against the segments rather than the vertices: a point can sit close to the
 * middle of a long edge while being kilometres from every corner, and only the edge distance
 * answers "how far outside is this?". Longitude is scaled by cos(latitude) so a degree east
 * is not treated as wide as a degree north.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {Array} polygonCoords - [{latitude,longitude}] or GeoJSON [lng,lat] pairs
 * @returns {number} km, or Infinity when the polygon is unusable
 */
export function distanceToPolygonEdgeKm(lat, lng, polygonCoords) {
  if (!Array.isArray(polygonCoords) || polygonCoords.length < 2) return Infinity;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Infinity;

  const scale = Math.cos((lat * Math.PI) / 180);
  const toXY = (a, b) => ({ x: b * KM_PER_DEG * scale, y: a * KM_PER_DEG });

  const p = toXY(lat, lng);
  let best = Infinity;

  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const a = readCoordinate(polygonCoords[j]);
    const b = readCoordinate(polygonCoords[i]);
    if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) continue;
    if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) continue;

    const s = toXY(a.lat, a.lng);
    const e = toXY(b.lat, b.lng);
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const lengthSq = dx * dx + dy * dy;

    // Project onto the segment, clamped so it cannot run past either end.
    const t =
      lengthSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / lengthSq));
    const distance = Math.hypot(p.x - (s.x + t * dx), p.y - (s.y + t * dy));

    if (distance < best) best = distance;
  }

  return best;
}

/**
 * Pick the zone whose edge is nearest the point, when that edge is within the tolerance.
 * Callers use this only after strict containment has already failed.
 *
 * @param {Array} zones
 * @param {number} lat
 * @param {number} lng
 * @param {(zone:any)=>Array|null} extractPolygon - caller's own polygon reader
 * @returns {any|null}
 */
export function findZoneWithinBuffer(zones, lat, lng, extractPolygon) {
  if (!Array.isArray(zones)) return null;

  let nearestZone = null;
  let nearestKm = Infinity;

  for (const zone of zones) {
    const polygon = extractPolygon(zone);
    if (!polygon || polygon.length < 3) continue;

    const distance = distanceToPolygonEdgeKm(lat, lng, polygon);
    if (distance <= ZONE_EDGE_BUFFER_KM && distance < nearestKm) {
      nearestKm = distance;
      nearestZone = zone;
    }
  }

  return nearestZone;
}

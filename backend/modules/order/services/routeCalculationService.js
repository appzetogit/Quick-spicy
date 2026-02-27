/**
 * Route Calculation Service
 * Uses Dijkstra's algorithm for route calculation
 * Falls back to OSRM API for real-world routing
 */
import { getFirebaseRealtimeDbSafe } from '../../../config/firebaseRealtime.js';

const ROUTE_CACHE_NODE = 'route_cache';
const ROUTE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatCoordPart(value) {
  // Keep compact stable key format similar to existing data:
  // 22.7118 -> "22_7118", 75.9000 -> "75_9"
  const fixed = Number(value).toFixed(4);
  const trimmed = fixed
    .replace(/\.?0+$/, '')
    .replace('-', 'm');
  return trimmed.replace('.', '_');
}

function buildRouteCacheKey(startLat, startLng, endLat, endLng) {
  return [
    formatCoordPart(startLat),
    formatCoordPart(startLng),
    formatCoordPart(endLat),
    formatCoordPart(endLng)
  ].join('_');
}

function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    points.push([lat * 1e-5, lng * 1e-5]);
  }

  return points;
}

function encodePolyline(coordinates = []) {
  let lastLat = 0;
  let lastLng = 0;
  let result = '';

  const encodeSigned = (num) => {
    let sgnNum = num < 0 ? ~(num << 1) : (num << 1);
    let encoded = '';
    while (sgnNum >= 0x20) {
      encoded += String.fromCharCode((0x20 | (sgnNum & 0x1f)) + 63);
      sgnNum >>= 5;
    }
    encoded += String.fromCharCode(sgnNum + 63);
    return encoded;
  };

  for (const point of coordinates) {
    const lat = Math.round(Number(point[0]) * 1e5);
    const lng = Math.round(Number(point[1]) * 1e5);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const dLat = lat - lastLat;
    const dLng = lng - lastLng;
    lastLat = lat;
    lastLng = lng;
    result += encodeSigned(dLat) + encodeSigned(dLng);
  }

  return result;
}

async function getCachedRouteFromFirebase(startLat, startLng, endLat, endLng) {
  try {
    const db = await getFirebaseRealtimeDbSafe();
    if (!db) return null;

    const key = buildRouteCacheKey(startLat, startLng, endLat, endLng);
    const snap = await db.ref(`${ROUTE_CACHE_NODE}/${key}`).once('value');
    if (!snap.exists()) return null;

    const value = snap.val() || {};
    const now = Date.now();
    const expiresAt = toFiniteNumber(value.expires_at) || 0;
    const distance = toFiniteNumber(value.distance);
    const duration = toFiniteNumber(value.duration);
    const polyline = typeof value.polyline === 'string' ? value.polyline : '';

    if (!expiresAt || expiresAt < now || !polyline || distance === null || duration === null) {
      return null;
    }

    const coordinates = decodePolyline(polyline);
    if (!Array.isArray(coordinates) || coordinates.length === 0) return null;

    return {
      success: true,
      coordinates,
      distance,
      duration,
      method: 'firebase_cache'
    };
  } catch {
    return null;
  }
}

async function setCachedRouteInFirebase(startLat, startLng, endLat, endLng, routeData) {
  try {
    const db = await getFirebaseRealtimeDbSafe();
    if (!db) return;

    const key = buildRouteCacheKey(startLat, startLng, endLat, endLng);
    const now = Date.now();
    const polyline = encodePolyline(routeData?.coordinates || []);
    if (!polyline) return;

    await db.ref(`${ROUTE_CACHE_NODE}/${key}`).set({
      cached_at: now,
      distance: Number(routeData.distance),
      duration: Number(routeData.duration),
      expires_at: now + ROUTE_CACHE_TTL_MS,
      polyline
    });
  } catch {
    // Non-blocking cache write
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

/**
 * Simple Dijkstra's algorithm implementation for route calculation
 * This is a simplified version - for production, use OSRM or Google Maps API
 * @param {Array} nodes - Array of {lat, lng, id} nodes
 * @param {Array} edges - Array of {from, to, weight} edges
 * @param {string} startId - Starting node ID
 * @param {string} endId - Ending node ID
 * @returns {Object} {path: [nodeIds], distance: number}
 */
function dijkstra(nodes, edges, startId, endId) {
  const distances = {};
  const previous = {};
  const unvisited = new Set(nodes.map(n => n.id));
  
  // Initialize distances
  nodes.forEach(node => {
    distances[node.id] = node.id === startId ? 0 : Infinity;
  });
  
  while (unvisited.size > 0) {
    // Find unvisited node with smallest distance
    let current = null;
    let minDistance = Infinity;
    
    for (const nodeId of unvisited) {
      if (distances[nodeId] < minDistance) {
        minDistance = distances[nodeId];
        current = nodeId;
      }
    }
    
    if (current === null || distances[current] === Infinity) {
      break; // No path found
    }
    
    if (current === endId) {
      // Reconstruct path
      const path = [];
      let node = endId;
      while (node !== undefined) {
        path.unshift(node);
        node = previous[node];
      }
      return { path, distance: distances[endId] };
    }
    
    unvisited.delete(current);
    
    // Update distances to neighbors
    const neighbors = edges.filter(e => e.from === current);
    for (const edge of neighbors) {
      const alt = distances[current] + edge.weight;
      if (alt < distances[edge.to]) {
        distances[edge.to] = alt;
        previous[edge.to] = current;
      }
    }
  }
  
  return { path: [], distance: Infinity };
}

/**
 * Calculate route using OSRM API (recommended for production)
 * @param {number} startLat - Starting latitude
 * @param {number} startLng - Starting longitude
 * @param {number} endLat - Ending latitude
 * @param {number} endLng - Ending longitude
 * @returns {Promise<Object>} {coordinates: [[lat, lng]], distance: number, duration: number}
 */
export async function calculateRouteOSRM(startLat, startLng, endLat, endLng) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]); // Convert [lng, lat] to [lat, lng]
      const distance = route.distance / 1000; // Convert meters to kilometers
      const duration = route.duration / 60; // Convert seconds to minutes
      
      return {
        success: true,
        coordinates,
        distance,
        duration,
        method: 'osrm'
      };
    } else {
      // Fallback to straight line
      const distance = haversineDistance(startLat, startLng, endLat, endLng);
      return {
        success: true,
        coordinates: [[startLat, startLng], [endLat, endLng]],
        distance,
        duration: (distance / 30) * 60, // Assume 30 km/h average speed
        method: 'haversine'
      };
    }
  } catch (error) {
    console.error('Error calculating route with OSRM:', error);
    // Fallback to straight line
    const distance = haversineDistance(startLat, startLng, endLat, endLng);
    return {
      success: true,
      coordinates: [[startLat, startLng], [endLat, endLng]],
      distance,
      duration: (distance / 30) * 60,
      method: 'haversine_fallback'
    };
  }
}

/**
 * Calculate route using Dijkstra's algorithm (for custom routing)
 * This creates intermediate waypoints and calculates optimal path
 * @param {number} startLat - Starting latitude
 * @param {number} startLng - Starting longitude
 * @param {number} endLat - Ending latitude
 * @param {number} endLng - Ending longitude
 * @param {Array} waypoints - Optional intermediate waypoints [{lat, lng}]
 * @returns {Promise<Object>} {coordinates: [[lat, lng]], distance: number, duration: number}
 */
export async function calculateRouteDijkstra(startLat, startLng, endLat, endLng, waypoints = []) {
  try {
    // Create nodes
    const nodes = [
      { id: 'start', lat: startLat, lng: startLng },
      ...waypoints.map((wp, i) => ({ id: `wp${i}`, lat: wp.lat, lng: wp.lng })),
      { id: 'end', lat: endLat, lng: endLng }
    ];
    
    // Create edges with weights (distances)
    const edges = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const distance = haversineDistance(
          nodes[i].lat, nodes[i].lng,
          nodes[j].lat, nodes[j].lng
        );
        edges.push({
          from: nodes[i].id,
          to: nodes[j].id,
          weight: distance
        });
      }
    }
    
    // Calculate shortest path
    const result = dijkstra(nodes, edges, 'start', 'end');
    
    // Convert path to coordinates
    const coordinates = result.path.map(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      return [node.lat, node.lng];
    });
    
    return {
      success: true,
      coordinates,
      distance: result.distance,
      duration: (result.distance / 30) * 60, // Assume 30 km/h average speed
      method: 'dijkstra'
    };
  } catch (error) {
    console.error('Error calculating route with Dijkstra:', error);
    // Fallback to straight line
    const distance = haversineDistance(startLat, startLng, endLat, endLng);
    return {
      success: true,
      coordinates: [[startLat, startLng], [endLat, endLng]],
      distance,
      duration: (distance / 30) * 60,
      method: 'haversine_fallback'
    };
  }
}

/**
 * Main route calculation function
 * Uses OSRM by default, falls back to Dijkstra if needed
 * @param {number} startLat - Starting latitude
 * @param {number} startLng - Starting longitude
 * @param {number} endLat - Ending latitude
 * @param {number} endLng - Ending longitude
 * @param {Object} options - {useDijkstra: boolean, waypoints: Array}
 * @returns {Promise<Object>} Route data
 */
export async function calculateRoute(startLat, startLng, endLat, endLng, options = {}) {
  const { useDijkstra = false, waypoints = [] } = options;

  // 1) Try Firebase RTDB cache first to avoid external API calls.
  const cached = await getCachedRouteFromFirebase(startLat, startLng, endLat, endLng);
  if (cached) return cached;

  // 2) Compute route via local algorithm/OSRM.
  let route;
  if (useDijkstra && waypoints.length > 0) {
    route = await calculateRouteDijkstra(startLat, startLng, endLat, endLng, waypoints);
  } else {
    route = await calculateRouteOSRM(startLat, startLng, endLat, endLng);
  }

  // 3) Persist into Firebase route_cache for next requests.
  if (route?.success) {
    await setCachedRouteInFirebase(startLat, startLng, endLat, endLng, route);
  }

  return route;
}


/**
 * Rapido/Zomato-Style Location Processing Service
 * 
 * Core Logic:
 * 1. Snap GPS to road (Google Roads API)
 * 2. Smooth location (Kalman Filter / Moving Average)
 * 3. Match to route polyline
 * 4. Calculate progress and next point
 */

import axios from 'axios';
import { getGoogleMapsApiKey } from '../../../shared/utils/envService.js';

// Location history for smoothing
const locationHistory = new Map(); // riderId -> [locations]

// Route polylines cache
const routePolylines = new Map(); // orderId -> {points, totalDistance}

// Cache for snapToRoads API calls (to avoid repeated expensive calls)
const snapToRoadCache = new Map(); // "lat,lng" -> {snapped: {lat, lng}, timestamp}
const lastSnapToRoadCall = new Map(); // riderId -> timestamp (for throttling)

// Cache for Directions API calls
const directionsCache = new Map(); // "origin|destination|waypoints" -> {route, timestamp}

// Configuration
const SNAP_TO_ROAD_THROTTLE_MS = 10000; // Only call snapToRoads every 10 seconds per rider
const SNAP_TO_ROAD_CACHE_DISTANCE_M = 50; // Cache snap results within 50 meters
const DIRECTIONS_CACHE_TTL_MS = 300000; // Cache directions for 5 minutes
const SNAP_TO_ROAD_ENABLED = false; // DISABLE by default - very expensive! Use only when needed

/**
 * Calculate distance between two points (Haversine formula) - helper for cache
 * @param {Object} point1 - {lat, lng}
 * @param {Object} point2 - {lat, lng}
 * @returns {number} Distance in meters
 */
function calculateDistanceQuick(point1, point2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLng = (point2.lng - point1.lng) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Snap GPS coordinates to nearest road using Google Roads API
 * OPTIMIZED: Added throttling and caching to reduce API costs
 * @param {Array} points - Array of {lat, lng} points
 * @param {string} riderId - Rider ID for throttling
 * @returns {Promise<Array>} Snapped points
 */
export async function snapToRoad(points, riderId = null) {
  try {
    // DISABLE snapToRoads by default - it's very expensive!
    // Only enable if really needed for production
    if (!SNAP_TO_ROAD_ENABLED) {
      return points; // Return original points without API call
    }

    if (!points || points.length === 0) return points;
    
    // Throttle: Only allow one call per rider every SNAP_TO_ROAD_THROTTLE_MS
    if (riderId) {
      const lastCall = lastSnapToRoadCall.get(riderId);
      const now = Date.now();
      if (lastCall && (now - lastCall) < SNAP_TO_ROAD_THROTTLE_MS) {
        // Return original points if throttled
        return points;
      }
      lastSnapToRoadCall.set(riderId, now);
    }
    
    // Check cache for nearby points (within 50 meters)
    const cachedResults = [];
    const uncachedPoints = [];
    
    for (const point of points) {
      let foundInCache = false;
      for (const [cachedKey, cached] of snapToRoadCache.entries()) {
        const [cachedLat, cachedLng] = cachedKey.split(',').map(Number);
        const distance = calculateDistanceQuick(point, { lat: cachedLat, lng: cachedLng });
        
        if (distance < SNAP_TO_ROAD_CACHE_DISTANCE_M) {
          cachedResults.push(cached.snapped);
          foundInCache = true;
          break;
        }
      }
      
      if (!foundInCache) {
        uncachedPoints.push(point);
      }
    }
    
    // If all points found in cache, return cached results
    if (uncachedPoints.length === 0) {
      return cachedResults.length > 0 ? cachedResults : points;
    }
    
    const apiKey = await getGoogleMapsApiKey();
    if (!apiKey) {
      console.warn('⚠️ Google Maps API key not found, skipping snap to road');
      return points;
    }
    
    // Google Roads API supports up to 100 points per request
    const batchSize = 100;
    const snappedPoints = [];
    
    for (let i = 0; i < uncachedPoints.length; i += batchSize) {
      const batch = uncachedPoints.slice(i, i + batchSize);
      
      // Format for Roads API: "lat,lng|lat,lng|..."
      const path = batch.map(p => `${p.lat},${p.lng}`).join('|');
      
      try {
        const response = await axios.get(
          `https://roads.googleapis.com/v1/snapToRoads`,
          {
            params: {
              path,
              interpolate: true, // Interpolate points between snapped points
              key: apiKey
            },
            timeout: 5000 // 5 second timeout
          }
        );
        
        if (response.data?.snappedPoints) {
          const snapped = response.data.snappedPoints.map((sp, idx) => {
            const originalPoint = batch[sp.originalIndex || idx];
            const snappedPoint = {
              lat: sp.location.latitude,
              lng: sp.location.longitude,
              originalIndex: sp.originalIndex,
              placeId: sp.placeId
            };
            
            // Cache the result
            const cacheKey = `${originalPoint.lat},${originalPoint.lng}`;
            snapToRoadCache.set(cacheKey, {
              snapped: snappedPoint,
              timestamp: Date.now()
            });
            
            return snappedPoint;
          });
          snappedPoints.push(...snapped);
        }
      } catch (error) {
        // Don't fail completely - return original points for this batch
        console.warn('⚠️ Error in snapToRoads batch:', error.message);
        snappedPoints.push(...batch);
      }
    }
    
    // Clean old cache entries (older than 1 hour)
    const oneHourAgo = Date.now() - 3600000;
    for (const [key, value] of snapToRoadCache.entries()) {
      if (value.timestamp < oneHourAgo) {
        snapToRoadCache.delete(key);
      }
    }
    
    // Combine cached and newly snapped points
    const allSnapped = [...cachedResults, ...snappedPoints];
    return allSnapped.length > 0 ? allSnapped : points;
  } catch (error) {
    console.error('❌ Error snapping to road:', error.message);
    // Return original points if API fails
    return points;
  }
}

/**
 * Generate route polyline using Google Directions API
 * OPTIMIZED: Added caching to avoid repeated API calls for same routes
 * @param {Object} start - {lat, lng}
 * @param {Object} waypoint - {lat, lng} (restaurant)
 * @param {Object} end - {lat, lng} (customer)
 * @returns {Promise<Object>} {points: Array, totalDistance: number}
 */
export async function generateRoutePolyline(start, waypoint, end) {
  try {
    const apiKey = await getGoogleMapsApiKey();
    if (!apiKey) {
      console.warn('⚠️ Google Maps API key not found, cannot generate route');
      return null;
    }
    
    // Round coordinates to 4 decimal places (~11 meters precision) for cache key
    // This allows caching similar routes
    const roundCoord = (coord) => Math.round(coord * 10000) / 10000;
    const origin = `${roundCoord(start.lat)},${roundCoord(start.lng)}`;
    const destination = `${roundCoord(end.lat)},${roundCoord(end.lng)}`;
    const waypoints = waypoint ? `via:${roundCoord(waypoint.lat)},${roundCoord(waypoint.lng)}` : '';
    
    // Create cache key
    const cacheKey = `${origin}|${destination}|${waypoints}`;
    
    // Check cache first
    const cached = directionsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < DIRECTIONS_CACHE_TTL_MS) {
      console.log('✅ Using cached route polyline');
      return cached.route;
    }
    
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/directions/json`,
      {
        params: {
          origin,
          destination,
          waypoints: waypoints || undefined,
          key: apiKey,
          alternatives: false,
          optimize: false
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    if (response.data?.routes?.[0]) {
      const route = response.data.routes[0];
      const polyline = route.overview_polyline.points;
      
      // Decode polyline to get all points
      const points = decodePolyline(polyline);
      
      // Calculate total distance
      let totalDistance = 0;
      for (let i = 1; i < points.length; i++) {
        totalDistance += calculateDistance(points[i-1], points[i]);
      }
      
      const routeData = {
        points,
        totalDistance,
        polyline,
        duration: route.legs.reduce((sum, leg) => sum + leg.duration.value, 0)
      };
      
      // Cache the result
      directionsCache.set(cacheKey, {
        route: routeData,
        timestamp: Date.now()
      });
      
      // Clean old cache entries (older than cache TTL)
      const now = Date.now();
      for (const [key, value] of directionsCache.entries()) {
        if ((now - value.timestamp) > DIRECTIONS_CACHE_TTL_MS) {
          directionsCache.delete(key);
        }
      }
      
      return routeData;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error generating route:', error.message);
    return null;
  }
}

/**
 * Decode Google polyline string to coordinates
 * @param {string} encoded - Encoded polyline string
 * @returns {Array} Array of {lat, lng} points
 */
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
    
    const deltaLat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += deltaLat;
    
    shift = 0;
    result = 0;
    
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    
    const deltaLng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += deltaLng;
    
    points.push({
      lat: lat * 1e-5,
      lng: lng * 1e-5
    });
  }
  
  return points;
}

/**
 * Calculate distance between two points (Haversine formula)
 * @param {Object} point1 - {lat, lng}
 * @param {Object} point2 - {lat, lng}
 * @returns {number} Distance in meters
 */
function calculateDistance(point1, point2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLng = (point2.lng - point1.lng) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Smooth location using moving average (Kalman Filter alternative)
 * @param {string} riderId - Rider ID
 * @param {Object} location - {lat, lng, speed, bearing}
 * @returns {Object} Smoothed location
 */
export function smoothLocation(riderId, location) {
  if (!locationHistory.has(riderId)) {
    locationHistory.set(riderId, []);
  }
  
  const history = locationHistory.get(riderId);
  history.push({
    ...location,
    timestamp: Date.now()
  });
  
  // Keep only last 5 points
  if (history.length > 5) {
    history.shift();
  }
  
  // Moving average smoothing
  if (history.length < 2) {
    return location;
  }
  
  const avgLat = history.reduce((sum, loc) => sum + loc.lat, 0) / history.length;
  const avgLng = history.reduce((sum, loc) => sum + loc.lng, 0) / history.length;
  
  // Speed normalization (clamp between 10-45 km/h)
  const speeds = history.map(loc => loc.speed || 0).filter(s => s > 0);
  const avgSpeed = speeds.length > 0 
    ? Math.max(10, Math.min(45, speeds.reduce((sum, s) => sum + s, 0) / speeds.length))
    : 20; // Default 20 km/h
  
  // Calculate bearing from last two points
  let bearing = location.bearing || 0;
  if (history.length >= 2) {
    const last = history[history.length - 1];
    const prev = history[history.length - 2];
    bearing = calculateBearing(prev, last);
  }
  
  return {
    lat: avgLat,
    lng: avgLng,
    speed: avgSpeed,
    bearing,
    accuracy: location.accuracy || 50
  };
}

/**
 * Calculate bearing (direction) between two points
 * @param {Object} from - {lat, lng}
 * @param {Object} to - {lat, lng}
 * @returns {number} Bearing in degrees (0-360)
 */
function calculateBearing(from, to) {
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const dLng = (to.lng - from.lng) * Math.PI / 180;
  
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - 
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Find nearest point on polyline
 * @param {Object} location - {lat, lng}
 * @param {Array} polylinePoints - Array of {lat, lng}
 * @returns {Object} {point: {lat, lng}, index: number, distance: number}
 */
export function findNearestPointOnPolyline(location, polylinePoints) {
  let minDistance = Infinity;
  let nearestIndex = 0;
  let nearestPoint = polylinePoints[0];
  
  for (let i = 0; i < polylinePoints.length; i++) {
    const distance = calculateDistance(location, polylinePoints[i]);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
      nearestPoint = polylinePoints[i];
    }
  }
  
  return {
    point: nearestPoint,
    index: nearestIndex,
    distance: minDistance
  };
}

/**
 * Calculate progress on route (Rapido core logic)
 * @param {string} orderId - Order ID
 * @param {Object} currentLocation - {lat, lng}
 * @returns {Object} {progress: number (0-1), nextPoint: {lat, lng}, distanceCovered: number}
 */
export async function calculateRouteProgress(orderId, currentLocation) {
  const route = routePolylines.get(orderId);
  if (!route) {
    return null;
  }
  
  // Find nearest point on polyline
  const nearest = findNearestPointOnPolyline(currentLocation, route.points);
  
  // Calculate distance covered up to nearest point
  let distanceCovered = 0;
  for (let i = 1; i <= nearest.index; i++) {
    distanceCovered += calculateDistance(route.points[i-1], route.points[i]);
  }
  
  // Calculate progress (0 to 1)
  const progress = route.totalDistance > 0 
    ? Math.min(1, Math.max(0, distanceCovered / route.totalDistance))
    : 0;
  
  // Get next point on route (for animation)
  const nextIndex = Math.min(nearest.index + 1, route.points.length - 1);
  const nextPoint = route.points[nextIndex];
  
  return {
    progress,
    nextPoint,
    currentPoint: nearest.point,
    distanceCovered,
    totalDistance: route.totalDistance,
    remainingDistance: route.totalDistance - distanceCovered
  };
}

/**
 * Process raw GPS location (Main entry point)
 * @param {string} riderId - Rider ID
 * @param {string} orderId - Order ID
 * @param {Object} rawLocation - {lat, lng, speed, bearing, accuracy}
 * @param {Object} routeInfo - {restaurant: {lat, lng}, customer: {lat, lng}}
 * @returns {Promise<Object>} Processed location ready for broadcast
 */
export async function processLocationUpdate(riderId, orderId, rawLocation, routeInfo) {
  try {
    // Step 1: Snap to road (OPTIMIZED: Pass riderId for throttling, disabled by default)
    // NOTE: snapToRoads is VERY expensive - only enable if absolutely necessary
    const snappedPoints = await snapToRoad([{ lat: rawLocation.lat, lng: rawLocation.lng }], riderId);
    const snappedLocation = snappedPoints[0] || rawLocation;
    
    // Step 2: Smooth location
    const smoothedLocation = smoothLocation(riderId, {
      ...snappedLocation,
      speed: rawLocation.speed || 20,
      bearing: rawLocation.bearing || 0,
      accuracy: rawLocation.accuracy || 50
    });
    
    // Step 3: Get or generate route polyline
    if (!routePolylines.has(orderId) && routeInfo) {
      const route = await generateRoutePolyline(
        smoothedLocation,
        routeInfo.restaurant,
        routeInfo.customer
      );
      if (route) {
        routePolylines.set(orderId, route);
      }
    }
    
    // Step 4: Calculate route progress
    const progress = await calculateRouteProgress(orderId, smoothedLocation);
    
    // Step 5: Get next point on route (for smooth animation)
    const finalLocation = progress?.nextPoint || smoothedLocation;
    
    return {
      lat: finalLocation.lat,
      lng: finalLocation.lng,
      bearing: smoothedLocation.bearing,
      speed: smoothedLocation.speed,
      progress: progress?.progress || 0,
      distanceCovered: progress?.distanceCovered || 0,
      remainingDistance: progress?.remainingDistance || 0,
      timestamp: Date.now(),
      snapped: true,
      onRoute: !!progress
    };
  } catch (error) {
    console.error('❌ Error processing location:', error);
    // Return raw location if processing fails
    return {
      ...rawLocation,
      timestamp: Date.now(),
      snapped: false,
      onRoute: false
    };
  }
}

/**
 * Cache route polyline for an order
 * @param {string} orderId - Order ID
 * @param {Object} route - Route object from generateRoutePolyline
 */
export function cacheRoutePolyline(orderId, route) {
  routePolylines.set(orderId, route);
}

/**
 * Get cached route polyline
 * @param {string} orderId - Order ID
 * @returns {Object|null} Cached route or null
 */
export function getCachedRoute(orderId) {
  return routePolylines.get(orderId) || null;
}

/**
 * Clear location history for a rider
 * @param {string} riderId - Rider ID
 */
export function clearLocationHistory(riderId) {
  locationHistory.delete(riderId);
}

/**
 * Clear route cache for an order
 * @param {string} orderId - Order ID
 */
export function clearRouteCache(orderId) {
  routePolylines.delete(orderId);
}


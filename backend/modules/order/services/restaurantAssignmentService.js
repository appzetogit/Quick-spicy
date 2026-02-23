import Restaurant from '../../restaurant/models/Restaurant.js';
import Zone from '../../admin/models/Zone.js';
import mongoose from 'mongoose';

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
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
 * Check if a point is within a zone polygon using ray casting algorithm
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Array} zoneCoordinates - Zone coordinates array
 * @returns {boolean}
 */
function isPointInZone(lat, lng, zoneCoordinates) {
  if (!zoneCoordinates || zoneCoordinates.length < 3) return false;
  
  // Ray casting algorithm for point-in-polygon test
  let inside = false;
  for (let i = 0, j = zoneCoordinates.length - 1; i < zoneCoordinates.length; j = i++) {
    // Extract coordinates from zone coordinate objects
    const coordI = zoneCoordinates[i];
    const coordJ = zoneCoordinates[j];
    
    const xi = typeof coordI === 'object' 
      ? (coordI.latitude || coordI.lat) 
      : (Array.isArray(coordI) ? coordI[0] : null);
    const yi = typeof coordI === 'object' 
      ? (coordI.longitude || coordI.lng) 
      : (Array.isArray(coordI) ? coordI[1] : null);
    const xj = typeof coordJ === 'object' 
      ? (coordJ.latitude || coordJ.lat) 
      : (Array.isArray(coordJ) ? coordJ[0] : null);
    const yj = typeof coordJ === 'object' 
      ? (coordJ.longitude || coordJ.lng) 
      : (Array.isArray(coordJ) ? coordJ[1] : null);
    
    if (xi === null || yi === null || xj === null || yj === null) continue;
    
    // Ray casting: check if ray from point crosses edge
    const intersect = ((yi > lng) !== (yj > lng)) && 
                     (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if a restaurant's location (pin) is within any active zone
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @returns {Promise<Object|null>} Zone object if restaurant is in zone, null otherwise
 */
async function isRestaurantInAnyZone(restaurantLat, restaurantLng) {
  if (!restaurantLat || !restaurantLng) return null;
  
  const activeZones = await Zone.find({ isActive: true }).lean();
  
  for (const zone of activeZones) {
    if (!zone.coordinates || zone.coordinates.length < 3) continue;
    
    let isInZone = false;
    if (typeof zone.containsPoint === 'function') {
      isInZone = zone.containsPoint(restaurantLat, restaurantLng);
    } else {
      isInZone = isPointInZone(restaurantLat, restaurantLng, zone.coordinates);
    }
    
    if (isInZone) {
      return zone;
    }
  }
  
  return null;
}

/**
 * Find nearest restaurant based on delivery location
 * ONLY restaurants whose location (pin) is within active zones will receive orders
 * @param {number} deliveryLat - Delivery latitude
 * @param {number} deliveryLng - Delivery longitude
 * @param {Array} orderItems - Order items (to check restaurant availability)
 * @returns {Object|null} Nearest restaurant or null
 */
export async function findNearestRestaurant(deliveryLat, deliveryLng, orderItems = []) {
  try {
    // Validate coordinates
    if (!deliveryLat || !deliveryLng || 
        typeof deliveryLat !== 'number' || typeof deliveryLng !== 'number' ||
        deliveryLat < -90 || deliveryLat > 90 || 
        deliveryLng < -180 || deliveryLng > 180) {
      throw new Error('Invalid delivery coordinates');
    }

    // Step 1: Get all active restaurants with valid locations
    const allRestaurants = await Restaurant.find({
      isActive: true,
      isAcceptingOrders: true,
      'location.latitude': { $exists: true, $ne: null },
      'location.longitude': { $exists: true, $ne: null }
    }).lean();

    // Step 2: Filter restaurants - ONLY those whose location (pin) is within active zones
    const restaurantsInZones = [];
    
    for (const restaurant of allRestaurants) {
      const restaurantLat = restaurant.location?.latitude || restaurant.location?.coordinates?.[1];
      const restaurantLng = restaurant.location?.longitude || restaurant.location?.coordinates?.[0];
      
      if (!restaurantLat || !restaurantLng) continue;
      
      // Check if restaurant's location (pin) is within any active zone
      const zone = await isRestaurantInAnyZone(restaurantLat, restaurantLng);
      
      if (zone) {
        // Restaurant is in a zone, now check if delivery location is also in the same zone
        let deliveryInZone = false;
        if (typeof zone.containsPoint === 'function') {
          deliveryInZone = zone.containsPoint(deliveryLat, deliveryLng);
        } else {
          deliveryInZone = isPointInZone(deliveryLat, deliveryLng, zone.coordinates);
        }
        
        if (deliveryInZone) {
          // Both restaurant and delivery location are in the same zone
          const distance = calculateDistance(deliveryLat, deliveryLng, restaurantLat, restaurantLng);
          
          restaurantsInZones.push({
            restaurant: restaurant,
            restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
            zoneId: zone._id.toString(),
            zoneName: zone.name || zone.zoneName,
            distance: distance
          });
        }
      }
    }

    // Step 3: If no restaurants found, return null (strict zone-based assignment)
    if (restaurantsInZones.length === 0) {
      console.log('⚠️ No restaurants found whose location is within active zones for delivery location:', deliveryLat, deliveryLng);
      return null;
    }

    // Sort by distance and return nearest restaurant
    restaurantsInZones.sort((a, b) => a.distance - b.distance);
    
    return {
      restaurant: restaurantsInZones[0].restaurant,
      restaurantId: restaurantsInZones[0].restaurantId,
      zoneId: restaurantsInZones[0].zoneId,
      zoneName: restaurantsInZones[0].zoneName,
      distance: restaurantsInZones[0].distance,
      assignedBy: 'zone_based'
    };
  } catch (error) {
    console.error('Error finding nearest restaurant:', error);
    throw error;
  }
}

/**
 * Assign order to nearest restaurant
 * @param {Object} orderData - Order data including delivery location
 * @returns {Object} Updated order data with assigned restaurant
 */
export async function assignOrderToNearestRestaurant(orderData) {
  try {
    const deliveryLocation = orderData.address?.location?.coordinates || 
                           [orderData.address?.location?.longitude || 0, 
                            orderData.address?.location?.latitude || 0];
    
    const deliveryLat = deliveryLocation[1] || orderData.address?.location?.latitude;
    const deliveryLng = deliveryLocation[0] || orderData.address?.location?.longitude;

    if (!deliveryLat || !deliveryLng) {
      throw new Error('Delivery location coordinates are required');
    }

    const nearestRestaurant = await findNearestRestaurant(
      deliveryLat, 
      deliveryLng, 
      orderData.items || []
    );

    if (!nearestRestaurant) {
      throw new Error('No available restaurant found for this delivery location');
    }

    return {
      ...orderData,
      restaurantId: nearestRestaurant.restaurantId,
      restaurantName: nearestRestaurant.restaurant.name || 'Unknown Restaurant',
      assignedRestaurant: {
        restaurantId: nearestRestaurant.restaurantId,
        distance: nearestRestaurant.distance,
        assignedBy: nearestRestaurant.assignedBy,
        zoneId: nearestRestaurant.zoneId || null,
        zoneName: nearestRestaurant.zoneName || null
      }
    };
  } catch (error) {
    console.error('Error assigning order to restaurant:', error);
    throw error;
  }
}


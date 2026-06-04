// Let's test if Poojitha Family Restaurant coordinates or nearby coordinates are inside the Cumbum Branch zone polygon.

const restaurantCoords = { lat: 15.564111, lng: 79.112036 };

// Zone polygon: Cumbum Branch
const cumbumPolygon = [
  { lat: 15.559262, lng: 79.119465 },
  { lat: 15.574972, lng: 79.085133 },
  { lat: 15.613662, lng: 79.119293 },
  { lat: 15.599113, lng: 79.142983 }
].map(c => [c.lng, c.lat]); // [lng, lat] format for GeoJSON / our function

// Ensure polygon is closed
const closedCumbumPolygon = [...cumbumPolygon];
if (closedCumbumPolygon[0][0] !== closedCumbumPolygon[closedCumbumPolygon.length-1][0] || 
    closedCumbumPolygon[0][1] !== closedCumbumPolygon[closedCumbumPolygon.length-1][1]) {
  closedCumbumPolygon.push(closedCumbumPolygon[0]);
}

function isPointInPolygon(lat, lng, polygonCoords) {
  let inside = false;
  const epsilon = 1e-10;

  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const xi = polygonCoords[i][0];
    const yi = polygonCoords[i][1];
    const xj = polygonCoords[j][0];
    const yj = polygonCoords[j][1];

    const cross = (lng - xi) * (yj - yi) - (lat - yi) * (xj - xi);
    if (Math.abs(cross) < epsilon) {
      const minX = Math.min(xi, xj) - epsilon;
      const maxX = Math.max(xi, xj) + epsilon;
      const minY = Math.min(yi, yj) - epsilon;
      const maxY = Math.max(yi, yj) + epsilon;
      if (lng >= minX && lng <= maxX && lat >= minY && lat <= maxY) {
        return true;
      }
    }

    const intersects = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || epsilon) + xi);

    if (intersects) inside = !inside;
  }

  return inside;
}

const isRestInCumbum = isPointInPolygon(restaurantCoords.lat, restaurantCoords.lng, closedCumbumPolygon);
console.log('Is Restaurant in Cumbum Zone:', isRestInCumbum);

// Let's check for some coordinates that are 1.2km away from the restaurant.
// Say,Bestavaripeta or Cumbum coordinates.
//bestavaripeta: {"type":"Point","coordinates":[79.1095136,15.5439658]}
const bestavaripeta = { lat: 15.5439658, lng: 79.1095136 };
console.log('Is Bestavaripeta in Cumbum Zone:', isPointInPolygon(bestavaripeta.lat, bestavaripeta.lng, closedCumbumPolygon));

// Cumbum: {"type":"Point","coordinates":[79.110598,15.5796776]}
const cumbum = { lat: 15.5796776, lng: 79.110598 };
console.log('Is Cumbum in Cumbum Zone:', isPointInPolygon(cumbum.lat, cumbum.lng, closedCumbumPolygon));

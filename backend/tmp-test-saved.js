// Let's test if Vijay's or other users' coordinates in Chinthalapalem/Kambham are inside Cumbum branch zone.

const cumbumPolygon = [
  { lat: 15.559262, lng: 79.119465 },
  { lat: 15.574972, lng: 79.085133 },
  { lat: 15.613662, lng: 79.119293 },
  { lat: 15.599113, lng: 79.142983 }
].map(c => [c.lng, c.lat]);

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

// Vijay: State Highway 65, State Highway 65, Chinthalapalem, Andhra Pradesh
// Coords: [79.1130433,15.56849]
const vijayCoords = { lat: 15.56849, lng: 79.1130433 };
console.log('Is Vijay (Chinthalapalem SH-65) in Cumbum Zone:', isPointInPolygon(vijayCoords.lat, vijayCoords.lng, closedCumbumPolygon));

// Pavi Akka: Kambham
// Coords: [79.10993321574855,15.580417911070784]
const paviCoords = { lat: 15.580417911070784, lng: 79.10993321574855 };
console.log('Is Pavi Akka (Kambham Bus Stand) in Cumbum Zone:', isPointInPolygon(paviCoords.lat, paviCoords.lng, closedCumbumPolygon));

// Hafeez Pathan: Kambham
// Coords: [79.110598,15.5796776]
const hafeezCoords = { lat: 15.5796776, lng: 79.110598 };
console.log('Is Hafeez Pathan in Cumbum Zone:', isPointInPolygon(hafeezCoords.lat, hafeezCoords.lng, closedCumbumPolygon));

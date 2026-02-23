# ETA Calculation System Documentation

## Overview

This is a comprehensive ETA (Estimated Time of Arrival) calculation system for the food delivery platform, similar to Zomato/Swiggy. It provides real-time ETA updates based on various factors including restaurant preparation time, rider assignment, traffic conditions, and more.

## Architecture

### Components

1. **Models**
   - `OrderEvent.js` - Tracks all events that affect ETA
   - `ETALog.js` - Logs ETA calculation history for analytics

2. **Services**
   - `etaCalculationService.js` - Core ETA calculation logic
   - `googleMapsService.js` - Google Maps Distance Matrix API integration
   - `etaEventService.js` - Handles events that trigger ETA recalculation
   - `etaWebSocketService.js` - Real-time WebSocket updates

3. **Controllers**
   - `etaController.js` - API endpoints for ETA operations

4. **Routes**
   - `etaRoutes.js` - ETA-related API routes

## ETA Calculation Formula

```
ETA = restaurantPrepTime
    + restaurantLoadDelay
    + riderAssignmentTime
    + travelTime(rider → restaurant)
    + travelTime(restaurant → user)
    + bufferTime
```

### Components Breakdown

1. **Restaurant Preparation Time**
   - Retrieved from restaurant settings (`estimatedDeliveryTime`)
   - Default: 25 minutes

2. **Restaurant Load Delay**
   - Calculated based on pending orders
   - Formula: `(pendingOrders / parallelCapacity) * avgPrepPerOrder`
   - Capped at 30 minutes

3. **Rider Assignment Time**
   - Average: 3-5 minutes
   - Set to 0 if rider already assigned

4. **Travel Times**
   - Calculated using Google Maps Distance Matrix API
   - Falls back to Haversine formula if API unavailable
   - Includes traffic-aware routing

5. **Traffic Multiplier**
   - Low: 1.0
   - Medium: 1.2
   - High: 1.4

6. **Buffer Time**
   - <5km: 4 minutes
   - ≥5km: 7 minutes

7. **ETA Range**
   - minETA = totalETA - 3 minutes
   - maxETA = totalETA + 3 minutes

## API Endpoints

### Public Endpoints

#### Get Live ETA
```
GET /api/order/api/orders/:orderId/eta
```

Response:
```json
{
  "success": true,
  "message": "Live ETA retrieved successfully",
  "data": {
    "minETA": 25,
    "maxETA": 30,
    "elapsedMinutes": 5,
    "status": "preparing",
    "formatted": "25-30 mins"
  }
}
```

#### Get ETA History
```
GET /api/order/api/orders/:orderId/eta/history
```

#### Get Order Events
```
GET /api/order/api/orders/:orderId/events
```

### Protected Endpoints

#### Calculate Initial ETA
```
POST /api/order/api/orders/calculate-eta
Authorization: Bearer <token>

Body:
{
  "restaurantId": "rest_123",
  "restaurantLocation": {
    "latitude": 23.2599,
    "longitude": 77.4126
  },
  "userLocation": {
    "latitude": 23.2600,
    "longitude": 77.4127
  }
}
```

#### Recalculate ETA
```
POST /api/order/api/orders/:orderId/eta/recalculate
Authorization: Bearer <token>

Body:
{
  "reason": "Manual recalculation"
}
```

### Event Handlers

These endpoints trigger ETA recalculation based on events:

#### Restaurant Accepted
```
POST /api/order/api/orders/:orderId/events/restaurant-accepted

Body:
{
  "acceptedAt": "2024-01-15T10:30:00Z"
}
```

#### Rider Assigned
```
POST /api/order/api/orders/:orderId/events/rider-assigned

Body:
{
  "riderId": "rider_123"
}
```

#### Rider Reached Restaurant
```
POST /api/order/api/orders/:orderId/events/rider-reached-restaurant
```

#### Food Not Ready
```
POST /api/order/api/orders/:orderId/events/food-not-ready

Body:
{
  "waitingTime": 5
}
```

#### Rider Started Delivery
```
POST /api/order/api/orders/:orderId/events/rider-started-delivery
```

#### Traffic Detected
```
POST /api/order/api/orders/:orderId/events/traffic-detected

Body:
{
  "trafficLevel": "high"
}
```

#### Rider Nearby
```
POST /api/order/api/orders/:orderId/events/rider-nearby

Body:
{
  "distanceToDrop": 0.3
}
```

## WebSocket Events

### Client → Server

#### Join Order Room
```javascript
socket.emit('join-order', { orderId: 'ORD-123' });
```

#### Join User Room
```javascript
socket.emit('join-user', { userId: 'user_123' });
```

### Server → Client

#### ETA Updated
```javascript
socket.on('ETA_UPDATED', (data) => {
  console.log('ETA Updated:', data);
  // {
  //   orderId: 'ORD-123',
  //   eta: {
  //     min: 25,
  //     max: 30,
  //     formatted: '25-30 mins',
  //     lastUpdated: '2024-01-15T10:30:00Z'
  //   },
  //   status: 'preparing',
  //   timestamp: '2024-01-15T10:30:00Z'
  // }
});
```

#### Rider Assigned
```javascript
socket.on('RIDER_ASSIGNED', (data) => {
  console.log('Rider Assigned:', data);
});
```

#### Picked Up
```javascript
socket.on('PICKED_UP', (data) => {
  console.log('Order Picked Up:', data);
});
```

#### Nearby
```javascript
socket.on('NEARBY', (data) => {
  console.log('Rider Nearby:', data);
  // {
  //   orderId: 'ORD-123',
  //   distanceToDrop: 0.3,
  //   timestamp: '2024-01-15T10:30:00Z'
  // }
});
```

## Integration Guide

### 1. Order Creation

When creating an order, ETA is automatically calculated:

```javascript
// In orderController.js - already integrated
const etaResult = await etaCalculationService.calculateInitialETA({
  restaurantId: assignedRestaurantId,
  restaurantLocation,
  userLocation
});
```

### 2. Restaurant Accepts Order

```javascript
import etaEventService from '../services/etaEventService.js';

// When restaurant accepts order
await etaEventService.handleRestaurantAccepted(orderId, new Date());
```

### 3. Rider Assignment

```javascript
import etaEventService from '../services/etaEventService.js';

// When rider is assigned
await etaEventService.handleRiderAssigned(orderId, riderId);
```

### 4. Rider Reaches Restaurant

```javascript
import etaEventService from '../services/etaEventService.js';

// When rider reaches restaurant
await etaEventService.handleRiderReachedRestaurant(orderId);
```

### 5. Food Not Ready

```javascript
import etaEventService from '../services/etaEventService.js';

// When food is not ready (rider waiting)
await etaEventService.handleFoodNotReady(orderId, waitingTimeMinutes);
```

### 6. Rider Started Delivery

```javascript
import etaEventService from '../services/etaEventService.js';

// When rider picks up and starts delivery
await etaEventService.handleRiderStartedDelivery(orderId);
```

### 7. Traffic Detection

```javascript
import etaEventService from '../services/etaEventService.js';

// When traffic is detected
await etaEventService.handleTrafficDetected(orderId, 'high'); // 'low', 'medium', 'high'
```

### 8. Rider Nearing Drop

```javascript
import etaEventService from '../services/etaEventService.js';

// When rider is within 500m of drop location
await etaEventService.handleRiderNearby(orderId, distanceInKm);
```

## Environment Variables

Add to `.env`:

```env
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

## Database Schema Updates

The Order model has been updated with:

```javascript
eta: {
  min: Number,      // minimum ETA in minutes
  max: Number,     // maximum ETA in minutes
  lastUpdated: Date
}
```

## Real-time Updates

The system automatically:
- Updates ETA every 30 seconds for active orders
- Emits WebSocket events when ETA changes
- Logs all ETA changes for analytics

## Edge Cases Handled

1. **No Rider Available**
   - Uses estimated travel time
   - Updates when rider is assigned

2. **Restaurant Delay**
   - Detects late acceptance
   - Adds delay to ETA

3. **Traffic Spike**
   - Detects high traffic
   - Applies traffic multiplier

4. **Food Not Ready**
   - Tracks waiting time
   - Adds to ETA

5. **API Failures**
   - Falls back to Haversine calculation
   - Uses cached location if available

## Admin Dashboard Integration

For admin dashboard analytics:

```javascript
// Get ETA statistics
const etaLogs = await ETALog.find({
  calculatedAt: { $gte: startDate, $lte: endDate }
}).aggregate([
  {
    $group: {
      _id: '$reason',
      avgMinETA: { $avg: '$newETA.min' },
      avgMaxETA: { $avg: '$newETA.max' },
      count: { $sum: 1 }
    }
  }
]);
```

## Testing

### Test ETA Calculation

```javascript
import etaCalculationService from './services/etaCalculationService.js';

const eta = await etaCalculationService.calculateInitialETA({
  restaurantId: 'rest_123',
  restaurantLocation: { latitude: 23.2599, longitude: 77.4126 },
  userLocation: { latitude: 23.2600, longitude: 77.4127 }
});

console.log('ETA:', eta);
```

### Test Event Handling

```javascript
import etaEventService from './services/etaEventService.js';

// Test restaurant accepted
await etaEventService.handleRestaurantAccepted(orderId, new Date());
```

## Performance Considerations

1. **Google Maps API**
   - Rate limits: 100 requests per 100 seconds
   - Consider caching for frequently accessed routes
   - Use batch requests when possible

2. **Database Queries**
   - Indexes on `orderId`, `timestamp` for fast lookups
   - Limit ETA history queries to last 50 records

3. **WebSocket**
   - Periodic updates every 30 seconds
   - Clean up intervals when order is delivered

## Future Enhancements

1. Machine learning for ETA prediction
2. Historical data analysis for better accuracy
3. Multi-zone support
4. Weather-based adjustments
5. Peak hour multipliers

## Support

For issues or questions, contact the backend team.


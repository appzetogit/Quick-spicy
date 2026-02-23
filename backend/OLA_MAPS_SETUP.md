# OLA Maps Integration Setup Guide

यह guide आपको OLA Maps API को अपने MERN stack project में integrate करने में मदद करेगा।

## Overview

OLA Maps API का उपयोग करके coordinates (latitude/longitude) को readable addresses में convert किया जाता है, जैसे "New Palasia, Indore, Madhya Pradesh"।

## Architecture

1. **Frontend**: Browser की Geolocation API से user की current location (lat/lng) fetch करता है
2. **Backend**: Frontend से coordinates receive करके OLA Maps API को call करता है
3. **OLA Maps API**: Coordinates को readable address में convert करता है

## Setup Instructions

### 1. OLA Maps API Key प्राप्त करें

1. OLA Maps developer portal पर जाएं: https://developer.olamaps.io/
2. Account बनाएं या login करें
3. API Key generate करें
4. API Key को safe रखें (यह sensitive information है)

### 2. Backend Environment Variables Setup

Backend folder में `.env` file में निम्नलिखित variable add करें:

```env
# OLA Maps API Configuration
OLA_MAPS_API_KEY=your_api_key_here
OLA_MAPS_PROJECT_ID=your_project_id_optional
OLA_MAPS_CLIENT_ID=your_client_id_optional
OLA_MAPS_CLIENT_SECRET=your_client_secret_optional
```

**Note**: 
- `OLA_MAPS_API_KEY` **required** है
- अन्य variables optional हैं (कुछ authentication methods के लिए)

### 3. Backend Implementation

Backend implementation पहले से ही complete है:

**Endpoint**: `GET /api/location/reverse?lat={latitude}&lng={longitude}`

**Location**: `backend/modules/location/controllers/locationController.js`

Backend automatically निम्नलिखित formats try करता है:
1. Query parameter format: `?latlng={lat},{lng}&api_key={key}`
2. Separate lat/lng parameters
3. Bearer token authentication
4. Header-based API key

**Response Format**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "formatted_address": "New Palasia, Indore, Madhya Pradesh",
        "address_components": {
          "city": "Indore",
          "state": "Madhya Pradesh",
          "country": "India",
          "area": "New Palasia"
        }
      }
    ]
  },
  "source": "olamaps"
}
```

### 4. Frontend Implementation

Frontend में दो तरीके से use कर सकते हैं:

#### Method 1: Simple Example Component (आपके example के अनुसार)

```jsx
import UserLocationExample from './examples/UserLocationExample'

function App() {
  return <UserLocationExample />
}
```

**File Location**: `frontend/src/module/user/examples/UserLocationExample.jsx`

#### Method 2: Using the Hook (Recommended - Production use)

```jsx
import { useLocation } from '@/module/user/hooks/useLocation'

function MyComponent() {
  const { location, loading, error, requestLocation } = useLocation()
  
  return (
    <div>
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error}</p>}
      {location && (
        <div>
          <p>Area: {location.area}</p>
          <p>City: {location.city}</p>
          <p>Address: {location.formattedAddress}</p>
        </div>
      )}
    </div>
  )
}
```

**Hook Location**: `frontend/src/module/user/hooks/useLocation.jsx`

### 5. API Call Flow

```
User Browser
    ↓
[Geolocation API] → lat, lng
    ↓
[Frontend] → locationAPI.reverseGeocode(lat, lng)
    ↓
[Backend API] → GET /api/location/reverse?lat={lat}&lng={lng}
    ↓
[Backend Controller] → OLA Maps API Call
    ↓
https://api.olamaps.io/places/v1/reverse-geocode?latlng={lat},{lng}&api_key={key}
    ↓
[OLA Maps API] → Address Response
    ↓
[Backend] → Process & Return
    ↓
[Frontend] → Display Address
```

## Testing

### Backend Test

Backend में test file run करें:

```bash
cd backend
node test-ola-maps.js
```

### Frontend Test

1. Example component को import करें:
```jsx
import UserLocationExample from '@/module/user/examples/UserLocationExample'
```

2. Component render करें और browser में location permission allow करें

3. Address properly display होना चाहिए

## API Endpoints

### Reverse Geocode
- **URL**: `/api/location/reverse`
- **Method**: `GET`
- **Query Parameters**:
  - `lat` (required): Latitude
  - `lng` (required): Longitude
- **Response**: 
  - Success: `{ success: true, data: { results: [...] }, source: "olamaps" }`
  - Error: `{ success: false, message: "error message" }`

### Nearby Locations
- **URL**: `/api/location/nearby`
- **Method**: `GET`
- **Query Parameters**:
  - `lat` (required): Latitude
  - `lng` (required): Longitude
  - `radius` (optional): Search radius in meters (default: 500)
  - `query` (optional): Search query

## Error Handling

Backend automatically multiple fallback methods try करता है:
1. OLA Maps API (primary)
2. Google Maps API (if configured, fallback)
3. BigDataCloud API (final fallback)

अगर OLA Maps fail हो जाए, तो system automatically fallback services use करेगा।

## Security Best Practices

1. ✅ **API Key को backend में रखें** - Frontend में directly expose न करें
2. ✅ **Environment variables use करें** - API keys को code में hardcode न करें
3. ✅ **.env file को .gitignore में रखें** - Git में commit न करें
4. ✅ **Production में secure storage use करें** - AWS Secrets Manager, etc.

## Troubleshooting

### Issue: "Location service not configured"
**Solution**: `.env` file में `OLA_MAPS_API_KEY` add करें

### Issue: "Invalid API key"
**Solution**: OLA Maps portal से correct API key verify करें

### Issue: Location permission denied
**Solution**: Browser settings में location permissions enable करें

### Issue: API timeout
**Solution**: 
- Internet connection check करें
- OLA Maps API status check करें
- Backend logs check करें

## Additional Resources

- OLA Maps Documentation: https://developer.olamaps.io/docs
- Example Components: `frontend/src/module/user/examples/`
- Location Hooks: `frontend/src/module/user/hooks/useLocation.jsx`

## Support

अगर कोई issue हो, तो:
1. Backend logs check करें
2. Browser console check करें
3. Network requests verify करें (Browser DevTools → Network tab)

---

**Last Updated**: 2024
**Maintained By**: AppzetoFood Development Team


import axios from 'axios';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Reverse geocode coordinates to address using OLA Maps API
 */
export const reverseGeocode = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude'
      });
    }

    const apiKey = process.env.OLA_MAPS_API_KEY;
    const projectId = process.env.OLA_MAPS_PROJECT_ID;
    const clientId = process.env.OLA_MAPS_CLIENT_ID;
    const clientSecret = process.env.OLA_MAPS_CLIENT_SECRET;

    try {
      let response = null;
      let lastError = null;

      // Only try OLA Maps if API key is configured
      if (apiKey) {
        // Try Method 1a: API Key with latlng combined format (user's example format)
        // This matches the exact format from Ola Maps documentation
        try {
          const requestId = Date.now().toString();
          const url = `https://api.olamaps.io/places/v1/reverse-geocode?latlng=${latNum},${lngNum}&api_key=${apiKey}`;
          
          response = await axios.get(url, {
            headers: {
              'X-Request-Id': requestId, // Unique ID for tracking
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            timeout: 10000 // 10 seconds timeout
          });
          
          logger.info('OLA Maps reverse geocode successful (latlng format)', {
            lat: latNum,
            lng: lngNum,
            responseKeys: response.data ? Object.keys(response.data) : [],
            hasResults: !!(response.data?.results),
            resultsLength: response.data?.results?.length || 0
          });
          
          // Log first result for debugging
          if (response.data?.results?.[0]) {
            logger.info('OLA Maps first result:', {
              formatted_address: response.data.results[0].formatted_address,
              hasAddressComponents: !!response.data.results[0].address_components
            });
          }
        } catch (err1a) {
          lastError = err1a;
          logger.warn('OLA Maps Method 1a failed:', {
            error: err1a.message,
            status: err1a.response?.status,
            data: err1a.response?.data
          });
          response = null;
          
          // Try Method 1b: API Key as query parameter (separate lat/lng)
          try {
            response = await axios.get(
              'https://api.olamaps.io/places/v1/reverse-geocode',
              {
                params: { 
                  lat: latNum, 
                  lng: lngNum,
                  key: apiKey,
                  // Add parameters for detailed response
                  include_sublocality: true,
                  include_neighborhood: true
                },
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'X-Request-Id': Date.now().toString()
                },
                timeout: 10000 // 10 seconds timeout
              }
            );
            logger.info('OLA Maps reverse geocode successful (query param)', {
              lat: latNum,
              lng: lngNum,
              responseKeys: response.data ? Object.keys(response.data) : []
            });
          } catch (err1b) {
            lastError = err1b;
            response = null;
          }
        }
        
        // Try Method 2: Bearer token with project headers
        if (!response) {
          try {
            const headers = {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'X-Request-Id': Date.now().toString()
            };
            
            if (projectId) {
              headers['X-Project-ID'] = projectId;
            }
            if (clientId) {
              headers['X-Client-ID'] = clientId;
            }

            response = await axios.get(
              'https://api.olamaps.io/places/v1/reverse-geocode',
              {
                params: { lat: latNum, lng: lngNum },
                headers,
                timeout: 10000 // 10 seconds timeout
              }
            );
            logger.info('OLA Maps reverse geocode successful (bearer token)', {
              lat: latNum,
              lng: lngNum
            });
          } catch (err2) {
            lastError = err2;
            response = null;
          }
        }
        
        // Try Method 3: API Key in X-API-Key header
        if (!response) {
          try {
            response = await axios.get(
              'https://api.olamaps.io/places/v1/reverse-geocode',
              {
                params: { lat: latNum, lng: lngNum },
                headers: {
                  'X-API-Key': apiKey,
                  'Content-Type': 'application/json',
                  'X-Request-Id': Date.now().toString()
                },
                timeout: 10000 // 10 seconds timeout
              }
            );
            logger.info('OLA Maps reverse geocode successful (header)', {
              lat: latNum,
              lng: lngNum
            });
          } catch (err3) {
            lastError = err3;
            response = null;
          }
        }
      } else {
        // OLA Maps API key not configured, skip to fallback
        logger.warn('OLA_MAPS_API_KEY not configured, using fallback service');
      }
      
      // All OLA Maps methods failed or not configured, use fallback
      if (!response) {
        try {
          logger.warn('All OLA Maps authentication methods failed, using fallback service', {
            error: lastError?.message || 'All methods failed',
            status: lastError?.response?.status
          });
          
          try {
              // Try Google Maps Geocoding API first (better sublocality data)
              let fallbackResponse = null;
              // Get Google Maps API key from database (NO FALLBACK)
              const { getGoogleMapsApiKey } = await import('../../../shared/utils/envService.js');
              const googleApiKey = await getGoogleMapsApiKey();
              
              if (googleApiKey) {
                try {
                  fallbackResponse = await axios.get(
                    `https://maps.googleapis.com/maps/api/geocode/json`,
                    {
                      params: {
                        latlng: `${latNum},${lngNum}`,
                        key: googleApiKey,
                        language: 'en'
                      },
                      timeout: 5000
                    }
                  );
                  
                  // Transform Google Maps response
                  if (fallbackResponse.data && fallbackResponse.data.results && fallbackResponse.data.results.length > 0) {
                    const googleResult = fallbackResponse.data.results[0];
                    const addressComponents = googleResult.address_components || [];
                    
                    // Extract components
                    let city = "";
                    let state = "";
                    let country = "";
                    let area = "";
                    
                    addressComponents.forEach(comp => {
                      const types = comp.types || [];
                      if (types.includes('locality')) city = comp.long_name;
                      if (types.includes('administrative_area_level_1')) state = comp.long_name;
                      if (types.includes('country')) country = comp.long_name;
                      if (types.includes('sublocality') || types.includes('sublocality_level_1') || types.includes('neighborhood')) {
                        area = comp.long_name;
                      }
                    });
                    
                    // If no sublocality, try all sublocality levels and neighborhood
                    if (!area) {
                      // Try sublocality_level_2, sublocality_level_3, neighborhood
                      const sublocality = addressComponents.find(c => {
                        const types = c.types || [];
                        return types.includes('sublocality_level_2') || 
                               types.includes('sublocality_level_3') ||
                               types.includes('neighborhood') ||
                               (types.includes('political') && 
                                !types.includes('administrative_area_level_1') &&
                                !types.includes('locality'));
                      });
                      if (sublocality && 
                          sublocality.long_name !== city && 
                          sublocality.long_name !== state &&
                          !sublocality.long_name.toLowerCase().includes('district')) {
                        area = sublocality.long_name;
                      }
                    }
                    
                    // If still no area, try Google Places Nearby Search for more specific location
                    if (!area && googleApiKey) {
                      try {
                        const placesResponse = await axios.get(
                          `https://maps.googleapis.com/maps/api/place/nearbysearch/json`,
                          {
                            params: {
                              location: `${latNum},${lngNum}`,
                              radius: 100, // 100 meters - very close
                              type: 'neighborhood|sublocality',
                              key: googleApiKey
                            },
                            timeout: 3000
                          }
                        );
                        
                        if (placesResponse.data && placesResponse.data.results && placesResponse.data.results.length > 0) {
                          const place = placesResponse.data.results[0];
                          if (place.name && 
                              place.name !== city && 
                              place.name !== state &&
                              !place.name.toLowerCase().includes('district')) {
                            area = place.name;
                            logger.info('Found area from Google Places Nearby Search', { area });
                          }
                        }
                      } catch (placesErr) {
                        // Silently fail - this is optional enhancement
                      }
                    }
                    
                    const transformedData = {
                      results: [{
                        formatted_address: googleResult.formatted_address,
                        address_components: {
                          city: city,
                          state: state,
                          country: country,
                          area: area
                        },
                        geometry: {
                          location: {
                            lat: latNum,
                            lng: lngNum
                          }
                        }
                      }]
                    };
                    
                    return res.json({
                      success: true,
                      data: transformedData,
                      source: 'google_maps'
                    });
                  }
                } catch (googleErr) {
                  logger.warn('Google Maps geocoding failed, using bigdatacloud fallback', {
                    error: googleErr.message
                  });
                }
              }
              
              // Fallback to bigdatacloud if Google Maps not available or failed
              fallbackResponse = await axios.get(
                `https://api.bigdatacloud.net/data/reverse-geocode-client`,
                {
                  params: {
                    latitude: latNum,
                    longitude: lngNum,
                    localityLanguage: 'en'
                  },
                  timeout: 5000 // Reduced timeout to 5 seconds
                }
              );

              // Transform fallback response to match expected format
              const fallbackData = fallbackResponse.data;
              
              // Extract sublocality/area from bigdatacloud response
              // bigdatacloud provides localityInfo.administrative array with different levels
              let area = "";
              if (fallbackData.localityInfo?.administrative) {
                // Find sublocality (usually at index 2 or 3, not state which is at 1)
                const adminLevels = fallbackData.localityInfo.administrative;
                // Level 1 is usually state, level 2+ might be district/city, level 3+ is sublocality
                for (let i = 2; i < adminLevels.length && i < 5; i++) {
                  const level = adminLevels[i];
                  if (level?.name && 
                      level.name !== fallbackData.principalSubdivision && 
                      level.name !== fallbackData.city &&
                      level.name !== fallbackData.locality) {
                    area = level.name;
                    break;
                  }
                }
                // If no area found, try subLocality field directly
                if (!area && fallbackData.subLocality) {
                  area = fallbackData.subLocality;
                }
              }
              
              // Build formatted address with area if available
              let formattedAddress = fallbackData.formattedAddress;
              if (!formattedAddress) {
                const parts = [];
                if (area) parts.push(area);
                if (fallbackData.locality || fallbackData.city) parts.push(fallbackData.locality || fallbackData.city);
                if (fallbackData.principalSubdivision) parts.push(fallbackData.principalSubdivision);
                formattedAddress = parts.join(', ');
              }
              
              const transformedData = {
                results: [{
                  formatted_address: formattedAddress,
                  address_components: {
                    city: fallbackData.city || fallbackData.locality,
                    state: fallbackData.principalSubdivision || fallbackData.administrativeArea,
                    country: fallbackData.countryName,
                    area: area || "" // Use extracted area, not state!
                  },
                  geometry: {
                    location: {
                      lat: latNum,
                      lng: lngNum
                    }
                  }
                }]
              };

              return res.json({
                success: true,
                data: transformedData,
                source: 'fallback'
              });
            } catch (fallbackError) {
              // Even fallback failed, return minimal data
              logger.error('Fallback geocoding also failed', {
                error: fallbackError.message
              });
              
              const minimalData = {
                results: [{
                  formatted_address: `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
                  address_components: {
                    city: 'Current Location',
                    state: '',
                    country: '',
                    area: ''
                  },
                  geometry: {
                    location: {
                      lat: latNum,
                      lng: lngNum
                    }
                  }
                }]
              };

            return res.json({
              success: true,
              data: minimalData,
              source: 'coordinates_only'
            });
          }
        } catch (fallbackOuterError) {
          // Outer fallback error handler
          logger.error('Outer fallback error', {
            error: fallbackOuterError.message
          });
          
          const minimalData = {
            results: [{
              formatted_address: `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
              address_components: {
                city: 'Current Location',
                state: '',
                country: '',
                area: ''
              },
              geometry: {
                location: {
                  lat: latNum,
                  lng: lngNum
                }
              }
            }]
          };

          return res.json({
            success: true,
            data: minimalData,
            source: 'coordinates_only'
          });
        }
      }

      // Only return OLA Maps response if we have one
      if (response && response.data) {
        // Log OLA Maps response for debugging
        logger.info('OLA Maps raw response structure:', {
          hasResults: !!response.data.results,
          hasResult: !!response.data.result,
          keys: Object.keys(response.data)
        });
        
        // OLA Maps API might return data in different structures
        // Process and normalize the response to extract sublocality/area
        let olaData = response.data;
        let processedData = olaData;
        
        // If OLA Maps returns results array, process it
        if (olaData.results && Array.isArray(olaData.results) && olaData.results.length > 0) {
          const firstResult = olaData.results[0];
          
          // Check if it has address_components array (Google Maps style)
          if (firstResult.address_components && Array.isArray(firstResult.address_components)) {
            let area = "";
            let city = "";
            let state = "";
            let country = "";
            let formattedAddress = firstResult.formatted_address || "";
            
            // Extract from address_components array
            firstResult.address_components.forEach(comp => {
              const types = comp.types || [];
              if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
                area = comp.long_name || comp.short_name || "";
              } else if (types.includes('neighborhood') && !area) {
                area = comp.long_name || comp.short_name || "";
              } else if (types.includes('locality')) {
                city = comp.long_name || comp.short_name || "";
              } else if (types.includes('administrative_area_level_1')) {
                state = comp.long_name || comp.short_name || "";
              } else if (types.includes('country')) {
                country = comp.long_name || comp.short_name || "";
              }
            });
            
            // If no sublocality found, try other levels
            if (!area) {
              const sublocality = firstResult.address_components.find(c => {
                const types = c.types || [];
                return types.includes('sublocality_level_2') || 
                       types.includes('sublocality_level_3') ||
                       (types.includes('political') && 
                        !types.includes('administrative_area_level_1') &&
                        !types.includes('locality') &&
                        !types.includes('country'));
              });
              if (sublocality) {
                area = sublocality.long_name || sublocality.short_name || "";
              }
            }
            
            // Reject generic area names
            if (area && (
                area.toLowerCase().includes('district') ||
                area.toLowerCase() === (state || "").toLowerCase() ||
                area.toLowerCase() === (city || "").toLowerCase()
              )) {
              area = "";
            }
            
            // If still no area, try to extract from formatted_address
            // This is CRITICAL for Indian addresses where area is in formatted_address
            if (!area && formattedAddress) {
              const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0);
              logger.info('Extracting area from formatted_address', { parts, city, state });
              
              if (parts.length >= 3) {
                // Format: "New Palasia, Indore, Madhya Pradesh"
                const potentialArea = parts[0];
                const cityPart = parts[1] || city;
                const statePart = parts[2] || state;
                
                if (potentialArea && 
                    potentialArea.toLowerCase() !== (cityPart || "").toLowerCase() &&
                    potentialArea.toLowerCase() !== (statePart || "").toLowerCase() &&
                    !potentialArea.toLowerCase().includes('district') &&
                    !potentialArea.toLowerCase().includes('city') &&
                    potentialArea.length > 2 &&
                    potentialArea.length < 50) {
                  area = potentialArea;
                  logger.info('✅ Extracted area from formatted_address (3+ parts):', area);
                  
                  // Update city and state from formatted_address if available
                  if (cityPart && (!city || cityPart.toLowerCase() !== city.toLowerCase())) {
                    city = cityPart;
                  }
                  if (statePart && (!state || statePart.toLowerCase() !== state.toLowerCase())) {
                    state = statePart;
                  }
                }
              } else if (parts.length === 2 && !area) {
                // Two parts: Could be "Area, City" or "City, State"
                // Try first part as area if it doesn't match city
                const firstPart = parts[0];
                const secondPart = parts[1];
                
                // If we already have city, check if first part is different
                if (city && firstPart.toLowerCase() !== city.toLowerCase() &&
                    firstPart.toLowerCase() !== (state || "").toLowerCase() &&
                    !firstPart.toLowerCase().includes('district') &&
                    !firstPart.toLowerCase().includes('city') &&
                    firstPart.length > 2 && firstPart.length < 50) {
                  area = firstPart;
                  logger.info('✅ Extracted area from formatted_address (2 parts):', area);
                }
              }
            }
            
            // Transform to our expected format
            processedData = {
              results: [{
                formatted_address: formattedAddress,
                address_components: {
                  city: city,
                  state: state,
                  country: country,
                  area: area
                },
                geometry: firstResult.geometry || {
                  location: {
                    lat: latNum,
                    lng: lngNum
                  }
                }
              }]
            };
            
            logger.info('OLA Maps processed response:', {
              area,
              city,
              state,
              formattedAddress
            });
          }
        }
        
        return res.json({
          success: true,
          data: processedData,
          source: 'olamaps'
        });
      }
      
      // If we reach here, all methods failed and fallback should have been used
      // But if fallback also failed, return coordinates-only response
      const minimalData = {
        results: [{
          formatted_address: `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
          address_components: {
            city: 'Current Location',
            state: '',
            country: '',
            area: ''
          },
          geometry: {
            location: {
              lat: latNum,
              lng: lngNum
            }
          }
        }]
      };

      return res.json({
        success: true,
        data: minimalData,
        source: 'coordinates_only'
      });
    } catch (apiError) {
      logger.error('Location service error (all methods failed)', {
        error: apiError.message,
        status: apiError.response?.status,
        data: apiError.response?.data
      });

      // Return error response
      if (apiError.response) {
        return res.status(apiError.response.status).json({
          success: false,
          message: 'Failed to get location details',
          error: apiError.response.data
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Location service unavailable',
        error: apiError.message
      });
    }
  } catch (error) {
    logger.error('Reverse geocode error', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get nearby locations/places using OLA Maps or Google Places API
 * GET /location/nearby?lat=...&lng=...&radius=...
 */
export const getNearbyLocations = async (req, res) => {
  try {
    const { lat, lng, radius = 500, query = '' } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = parseFloat(radius);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude'
      });
    }

    const apiKey = process.env.OLA_MAPS_API_KEY;
    // Get Google Maps API key from database (NO FALLBACK)
    const { getGoogleMapsApiKey } = await import('../../../shared/utils/envService.js');
    const googleApiKey = await getGoogleMapsApiKey();

    let nearbyPlaces = [];

    // Try Google Places API first (better results)
    if (googleApiKey) {
      try {
        const response = await axios.get(
          'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
          {
            params: {
              location: `${latNum},${lngNum}`,
              radius: radiusNum,
              type: 'establishment|point_of_interest',
              key: googleApiKey,
              ...(query && { keyword: query })
            },
            timeout: 5000
          }
        );

        if (response.data && response.data.results) {
          nearbyPlaces = response.data.results.slice(0, 10).map((place, index) => {
            // Calculate distance
            const placeLat = place.geometry.location.lat;
            const placeLng = place.geometry.location.lng;
            const distance = calculateDistance(latNum, lngNum, placeLat, placeLng);

            return {
              id: place.place_id || `place_${index}`,
              name: place.name || '',
              address: place.vicinity || place.formatted_address || '',
              distance: distance < 1000 
                ? `${Math.round(distance)} m` 
                : `${(distance / 1000).toFixed(2)} km`,
              distanceMeters: Math.round(distance),
              latitude: placeLat,
              longitude: placeLng,
              types: place.types || []
            };
          });

          // Sort by distance
          nearbyPlaces.sort((a, b) => a.distanceMeters - b.distanceMeters);

          return res.json({
            success: true,
            data: {
              locations: nearbyPlaces,
              source: 'google_places'
            }
          });
        }
      } catch (googleError) {
        logger.warn('Google Places API failed, trying OLA Maps', {
          error: googleError.message
        });
      }
    }

    // Fallback to OLA Maps (if available) or return empty
    if (apiKey) {
      try {
        // Note: OLA Maps might have different endpoint structure
        // This is a placeholder - adjust based on actual OLA Maps API
        const response = await axios.get(
          'https://api.olamaps.io/places/v1/nearby',
          {
            params: {
              lat: latNum,
              lng: lngNum,
              radius: radiusNum,
              key: apiKey
            },
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            timeout: 5000
          }
        );

        if (response.data && response.data.results) {
          nearbyPlaces = response.data.results.slice(0, 10).map((place, index) => {
            const placeLat = place.geometry?.location?.lat || place.lat;
            const placeLng = place.geometry?.location?.lng || place.lng;
            const distance = calculateDistance(latNum, lngNum, placeLat, placeLng);

            return {
              id: place.place_id || place.id || `place_${index}`,
              name: place.name || '',
              address: place.vicinity || place.formatted_address || place.address || '',
              distance: distance < 1000 
                ? `${Math.round(distance)} m` 
                : `${(distance / 1000).toFixed(2)} km`,
              distanceMeters: Math.round(distance),
              latitude: placeLat,
              longitude: placeLng
            };
          });

          nearbyPlaces.sort((a, b) => a.distanceMeters - b.distanceMeters);

          return res.json({
            success: true,
            data: {
              locations: nearbyPlaces,
              source: 'olamaps'
            }
          });
        }
      } catch (olaError) {
        logger.warn('OLA Maps nearby search failed', {
          error: olaError.message
        });
      }
    }

    // Return empty results if all APIs fail
    return res.json({
      success: true,
      data: {
        locations: [],
        source: 'none'
      }
    });
  } catch (error) {
    logger.error('Get nearby locations error', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}


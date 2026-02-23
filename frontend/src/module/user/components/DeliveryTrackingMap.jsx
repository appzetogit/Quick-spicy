import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import io from 'socket.io-client';
import { API_BASE_URL } from '@/lib/api/config';
import bikeLogo from '@/assets/bikelogo.png';
import { RouteBasedAnimationController } from '@/module/user/utils/routeBasedAnimation';
import { extractPolylineFromDirections, findNearestPointOnPolyline } from '@/module/delivery/utils/liveTrackingPolyline';
import './DeliveryTrackingMap.css';

// Helper function to calculate Haversine distance
function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const DeliveryTrackingMap = ({
  orderId,
  orderTrackingIds = [],
  restaurantCoords,
  customerCoords,
  userLiveCoords = null,
  userLocationAccuracy = null,
  deliveryBoyData = null,
  order = null
}) => {
  const mapRef = useRef(null);
  const bikeMarkerRef = useRef(null);
  const userLocationMarkerRef = useRef(null);
  const userLocationCircleRef = useRef(null);
  const mapInstance = useRef(null);
  const socketRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [deliveryBoyLocation, setDeliveryBoyLocation] = useState(null);
  const routePolylineRef = useRef(null);
  const routePolylinePointsRef = useRef(null); // Store decoded polyline points for route-based animation
  const animationControllerRef = useRef(null); // Route-based animation controller
  const lastRouteUpdateRef = useRef(null);
  const userHasInteractedRef = useRef(false);
  const isProgrammaticChangeRef = useRef(false);
  const mapInitializedRef = useRef(false);
  const directionsCacheRef = useRef(new Map()); // Cache for Directions API calls
  const lastRouteRequestRef = useRef({ start: null, end: null, timestamp: 0 });

  const backendUrl = API_BASE_URL.replace('/api', '');
  const [GOOGLE_MAPS_API_KEY, setGOOGLE_MAPS_API_KEY] = useState("");
  const trackingIds = useMemo(() => {
    const ids = [orderId, ...(Array.isArray(orderTrackingIds) ? orderTrackingIds : [])]
      .map((id) => (id === null || id === undefined ? '' : String(id).trim()))
      .filter(Boolean);
    return [...new Set(ids)];
  }, [orderId, orderTrackingIds]);
  const trackingIdsKey = trackingIds.join('|');

  const requestCurrentLocationForTrackingIds = useCallback(() => {
    if (!socketRef.current || !socketRef.current.connected) return;
    trackingIds.forEach((trackingId) => {
      socketRef.current.emit('request-current-location', trackingId);
    });
  }, [trackingIdsKey]);

  // Fallback source for rider location from order payload (used when socket update is delayed/missed)
  useEffect(() => {
    const lat = order?.deliveryState?.currentLocation?.lat;
    const lng = order?.deliveryState?.currentLocation?.lng;
    const heading = order?.deliveryState?.currentLocation?.bearing ?? 0;

    if (typeof lat === 'number' && typeof lng === 'number') {
      const location = { lat, lng, heading };
      setCurrentLocation(location);
      setDeliveryBoyLocation(location);
    }
  }, [order?.deliveryState?.currentLocation?.lat, order?.deliveryState?.currentLocation?.lng, order?.deliveryState?.currentLocation?.bearing]);

  // Load Google Maps API key from backend
  useEffect(() => {
    import('@/lib/utils/googleMapsApiKey.js').then(({ getGoogleMapsApiKey }) => {
      getGoogleMapsApiKey().then(key => {
        setGOOGLE_MAPS_API_KEY(key)
      })
    })
  }, [])

  // Draw route using Google Maps Directions API with live updates
  // OPTIMIZED: Added caching to reduce API calls
  const drawRoute = useCallback((start, end) => {
    if (!mapInstance.current || !directionsServiceRef.current || !directionsRendererRef.current) return;

    // Validate coordinates before making API call
    if (!start || !end) {
      console.warn('Invalid coordinates: start or end is missing');
      return;
    }

    const startLat = Number(start.lat);
    const startLng = Number(start.lng);
    const endLat = Number(end.lat);
    const endLng = Number(end.lng);

    // Check if coordinates are valid numbers
    if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng)) {
      console.warn('Invalid coordinates: coordinates are not valid numbers', { start, end });
      return;
    }

    // Check if coordinates are within valid range
    if (startLat < -90 || startLat > 90 || endLat < -90 || endLat > 90 ||
      startLng < -180 || startLng > 180 || endLng < -180 || endLng > 180) {
      console.warn('Invalid coordinates: coordinates are out of valid range', { start, end });
      return;
    }

    // Check if start and end are the same (will cause API error)
    if (startLat === endLat && startLng === endLng) {
      console.warn('Invalid route: start and end coordinates are the same');
      return;
    }

    // Round coordinates to 4 decimal places (~11 meters) for cache key
    const roundCoord = (coord) => Math.round(coord * 10000) / 10000;
    const cacheKey = `${roundCoord(startLat)},${roundCoord(startLng)}|${roundCoord(endLat)},${roundCoord(endLng)}`;

    // Check cache first (cache valid for 5 minutes)
    const cached = directionsCacheRef.current.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < 300000) { // 5 minutes cache
      console.log('✅ Using cached route');
      // Use cached result
      if (cached.result && cached.result.routes && cached.result.routes[0]) {
        directionsRendererRef.current.setOptions({ preserveViewport: true });
        directionsRendererRef.current.setDirections(cached.result);

        const polylinePoints = extractPolylineFromDirections(cached.result);
        if (polylinePoints && polylinePoints.length > 0) {
          routePolylinePointsRef.current = polylinePoints;

          if (bikeMarkerRef.current && !animationControllerRef.current) {
            animationControllerRef.current = new RouteBasedAnimationController(
              bikeMarkerRef.current,
              polylinePoints
            );
          }
        }

        if (cached.result.routes && cached.result.routes[0] && cached.result.routes[0].overview_path) {
          if (routePolylineRef.current) {
            routePolylineRef.current.setMap(null);
          }

          routePolylineRef.current = new window.google.maps.Polyline({
            path: cached.result.routes[0].overview_path,
            geodesic: true,
            strokeColor: '#10b981',
            strokeOpacity: 0.8,
            strokeWeight: 4,
            icons: [{
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 1,
                strokeWeight: 2,
                strokeColor: '#10b981',
                scale: 4
              },
              offset: '0%',
              repeat: '15px'
            }],
            map: mapInstance.current,
            zIndex: 1
          });
        }
      }
      return;
    }

    // Throttle: Don't make API call if same route was requested within last 2 seconds
    const lastRequest = lastRouteRequestRef.current;
    if (lastRequest.start && lastRequest.end &&
      Math.abs(lastRequest.start.lat - startLat) < 0.0001 &&
      Math.abs(lastRequest.start.lng - startLng) < 0.0001 &&
      Math.abs(lastRequest.end.lat - endLat) < 0.0001 &&
      Math.abs(lastRequest.end.lng - endLng) < 0.0001 &&
      (now - lastRequest.timestamp) < 2000) {
      console.log('⏭️ Skipping duplicate route request (throttled)');
      return;
    }

    lastRouteRequestRef.current = {
      start: { lat: startLat, lng: startLng },
      end: { lat: endLat, lng: endLng },
      timestamp: now
    };

    try {
      directionsServiceRef.current.route({
        origin: { lat: startLat, lng: startLng },
        destination: { lat: endLat, lng: endLng },
        travelMode: window.google.maps.TravelMode.DRIVING
      }, (result, status) => {
        if (status === 'OK' && result) {
          // Cache the result
          directionsCacheRef.current.set(cacheKey, {
            result: result,
            timestamp: now
          });

          // Clean old cache entries (older than 10 minutes)
          const tenMinutesAgo = now - 600000;
          for (const [key, value] of directionsCacheRef.current.entries()) {
            if (value.timestamp < tenMinutesAgo) {
              directionsCacheRef.current.delete(key);
            }
          }

          // Ensure viewport doesn't change when route is set
          directionsRendererRef.current.setOptions({ preserveViewport: true });
          directionsRendererRef.current.setDirections(result);

          // Extract polyline points for route-based animation (Rapido style)
          const polylinePoints = extractPolylineFromDirections(result);
          if (polylinePoints && polylinePoints.length > 0) {
            routePolylinePointsRef.current = polylinePoints;
            console.log('✅ Extracted', polylinePoints.length, 'polyline points for route-based animation');

            // Initialize animation controller if bike marker exists
            if (bikeMarkerRef.current && !animationControllerRef.current) {
              animationControllerRef.current = new RouteBasedAnimationController(
                bikeMarkerRef.current,
                polylinePoints
              );
              console.log('✅ Route-based animation controller initialized');
            }
          }

          // Create dashed polyline overlay for better visibility
          if (result.routes && result.routes[0] && result.routes[0].overview_path) {
            // Remove existing custom polyline if any
            if (routePolylineRef.current) {
              routePolylineRef.current.setMap(null);
            }

            // Create dashed polyline
            routePolylineRef.current = new window.google.maps.Polyline({
              path: result.routes[0].overview_path,
              geodesic: true,
              strokeColor: '#10b981',
              strokeOpacity: 0.8,
              strokeWeight: 4,
              icons: [{
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeOpacity: 1,
                  strokeWeight: 2,
                  strokeColor: '#10b981',
                  scale: 4
                },
                offset: '0%',
                repeat: '15px'
              }],
              map: mapInstance.current,
              zIndex: 1
            });
          }

        } else {
          // Silently handle errors - don't log UNKNOWN_ERROR as it's often a temporary API issue
          if (status !== 'UNKNOWN_ERROR') {
            console.warn('Directions request failed:', status);
          }
        }
      });
    } catch (error) {
      console.warn('Error calling Directions API:', error);
    }
  }, []);

  // Check if delivery partner is assigned (memoized to avoid dependency issues)
  // MUST be defined BEFORE any useEffect that uses it
  const hasDeliveryPartner = useMemo(() => {
    const deliveryStateStatus = order?.deliveryState?.status;
    const currentPhase = order?.deliveryState?.currentPhase;

    // Check if delivery partner has accepted (key condition)
    const hasAccepted = deliveryStateStatus === 'accepted';
    const hasPartner = !!(order?.deliveryPartnerId ||
      order?.deliveryPartner ||
      order?.assignmentInfo?.deliveryPartnerId ||
      hasAccepted ||
      (deliveryStateStatus && deliveryStateStatus !== 'pending') ||
      (currentPhase && currentPhase !== 'assigned' && currentPhase !== 'pending') ||
      (currentPhase === 'en_route_to_pickup') ||
      (currentPhase === 'at_pickup') ||
      (currentPhase === 'en_route_to_delivery'));

    console.log('🔍 hasDeliveryPartner check:', {
      hasPartner,
      hasAccepted,
      deliveryPartnerId: order?.deliveryPartnerId,
      deliveryPartner: !!order?.deliveryPartner,
      assignmentInfo: order?.assignmentInfo,
      deliveryStateStatus,
      deliveryStatePhase: currentPhase
    });

    return hasPartner;
  }, [order?.deliveryPartnerId, order?.deliveryPartner, order?.assignmentInfo?.deliveryPartnerId, order?.deliveryState?.status, order?.deliveryState?.currentPhase]);

  // Determine which route to show based on order phase
  const getRouteToShow = useCallback(() => {
    if (!order || !deliveryBoyLocation) {
      // No delivery boy location yet, show restaurant to customer
      return { start: restaurantCoords, end: customerCoords };
    }

    const currentPhase = order.deliveryState?.currentPhase || 'assigned';
    const status = order.deliveryState?.status || 'pending';

    // Phase 1: Delivery boy going to restaurant (en_route_to_pickup)
    if (currentPhase === 'en_route_to_pickup' || status === 'accepted') {
      return {
        start: { lat: deliveryBoyLocation.lat, lng: deliveryBoyLocation.lng },
        end: restaurantCoords
      };
    }

    // Phase 2: Pickup completed/confirmed - show route from delivery boy to customer
    if (currentPhase === 'at_pickup' || status === 'reached_pickup' || status === 'order_confirmed') {
      return {
        start: { lat: deliveryBoyLocation.lat, lng: deliveryBoyLocation.lng },
        end: customerCoords
      };
    }

    // Phase 3: Delivery boy going to customer (en_route_to_delivery)
    if (currentPhase === 'en_route_to_delivery' || status === 'en_route_to_delivery' || order.status === 'out_for_delivery') {
      return {
        start: { lat: deliveryBoyLocation.lat, lng: deliveryBoyLocation.lng },
        end: customerCoords
      };
    }

    // Default: Show restaurant to customer
    return { start: restaurantCoords, end: customerCoords };
  }, [order, deliveryBoyLocation, restaurantCoords, customerCoords]);

  // Move bike smoothly with rotation
  const moveBikeSmoothly = useCallback((lat, lng, heading) => {
    if (!mapInstance.current || !isMapLoaded) {
      console.log('⏳ Map not loaded yet, storing location for later:', { lat, lng, heading });
      setCurrentLocation({ lat, lng, heading });
      return;
    }

    try {
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        console.error('❌ Invalid coordinates:', { lat, lng });
        return;
      }

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.error('❌ Coordinates out of range:', { lat, lng });
        return;
      }

      const position = new window.google.maps.LatLng(lat, lng);

      if (!bikeMarkerRef.current) {
        // Create bike marker with the same icon as delivery boy's map
        console.log('🚴🚴🚴 Creating bike marker with logo path:', bikeLogo);
        console.log('🚴 Map instance:', !!mapInstance.current);
        console.log('🚴 Position:', { lat, lng, heading });

        // Create bike icon configuration
        let bikeIcon = {
          url: bikeLogo,
          scaledSize: new window.google.maps.Size(50, 50), // Slightly larger for better visibility
          anchor: new window.google.maps.Point(25, 25),
          rotation: heading || 0
        };

        try {
          // Test if image loads (but don't wait for it - create marker immediately)
          const img = new Image();
          img.onload = () => {
            console.log('✅ Bike logo image loaded successfully:', bikeLogo);
          };
          img.onerror = () => {
            console.error('❌ Bike logo image failed to load:', bikeLogo);
            // If image fails, update marker with fallback icon
            if (bikeMarkerRef.current) {
              bikeMarkerRef.current.setIcon({
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: '#FF6B00',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 3
              });
            }
          };
          img.src = bikeLogo;

          bikeMarkerRef.current = new window.google.maps.Marker({
            position: position,
            map: mapInstance.current,
            icon: bikeIcon,
            optimized: false,
            zIndex: window.google.maps.Marker.MAX_ZINDEX + 3, // Above other markers
            title: 'Delivery Partner',
            visible: true,
            animation: window.google.maps.Animation.DROP // Add drop animation
          });

          // Force marker to be visible
          bikeMarkerRef.current.setVisible(true);

          // Initialize route-based animation controller if polyline is available
          if (routePolylinePointsRef.current && routePolylinePointsRef.current.length > 0) {
            animationControllerRef.current = new RouteBasedAnimationController(
              bikeMarkerRef.current,
              routePolylinePointsRef.current
            );
            console.log('✅ Route-based animation controller initialized with bike marker');
          }

          // Verify marker is on map
          const markerMap = bikeMarkerRef.current.getMap();
          const markerVisible = bikeMarkerRef.current.getVisible();
          const markerPosition = bikeMarkerRef.current.getPosition();

          console.log('✅✅✅ Bike marker created and visible at:', {
            lat,
            lng,
            heading,
            marker: bikeMarkerRef.current,
            isVisible: markerVisible,
            position: markerPosition ? { lat: markerPosition.lat(), lng: markerPosition.lng() } : null,
            map: markerMap,
            iconUrl: bikeLogo,
            mapBounds: markerMap ? markerMap.getBounds() : null,
            hasRouteAnimation: !!animationControllerRef.current
          });

          if (!markerMap) {
            console.error('❌ Bike marker created but not on map! Re-adding...');
            bikeMarkerRef.current.setMap(mapInstance.current);
          }
          if (!markerVisible) {
            console.error('❌ Bike marker created but not visible! Making visible...');
            bikeMarkerRef.current.setVisible(true);
          }

          // Double check after a moment
          setTimeout(() => {
            if (bikeMarkerRef.current) {
              const finalMap = bikeMarkerRef.current.getMap();
              const finalVisible = bikeMarkerRef.current.getVisible();
              console.log('🔍 Bike marker verification after 500ms:', {
                exists: !!bikeMarkerRef.current,
                onMap: !!finalMap,
                visible: finalVisible,
                position: bikeMarkerRef.current.getPosition()
              });
            }
          }, 500);
        } catch (markerError) {
          console.error('❌ Error creating bike marker:', markerError);
          // Try fallback simple marker
          try {
            bikeMarkerRef.current = new window.google.maps.Marker({
              position: position,
              map: mapInstance.current,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: '#FF6B00',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 3
              },
              title: 'Delivery Partner',
              visible: true,
              zIndex: window.google.maps.Marker.MAX_ZINDEX + 3
            });
            console.log('✅ Created fallback marker (orange circle)');
          } catch (fallbackError) {
            console.error('❌ Even fallback marker failed:', fallbackError);
          }
        }
      } else {
        // RAPIDO/ZOMATO-STYLE: Bike MUST stay on route polyline, NEVER use raw GPS
        if (routePolylinePointsRef.current && routePolylinePointsRef.current.length > 0) {
          // Find nearest point on polyline (ensures marker stays on road)
          // Note: findNearestPointOnPolyline takes (polyline, riderPosition)
          const nearest = findNearestPointOnPolyline(routePolylinePointsRef.current, { lat, lng });

          if (nearest && nearest.nearestPoint) {
            // Calculate progress on route (0 to 1) based on distance traveled
            const totalPoints = routePolylinePointsRef.current.length;

            // Calculate cumulative distance to nearest point for accurate progress
            let distanceToNearest = 0;
            for (let i = 0; i < nearest.segmentIndex; i++) {
              const p1 = routePolylinePointsRef.current[i];
              const p2 = routePolylinePointsRef.current[i + 1];
              distanceToNearest += calculateHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
            }

            // Add distance within current segment
            const segmentStart = routePolylinePointsRef.current[nearest.segmentIndex];
            const segmentEnd = routePolylinePointsRef.current[nearest.segmentIndex + 1] || segmentStart;
            const segmentDistance = calculateHaversineDistance(segmentStart.lat, segmentStart.lng, segmentEnd.lat, segmentEnd.lng);
            const segmentProgress = calculateHaversineDistance(segmentStart.lat, segmentStart.lng, nearest.nearestPoint.lat, nearest.nearestPoint.lng) / (segmentDistance || 1);
            distanceToNearest += segmentDistance * segmentProgress;

            // Calculate total route distance
            let totalDistance = 0;
            for (let i = 0; i < routePolylinePointsRef.current.length - 1; i++) {
              const p1 = routePolylinePointsRef.current[i];
              const p2 = routePolylinePointsRef.current[i + 1];
              totalDistance += calculateHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
            }

            // Calculate progress (0 to 1)
            let progress = totalDistance > 0 ? Math.min(1, Math.max(0, distanceToNearest / totalDistance)) : 0;

            // Ensure progress doesn't go backwards (only forward movement) - Rapido/Zomato style
            if (animationControllerRef.current && animationControllerRef.current.lastProgress !== undefined) {
              const lastProgress = animationControllerRef.current.lastProgress;
              // Allow small backward movement (GPS noise) but prevent large jumps
              if (progress < lastProgress - 0.05) {
                progress = lastProgress; // Don't go backwards more than 5%
                console.log('🛑 Preventing backward movement:', { new: progress, last: lastProgress });
              } else if (progress < lastProgress) {
                // Small backward movement - keep last progress
                progress = lastProgress;
              }
            }

            // Use route-based animation controller if available
            if (animationControllerRef.current) {
              console.log('🛵 Route-based animation (Rapido/Zomato style):', {
                progress,
                segmentIndex: nearest.segmentIndex,
                onRoute: true,
                snappedToRoad: true
              });
              animationControllerRef.current.updatePosition(progress, heading || 0);
              animationControllerRef.current.lastProgress = progress;
            } else {
              // Initialize animation controller if not exists
              if (bikeMarkerRef.current) {
                animationControllerRef.current = new RouteBasedAnimationController(
                  bikeMarkerRef.current,
                  routePolylinePointsRef.current
                );
                animationControllerRef.current.updatePosition(progress, heading || 0);
                animationControllerRef.current.lastProgress = progress;
                console.log('✅ Initialized route-based animation controller');
              } else {
                // Fallback: Move to nearest point on polyline (STAY ON ROAD)
                const nearestPosition = new window.google.maps.LatLng(nearest.nearestPoint.lat, nearest.nearestPoint.lng);
                bikeMarkerRef.current.setPosition(nearestPosition);
                bikeMarkerRef.current.setRotation(heading || 0);
                console.log('🛣️ Bike snapped to nearest road point:', nearest.nearestPoint);
              }
            }
          } else {
            // If nearest point not found, use first point of polyline (don't use raw GPS)
            console.warn('⚠️ Could not find nearest point, using polyline start point');
            const firstPoint = routePolylinePointsRef.current[0];
            if (firstPoint && bikeMarkerRef.current) {
              const firstPosition = new window.google.maps.LatLng(firstPoint.lat, firstPoint.lng);
              bikeMarkerRef.current.setPosition(firstPosition);
            }
          }
        } else {
          // CRITICAL: If no polyline, DO NOT show bike at raw GPS location
          // Wait for route to be generated first
          console.warn('⚠️⚠️⚠️ NO POLYLINE AVAILABLE - Bike marker NOT updated to prevent off-road display');
          console.warn('⚠️ Waiting for route to be generated before showing bike position');
          // Don't update marker position - keep it at last known position on route
          // This prevents bike from jumping to buildings/footpaths
          return; // Exit early - don't update marker
        }

        // Ensure bike is visible
        bikeMarkerRef.current.setVisible(true);

        // Verify bike is on map
        if (!bikeMarkerRef.current.getMap()) {
          console.log('⚠️ Bike marker not on map, re-adding...');
          bikeMarkerRef.current.setMap(mapInstance.current);
        }

        // DO NOT auto-pan map - keep it stable
        // Map should remain at user's chosen view
      }
    } catch (error) {
      console.error('❌ Error moving bike:', error);
    }
  }, [isMapLoaded, bikeLogo]);

  // Initialize Socket.io connection
  useEffect(() => {
    if (!trackingIds.length) return;

    socketRef.current = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionAttempts: 5,
      timeout: 5000
    });

    const handleRealtimeLocation = (data) => {
      if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
        const location = { lat: data.lat, lng: data.lng, heading: data.heading || data.bearing || 0 };
        setCurrentLocation(location);
        setDeliveryBoyLocation(location);

        if (isMapLoaded && mapInstance.current) {
          if (data.progress !== undefined && animationControllerRef.current && routePolylinePointsRef.current) {
            animationControllerRef.current.updatePosition(data.progress, data.bearing || data.heading || 0);
          } else {
            moveBikeSmoothly(data.lat, data.lng, data.heading || data.bearing || 0);
          }
        }
      }
    };

    const handleCurrentLocation = (data) => {
      if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
        const location = { lat: data.lat, lng: data.lng, heading: data.heading || data.bearing || 0 };
        setCurrentLocation(location);
        setDeliveryBoyLocation(location);

        if (isMapLoaded && mapInstance.current) {
          if (data.progress !== undefined && animationControllerRef.current && routePolylinePointsRef.current) {
            animationControllerRef.current.updatePosition(data.progress, data.bearing || data.heading || 0);
          } else {
            moveBikeSmoothly(data.lat, data.lng, data.heading || data.bearing || 0);
          }
        }
      }
    };

    const handleRouteInitialized = (data) => {
      if (data.points && Array.isArray(data.points) && data.points.length > 0) {
        routePolylinePointsRef.current = data.points;
        if (bikeMarkerRef.current && !animationControllerRef.current) {
          animationControllerRef.current = new RouteBasedAnimationController(
            bikeMarkerRef.current,
            data.points
          );
        } else if (animationControllerRef.current) {
          animationControllerRef.current.updatePolyline(data.points);
        }
      }
    };

    socketRef.current.on('connect', () => {
      trackingIds.forEach((trackingId) => {
        socketRef.current.emit('join-order-tracking', trackingId);
      });
      requestCurrentLocationForTrackingIds();

      const locationRequestInterval = setInterval(() => {
        requestCurrentLocationForTrackingIds();
      }, 5000);

      socketRef.current._locationRequestInterval = locationRequestInterval;
    });

    trackingIds.forEach((trackingId) => {
      socketRef.current.on(`location-receive-${trackingId}`, handleRealtimeLocation);
      socketRef.current.on(`current-location-${trackingId}`, handleCurrentLocation);
      socketRef.current.on(`route-initialized-${trackingId}`, handleRouteInitialized);
    });

    socketRef.current.on('order_status_update', (data) => {
      if (window.dispatchEvent && data.message) {
        window.dispatchEvent(new CustomEvent('orderStatusNotification', {
          detail: data
        }));
      }
    });

    const handlePageHide = () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      if (socketRef.current) {
        if (socketRef.current._locationRequestInterval) {
          clearInterval(socketRef.current._locationRequestInterval);
        }
        trackingIds.forEach((trackingId) => {
          socketRef.current.off(`location-receive-${trackingId}`, handleRealtimeLocation);
          socketRef.current.off(`current-location-${trackingId}`, handleCurrentLocation);
          socketRef.current.off(`route-initialized-${trackingId}`, handleRouteInitialized);
        });
        socketRef.current.off('order_status_update');
        socketRef.current.disconnect();
      }
    };
  }, [backendUrl, moveBikeSmoothly, trackingIdsKey, requestCurrentLocationForTrackingIds]);
  // Initialize Google Map (only once - prevent re-initialization)
  useEffect(() => {
    if (!mapRef.current || !restaurantCoords || !customerCoords || mapInitializedRef.current) return;

    const loadGoogleMapsIfNeeded = async () => {
      // Wait for Google Maps to load from main.jsx first
      if (!window.google || !window.google.maps) {
        console.log('⏳ Waiting for Google Maps API to load...');
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait

        while (!window.google && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        // If still not loaded, try loading it ourselves
        if (!window.google || !window.google.maps) {
          console.log('⏳ Google Maps not loaded from main.jsx, loading manually...');
          try {
            const { getGoogleMapsApiKey } = await import('@/lib/utils/googleMapsApiKey.js');
            const { Loader } = await import('@googlemaps/js-api-loader');
            const apiKey = await getGoogleMapsApiKey();
            if (apiKey) {
              const loader = new Loader({
                apiKey: apiKey,
                version: "weekly",
                libraries: ["places", "geometry", "drawing"]
              });
              await loader.load();
              console.log('✅ Google Maps loaded manually');
            } else {
              console.error('❌ No Google Maps API key found');
              return;
            }
          } catch (error) {
            console.error('❌ Error loading Google Maps:', error);
            return;
          }
        }
      }

      // Initialize map once Google Maps is loaded
      if (window.google && window.google.maps) {
        // Wait for MapTypeId to be available (sometimes it loads slightly after maps)
        let mapTypeIdAttempts = 0;
        const checkMapTypeId = () => {
          if (window.google?.maps?.MapTypeId) {
            initializeMap();
          } else if (mapTypeIdAttempts < 20) {
            mapTypeIdAttempts++;
            setTimeout(checkMapTypeId, 100);
          } else {
            console.warn('⚠️ Google Maps MapTypeId not available, using string fallback');
            // Use fallback - initialize with string instead of enum
            initializeMap();
          }
        };
        checkMapTypeId();
      } else {
        console.error('❌ Google Maps API still not available');
      }
    };

    loadGoogleMapsIfNeeded();

    function initializeMap() {
      try {
        // Verify Google Maps is fully loaded
        if (!window.google || !window.google.maps || !window.google.maps.Map) {
          console.error('❌ Google Maps API not fully loaded');
          return;
        }

        // Calculate center point
        const centerLng = (restaurantCoords.lng + customerCoords.lng) / 2;
        const centerLat = (restaurantCoords.lat + customerCoords.lat) / 2;

        // Get MapTypeId safely
        const mapTypeId = window.google.maps.MapTypeId?.ROADMAP || 'roadmap';

        // Initialize map - center between user and restaurant, stable view
        mapInstance.current = new window.google.maps.Map(mapRef.current, {
          center: { lat: centerLat, lng: centerLng },
          zoom: 15,
          mapTypeId: mapTypeId,
          tilt: 0, // Flat 2D view for stability
          heading: 0,
          mapTypeControl: false, // Hide Map/Satellite selector
          fullscreenControl: false, // Hide fullscreen button
          streetViewControl: false, // Hide street view control
          zoomControl: false, // Hide zoom controls
          disableDefaultUI: true, // Hide all default UI controls
          gestureHandling: 'greedy', // Allow hand gestures for zoom and pan
          // Prevent automatic viewport changes
          restriction: null,
          // Keep map stable - no auto-fit bounds
          noClear: false,
          // Hide all default labels, POIs, and location markers
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi',
              elementType: 'geometry',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.business',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.attraction',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.place_of_worship',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.school',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.sports_complex',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'transit',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'transit.station',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative.locality',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative.neighborhood',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative.land_parcel',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'road',
              elementType: 'labels.text',
              stylers: [{ visibility: 'on' }] // Keep road numbers visible
            },
            {
              featureType: 'road',
              elementType: 'labels.icon',
              stylers: [{ visibility: 'on' }] // Keep road icons visible
            }
          ]
        });

        // Track user interaction to prevent automatic zoom/pan interference
        mapInstance.current.addListener('dragstart', () => {
          userHasInteractedRef.current = true;
        });

        mapInstance.current.addListener('zoom_changed', () => {
          if (!isProgrammaticChangeRef.current) {
            userHasInteractedRef.current = true;
          }
        });

        // Initialize Directions Service and Renderer
        directionsServiceRef.current = new window.google.maps.DirectionsService();
        directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
          map: mapInstance.current,
          suppressMarkers: true, // We'll add custom markers
          preserveViewport: true, // CRITICAL: Don't auto-adjust viewport when route is set - keep map stable
          polylineOptions: {
            strokeColor: '#10b981',
            strokeWeight: 0, // Hide default polyline, we'll use custom dashed one
            strokeOpacity: 0
          }
        });

        // Ensure viewport never changes automatically - map stays stable
        directionsRendererRef.current.setOptions({ preserveViewport: true });

        // Add restaurant marker with home icon (only once)
        if (!mapInstance.current._restaurantMarker) {
          const restaurantHomeIconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
              <!-- Pin shape -->
              <path d="M20 0 C9 0 0 9 0 20 C0 35 20 50 20 50 C20 50 40 35 40 20 C40 9 31 0 20 0 Z" fill="#22c55e" stroke="#ffffff" stroke-width="2"/>
              <!-- Home icon -->
              <path d="M20 12 L12 18 L12 28 L16 28 L16 24 L24 24 L24 28 L28 28 L28 18 Z" fill="white" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16 24 L16 20 L20 17 L24 20 L24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `);

          mapInstance.current._restaurantMarker = new window.google.maps.Marker({
            position: { lat: restaurantCoords.lat, lng: restaurantCoords.lng },
            map: mapInstance.current,
            icon: {
              url: restaurantHomeIconUrl,
              scaledSize: new window.google.maps.Size(40, 50),
              anchor: new window.google.maps.Point(20, 50),
              origin: new window.google.maps.Point(0, 0)
            },
            zIndex: window.google.maps.Marker.MAX_ZINDEX + 1
          });
        }

        // Add customer marker with click/cursor icon (only once)
        if (!mapInstance.current._customerMarker) {
          const customerClickIconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
              <!-- Pin shape -->
              <path d="M20 0 C9 0 0 9 0 20 C0 35 20 50 20 50 C20 50 40 35 40 20 C40 9 31 0 20 0 Z" fill="#4285F4" stroke="#ffffff" stroke-width="2"/>
              <!-- Cursor/Click icon (pointer) -->
              <path d="M14 8 L14 18 L18 18 L22 22 L22 10 L18 6 Z" fill="white" stroke="white" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M18 18 L18 14 L22 10" fill="none" stroke="white" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `);

          mapInstance.current._customerMarker = new window.google.maps.Marker({
            position: { lat: customerCoords.lat, lng: customerCoords.lng },
            map: mapInstance.current,
            icon: {
              url: customerClickIconUrl,
              scaledSize: new window.google.maps.Size(40, 50),
              anchor: new window.google.maps.Point(20, 50),
              origin: new window.google.maps.Point(0, 0)
            },
            zIndex: window.google.maps.Marker.MAX_ZINDEX + 1
          });
        }

        // Add user's live location marker (blue dot) and radius circle if available
        if (userLiveCoords && userLiveCoords.lat && userLiveCoords.lng) {
          // Create blue dot marker for user's live location
          userLocationMarkerRef.current = new window.google.maps.Marker({
            position: { lat: userLiveCoords.lat, lng: userLiveCoords.lng },
            map: mapInstance.current,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: '#4285F4', // Google blue
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 3
            },
            zIndex: window.google.maps.Marker.MAX_ZINDEX + 2,
            optimized: false,
            title: "Your live location"
          });

          // Create radius circle around user's location
          const radiusMeters = Math.max(userLocationAccuracy || 50, 20); // Minimum 20m
          userLocationCircleRef.current = new window.google.maps.Circle({
            strokeColor: '#4285F4',
            strokeOpacity: 0.4,
            strokeWeight: 2,
            fillColor: '#4285F4',
            fillOpacity: 0.15, // Light transparent blue
            map: mapInstance.current,
            center: { lat: userLiveCoords.lat, lng: userLiveCoords.lng },
            radius: radiusMeters, // Meters
            zIndex: window.google.maps.Marker.MAX_ZINDEX + 1
          });

          console.log('✅ User live location marker and radius circle added:', {
            position: userLiveCoords,
            radius: radiusMeters
          });
        }

        // Draw route based on order phase
        mapInstance.current.addListener('tilesloaded', () => {
          setIsMapLoaded(true);

          // Hide Google Maps footer elements (Keyboard shortcuts, Map data, Terms)
          const hideGoogleFooter = () => {
            const footerElements = mapRef.current?.querySelectorAll?.('.gm-style-cc, a[href*="keyboard"], a[href*="terms"]');
            footerElements?.forEach(el => {
              if (el instanceof HTMLElement) {
                el.style.display = 'none';
              }
            });
          };

          // Hide immediately and also set interval to catch dynamically added elements
          hideGoogleFooter();
          const footerHideInterval = setInterval(() => {
            hideGoogleFooter();
          }, 500);

          // Clear interval after 5 seconds
          setTimeout(() => clearInterval(footerHideInterval), 5000);

          // Check if delivery partner is assigned and show bike immediately
          const currentPhase = order?.deliveryState?.currentPhase;
          const deliveryStateStatus = order?.deliveryState?.status;
          const hasDeliveryPartnerOnLoad = currentPhase === 'en_route_to_pickup' ||
            currentPhase === 'at_pickup' ||
            currentPhase === 'en_route_to_delivery' ||
            deliveryStateStatus === 'accepted' ||
            (deliveryStateStatus && deliveryStateStatus !== 'pending');

          console.log('🚴 Map tiles loaded - Checking for delivery partner:', {
            currentPhase,
            deliveryStateStatus,
            hasDeliveryPartnerOnLoad,
            hasBikeMarker: !!bikeMarkerRef.current
          });

          // DO NOT create bike at restaurant on map load
          // Wait for real location from socket - bike will be created when real location is received
          if (hasDeliveryPartnerOnLoad && !bikeMarkerRef.current) {
            console.log('🚴 Map loaded - Delivery partner detected, waiting for REAL location from socket...');
            // Request current location immediately
            if (socketRef.current && socketRef.current.connected) {
              requestCurrentLocationForTrackingIds();
              console.log('📡 Requested current location immediately on map load');
            }
            // Don't create bike at restaurant - wait for real location
          }

          // DO NOT draw default route - only draw when delivery partner is assigned
          // Route will be drawn when delivery partner accepts or when location updates arrive
        });

        console.log('✅ Google Map initialized successfully');
        mapInitializedRef.current = true; // Mark map as initialized
      } catch (error) {
        console.error('❌ Map initialization error:', error);
      }
    }
  }, [restaurantCoords, customerCoords]); // Removed dependencies that cause re-initialization

  // Memoize restaurant and customer coordinates to avoid dependency issues
  const restaurantLat = restaurantCoords?.lat;
  const restaurantLng = restaurantCoords?.lng;
  const deliveryBoyLat = deliveryBoyLocation?.lat;
  const deliveryBoyLng = deliveryBoyLocation?.lng;
  const deliveryBoyHeading = deliveryBoyLocation?.heading;

  // Update route when delivery boy location or order phase changes
  useEffect(() => {
    if (!isMapLoaded) return;

    // Check if delivery partner is assigned based on phase
    const currentPhase = order?.deliveryState?.currentPhase;
    const hasDeliveryPartnerByPhase = currentPhase === 'en_route_to_pickup' ||
      currentPhase === 'at_pickup' ||
      currentPhase === 'en_route_to_delivery';

    // If delivery partner is assigned but bike marker doesn't exist, create it
    if (hasDeliveryPartnerByPhase && !bikeMarkerRef.current && mapInstance.current) {
      console.log('🚴 Delivery partner detected by phase, creating bike marker:', currentPhase);
      // DO NOT show bike at restaurant - wait for real location from socket
      // Bike will be created when real location is received via socket
      console.log('⏳ Waiting for real location from socket - NOT showing at restaurant');
      if (socketRef.current && socketRef.current.connected) {
        requestCurrentLocationForTrackingIds();
      }
    }

    // Throttle route updates to avoid too many API calls
    const now = Date.now();
    if (lastRouteUpdateRef.current && (now - lastRouteUpdateRef.current) < 10000) {
      return; // Skip if updated less than 10 seconds ago
    }

    // Only draw route if delivery partner is assigned
    const routePhase = order?.deliveryState?.currentPhase;
    const routeStatus = order?.deliveryState?.status;
    const hasDeliveryPartnerForRoute = routeStatus === 'accepted' ||
      routePhase === 'en_route_to_pickup' ||
      routePhase === 'at_pickup' ||
      routePhase === 'en_route_to_delivery' ||
      (routeStatus && routeStatus !== 'pending');

    // Only draw route if delivery partner is assigned
    if (!hasDeliveryPartnerForRoute) {
      // Clear any existing route if delivery partner is not assigned
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setDirections({ routes: [] });
      }
      return;
    }

    const route = getRouteToShow();
    if (route.start && route.end) {
      lastRouteUpdateRef.current = now;
      drawRoute(route.start, route.end);
      console.log('🔄 Route updated:', {
        phase: order?.deliveryState?.currentPhase,
        status: order?.deliveryState?.status,
        from: route.start,
        to: route.end,
        hasBikeMarker: !!bikeMarkerRef.current
      });

      // Force show bike if delivery partner is assigned but bike marker doesn't exist
      if (hasDeliveryPartnerByPhase && !bikeMarkerRef.current && mapInstance.current) {
        console.log('🚴🚴🚴 FORCING bike marker creation after route update!', {
          phase: currentPhase,
          routeStart: route.start,
          routeEnd: route.end,
          restaurantCoords
        });

        // ONLY use real delivery boy location - NEVER use restaurant
        // Priority 1: Use delivery boy's REAL location from socket/state
        if (deliveryBoyLat && deliveryBoyLng) {
          console.log('✅✅✅ Creating bike at REAL delivery boy location:', { lat: deliveryBoyLat, lng: deliveryBoyLng });
          moveBikeSmoothly(deliveryBoyLat, deliveryBoyLng, deliveryBoyHeading || 0);
        }
        // Priority 2: Use route start ONLY if it's the delivery boy's location (not restaurant)
        else if (route.start && route.start.lat && route.start.lng) {
          // Only use route.start if we don't have delivery boy location
          // But request real location from socket first
          console.log('⏳ Using route start, but requesting real location from socket...');
          if (socketRef.current && socketRef.current.connected) {
            requestCurrentLocationForTrackingIds();
          }
          console.log('🚴 Creating bike at route start (temporary):', route.start);
          moveBikeSmoothly(route.start.lat, route.start.lng, 0);
        }
        // DO NOT use restaurant or customer location - wait for real location
        else {
          console.log('⏳⏳⏳ No real location yet - requesting from socket and waiting...');
          if (socketRef.current && socketRef.current.connected) {
            requestCurrentLocationForTrackingIds();
          }
          console.log('✅ Bike will be created when real location is received from socket');
        }
      }
    }
  }, [isMapLoaded, deliveryBoyLat, deliveryBoyLng, order?.deliveryState?.currentPhase, order?.deliveryState?.status, restaurantLat, restaurantLng, customerCoords?.lat, customerCoords?.lng, moveBikeSmoothly, getRouteToShow, drawRoute, hasDeliveryPartner]);

  // Update bike when REAL location changes (from socket)
  useEffect(() => {
    if (isMapLoaded && currentLocation && currentLocation.lat && currentLocation.lng) {
      console.log('🔄🔄🔄 Updating bike to REAL location:', currentLocation);
      // Always update to real location - this takes priority over restaurant location
      moveBikeSmoothly(currentLocation.lat, currentLocation.lng, currentLocation.heading || 0);
    }
  }, [isMapLoaded, currentLocation?.lat, currentLocation?.lng, currentLocation?.heading, moveBikeSmoothly]);

  // Create bike marker when map loads if we have stored location
  useEffect(() => {
    if (isMapLoaded && mapInstance.current && currentLocation && !bikeMarkerRef.current) {
      console.log('🚴 Creating bike marker from stored location on map load:', currentLocation);
      moveBikeSmoothly(currentLocation.lat, currentLocation.lng, currentLocation.heading || 0);
    }
  }, [isMapLoaded, currentLocation, moveBikeSmoothly]);

  // Show bike marker when delivery partner is assigned (even without location yet)
  useEffect(() => {
    if (!isMapLoaded || !mapInstance.current) {
      console.log('⏳ Map not loaded yet, waiting...');
      return;
    }

    // Also check phase directly as fallback
    const currentPhase = order?.deliveryState?.currentPhase;
    const deliveryStateStatus = order?.deliveryState?.status;

    // Key check: If status is 'accepted', definitely show bike
    const isAccepted = deliveryStateStatus === 'accepted';
    const hasPartnerByPhase = isAccepted ||
      currentPhase === 'en_route_to_pickup' ||
      currentPhase === 'at_pickup' ||
      currentPhase === 'en_route_to_delivery' ||
      deliveryStateStatus === 'reached_pickup' ||
      deliveryStateStatus === 'order_confirmed' ||
      deliveryStateStatus === 'en_route_to_delivery';

    const shouldShowBike = hasDeliveryPartner || hasPartnerByPhase;

    console.log('🚴🚴🚴 BIKE VISIBILITY CHECK:', {
      shouldShowBike,
      isAccepted,
      hasDeliveryPartner,
      hasPartnerByPhase,
      deliveryStateStatus,
      currentPhase,
      hasBikeMarker: !!bikeMarkerRef.current
    });

    console.log('🔍 Checking delivery partner assignment:', {
      hasDeliveryPartner,
      hasPartnerByPhase,
      shouldShowBike,
      currentPhase,
      deliveryStateStatus,
      deliveryPartnerId: order?.deliveryPartnerId,
      deliveryPartner: order?.deliveryPartner,
      assignmentInfo: order?.assignmentInfo,
      deliveryState: order?.deliveryState,
      hasBikeMarker: !!bikeMarkerRef.current,
      deliveryBoyLocation: { lat: deliveryBoyLat, lng: deliveryBoyLng, heading: deliveryBoyHeading },
      restaurantCoords: { lat: restaurantLat, lng: restaurantLng },
      mapInstance: !!mapInstance.current,
      isMapLoaded
    });

    if (shouldShowBike && !bikeMarkerRef.current) {
      console.log('🚴🚴🚴 CREATING BIKE MARKER - Delivery partner accepted!');
      console.log('🚴 Full order state:', JSON.stringify(order?.deliveryState, null, 2));

      // Priority 1: ALWAYS use delivery boy's REAL location if available (from socket)
      if (deliveryBoyLat && deliveryBoyLng) {
        console.log('✅✅✅ Creating bike at REAL delivery boy location:', { lat: deliveryBoyLat, lng: deliveryBoyLng, heading: deliveryBoyHeading });
        moveBikeSmoothly(deliveryBoyLat, deliveryBoyLng, deliveryBoyHeading || 0);
      }
      // Priority 2: DO NOT show at restaurant - ONLY wait for real location from socket
      // Bike should ONLY show at real delivery boy location, NEVER at restaurant
      else if (restaurantLat && restaurantLng) {
        console.log('⏳⏳⏳ WAITING for REAL location from socket - NOT showing at restaurant');
        console.log('📡 Requesting current location from backend immediately...');
        // Request location immediately
        if (socketRef.current && socketRef.current.connected) {
          requestCurrentLocationForTrackingIds();
        }
        // DO NOT show at restaurant - only wait for real location
        // Real location will come via socket and bike will be created then
        console.log('✅ Bike will be created when real location is received from socket');
      }
      // Priority 3: Use customer location as last resort
      else if (customerCoords && customerCoords.lat && customerCoords.lng) {
        console.log('📍 Creating bike at customer location (fallback):', customerCoords);
        moveBikeSmoothly(customerCoords.lat, customerCoords.lng, 0);
      } else {
        console.error('❌ Cannot create bike marker - no coordinates available!', {
          restaurantCoords,
          customerCoords,
          deliveryBoyLocation
        });
      }

      // Verify marker was created after a short delay
      setTimeout(() => {
        if (bikeMarkerRef.current) {
          const marker = bikeMarkerRef.current;
          const markerPosition = marker.getPosition();
          const markerVisible = marker.getVisible();
          const markerMap = marker.getMap();

          console.log('✅✅✅ BIKE MARKER VERIFICATION:', {
            exists: true,
            visible: markerVisible,
            onMap: !!markerMap,
            position: markerPosition ? {
              lat: markerPosition.lat(),
              lng: markerPosition.lng()
            } : null,
            iconUrl: bikeLogo
          });

          // Force visibility if needed
          if (!markerVisible) {
            console.warn('⚠️ Bike marker not visible, forcing visibility...');
            marker.setVisible(true);
          }
          if (!markerMap) {
            console.warn('⚠️ Bike marker not on map, re-adding...');
            marker.setMap(mapInstance.current);
          }
        } else {
          console.warn('⚠️ Bike marker not created yet - waiting for real delivery boy location from socket');
          // Don't create fallback at restaurant - wait for real location
          // Real location will come via socket and bike will be created in moveBikeSmoothly
          if (socketRef.current && socketRef.current.connected) {
            requestCurrentLocationForTrackingIds();
            console.log('📡 Requested current location from socket for bike marker');
          }
        }
      }, 500);
    } else if (shouldShowBike && bikeMarkerRef.current) {
      // Bike marker exists, just update position if needed
      if (deliveryBoyLat && deliveryBoyLng) {
        moveBikeSmoothly(deliveryBoyLat, deliveryBoyLng, deliveryBoyHeading || 0);
      }
    } else {
      // Remove bike marker if delivery partner is not assigned
      if (bikeMarkerRef.current) {
        console.log('🗑️ Removing bike marker - no delivery partner');
        bikeMarkerRef.current.setMap(null);
        bikeMarkerRef.current = null;
      }
    }
  }, [isMapLoaded, hasDeliveryPartner, deliveryBoyLat, deliveryBoyLng, deliveryBoyHeading, restaurantLat, restaurantLng, moveBikeSmoothly, order]);

  // Update user's live location marker and circle when location changes
  useEffect(() => {
    if (isMapLoaded && userLiveCoords && userLiveCoords.lat && userLiveCoords.lng && mapInstance.current) {
      const userPos = { lat: userLiveCoords.lat, lng: userLiveCoords.lng };
      const radiusMeters = Math.max(userLocationAccuracy || 50, 20);

      // Update or create user location marker
      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.setPosition(userPos);
      } else {
        userLocationMarkerRef.current = new window.google.maps.Marker({
          position: userPos,
          map: mapInstance.current,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: '#4285F4',
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 3
          },
          zIndex: window.google.maps.Marker.MAX_ZINDEX + 2,
          optimized: false,
          title: "Your live location"
        });
      }

      // Update or create radius circle
      if (userLocationCircleRef.current) {
        userLocationCircleRef.current.setCenter(userPos);
        userLocationCircleRef.current.setRadius(radiusMeters);
      } else {
        userLocationCircleRef.current = new window.google.maps.Circle({
          strokeColor: '#4285F4',
          strokeOpacity: 0.4,
          strokeWeight: 2,
          fillColor: '#4285F4',
          fillOpacity: 0.15,
          map: mapInstance.current,
          center: userPos,
          radius: radiusMeters,
          zIndex: window.google.maps.Marker.MAX_ZINDEX + 1
        });
      }
    }
  }, [isMapLoaded, userLiveCoords, userLocationAccuracy]);

  // Periodic check to ensure bike marker is created if it should be visible
  // DISABLED - prevents duplicate marker creation
  // useEffect(() => {
  //   if (!isMapLoaded || !mapInstance.current) return;
  //   
  //   const checkInterval = setInterval(() => {
  //     const currentPhase = order?.deliveryState?.currentPhase;
  //     const deliveryStateStatus = order?.deliveryState?.status;
  //     const shouldHaveBike = deliveryStateStatus === 'accepted' ||
  //                            currentPhase === 'en_route_to_pickup' ||
  //                            currentPhase === 'at_pickup' ||
  //                            currentPhase === 'en_route_to_delivery' ||
  //                            (deliveryStateStatus && deliveryStateStatus !== 'pending');
  //     
  //     if (shouldHaveBike && !bikeMarkerRef.current && restaurantCoords && restaurantCoords.lat && restaurantCoords.lng) {
  //       console.log('🔄 Periodic check: Bike should be visible but missing, creating now...');
  //       try {
  //         const position = new window.google.maps.LatLng(restaurantCoords.lat, restaurantCoords.lng);
  //         bikeMarkerRef.current = new window.google.maps.Marker({
  //           position: position,
  //           map: mapInstance.current,
  //           icon: {
  //             url: bikeLogo,
  //             scaledSize: new window.google.maps.Size(50, 50),
  //             anchor: new window.google.maps.Point(25, 25),
  //             rotation: 0
  //           },
  //           optimized: false,
  //           zIndex: window.google.maps.Marker.MAX_ZINDEX + 3,
  //           title: 'Delivery Partner',
  //           visible: true
  //         });
  //         console.log('✅✅✅ BIKE MARKER CREATED via periodic check!');
  //       } catch (err) {
  //         console.error('❌ Periodic bike creation failed:', err);
  //       }
  //     }
  //   }, 2000); // Check every 2 seconds
  //   
  //   return () => clearInterval(checkInterval);
  // }, [isMapLoaded, order?.deliveryState?.currentPhase, order?.deliveryState?.status, restaurantCoords, bikeLogo]);

  // Cleanup animation controller on unmount
  useEffect(() => {
    return () => {
      if (animationControllerRef.current) {
        animationControllerRef.current.destroy();
        animationControllerRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default DeliveryTrackingMap;


import { useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { API_BASE_URL } from '@/lib/api/config';

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Hook for delivery boys to share their location in real-time
 * @param {string} orderId - Order ID to track
 * @param {boolean} enabled - Whether location sharing is enabled
 * @returns {object} - { isSharing, startSharing, stopSharing, error }
 */
export const useLocationSharing = (orderId, enabled = false) => {
  const socketRef = useRef(null);
  const watchIdRef = useRef(null);
  const isSharingRef = useRef(false);

  const backendUrl = API_BASE_URL.replace('/api', '');

  const startSharing = () => {
    if (!orderId) {
      console.error('Order ID is required for location sharing');
      return;
    }

    if (isSharingRef.current) {
      console.log('Location sharing already active');
      return;
    }

    // Initialize socket connection
    if (!socketRef.current) {
      socketRef.current = io(backendUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
      });

      socketRef.current.on('connect', () => {
        console.log('✅ Socket connected for location sharing');
        socketRef.current.emit('join-delivery', orderId);
      });

      socketRef.current.on('disconnect', () => {
        console.log('❌ Socket disconnected');
      });
    }

    // Throttle location updates to every 3-5 seconds (Zomato-style optimization)
    let lastSentTime = 0;
    const LOCATION_UPDATE_INTERVAL = 3000; // 3 seconds (industry standard: 3-5 sec)
    const lastLocationRef = { lat: null, lng: null };

    // Start watching position
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, heading } = position.coords;
          const now = Date.now();

          // Throttle: Only send if enough time has passed (3 seconds)
          if (now - lastSentTime < LOCATION_UPDATE_INTERVAL) {
            return; // Skip this update
          }

          // Also check if location changed significantly (at least 5 meters)
          if (lastLocationRef.lat !== null && lastLocationRef.lng !== null) {
            const distance = calculateDistance(
              lastLocationRef.lat,
              lastLocationRef.lng,
              latitude,
              longitude
            );
            
            // Skip if moved less than 5 meters (reduce unnecessary updates)
            if (distance < 5) {
              return;
            }
          }

          // Update last location
          lastLocationRef.lat = latitude;
          lastLocationRef.lng = longitude;
          lastSentTime = now;

          // Send location update via socket
          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('update-location', {
              orderId,
              lat: latitude,
              lng: longitude,
              heading: heading || 0, // heading may not be available on all devices
              timestamp: now
            });

            console.log(`📍 Location sent (throttled):`, { lat: latitude, lng: longitude, heading, interval: LOCATION_UPDATE_INTERVAL });
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
          // Handle different error types
          switch (error.code) {
            case error.PERMISSION_DENIED:
              console.error('User denied geolocation permission');
              break;
            case error.POSITION_UNAVAILABLE:
              console.error('Location information unavailable');
              break;
            case error.TIMEOUT:
              console.error('Location request timed out');
              break;
            default:
              console.error('Unknown geolocation error');
          }
        },
        {
          enableHighAccuracy: true, // Force GPS for accuracy
          maximumAge: 0, // No cache, always get fresh location
          timeout: 5000 // 5 seconds timeout
        }
      );

      isSharingRef.current = true;
      console.log('✅ Location sharing started');
    } else {
      console.error('Geolocation is not supported by this browser');
    }
  };

  const stopSharing = () => {
    // Stop geolocation watch
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      console.log('📍 Geolocation watch stopped');
    }

    // Disconnect socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      console.log('🔌 Socket disconnected');
    }

    isSharingRef.current = false;
  };

  // Auto-start/stop based on enabled prop
  useEffect(() => {
    if (enabled && orderId) {
      startSharing();
    } else {
      stopSharing();
    }

    return () => {
      stopSharing();
    };
  }, [enabled, orderId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSharing();
    };
  }, []);

  return {
    isSharing: isSharingRef.current,
    startSharing,
    stopSharing
  };
};

export default useLocationSharing;


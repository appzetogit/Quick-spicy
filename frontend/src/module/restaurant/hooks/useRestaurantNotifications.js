import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { API_BASE_URL } from '@/lib/api/config';
import { restaurantAPI } from '@/lib/api';
import alertSound from '@/assets/audio/alert.mp3';
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const resolveAudioSource = (source, cacheKey = 'restaurant-alert') => {
  if (!source) return source;
  if (!import.meta.env.DEV) return source;
  const separator = source.includes('?') ? '&' : '?';
  return `${source}${separator}devcache=${cacheKey}`;
}


/**
 * Hook for restaurant to receive real-time order notifications with sound
 * @returns {object} - { newOrder, playSound, isConnected }
 */
export const useRestaurantNotifications = () => {
  const socketRef = useRef(null);
  const [newOrder, setNewOrder] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const audioRef = useRef(null);
  const userInteractedRef = useRef(false); // Track user interaction for autoplay policy
  const audioUnlockAttemptedRef = useRef(false);
  const [restaurantId, setRestaurantId] = useState(null);
  const lastConnectErrorLogRef = useRef(0);
  const CONNECT_ERROR_LOG_THROTTLE_MS = 10000;

  // Get restaurant ID from API
  useEffect(() => {
    const fetchRestaurantId = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant();
        if (response.data?.success && response.data.data?.restaurant) {
          const restaurant = response.data.data.restaurant;
          const id = restaurant._id?.toString() || restaurant.restaurantId;
          setRestaurantId(id);
        }
      } catch (error) {
        debugError('Error fetching restaurant:', error);
      }
    };
    fetchRestaurantId();
  }, []);

  useEffect(() => {
    if (!restaurantId) {
      debugLog('⏳ Waiting for restaurantId...');
      return;
    }

    // Normalize backend URL - use simpler, more robust approach
    let backendUrl = API_BASE_URL;
    
    // Step 1: Extract protocol and hostname using URL parsing if possible
    try {
      const urlObj = new URL(backendUrl);
      // Remove /api from pathname
      let pathname = urlObj.pathname.replace(/^\/api\/?$/, '');
      // Reconstruct clean URL
      backendUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ''}${pathname}`;
    } catch (e) {
      // If URL parsing fails, use regex-based normalization
      // Remove /api suffix first
      backendUrl = backendUrl.replace(/\/api\/?$/, '');
      backendUrl = backendUrl.replace(/\/+$/, ''); // Remove trailing slashes
      
      // Normalize protocol - ensure exactly two slashes after protocol
      // Fix patterns: https:/, https:///, https://https://
      if (backendUrl.startsWith('https:') || backendUrl.startsWith('http:')) {
        // Extract protocol
        const protocolMatch = backendUrl.match(/^(https?):/i);
        if (protocolMatch) {
          const protocol = protocolMatch[1].toLowerCase();
          // Remove everything up to and including the first valid domain part
          const afterProtocol = backendUrl.substring(protocol.length + 1);
          // Remove leading slashes
          const cleanPath = afterProtocol.replace(/^\/+/, '');
          // Reconstruct with exactly two slashes
          backendUrl = `${protocol}://${cleanPath}`;
        }
      }
    }
    
    // Final cleanup: ensure exactly two slashes after protocol
    backendUrl = backendUrl.replace(/^(https?):\/+/gi, '$1://');
    backendUrl = backendUrl.replace(/\/+$/, ''); // Remove trailing slashes
    
    // CRITICAL: Check for localhost in production BEFORE creating socket
    // Detect production environment more reliably
    const frontendHostname = window.location.hostname;
    const isLocalhost = frontendHostname === 'localhost' || 
                        frontendHostname === '127.0.0.1' ||
                        frontendHostname === '';
    const isProductionBuild = import.meta.env.MODE === 'production' || import.meta.env.PROD;
    // Production deployment: not localhost AND (HTTPS OR has domain name with dots)
    const isProductionDeployment = !isLocalhost && (
      window.location.protocol === 'https:' || 
      (frontendHostname.includes('.') && !frontendHostname.startsWith('192.168.') && !frontendHostname.startsWith('10.'))
    );
    
    // If backend URL is localhost but we're not running locally, BLOCK connection
    const backendIsLocalhost = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
    // Block if: backend is localhost AND (production build OR production deployment)
    // Allow if: frontend is also localhost (development scenario)
    const shouldBlockConnection = backendIsLocalhost && (isProductionBuild || isProductionDeployment) && !isLocalhost;
    
    if (shouldBlockConnection) {
      // Try to infer backend URL from frontend URL (common pattern: api.domain.com or domain.com/api)
      const frontendHost = window.location.hostname;
      const frontendProtocol = window.location.protocol;
      let suggestedBackendUrl = null;
      
      // Common patterns:
      // - If frontend is on foods.appzeto.com, backend might be api.foods.appzeto.com or foods.appzeto.com
      if (frontendHost.includes('foods.appzeto.com')) {
        suggestedBackendUrl = `${frontendProtocol}//api.foods.appzeto.com/api`;
      } else if (frontendHost.includes('appzeto.com')) {
        suggestedBackendUrl = `${frontendProtocol}//api.${frontendHost}/api`;
      }
      
      debugError('❌ CRITICAL: BLOCKING Socket.IO connection to localhost!');
      debugError('💡 This means VITE_API_BASE_URL was not set during build time');
      debugError('💡 Current backendUrl:', backendUrl);
      debugError('💡 Current API_BASE_URL:', API_BASE_URL);
      debugError('💡 VITE_API_BASE_URL:', import.meta.env.VITE_API_BASE_URL || 'NOT SET');
      debugError('💡 Environment mode:', import.meta.env.MODE);
      debugError('💡 Frontend hostname:', frontendHost);
      debugError('💡 Frontend protocol:', frontendProtocol);
      debugError('💡 Is production build:', isProductionBuild);
      debugError('💡 Is production deployment:', isProductionDeployment);
      debugError('💡 Backend is localhost:', backendIsLocalhost);
      if (suggestedBackendUrl) {
        debugError('💡 Suggested backend URL:', suggestedBackendUrl);
        debugError('💡 Fix: Rebuild frontend with: VITE_API_BASE_URL=' + suggestedBackendUrl + ' npm run build');
      } else {
        debugError('💡 Fix: Rebuild frontend with: VITE_API_BASE_URL=https://your-backend-domain.com/api npm run build');
      }
      debugError('💡 Note: Vite environment variables are embedded at BUILD TIME, not runtime');
      debugError('💡 You must rebuild and redeploy the frontend with correct VITE_API_BASE_URL');
      
      // Clean up any existing socket connection
      if (socketRef.current) {
        debugLog('🧹 Cleaning up existing socket connection...');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      // Don't try to connect to localhost in production - it will fail
      setIsConnected(false);
      return; // CRITICAL: Exit early to prevent socket creation
    }
    
    // Validate backend URL format
    if (!backendUrl || !backendUrl.startsWith('http')) {
      debugError('❌ CRITICAL: Invalid backend URL format:', backendUrl);
      debugError('💡 API_BASE_URL:', API_BASE_URL);
      debugError('💡 Expected format: https://your-domain.com or http://localhost:5000');
      setIsConnected(false);
      return; // Don't try to connect with invalid URL
    }
    
    // Construct Socket.IO URL
    const socketUrl = `${backendUrl}/restaurant`;
    
    // Validate socket URL format
    try {
      const urlTest = new URL(socketUrl); // This will throw if URL is invalid
      // Additional validation: ensure it's not localhost in production
      if ((isProductionBuild || isProductionDeployment) && (urlTest.hostname === 'localhost' || urlTest.hostname === '127.0.0.1')) {
        debugError('❌ CRITICAL: Socket URL contains localhost in production!');
        debugError('💡 Socket URL:', socketUrl);
        debugError('💡 This should have been caught earlier, but blocking anyway');
        setIsConnected(false);
        return;
      }
    } catch (urlError) {
      debugError('❌ CRITICAL: Invalid Socket.IO URL:', socketUrl);
      debugError('💡 URL validation error:', urlError.message);
      debugError('💡 Backend URL:', backendUrl);
      debugError('💡 API_BASE_URL:', API_BASE_URL);
      setIsConnected(false);
      return; // Don't try to connect with invalid URL
    }
    
    debugLog('🔌 Attempting to connect to Socket.IO:', socketUrl);
    debugLog('🔌 Backend URL:', backendUrl);
    debugLog('🔌 API_BASE_URL:', API_BASE_URL);
    debugLog('🔌 Restaurant ID:', restaurantId);
    debugLog('🔌 Environment:', import.meta.env.MODE);
    debugLog('🔌 Is Production Build:', isProductionBuild);
    debugLog('🔌 Is Production Deployment:', isProductionDeployment);

    // Initialize socket connection to restaurant namespace
    // Use polling only to avoid repeated "WebSocket connection failed" when backend is down
    socketRef.current = io(socketUrl, {
      path: '/socket.io/',
      transports: ['polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      forceNew: false,
      autoConnect: true,
      auth: {
        token: localStorage.getItem('restaurant_accessToken') || localStorage.getItem('accessToken')
      }
    });

    socketRef.current.on('connect', () => {
      debugLog('✅ Restaurant Socket connected, restaurantId:', restaurantId);
      debugLog('✅ Socket ID:', socketRef.current.id);
      debugLog('✅ Socket URL:', socketUrl);
      setIsConnected(true);
      
      // Join restaurant room immediately after connection with retry
      if (restaurantId) {
        const joinRoom = () => {
          debugLog('📢 Joining restaurant room with ID:', restaurantId);
          socketRef.current.emit('join-restaurant', restaurantId);
          
          // Retry join after 2 seconds if no confirmation received
          setTimeout(() => {
            if (socketRef.current?.connected) {
              debugLog('🔄 Retrying restaurant room join...');
              socketRef.current.emit('join-restaurant', restaurantId);
            }
          }, 2000);
        };
        
        joinRoom();
      } else {
        debugWarn('⚠️ Cannot join restaurant room: restaurantId is missing');
      }
    });

    // Listen for room join confirmation
    socketRef.current.on('restaurant-room-joined', (data) => {
      debugLog('✅ Restaurant room joined successfully:', data);
      debugLog('✅ Room:', data?.room);
      debugLog('✅ Restaurant ID in room:', data?.restaurantId);
    });

    // Listen for connection errors (throttle logs to avoid console spam on reconnect loops)
    socketRef.current.on('connect_error', (error) => {
      const now = Date.now();
      const shouldLog = now - lastConnectErrorLogRef.current >= CONNECT_ERROR_LOG_THROTTLE_MS;
      if (shouldLog) {
        lastConnectErrorLogRef.current = now;
        const isTransportError = error.type === 'TransportError' || error.message?.includes('xhr poll error');
        debugWarn(
          'Restaurant Socket:',
          isTransportError
            ? `Cannot reach backend at ${backendUrl}. Ensure the backend is running (e.g. npm run dev in backend).`
            : error.message
        );
        if (!isTransportError) {
          debugWarn('Details:', { type: error.type, socketUrl, backendUrl });
        }
      }
      if (error.message?.includes('CORS') || error.message?.includes('Not allowed')) {
        debugWarn('💡 Add frontend URL to CORS_ORIGIN in backend .env');
      }
      setIsConnected(false);
    });

    // Listen for disconnection
    socketRef.current.on('disconnect', (reason) => {
      debugLog('❌ Restaurant Socket disconnected:', reason);
      setIsConnected(false);
      
      if (reason === 'io server disconnect') {
        // Server disconnected the socket, reconnect manually
        socketRef.current.connect();
      }
    });

    // Listen for reconnection attempts
    socketRef.current.on('reconnect_attempt', (attemptNumber) => {
      debugLog(`🔄 Reconnection attempt ${attemptNumber}...`);
    });

    // Listen for successful reconnection
    socketRef.current.on('reconnect', (attemptNumber) => {
      debugLog(`✅ Reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
      
      // Rejoin restaurant room after reconnection
      if (restaurantId) {
        socketRef.current.emit('join-restaurant', restaurantId);
      }
    });

    // Listen for new order notifications
    socketRef.current.on('new_order', (orderData) => {
      debugLog('📦 New order received:', orderData);
      setNewOrder(orderData);
      
      // Play notification sound
      playNotificationSound();
    });

    // Listen for sound notification event
    socketRef.current.on('play_notification_sound', (data) => {
      debugLog('🔔 Sound notification:', data);
      playNotificationSound();
    });

    // Listen for order status updates
    socketRef.current.on('order_status_update', (data) => {
      debugLog('📊 Order status update:', data);
      // You can handle status updates here if needed
    });

    // Load notification sound
    audioRef.current = new Audio(resolveAudioSource(alertSound));
    audioRef.current.preload = 'auto';
    audioRef.current.volume = 0.7;

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [restaurantId]);

  // Track user interaction for autoplay policy
  useEffect(() => {
    const handleUserInteraction = async () => {
      userInteractedRef.current = true;

      if (!audioRef.current) {
        audioRef.current = new Audio(resolveAudioSource(alertSound));
        audioRef.current.preload = 'auto';
        audioRef.current.volume = 0.7;
      }

      if (!audioUnlockAttemptedRef.current && audioRef.current) {
        audioUnlockAttemptedRef.current = true;
        try {
          audioRef.current.muted = true;
          await audioRef.current.play();
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          audioRef.current.muted = false;
        } catch (error) {
          audioUnlockAttemptedRef.current = false;
          if (!error.message?.includes('user didn\'t interact') && !error.name?.includes('NotAllowedError')) {
            debugWarn('Error unlocking notification sound:', error);
          }
        }
      }

      // Remove listeners after first interaction
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('pointerdown', handleUserInteraction);
    };
    
    // Listen for user interaction
    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    document.addEventListener('keydown', handleUserInteraction, { once: true });
    window.addEventListener('pointerdown', handleUserInteraction, { once: true, passive: true });
    
    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('pointerdown', handleUserInteraction);
    };
  }, []);

  const playNotificationSound = () => {
    try {
      if (audioRef.current) {
        // Only play if user has interacted with the page (browser autoplay policy)
        if (!userInteractedRef.current) {
          debugLog('🔇 Audio playback skipped - user has not interacted with page yet');
          return;
        }
        
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(error => {
          // Don't log autoplay policy errors as they're expected
          if (!error.message?.includes('user didn\'t interact') && !error.name?.includes('NotAllowedError')) {
            debugWarn('Error playing notification sound:', error);
          }
        });
      }
    } catch (error) {
      // Don't log autoplay policy errors
      if (!error.message?.includes('user didn\'t interact') && !error.name?.includes('NotAllowedError')) {
        debugWarn('Error playing sound:', error);
      }
    }
  };

  const clearNewOrder = () => {
    setNewOrder(null);
  };

  return {
    newOrder,
    clearNewOrder,
    isConnected,
    playNotificationSound
  };
};



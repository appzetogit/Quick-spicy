import { useEffect, useState, useRef, useMemo, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import Lenis from "lenis"
import { toast } from "sonner"
import {
  Lightbulb,
  HelpCircle,
  Calendar,
  Clock,
  Lock,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  UtensilsCrossed,
  Wallet,
  TrendingUp,
  CheckCircle,
  Bell,
  MapPin,
  ChefHat,
  Phone,
  X,
  TargetIcon,
  Play,
  Pause,
  IndianRupee,
  Loader2,
  Camera,
} from "lucide-react"
import BottomPopup from "../components/BottomPopup"
import FeedNavbar from "../components/FeedNavbar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useGigStore } from "../store/gigStore"
import { useProgressStore } from "../store/progressStore"
import { formatTimeDisplay, calculateTotalHours } from "../utils/gigUtils"
import {
  fetchDeliveryWallet,
  calculatePeriodEarnings
} from "../utils/deliveryWalletState"
import { formatCurrency } from "../../restaurant/utils/currency"
import { getAllDeliveryOrders, saveDeliveryOrderStatus, DELIVERY_ORDER_STATUS } from "../utils/deliveryOrderStatus"
import { getUnreadDeliveryNotificationCount } from "../utils/deliveryNotifications"
import { deliveryAPI, restaurantAPI, uploadAPI } from "@/lib/api"
import { subscribeOrderTracking } from "@/lib/realtimeTracking"
import { useDeliveryNotifications } from "../hooks/useDeliveryNotifications"
import { getGoogleMapsApiKey } from "@/lib/utils/googleMapsApiKey"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { Loader } from "@googlemaps/js-api-loader"
import {
  buildVisibleRouteFromRiderPosition,
  decodePolyline,
  extractPolylineFromDirections,
  calculateBearing,
  animateMarker,
  calculateDistance
} from "../utils/liveTrackingPolyline"
import referralBonusBg from "../../../assets/referralbonuscardbg.png"
// import dropLocationBanner from "../../../assets/droplocationbanner.png" // File not found - commented out
import alertSound from "../../../assets/audio/alert.mp3"
import originalSound from "../../../assets/audio/original.mp3"
import bikeLogo from "../../../assets/bikelogo.png"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const PICKUP_REACHED_THRESHOLD_METERS = 120
const DROP_REACHED_THRESHOLD_METERS = 90
const ROUTE_OFF_TRACK_THRESHOLD_METERS = 40
const DELIVERY_LOCATION_SEND_INTERVAL_MS = 3000
const DELIVERY_LOCATION_FALLBACK_INTERVAL_MS = 3000


// Ola Maps API Key removed

// Mock restaurants data
const mockRestaurants = [
  {
    id: 1,
    name: "Hotel Pankaj",
    address: "Opposite Midway, Behror Locality, Behror",
    lat: 28.2849,
    lng: 76.1209,
    distance: "3.56 km",
    timeAway: "4 mins",
    orders: 2,
    estimatedEarnings: 76.62, // Consistent payment amount
    pickupDistance: "3.56 km",
    dropDistance: "12.2 km",
    payment: "COD",
    amount: 76.62, // Payment amount (consistent with estimatedEarnings)
    items: 2,
    phone: "+911234567890",
    orderId: "ORD1234567890",
    customerName: "Rajesh Kumar",
    customerAddress: "401, 4th Floor, Pushparatna Solitare Building, Janjeerwala Square, New Palasia, Indore",
    customerPhone: "+919876543210",
    tripTime: "38 mins",
    tripDistance: "8.8 kms"
  },
  {
    id: 2,
    name: "Haldi",
    address: "B 2, Narnor-Alwar Rd, Indus Valley, Behror",
    lat: 28.2780,
    lng: 76.1150,
    distance: "4.2 km",
    timeAway: "4 mins",
    orders: 1,
    estimatedEarnings: 76.62,
    pickupDistance: "4.2 km",
    dropDistance: "8.5 km",
    payment: "COD",
    amount: 76.62,
    items: 3,
    phone: "+911234567891",
    orderId: "ORD1234567891",
    customerName: "Priya Sharma",
    customerAddress: "Flat 302, Green Valley Apartments, MG Road, Indore",
    customerPhone: "+919876543211",
    tripTime: "35 mins",
    tripDistance: "7.5 kms"
  },
  {
    id: 3,
    name: "Pandit Ji Samose Wale",
    address: "Near Govt. Senior Secondary School, Behror Locality, Behror",
    lat: 28.2870,
    lng: 76.1250,
    distance: "5.04 km",
    timeAway: "6 mins",
    orders: 1,
    estimatedEarnings: 76.62,
    pickupDistance: "5.04 km",
    dropDistance: "7.8 km",
    payment: "COD",
    amount: 76.62,
    items: 1,
    phone: "+911234567892",
    orderId: "ORD1234567892",
    customerName: "Amit Patel",
    customerAddress: "House No. 45, Sector 5, Vijay Nagar, Indore",
    customerPhone: "+919876543212",
    tripTime: "32 mins",
    tripDistance: "6.9 kms"
  }
]

// ============================================
// STABLE TRACKING SYSTEM - RAPIDO/UBER STYLE
// ============================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 
 * @param {number} lng1 
 * @param {number} lat2 
 * @param {number} lng2 
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000 // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toFiniteCoordinate(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getCustomerDestination(restaurantInfo) {
  if (!restaurantInfo) return null
  const lat = toFiniteCoordinate(restaurantInfo.customerLat)
  const lng = toFiniteCoordinate(restaurantInfo.customerLng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function isDirectionsResultNearDestination(directionsResult, destination, thresholdMeters = 120) {
  if (!directionsResult || !destination) return false
  const legs = directionsResult?.routes?.[0]?.legs
  const lastLeg = Array.isArray(legs) && legs.length > 0 ? legs[legs.length - 1] : null
  const endLocation = lastLeg?.end_location
  if (!endLocation) return false

  const endLat = typeof endLocation.lat === 'function' ? endLocation.lat() : Number(endLocation.lat)
  const endLng = typeof endLocation.lng === 'function' ? endLocation.lng() : Number(endLocation.lng)
  if (!Number.isFinite(endLat) || !Number.isFinite(endLng)) return false

  return haversineDistance(endLat, endLng, destination.lat, destination.lng) <= thresholdMeters
}

/**
 * Filter GPS location based on accuracy, distance jump, and speed
 * @param {Object} position - GPS position object
 * @param {Array} lastValidLocation - [lat, lng] of last valid location
 * @param {number} lastLocationTime - Timestamp of last location
 * @returns {boolean} true if location should be accepted
 */
function shouldAcceptLocation(position, lastValidLocation, lastLocationTime) {
  const accuracy = position.coords.accuracy || 0
  const latitude = position.coords.latitude
  const longitude = position.coords.longitude
  
  // CRITICAL: Always accept first location (no previous location) to ensure admin map shows delivery boy
  // Even if accuracy is poor, we need at least one location update
  const isFirstLocation = !lastValidLocation || !lastLocationTime
  
  if (isFirstLocation) {
    // For first location, accept if accuracy < 1000m (very lenient)
    if (accuracy > 1000) {
      debugLog('🚫 First location rejected: accuracy extremely poor', { accuracy: accuracy.toFixed(2) + 'm' })
      return false
    }
    debugLog('✅ Accepting first location (will be used for admin map):', { 
      accuracy: accuracy.toFixed(2) + 'm',
      lat: latitude,
      lng: longitude
    })
    return true
  }
  
  // Filter 1: For subsequent locations, use relaxed accuracy threshold (200m instead of 30m)
  // This allows GPS to work even in areas with poor signal
  if (accuracy > 200) {
    debugLog('🚫 Location rejected: accuracy too poor', { accuracy: accuracy.toFixed(2) + 'm' })
    return false
  }
  
  // Filter 2: Check distance jump and speed if we have previous location
  if (lastValidLocation && lastLocationTime) {
    const [prevLat, prevLng] = lastValidLocation
    const distance = haversineDistance(prevLat, prevLng, latitude, longitude)
    const timeDiff = (Date.now() - lastLocationTime) / 1000 // seconds
    
    // Filter 2a: Ignore if distance jump > 50 meters within 2 seconds
    if (distance > 50 && timeDiff < 2) {
      debugLog('🚫 Location rejected: distance jump too large', { 
        distance: distance.toFixed(2) + 'm', 
        timeDiff: timeDiff.toFixed(2) + 's' 
      })
      return false
    }
    
    // Filter 2b: Ignore if calculated speed > 60 km/h (bike speed limit)
    if (timeDiff > 0) {
      const speedKmh = (distance / timeDiff) * 3.6 // Convert m/s to km/h
      if (speedKmh > 60) {
        debugLog('🚫 Location rejected: speed too high', { 
          speed: speedKmh.toFixed(2) + ' km/h' 
        })
        return false
      }
    }
  }
  
  return true
}

/**
 * Apply moving average smoothing on location history
 * @param {Array} locationHistory - Array of [lat, lng] coordinates
 * @returns {Array|null} Smoothed [lat, lng] or null if not enough points
 */
function smoothLocation(locationHistory) {
  if (locationHistory.length < 2) {
    return locationHistory.length === 1 ? locationHistory[0] : null
  }
  
  // Use last 5 points for moving average
  const pointsToUse = locationHistory.slice(-5)
  
  // Calculate average latitude and longitude
  const avgLat = pointsToUse.reduce((sum, point) => sum + point[0], 0) / pointsToUse.length
  const avgLng = pointsToUse.reduce((sum, point) => sum + point[1], 0) / pointsToUse.length
  
  return [avgLat, avgLng]
}

/**
 * Animate marker smoothly from current position to new position
 * @param {Object} marker - Google Maps Marker instance
 * @param {Object} newPosition - {lat, lng} new position
 * @param {number} duration - Animation duration in milliseconds (default 1500ms)
 * @param {React.RefObject} animationRef - Ref to store animation frame ID (from component)
 */
function animateMarkerSmoothly(marker, newPosition, duration = 1500, animationRef) {
  if (!marker || !newPosition) return
  
  const currentPosition = marker.getPosition()
  if (!currentPosition) {
    // If no current position, set directly
    marker.setPosition(newPosition)
    return
  }
  
  const startLat = currentPosition.lat()
  const startLng = currentPosition.lng()
  const endLat = newPosition.lat
  const endLng = newPosition.lng
  
  // Cancel any ongoing animation (use ref if passed)
  if (animationRef?.current) {
    cancelAnimationFrame(animationRef.current)
  }
  
  const startTime = Date.now()
  const startPos = { lat: startLat, lng: startLng }
  const endPos = { lat: endLat, lng: endLng }
  
  function animate() {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    
    // Linear easing
    const currentLat = startPos.lat + (endPos.lat - startPos.lat) * progress
    const currentLng = startPos.lng + (endPos.lng - startPos.lng) * progress
    
    marker.setPosition({ lat: currentLat, lng: currentLng })
    
    if (progress < 1) {
      if (animationRef) animationRef.current = requestAnimationFrame(animate)
    } else {
      if (animationRef) animationRef.current = null
    }
  }
  
  if (animationRef) animationRef.current = requestAnimationFrame(animate)
}

export default function DeliveryHome() {
  const ENABLE_GOOGLE_DIRECTIONS = import.meta.env.VITE_ENABLE_GOOGLE_DIRECTIONS === 'true'
  const DELIVERY_DROP_OTP_LENGTH = 4
  const DELIVERY_ACTIVE_ORDER_KEY = 'deliveryActiveOrder'
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const location = useLocation()
  const [animationKey, setAnimationKey] = useState(0)

  // Helper function to safely call preventDefault (handles passive event listeners)
  // React's synthetic touch events are passive by default, so we check cancelable first
  const safePreventDefault = (e) => {
    if (!e) return;
    
    // Early return if event is not cancelable (passive listener)
    // This prevents the browser warning about calling preventDefault on passive listeners
    if (e.cancelable === false) {
      return; // Event listener is passive, cannot and should not call preventDefault
    }
    
    // For touch events, check if CSS touch-action is handling it
    // If touch-action is set, we don't need preventDefault
    const eventType = e.type || '';
    if (eventType.includes('touch')) {
      const target = e.target || e.currentTarget;
      if (target) {
        try {
          const computedStyle = window.getComputedStyle(target);
          const touchAction = computedStyle.touchAction;
          // If touch-action is set (not 'auto'), CSS is handling it, skip preventDefault
          if (touchAction && touchAction !== 'auto' && touchAction !== '') {
            return; // CSS touch-action is handling scrolling prevention
          }
        } catch (styleError) {
          // If getComputedStyle fails, continue with preventDefault check
        }
      }
    }
    
    // For React synthetic events, check the native event's cancelable property
    // React synthetic events may have cancelable: true but the underlying listener is passive
    const nativeEvent = e.nativeEvent;
    if (nativeEvent) {
      // Check native event's cancelable property - this is the most reliable check
      if (nativeEvent.cancelable === false) {
        return; // Native event listener is passive
      }
      
      // Additional check: if defaultPrevented is already true, no need to call again
      if (nativeEvent.defaultPrevented === true) {
        return;
      }
    }
    
    // Only call preventDefault if event is cancelable AND we have a function
    // Wrap in try-catch to completely suppress passive listener errors
    if (e.cancelable !== false && typeof e.preventDefault === 'function') {
      try {
        // Final check: ensure native event is still cancelable
        if (nativeEvent && nativeEvent.cancelable === false) {
          return;
        }
        // Suppress console errors temporarily while calling preventDefault
        const originalError = console.error;
        console.error = () => {}; // Temporarily suppress console.error
        try {
          e.preventDefault();
        } finally {
          console.error = originalError; // Restore console.error
        }
      } catch (err) {
        // Silently ignore - this shouldn't happen if cancelable is true
        // But some browsers may still throw if the listener is passive
        // Don't log the error to avoid console spam
        return;
      }
    }
  }
  const [walletState, setWalletState] = useState({
    totalBalance: 0,
    cashInHand: 0,
    totalWithdrawn: 0,
    totalEarned: 0,
    transactions: [],
    joiningBonusClaimed: false
  })
  const [cashLimitWarningMessage, setCashLimitWarningMessage] = useState("")
  const hasShownCashLimitToastRef = useRef(false)
  const [activeOrder, setActiveOrder] = useState(() => {
    const stored = localStorage.getItem('activeOrder')
    return stored ? JSON.parse(stored) : null
  })
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(() => getUnreadDeliveryNotificationCount())
  const availableCashLimit = Number(walletState?.availableCashLimit)
  const isCashLimitBlocked = Number.isFinite(availableCashLimit) && availableCashLimit <= 0
  const cashLimitBlockedMessage = cashLimitWarningMessage || "Deposit cash to continue"
  
  // Delivery notifications hook
  const {
    newOrder,
    clearNewOrder,
    orderReady,
    clearOrderReady,
    orderStatusUpdate,
    clearOrderStatusUpdate,
    isConnected
  } = useDeliveryNotifications()
  
  // Default location - will be set from saved location or GPS, not hardcoded
  const [riderLocation, setRiderLocation] = useState(null) // Will be set from GPS or saved location
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false)
  const [bankDetailsFilled, setBankDetailsFilled] = useState(false)
  const [deliveryStatus, setDeliveryStatus] = useState(null) // Store delivery partner status
  const [rejectionReason, setRejectionReason] = useState(null) // Store rejection reason
  const [isReverifying, setIsReverifying] = useState(false) // Loading state for reverify
  
  // Map refs and state (Ola Maps removed)
  const mapContainerRef = useRef(null)
  const directionsMapContainerRef = useRef(null)
  const watchPositionIdRef = useRef(null) // Store watchPosition ID for cleanup
  const lastLocationRef = useRef(null) // Store last location for heading calculation
  const bikeMarkerRef = useRef(null) // Store bike marker instance
  const isUserPanningRef = useRef(false) // Track if user manually panned the map
  const routePolylineRef = useRef(null) // Store route polyline instance (legacy - for fallback)
  const routeHistoryRef = useRef([]) // Store route history for traveled path
  const isOnlineRef = useRef(false) // Store online status for use in callbacks
  
  // Stable tracking system - Rapido/Uber style
  const locationHistoryRef = useRef([]) // Store last 5 valid GPS points for smoothing
  const lastValidLocationRef = useRef(null) // Last valid smoothed location
  const lastLocationTimeRef = useRef(null) // Timestamp of last location update
  const smoothedLocationRef = useRef(null) // Current smoothed location
  const markerAnimationRef = useRef(null) // Track ongoing marker animation
  const zonesPolygonsRef = useRef([]) // Store zone polygons
  // Google Maps Directions API refs
  const directionsServiceRef = useRef(null) // Directions Service instance
  const directionsRendererRef = useRef(null) // Directions Renderer instance
  const directionsMapInstanceRef = useRef(null) // Directions map instance
  const directionsApiCacheRef = useRef(new Map()) // Cache directions results to reduce API usage
  const directionsApiLastRequestRef = useRef({ key: null, timestamp: 0 }) // Prevent duplicate rapid requests
  const restaurantMarkerRef = useRef(null) // Restaurant marker on main map
  const customerMarkerRef = useRef(null) // Customer marker on main map
  const directionsDestinationMarkerRef = useRef(null) // Destination marker on directions map
  const directionsBikeMarkerRef = useRef(null) // Bike marker on directions map
  const lastRouteRecalculationRef = useRef(null) // Track last route recalculation time (API cost optimization)
  const lastBikePositionRef = useRef(null) // Track last bike position for deviation detection
  const acceptedOrderIdsRef = useRef(new Set()) // Track accepted order IDs to prevent duplicate notifications
  // Live tracking polyline refs
  const liveTrackingPolylineRef = useRef(null) // Google Maps Polyline instance for live tracking
  const liveTrackingPolylineShadowRef = useRef(null) // Shadow/outline polyline for better visibility (Zomato/Rapido style)
  const fullRoutePolylineRef = useRef([]) // Store full decoded polyline from Directions API
  const lastRiderPositionRef = useRef(null) // Last rider position for smooth animation
  const markerAnimationCancelRef = useRef(null) // Cancel function for marker animation
  const directionsResponseRef = useRef(null) // Store directions response for use in callbacks
  const fetchedOrderDetailsForDropRef = useRef(null) // Prevent re-fetching order details for Reached Drop customer coords
  const [zones, setZones] = useState([]) // Store nearby zones
  const [mapLoading, setMapLoading] = useState(false)
  const [directionsMapLoading, setDirectionsMapLoading] = useState(false)
  const isInitializingMapRef = useRef(false)

  // Safety timeout: hide "Loading map..." overlay after max 2 seconds
  useEffect(() => {
    if (!mapLoading) return
    const timer = setTimeout(() => {
      setMapLoading(false)
    }, 2000)
    return () => clearTimeout(timer)
  }, [mapLoading])

  // Seeded random number generator for consistent hotspots
  const createSeededRandom = (seed) => {
    let currentSeed = seed
    return () => {
      currentSeed = (currentSeed * 9301 + 49297) % 233280
      return currentSeed / 233280
    }
  }

  // Generate irregular polygon from random nearby points (using seeded random)
  const createIrregularPolygon = (center, numPoints, spread, seedOffset) => {
    const [lat, lng] = center
    const vertices = []
    const seededRandom = createSeededRandom(seedOffset)
    
    // Generate random points around the center
    for (let i = 0; i < numPoints; i++) {
      // Seeded random angle
      const angle = seededRandom() * 2 * Math.PI
      // Seeded random distance (varying spread for irregularity)
      const distance = spread * (0.5 + seededRandom() * 0.5)
      
      const vertexLat = lat + distance * Math.cos(angle)
      const vertexLng = lng + distance * Math.sin(angle)
      vertices.push([vertexLat, vertexLng])
    }
    
    // Sort vertices by angle to create a proper polygon (prevents self-intersection)
    const centerLat = vertices.reduce((sum, v) => sum + v[0], 0) / vertices.length
    const centerLng = vertices.reduce((sum, v) => sum + v[1], 0) / vertices.length
    
    vertices.sort((a, b) => {
      const angleA = Math.atan2(a[0] - centerLat, a[1] - centerLng)
      const angleB = Math.atan2(b[0] - centerLat, b[1] - centerLng)
      return angleA - angleB
    })
    
    return vertices
  }

  // Generate nearby hotspot locations with irregular shapes from 3-5 points
  // Using useState with lazy initializer to generate hotspots once and keep them fixed
  const [hotspots] = useState(() => {
    // Use default location if riderLocation is not available yet
    const defaultLocation = [23.2599, 77.4126] // Bhopal center as fallback
    const [lat, lng] = riderLocation || defaultLocation
    const hotspots = []
    const baseSpread = 0.004 // Base spread for points in degrees
    
    // Hotspot 1 - Northeast, 3 points
    hotspots.push({
      type: 'polygon',
      center: [lat + 0.008, lng + 0.006],
      vertices: createIrregularPolygon([lat + 0.008, lng + 0.006], 3, baseSpread * 1.2, 1000),
      opacity: 0.25
    })
    
    // Hotspot 2 - Northwest, 4 points
    hotspots.push({
      type: 'polygon',
      center: [lat + 0.005, lng - 0.007],
      vertices: createIrregularPolygon([lat + 0.005, lng - 0.007], 4, baseSpread * 1.0, 2000),
      opacity: 0.3
    })
    
    // Hotspot 3 - Southeast, 5 points
    hotspots.push({
      type: 'polygon',
      center: [lat - 0.006, lng + 0.009],
      vertices: createIrregularPolygon([lat - 0.006, lng + 0.009], 5, baseSpread * 0.9, 3000),
      opacity: 0.2
    })
    
    // Hotspot 4 - Southwest, 3 points
    hotspots.push({
      type: 'polygon',
      center: [lat - 0.004, lng - 0.005],
      vertices: createIrregularPolygon([lat - 0.004, lng - 0.005], 3, baseSpread * 1.1, 4000),
      opacity: 0.28
    })
    
    // Hotspot 5 - North, 4 points
    hotspots.push({
      type: 'polygon',
      center: [lat + 0.011, lng + 0.001],
      vertices: createIrregularPolygon([lat + 0.011, lng + 0.001], 4, baseSpread * 0.7, 5000),
      opacity: 0.22
    })
    
    // Hotspot 6 - East, 5 points
    hotspots.push({
      type: 'polygon',
      center: [lat + 0.002, lng + 0.012],
      vertices: createIrregularPolygon([lat + 0.002, lng + 0.012], 5, baseSpread * 1.1, 6000),
      opacity: 0.32
    })
    
    // Hotspot 7 - South, 3 points
    hotspots.push({
      type: 'polygon',
      center: [lat - 0.009, lng - 0.002],
      vertices: createIrregularPolygon([lat - 0.009, lng - 0.002], 3, baseSpread * 1.0, 7000),
      opacity: 0.26
    })
    
    // Hotspot 8 - West, 4 points
    hotspots.push({
      type: 'polygon',
      center: [lat - 0.001, lng - 0.010],
      vertices: createIrregularPolygon([lat - 0.001, lng - 0.010], 4, baseSpread * 0.85, 8000),
      opacity: 0.24
    })
    
    // Hotspot 9 - Northeast (further), 5 points
    hotspots.push({
      type: 'polygon',
      center: [lat + 0.006, lng + 0.008],
      vertices: createIrregularPolygon([lat + 0.006, lng + 0.008], 5, baseSpread * 0.6, 9000),
      opacity: 0.23
    })
    
    // Hotspot 10 - Southwest (further), 3 points
    hotspots.push({
      type: 'polygon',
      center: [lat - 0.007, lng - 0.008],
      vertices: createIrregularPolygon([lat - 0.007, lng - 0.008], 3, baseSpread * 0.9, 10000),
      opacity: 0.27
    })
    
    return hotspots
  })
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false)
  const [acceptButtonProgress, setAcceptButtonProgress] = useState(0)
  const [isAnimatingToComplete, setIsAnimatingToComplete] = useState(false)
  const [hasAutoShown, setHasAutoShown] = useState(false)
  const [showNewOrderPopup, setShowNewOrderPopup] = useState(false)
  const [countdownSeconds, setCountdownSeconds] = useState(300)
  const countdownTimerRef = useRef(null)
  const [showRejectPopup, setShowRejectPopup] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const alertAudioRef = useRef(null)
  const userInteractedRef = useRef(false) // Track user interaction for autoplay policy
  const newOrderAcceptButtonRef = useRef(null)
  const newOrderAcceptButtonSwipeStartX = useRef(0)
  const newOrderAcceptButtonSwipeStartY = useRef(0)
  const newOrderAcceptButtonIsSwiping = useRef(false)
  const [newOrderAcceptButtonProgress, setNewOrderAcceptButtonProgress] = useState(0)
  const [newOrderIsAnimatingToComplete, setNewOrderIsAnimatingToComplete] = useState(false)
  const [isAcceptingNewOrder, setIsAcceptingNewOrder] = useState(false)
  const isAcceptingNewOrderRef = useRef(false)
  const newOrderPopupRef = useRef(null)
  const newOrderSwipeStartY = useRef(0)
  const newOrderIsSwiping = useRef(false)
  const [newOrderDragY, setNewOrderDragY] = useState(0)
  const [isDraggingNewOrderPopup, setIsDraggingNewOrderPopup] = useState(false)
  const [isNewOrderPopupMinimized, setIsNewOrderPopupMinimized] = useState(false)
  const [showDirectionsMap, setShowDirectionsMap] = useState(false)
  const [navigationMode, setNavigationMode] = useState('restaurant') // 'restaurant' or 'customer'
  const [showreachedPickupPopup, setShowreachedPickupPopup] = useState(false)
  const [showOrderIdConfirmationPopup, setShowOrderIdConfirmationPopup] = useState(false)
  const [showReachedDropPopup, setShowReachedDropPopup] = useState(false)
  const [showOrderDeliveredAnimation, setShowOrderDeliveredAnimation] = useState(false)
  const [showCustomerReviewPopup, setShowCustomerReviewPopup] = useState(false)
  const [showPaymentPage, setShowPaymentPage] = useState(false)
  const [customerRating, setCustomerRating] = useState(0)
  const [customerReviewText, setCustomerReviewText] = useState("")
  const [orderEarnings, setOrderEarnings] = useState(0) // Store earnings from completed order
  const [routePolyline, setRoutePolyline] = useState([])
   const [showRoutePath, setShowRoutePath] = useState(false) // Toggle to show/hide route path - disabled by default
   const [directionsResponse, setDirectionsResponse] = useState(null) // Directions API response for road-based routing
  const [reachedPickupButtonProgress, setreachedPickupButtonProgress] = useState(0)
  const [reachedPickupIsAnimatingToComplete, setreachedPickupIsAnimatingToComplete] = useState(false)
  const reachedPickupButtonRef = useRef(null)
  const reachedPickupSwipeStartX = useRef(0)
  const reachedPickupSwipeStartY = useRef(0)
  const reachedPickupIsSwiping = useRef(false)
  const [isDraggingReachedPickup, setIsDraggingReachedPickup] = useState(false)
  const [reachedDropButtonProgress, setReachedDropButtonProgress] = useState(0)
  const [reachedDropIsAnimatingToComplete, setReachedDropIsAnimatingToComplete] = useState(false)
  const reachedDropButtonRef = useRef(null)
  const reachedDropSwipeStartX = useRef(0)
  const reachedDropSwipeStartY = useRef(0)
  const reachedDropIsSwiping = useRef(false)
  const reachedDropHoldTimerRef = useRef(null)
  const reachedDropHoldTriggeredRef = useRef(false)
  const reachedDropLastProgressRef = useRef(0)
  const [orderIdConfirmButtonProgress, setOrderIdConfirmButtonProgress] = useState(0)
  const [orderIdConfirmIsAnimatingToComplete, setOrderIdConfirmIsAnimatingToComplete] = useState(false)
  const orderIdConfirmButtonRef = useRef(null)
  const orderIdConfirmSwipeStartX = useRef(0)
  const orderIdConfirmSwipeStartY = useRef(0)
  const orderIdConfirmIsSwiping = useRef(false)
  // Bill image upload state
  const [billImageUrl, setBillImageUrl] = useState(null)
  const [isUploadingBill, setIsUploadingBill] = useState(false)
  const [billImageUploaded, setBillImageUploaded] = useState(false)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const [orderDeliveredButtonProgress, setOrderDeliveredButtonProgress] = useState(0)
  const [orderDeliveredIsAnimatingToComplete, setOrderDeliveredIsAnimatingToComplete] = useState(false)
  const [showDeliveryOtpModal, setShowDeliveryOtpModal] = useState(false)
  const [deliveryOtpDigits, setDeliveryOtpDigits] = useState(() => Array(DELIVERY_DROP_OTP_LENGTH).fill(""))
  const [deliveryOtpValue, setDeliveryOtpValue] = useState("")
  const [deliveryOtpError, setDeliveryOtpError] = useState("")
  const [isVerifyingDeliveryOtp, setIsVerifyingDeliveryOtp] = useState(false)
  const deliveryOtpResolveRef = useRef(null)
  const activeOrderTrackingIds = useMemo(() => {
    const ids = [
      selectedRestaurant?.orderId,
      selectedRestaurant?.id,
      selectedRestaurant?._id,
      newOrder?.orderId,
      newOrder?.orderMongoId,
      newOrder?._id
    ]
      .map((value) => (value == null ? "" : String(value).trim()))
      .filter(Boolean)

    return [...new Set(ids)]
  }, [
    selectedRestaurant?.orderId,
    selectedRestaurant?.id,
    selectedRestaurant?._id,
    newOrder?.orderId,
    newOrder?.orderMongoId,
    newOrder?._id
  ])
  const deliveryOtpInputRefs = useRef([])
  const deliveryOtpSingleInputRef = useRef(null)
  const orderDeliveredButtonRef = useRef(null)
  // Trip distance and time from Google Maps API
  const [tripDistance, setTripDistance] = useState(null) // in meters
  const [tripTime, setTripTime] = useState(null) // in seconds
  const pickupRouteDistanceRef = useRef(0) // Distance to pickup in meters
  const pickupRouteTimeRef = useRef(0) // Time to pickup in seconds
  const deliveryRouteDistanceRef = useRef(0) // Distance to delivery in meters
  const deliveryRouteTimeRef = useRef(0) // Time to delivery in seconds
  const orderDeliveredSwipeStartX = useRef(0)
  const orderDeliveredSwipeStartY = useRef(0)
  const orderDeliveredIsSwiping = useRef(false)
  const orderDeliveredHoldTimerRef = useRef(null)
  const orderDeliveredHoldTriggeredRef = useRef(false)
  const orderDeliveredLastProgressRef = useRef(0)
  const orderDeliveredAutoFlowStartedRef = useRef(false)
  const orderDeliveredFlowInProgressRef = useRef(false)
  const [earningsGuaranteeIsPlaying, setEarningsGuaranteeIsPlaying] = useState(true)
  const [earningsGuaranteeAudioTime, setEarningsGuaranteeAudioTime] = useState("00:00")
  const earningsGuaranteeAudioRef = useRef(null)
  const bottomSheetRef = useRef(null)
  const handleRef = useRef(null)
  const acceptButtonRef = useRef(null)
  const swipeStartY = useRef(0)
  const isSwiping = useRef(false)
  const acceptButtonSwipeStartX = useRef(0)
  const acceptButtonSwipeStartY = useRef(0)
  const acceptButtonIsSwiping = useRef(false)
  const autoShowTimerRef = useRef(null)
  const lastPersistedActiveOrderRef = useRef("")

  useEffect(() => {
    if (!showDeliveryOtpModal) return
    const focusTimer = setTimeout(() => {
      deliveryOtpSingleInputRef.current?.focus()
    }, 120)
    return () => clearTimeout(focusTimer)
  }, [showDeliveryOtpModal])

  useEffect(() => {
    if (!activeOrderTrackingIds.length) return

    const unsubscribers = activeOrderTrackingIds.map((trackingId) =>
      subscribeOrderTracking(
        trackingId,
        (trackingData) => {
          const rawRoute = trackingData?.route_coordinates || trackingData?.polyline || null

          if (Array.isArray(rawRoute) && rawRoute.length > 1) {
            setRoutePolyline(rawRoute)
          } else if (typeof rawRoute === "string" && rawRoute.trim()) {
            const decodedRoute = decodePolyline(rawRoute)
            if (decodedRoute.length > 1) {
              setRoutePolyline(decodedRoute.map((point) => [point.lat, point.lng]))
            }
          }

          const lat = Number(trackingData?.lat || trackingData?.boy_lat)
          const lng = Number(trackingData?.lng || trackingData?.boy_lng)
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            setRiderLocation((prev) => {
              if (Array.isArray(prev) && prev[0] === lat && prev[1] === lng) {
                return prev
              }
              return [lat, lng]
            })
          }
        },
        (error) => {
          debugWarn("Firebase delivery tracking listener error:", error?.message || error)
        }
      )
    )

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === "function") unsubscribe()
      })
    }
  }, [activeOrderTrackingIds])

  useEffect(() => {
    return () => {
      if (reachedDropHoldTimerRef.current) {
        clearTimeout(reachedDropHoldTimerRef.current)
        reachedDropHoldTimerRef.current = null
      }
      if (orderDeliveredHoldTimerRef.current) {
        clearTimeout(orderDeliveredHoldTimerRef.current)
        orderDeliveredHoldTimerRef.current = null
      }
    }
  }, [])

  const {
    bookedGigs,
    currentGig,
    goOnline,
    goOffline,
    getSelectedDropLocation
  } = useGigStore()

  const getDeliveryFlowStage = useCallback(() => {
    if (showPaymentPage) return 'payment'
    if (showCustomerReviewPopup) return 'review'
    if (showOrderDeliveredAnimation) return 'order_delivered'
    if (showReachedDropPopup) return 'reached_drop'
    if (showOrderIdConfirmationPopup) return 'order_id_confirmation'
    if (showreachedPickupPopup) return 'reached_pickup'

    const orderStatus = selectedRestaurant?.orderStatus || selectedRestaurant?.status || ''
    const phase = selectedRestaurant?.deliveryPhase || selectedRestaurant?.deliveryState?.currentPhase || ''
    if (
      orderStatus === 'out_for_delivery' ||
      phase === 'en_route_to_delivery' ||
      phase === 'picked_up' ||
      phase === 'en_route_to_drop' ||
      phase === 'at_delivery'
    ) {
      return 'en_route_to_drop'
    }

    return 'en_route_to_pickup'
  }, [
    selectedRestaurant?.deliveryPhase,
    selectedRestaurant?.deliveryState?.currentPhase,
    selectedRestaurant?.orderStatus,
    selectedRestaurant?.status,
    showCustomerReviewPopup,
    showOrderDeliveredAnimation,
    showOrderIdConfirmationPopup,
    showPaymentPage,
    showReachedDropPopup,
    showreachedPickupPopup
  ])

  const getRestaurantMarkerIcon = useCallback(() => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="52" height="60" viewBox="0 0 52 60"><path fill="#FF6B35" d="M26 2c-9.94 0-18 8.06-18 18 0 13.5 18 38 18 38s18-24.5 18-38c0-9.94-8.06-18-18-18z"/><circle cx="26" cy="20" r="12" fill="#FFF7ED"/><path fill="#FF6B35" d="M20 14h2v12h-2zm10 0h2v12h-2zm-5 0h2v5h2v2h-2v5h-2v-5h-2v-2h2z"/> </svg>'

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new window.google.maps.Size(52, 60),
      anchor: new window.google.maps.Point(26, 56),
      labelOrigin: new window.google.maps.Point(26, 20)
    }
  }, [])

  const createRestaurantMapMarker = useCallback((location, title = 'Restaurant') => {
    if (!window.google?.maps || !window.deliveryMapInstance || !location) {
      return null
    }

    if (restaurantMarkerRef.current) {
      restaurantMarkerRef.current.setMap(null)
      restaurantMarkerRef.current = null
    }

    restaurantMarkerRef.current = new window.google.maps.Marker({
      position: location,
      map: window.deliveryMapInstance,
      icon: getRestaurantMarkerIcon(),
      title,
      animation: window.google.maps.Animation.DROP,
      optimized: false,
      zIndex: 1200
    })

    return restaurantMarkerRef.current
  }, [getRestaurantMarkerIcon])

  // Use same localStorage key as FeedNavbar for online status
  const LS_KEY = "app:isOnline"
  
  // Initialize online status from localStorage (same as FeedNavbar)
  const [isOnline, setIsOnline] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      const value = raw ? JSON.parse(raw) === true : false
      isOnlineRef.current = value // Initialize ref
      return value
    } catch {
      isOnlineRef.current = false
      return false
    }
  })

  // Keep ref in sync with state
  useEffect(() => {
    isOnlineRef.current = isOnline
  }, [isOnline])

  // Sync online status with localStorage changes (from FeedNavbar or other tabs)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === LS_KEY && e.newValue != null) {
        const next = JSON.parse(e.newValue) === true
        debugLog('[DeliveryHome] Storage event - online status changed:', next)
        setIsOnline(prev => {
          // Only update if different to avoid unnecessary re-renders
          if (prev !== next) {
            debugLog('[DeliveryHome] Updating isOnline state:', prev, '->', next)
            return next
          }
          return prev
        })
      }
    }

    // Listen for storage events (cross-tab sync)
    window.addEventListener('storage', handleStorageChange)
    
    // Also listen for custom events (same-tab sync from FeedNavbar)
    const handleCustomStorageChange = () => {
      try {
        const raw = localStorage.getItem(LS_KEY)
        const next = raw ? JSON.parse(raw) === true : false
        debugLog('[DeliveryHome] Custom event - online status changed:', next)
        setIsOnline(prev => {
          if (prev !== next) {
            debugLog('[DeliveryHome] Updating isOnline state from custom event:', prev, '->', next)
            return next
          }
          return prev
        })
      } catch (error) {
        debugError('[DeliveryHome] Error reading online status:', error)
      }
    }
    
    window.addEventListener('onlineStatusChanged', handleCustomStorageChange)

    // Also poll localStorage periodically to catch any missed updates (fallback)
    const pollInterval = setInterval(() => {
      try {
        const raw = localStorage.getItem(LS_KEY)
        const next = raw ? JSON.parse(raw) === true : false
        setIsOnline(prev => {
          if (prev !== next) {
            debugLog('[DeliveryHome] Polling detected change:', prev, '->', next)
            return next
          }
          return prev
        })
      } catch {}
    }, 1000) // Check every second

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('onlineStatusChanged', handleCustomStorageChange)
      clearInterval(pollInterval)
    }
  }, [])

  // Calculate today's stats
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayDateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // Get today's gig (prioritize active, then booked)
  const todayGig = bookedGigs.find(gig => gig.date === todayDateKey && gig.status === 'active') ||
    bookedGigs.find(gig => gig.date === todayDateKey && gig.status === 'booked')

  // Calculate login hours based on when gig started
  const calculateLoginHours = () => {
    if (!todayGig || todayGig.status !== 'active') return 0

    const now = new Date()
    let startTime = now

    // Use startedAt if available, otherwise use gig start time
    if (todayGig.startedAt) {
      startTime = new Date(todayGig.startedAt)
    } else if (todayGig.startTime) {
      const [hours, minutes] = todayGig.startTime.split(':').map(Number)
      startTime = new Date()
      startTime.setHours(hours, minutes, 0, 0)
      // If start time is in the future, use current time
      if (startTime > now) {
        startTime = now
      }
    }

    const diffMs = now - startTime
    const diffHours = diffMs / (1000 * 60 * 60)
    return Math.max(0, diffHours)
  }

  const loginHours = calculateLoginHours()
  const minimumHours = 2.67 // 2 hrs 40 mins = 2.67 hours
  const progressPercentage = Math.min((loginHours / minimumHours) * 100, 100)

  // Get today's progress from store
  const { getTodayProgress, getDateData, hasDateData, updateTodayProgress } = useProgressStore()
  const todayProgress = getTodayProgress()
  
  // Check if store has data for today
  const hasStoreDataForToday = hasDateData(today)
  const todayData = hasStoreDataForToday ? getDateData(today) : null

  // Calculate today's earnings (prefer store, then calculated; default to 0 so UI is not empty)
  const calculatedEarnings = calculatePeriodEarnings(walletState, 'today') || 0
  const todayEarnings = hasStoreDataForToday && todayData
    ? (todayData.earnings || calculatedEarnings)
    : calculatedEarnings

  // Calculate today's trips (prefer store, then calculated; default to 0)
  const allOrders = getAllDeliveryOrders()
  const calculatedTrips = allOrders.filter(order => {
    const orderId = order.orderId || order.id
    const orderDateKey = `delivery_order_date_${orderId}`
    const orderDateStr = localStorage.getItem(orderDateKey)
    if (!orderDateStr) return false
    const orderDate = new Date(orderDateStr)
    orderDate.setHours(0, 0, 0, 0)
    return orderDate.getTime() === today.getTime()
  }).length
  const todayTrips = hasStoreDataForToday && todayData
    ? (todayData.trips || calculatedTrips)
    : calculatedTrips

  // Calculate today's gigs count
  const todayGigsCount = bookedGigs.filter(gig => gig.date === todayDateKey).length

  // Calculate weekly earnings from wallet transactions (payment + earning_addon bonus)
  // Include both payment and earning_addon transactions in weekly earnings
  const weeklyEarnings = walletState?.transactions
    ?.filter(t => {
      // Include both payment and earning_addon transactions
      if ((t.type !== 'payment' && t.type !== 'earning_addon') || t.status !== 'Completed') return false
      const now = new Date()
      const startOfWeek = new Date(now)
      startOfWeek.setDate(now.getDate() - now.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      const transactionDate = t.date ? new Date(t.date) : (t.createdAt ? new Date(t.createdAt) : null)
      if (!transactionDate) return false
      return transactionDate >= startOfWeek && transactionDate <= now
    })
    .reduce((sum, t) => sum + (t.amount || 0), 0) || 0

  // Calculate weekly orders count from transactions
  const calculateWeeklyOrders = () => {
    if (!walletState || !walletState.transactions || !Array.isArray(walletState.transactions)) {
      return 0
    }

    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay()) // Start of week (Sunday)
    startOfWeek.setHours(0, 0, 0, 0)

    return walletState.transactions.filter(t => {
      // Count payment transactions (completed orders)
      if (t.type !== 'payment' || t.status !== 'Completed') return false
      const transactionDate = t.date ? new Date(t.date) : (t.createdAt ? new Date(t.createdAt) : null)
      if (!transactionDate) return false
      return transactionDate >= startOfWeek && transactionDate <= now
    }).length
  }

  const weeklyOrders = calculateWeeklyOrders()

  // State for active earning addon
  const [activeEarningAddon, setActiveEarningAddon] = useState(null)

  // Fetch active earning addon offers
  useEffect(() => {
    const fetchActiveEarningAddons = async () => {
      try {
        const response = await deliveryAPI.getActiveEarningAddons()
        debugLog('Active earning addons response:', response?.data)
        
        if (response?.data?.success && response?.data?.data?.activeOffers) {
          const offers = response.data.data.activeOffers
          debugLog('Active offers found:', offers)
          
          // Get the first valid active offer (prioritize isValid, then isUpcoming, then any active status)
          const activeOffer = offers.find(offer => offer.isValid) || 
                             offers.find(offer => offer.isUpcoming) ||
                             offers.find(offer => offer.status === 'active') || 
                             offers[0] || 
                             null
          
          debugLog('Selected active offer:', activeOffer)
          setActiveEarningAddon(activeOffer)
        } else {
          debugLog('No active offers found in response')
          setActiveEarningAddon(null)
        }
      } catch (error) {
        // Suppress network errors - backend might be down or endpoint not available
        if (error.code === 'ERR_NETWORK') {
          // Silently handle network errors - backend might not be running
          setActiveEarningAddon(null)
          return
        }
        
        // Skip logging timeout errors (handled by axios interceptor)
        if (error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          // Only log non-network errors
          if (error.response) {
            debugError('Error fetching active earning addons:', error.response?.data || error.message)
          }
        }
        setActiveEarningAddon(null)
      }
    }

    // Fetch immediately on mount
    fetchActiveEarningAddons()

    // Refresh every 5 seconds to get latest offers
    const refreshInterval = setInterval(() => {
      fetchActiveEarningAddons()
    }, 5000)

    // Refresh when page becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchActiveEarningAddons()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Also listen for focus events for instant refresh
    const handleFocus = () => {
      fetchActiveEarningAddons()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      clearInterval(refreshInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // Calculate bonus earnings from earning_addon transactions (only for active offer)
  const calculateBonusEarnings = () => {
    if (!activeEarningAddon || !walletState?.transactions) return 0
    
    const now = new Date()
    const startDate = activeEarningAddon.startDate ? new Date(activeEarningAddon.startDate) : null
    const endDate = activeEarningAddon.endDate ? new Date(activeEarningAddon.endDate) : null
    
    return walletState.transactions
      .filter(t => {
        // Only count earning_addon type transactions
        if (t.type !== 'earning_addon' || t.status !== 'Completed') return false
        
        // Filter by date range if offer has dates
        if (startDate || endDate) {
          const transactionDate = t.date ? new Date(t.date) : (t.createdAt ? new Date(t.createdAt) : null)
          if (!transactionDate) return false
          
          if (startDate && transactionDate < startDate) return false
          if (endDate && transactionDate > endDate) return false
        }
        
        // Check if transaction is related to current offer
        if (t.metadata?.earningAddonId) {
          return t.metadata.earningAddonId === activeEarningAddon._id?.toString() || 
                 t.metadata.earningAddonId === activeEarningAddon.id?.toString()
        }
        
        // If no metadata, include all earning_addon transactions in date range
        return true
      })
      .reduce((sum, t) => sum + (t.amount || 0), 0)
  }

  // Earnings Guarantee - Use active earning addon if available, otherwise show 0
  // When no offer is active, show 0 of 0 and ₹0
  const earningsGuaranteeTarget = activeEarningAddon?.earningAmount || 0
  const earningsGuaranteeOrdersTarget = activeEarningAddon?.requiredOrders || 0
  // Only show current orders/earnings if there's an active offer
  const earningsGuaranteeCurrentOrders = activeEarningAddon ? (activeEarningAddon.currentOrders || weeklyOrders) : 0
  // Show only bonus earnings from the offer, not total weekly earnings
  const earningsGuaranteeCurrentEarnings = activeEarningAddon ? calculateBonusEarnings() : 0
  const ordersProgress = earningsGuaranteeOrdersTarget > 0 
    ? Math.min(earningsGuaranteeCurrentOrders / earningsGuaranteeOrdersTarget, 1) 
    : 0
  const earningsProgress = earningsGuaranteeTarget > 0 
    ? Math.min(earningsGuaranteeCurrentEarnings / earningsGuaranteeTarget, 1) 
    : 0

  // Get week end date for valid till - use offer end date if available
  const getWeekEndDate = () => {
    if (activeEarningAddon?.endDate) {
      const endDate = new Date(activeEarningAddon.endDate)
      const day = endDate.getDate()
      const month = endDate.toLocaleString('en-US', { month: 'short' })
      return `${day} ${month}`
    }
    const now = new Date()
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() - now.getDay() + 6) // End of week (Saturday)
    const day = endOfWeek.getDate()
    const month = endOfWeek.toLocaleString('en-US', { month: 'short' })
    return `${day} ${month}`
  }

  const weekEndDate = getWeekEndDate()
  // Offer is live if it's valid (started) or upcoming (not started yet but active)
  const isOfferLive = activeEarningAddon?.isValid || activeEarningAddon?.isUpcoming || false

  // Calculate total hours worked today (prefer store, then calculated; default to 0)
  const calculatedHours = bookedGigs
    .filter(gig => gig.date === todayDateKey)
    .reduce((total, gig) => total + (gig.totalHours || 0), 0)
  const todayHoursWorked = hasStoreDataForToday && todayData
    ? (todayData.timeOnOrders || calculatedHours)
    : calculatedHours

  // Track last updated values to prevent infinite loops
  const lastUpdatedRef = useRef({ earnings: null, trips: null, hours: null })

  // Update progress store with calculated values when data changes (with debounce)
  useEffect(() => {
    // Only update if values have actually changed
    if (
      calculatedEarnings !== undefined && 
      calculatedTrips !== undefined && 
      calculatedHours !== undefined &&
      (
        lastUpdatedRef.current.earnings !== calculatedEarnings ||
        lastUpdatedRef.current.trips !== calculatedTrips ||
        lastUpdatedRef.current.hours !== calculatedHours
      )
    ) {
      lastUpdatedRef.current = {
        earnings: calculatedEarnings,
        trips: calculatedTrips,
        hours: calculatedHours
      }
      
      updateTodayProgress({
        earnings: calculatedEarnings,
        trips: calculatedTrips,
        timeOnOrders: calculatedHours
      })
    }
  }, [calculatedEarnings, calculatedTrips, calculatedHours, updateTodayProgress])

  // Listen for progress data updates from other components
  useEffect(() => {
    const handleProgressUpdate = () => {
      // Force re-render to show updated progress
      setAnimationKey(prev => prev + 1)
    }
    
    window.addEventListener('progressDataUpdated', handleProgressUpdate)
    return () => {
      window.removeEventListener('progressDataUpdated', handleProgressUpdate)
    }
  }, []) // Empty dependency array - only set up listener once

  const formatHours = (hours) => {
    const h = Math.floor(hours)
    const m = Math.floor((hours - h) * 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }


  // Listen for progress data updates
  useEffect(() => {
    const handleProgressUpdate = () => {
      // Force re-render to show updated progress
      setAnimationKey(prev => prev + 1)
    }

    window.addEventListener('progressDataUpdated', handleProgressUpdate)
    window.addEventListener('storage', handleProgressUpdate)

    return () => {
      window.removeEventListener('progressDataUpdated', handleProgressUpdate)
      window.removeEventListener('storage', handleProgressUpdate)
    }
  }, [])

  // Initialize Lenis
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [location.pathname, animationKey])

  // Track user interaction for autoplay policy
  useEffect(() => {
    const handleUserInteraction = () => {
      userInteractedRef.current = true
      // Remove listeners after first interaction
      document.removeEventListener('click', handleUserInteraction)
      document.removeEventListener('touchstart', handleUserInteraction)
      document.removeEventListener('keydown', handleUserInteraction)
    }
    
    // Listen for user interaction
    document.addEventListener('click', handleUserInteraction, { once: true })
    document.addEventListener('touchstart', handleUserInteraction, { once: true })
    document.addEventListener('keydown', handleUserInteraction, { once: true })
    
    return () => {
      document.removeEventListener('click', handleUserInteraction)
      document.removeEventListener('touchstart', handleUserInteraction)
      document.removeEventListener('keydown', handleUserInteraction)
    }
  }, [])

  // Play alert sound function - plays until countdown ends (30 seconds)
  const playAlertSound = async () => {
    // Only play if user has interacted with the page (browser autoplay policy)
    if (!userInteractedRef.current) {
      debugLog('🔇 Audio playback skipped - user has not interacted with page yet')
      return null
    }
    
    try {
      // Get selected alert sound preference from localStorage
      const selectedSound = localStorage.getItem('delivery_alert_sound') || 'zomato_tone'
      const soundFile = selectedSound === 'original' ? originalSound : alertSound
      
      debugLog('🔊 Playing alert sound:', {
        selectedSound,
        soundType: selectedSound === 'original' ? 'Original' : 'Zomato Tone',
        soundFile,
        originalSoundPath: originalSound,
        alertSoundPath: alertSound
      })
      
      // Verify sound file exists
      if (!soundFile) {
        debugError('❌ Sound file is undefined!', { selectedSound, soundFile })
        return null
      }
      
      // Use selected sound file from assets
      const audio = new Audio(soundFile)
      
      // Add load event listener to verify file loads
      audio.addEventListener('loadeddata', () => {
        debugLog('✅ Audio file loaded successfully:', soundFile)
      })
      
      audio.addEventListener('canplay', () => {
        debugLog('✅ Audio can play:', soundFile)
      })
      
      audio.volume = 1
      audio.loop = true // Loop the sound
      
      // Set up error handler
      audio.addEventListener('error', (e) => {
        debugError('Audio error:', e)
        debugError('Audio error details:', {
          code: audio.error?.code,
          message: audio.error?.message
        })
      })
      
      // Preload audio before playing
      audio.preload = 'auto'
      
      // Play the sound and wait for it to start
      try {
        // Wait for audio to be ready
        await new Promise((resolve, reject) => {
          audio.addEventListener('canplaythrough', resolve, { once: true })
          audio.addEventListener('error', reject, { once: true })
          audio.load()
          // Timeout after 3 seconds
          setTimeout(() => reject(new Error('Audio load timeout')), 3000)
        })
        
        const playPromise = audio.play()
        if (playPromise !== undefined) {
          await playPromise
        }
        debugLog('✅ Alert sound started playing successfully', {
          src: audio.src,
          volume: audio.volume,
          loop: audio.loop,
          readyState: audio.readyState
        })
        return audio
      } catch (playError) {
        debugError('❌ Audio play error:', {
          error: playError,
          message: playError.message,
          name: playError.name,
          soundFile,
          selectedSound,
          audioReadyState: audio.readyState,
          audioSrc: audio.src
        })
        
        // Don't log autoplay policy errors as they're expected before user interaction
        if (!playError.message?.includes('user didn\'t interact') && 
            !playError.name?.includes('NotAllowedError') &&
            !playError.message?.includes('timeout')) {
          debugError('❌ Could not play alert sound:', playError)
        }
        
        // Try to load and play again
        try {
          audio.load()
          await new Promise((resolve) => setTimeout(resolve, 100)) // Small delay
          const playPromise = audio.play()
          if (playPromise !== undefined) {
            await playPromise
          }
          debugLog('✅ Alert sound started playing after retry')
          return audio
        } catch (retryError) {
          // Don't log autoplay policy errors
          if (!retryError.message?.includes('user didn\'t interact') && 
              !retryError.name?.includes('NotAllowedError')) {
            debugError('❌ Could not play alert sound after retry:', retryError)
          }
          return null
        }
      }
    } catch (error) {
      debugError('❌ Could not create audio:', error)
      return null
    }
  }

  // Auto-show disabled - Only real orders from Socket.IO will show
  // Removed mock restaurant auto-show logic

  // Countdown timer for new order popup
  useEffect(() => {
    if (showNewOrderPopup && countdownSeconds > 0) {
      countdownTimerRef.current = setInterval(() => {
        setCountdownSeconds((prev) => {
          if (prev <= 1) {
            // Stop audio when countdown reaches 0
            if (alertAudioRef.current) {
              alertAudioRef.current.pause()
              alertAudioRef.current.currentTime = 0
              alertAudioRef.current = null
              debugLog('[NewOrder] 🔇 Audio stopped (countdown ended)')
            }
            // Auto-close when countdown reaches 0
            setShowNewOrderPopup(false)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
    }

    return () => {
      // Only clear the timer, don't stop audio here
      // Audio will be stopped by the popup close useEffect
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
    }
  }, [showNewOrderPopup, countdownSeconds])

  // Play audio when New Order popup appears (only for real orders from Socket.IO)
  useEffect(() => {
    if (showNewOrderPopup && (newOrder || selectedRestaurant)) {
      // Stop any existing audio first
      if (alertAudioRef.current) {
        alertAudioRef.current.pause()
        alertAudioRef.current.currentTime = 0
        alertAudioRef.current = null
      }

      // Play alert sound when popup appears
      const playAudio = async () => {
        try {
          // Check localStorage preference
          const currentPreference = localStorage.getItem('delivery_alert_sound') || 'zomato_tone'
          debugLog('[NewOrder] 🎵 Attempting to play audio...', {
            preference: currentPreference,
            willUse: currentPreference === 'original' ? 'original.mp3' : 'alert.mp3'
          })
          const audio = await playAlertSound()
          if (audio) {
            alertAudioRef.current = audio
            debugLog('[NewOrder] 🔊 Audio started playing, looping:', audio.loop)
            
            // Verify audio is actually playing and ensure it loops
            audio.addEventListener('playing', () => {
              debugLog('[NewOrder] ✅ Audio is now playing')
            })
            
            // Manually restart if loop doesn't work
            audio.addEventListener('ended', () => {
              debugLog('[NewOrder] 🔄 Audio ended, restarting...')
              if (showNewOrderPopup && alertAudioRef.current === audio) {
                audio.currentTime = 0
                audio.play().catch(err => {
                  debugError('[NewOrder] ❌ Failed to restart audio:', err)
                })
              }
            })
            
            audio.addEventListener('error', (e) => {
              debugError('[NewOrder] ❌ Audio error:', e)
            })
            
            // Double-check loop is enabled
            if (!audio.loop) {
              audio.loop = true
              debugLog('[NewOrder] 🔧 Loop was false, enabled it')
            }
          } else {
            debugLog('[NewOrder] ⚠️ playAlertSound returned null')
          }
        } catch (error) {
          debugError('[NewOrder] ⚠️ Audio failed to play:', error)
        }
      }
      
      // Small delay to ensure popup is fully rendered
      const timeoutId = setTimeout(() => {
        playAudio()
      }, 100)
      
      return () => {
        clearTimeout(timeoutId)
      }
    } else {
      // Stop audio when popup closes
      if (alertAudioRef.current) {
        debugLog('[NewOrder] 🔇 Stopping audio (popup closed)')
        alertAudioRef.current.pause()
        alertAudioRef.current.currentTime = 0
        alertAudioRef.current = null
      }
    }
  }, [showNewOrderPopup, selectedRestaurant])

  // Reset countdown when popup closes
  useEffect(() => {
    if (!showNewOrderPopup) {
      setCountdownSeconds(300)
    }
  }, [showNewOrderPopup])

  // Simulate audio playback for Earnings Guarantee
  useEffect(() => {
    if (earningsGuaranteeIsPlaying) {
      // Simulate audio time progression
      let time = 0
      const interval = setInterval(() => {
        time += 1
        const minutes = Math.floor(time / 60)
        const seconds = time % 60
        setEarningsGuaranteeAudioTime(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`)
        
        // Stop after 10 seconds (simulating audio length)
        if (time >= 10) {
          setEarningsGuaranteeIsPlaying(false)
          clearInterval(interval)
        }
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [earningsGuaranteeIsPlaying])

  const toggleEarningsGuaranteeAudio = () => {
    setEarningsGuaranteeIsPlaying(!earningsGuaranteeIsPlaying)
  }

  // Reject reasons for order cancellation
  const rejectReasons = [
    "Too far from current location",
    "Vehicle issue",
    "Personal emergency",
    "Weather conditions",
    "Already have too many orders",
    "Other reason"
  ]

  // Handle reject order
  const handleRejectClick = () => {
    setShowRejectPopup(true)
  }

  const handleRejectConfirm = () => {    
    if (alertAudioRef.current) {
      alertAudioRef.current.pause()
      alertAudioRef.current.currentTime = 0
    }
    setShowRejectPopup(false)
    setShowNewOrderPopup(false)
    setIsNewOrderPopupMinimized(false) // Reset minimized state
    setNewOrderDragY(0) // Reset drag position
    setRejectReason("")
    setCountdownSeconds(300)
    // Here you would typically send the rejection to your backend
    debugLog("Order rejected with reason:", rejectReason)
  }

  const handleRejectCancel = () => {
    setShowRejectPopup(false)
    setRejectReason("")
  }

  // Reset popup state on page load/refresh - ensure no popup shows on refresh
  useEffect(() => {
    // Clear any popup state on mount
    setShowNewOrderPopup(false)
    setSelectedRestaurant(null)
    setHasAutoShown(false)
    setCountdownSeconds(300)
    
    // Clear any timers
    if (autoShowTimerRef.current) {
      clearTimeout(autoShowTimerRef.current)
      autoShowTimerRef.current = null
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    
    // Stop and cleanup audio
    if (alertAudioRef.current) {
      alertAudioRef.current.pause()
      alertAudioRef.current.currentTime = 0
      alertAudioRef.current = null
    }
  }, []) // Only run on mount

  // Get rider location - App open à¤¹à¥‹à¤¤à¥‡ à¤¹à¥€ location fetch à¤•à¤°à¥‡à¤‚
  useEffect(() => {
    // First, check if we have saved location in localStorage (for refresh handling)
    const savedLocation = localStorage.getItem('deliveryBoyLastLocation')
    if (savedLocation) {
      try {
        const parsed = JSON.parse(savedLocation)
        if (parsed && Array.isArray(parsed) && parsed.length === 2) {
          const [lat, lng] = parsed
          
          // Validate saved coordinates
          if (typeof lat === 'number' && typeof lng === 'number' &&
              lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            // Check if coordinates might be swapped (common issue)
            // If lat > 90 or lng > 180, they're definitely swapped
            // If lat is in lng range (68-98 for India) and lng is in lat range (8-38), they might be swapped
            const mightBeSwapped = (lat >= 68 && lat <= 98 && lng >= 8 && lng <= 38)
            
            if (mightBeSwapped) {
              debugWarn('⚠️ Saved coordinates might be swapped - correcting:', {
                original: [lat, lng],
                corrected: [lng, lat],
                note: 'Swapping lat/lng based on India coordinate ranges'
              })
              // Swap coordinates
              const correctedLocation = [lng, lat]
              setRiderLocation(correctedLocation)
              lastLocationRef.current = correctedLocation
              routeHistoryRef.current = [{
                lat: correctedLocation[0],
                lng: correctedLocation[1]
              }]
              // Update localStorage with corrected coordinates
              localStorage.setItem('deliveryBoyLastLocation', JSON.stringify(correctedLocation))
              debugLog('✅ Corrected and saved location:', correctedLocation)
            } else {
              setRiderLocation(parsed)
              lastLocationRef.current = parsed
              routeHistoryRef.current = [{
                lat: parsed[0],
                lng: parsed[1]
              }]
              debugLog('📍 Restored location from localStorage:', {
                location: parsed,
                format: "[lat, lng]",
                validated: true
              })
            }
          } else {
            debugWarn('⚠️ Invalid saved coordinates in localStorage:', parsed)
          }
        }
      } catch (e) {
        debugWarn('⚠️ Error parsing saved location:', e)
      }
    }

    if (navigator.geolocation) {
      // Get current position first - App open à¤¹à¥‹à¤¤à¥‡ à¤¹à¥€ location à¤²à¥‡à¤‚
      debugLog('📍 Fetching current location on app open...')
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Validate coordinates
          const latitude = position.coords.latitude
          const longitude = position.coords.longitude
          const accuracy = position.coords.accuracy || 0
          
          // Validate coordinates are valid numbers
          if (typeof latitude !== 'number' || typeof longitude !== 'number' || 
              isNaN(latitude) || isNaN(longitude) ||
              latitude < -90 || latitude > 90 || 
              longitude < -180 || longitude > 180) {
            debugWarn("⚠️ Invalid coordinates received:", { latitude, longitude })
            // Don't use default location - keep trying or use saved location
            // Retry after a delay
            setTimeout(() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    const lat = pos.coords.latitude
                    const lng = pos.coords.longitude
                    if (typeof lat === 'number' && typeof lng === 'number' && 
                        !isNaN(lat) && !isNaN(lng) &&
                        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                      setRiderLocation([lat, lng])
                      lastLocationRef.current = [lat, lng]
                    }
                  },
                  (err) => debugWarn("⚠️ Retry failed:", err),
                  { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                )
              }
            }, 2000)
            return
          }
          
          // Check for coordinate swap (common issue: lat/lng swapped)
          // India coordinates: lat ~8-37, lng ~68-97
          if ((latitude > 90 || latitude < -90) || (longitude > 180 || longitude < -180)) {
            debugError("❌ Coordinates out of valid range - possible swap:", { latitude, longitude })
            // Don't use default location - retry
            setTimeout(() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    const lat = pos.coords.latitude
                    const lng = pos.coords.longitude
                    if (typeof lat === 'number' && typeof lng === 'number' && 
                        !isNaN(lat) && !isNaN(lng) &&
                        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                      setRiderLocation([lat, lng])
                      lastLocationRef.current = [lat, lng]
                    }
                  },
                  (err) => debugWarn("⚠️ Retry failed:", err),
                  { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                )
              }
            }, 2000)
            return
          }
          
          // Validate coordinates are reasonable for India (basic sanity check)
          // India: Latitude 8.4° to 37.6°, Longitude 68.7° to 97.25°
          const isInIndiaRange = latitude >= 8 && latitude <= 38 && longitude >= 68 && longitude <= 98
          if (!isInIndiaRange) {
            debugWarn("⚠️ Coordinates outside India range - might be incorrect:", { 
              latitude, 
              longitude,
              note: "India range: lat 8-38, lng 68-98"
            })
            // Still use the location but log warning
          }
          
          // Apply stable tracking filter
          const shouldAccept = shouldAcceptLocation(
            position,
            lastValidLocationRef.current,
            lastLocationTimeRef.current
          )
          
          if (!shouldAccept) {
            debugLog('🚫 Initial location rejected by filter, will wait for better GPS signal')
            return
          }
          
          const rawLocation = [latitude, longitude]
          
          // Initialize location history with first valid point
          locationHistoryRef.current = [rawLocation]
          const smoothedLocation = rawLocation // First point, no smoothing needed yet
          
          // Update refs
          lastValidLocationRef.current = smoothedLocation
          lastLocationTimeRef.current = Date.now()
          smoothedLocationRef.current = smoothedLocation
          
          let heading = position.coords.heading !== null && position.coords.heading !== undefined 
            ? position.coords.heading 
            : null
          
          // Initialize route history
          routeHistoryRef.current = [{
            lat: smoothedLocation[0],
            lng: smoothedLocation[1]
          }]
          
          // Save location to localStorage
          localStorage.setItem('deliveryBoyLastLocation', JSON.stringify(smoothedLocation))
          
          setRiderLocation(smoothedLocation)
          lastLocationRef.current = smoothedLocation
          
          // Initialize map if not already initialized (will use this location)
          if (!window.deliveryMapInstance && window.google && window.google.maps && mapContainerRef.current) {
            debugLog('📍 Map not initialized yet, will initialize with GPS location')
            // Map will be initialized in the map initialization useEffect with this location
          } else if (window.deliveryMapInstance) {
            // Map already initialized - recenter and update marker
            window.deliveryMapInstance.setCenter({ lat: smoothedLocation[0], lng: smoothedLocation[1] })
            window.deliveryMapInstance.setZoom(18)
            createOrUpdateBikeMarker(smoothedLocation[0], smoothedLocation[1], heading, !isUserPanningRef.current)
            updateRoutePolyline()
            debugLog('📍 Map recentered to GPS location')
          }
          
          debugLog("📍 Current location obtained on app open (filtered):", { 
            raw: { lat: latitude, lng: longitude },
            smoothed: { lat: smoothedLocation[0], lng: smoothedLocation[1] },
            heading,
            accuracy: `${accuracy.toFixed(0)}m`,
            isOnline: isOnlineRef.current,
            timestamp: new Date().toISOString()
          })
        },
        (error) => {
          debugWarn("⚠️ Error getting current location:", error)
          // Don't use default location - retry after delay
          // Check if we have saved location from localStorage
          const savedLoc = localStorage.getItem('deliveryBoyLastLocation')
          if (!savedLoc) {
            // No saved location, retry after 3 seconds
            setTimeout(() => {
              if (navigator.geolocation) {
                debugLog('🔄 Retrying location fetch...')
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    const lat = position.coords.latitude
                    const lng = position.coords.longitude
                    if (typeof lat === 'number' && typeof lng === 'number' && 
                        !isNaN(lat) && !isNaN(lng) &&
                        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                      const newLocation = [lat, lng]
                      setRiderLocation(newLocation)
                      lastLocationRef.current = newLocation
                      smoothedLocationRef.current = newLocation
                      lastValidLocationRef.current = newLocation
                      locationHistoryRef.current = [newLocation]
                      localStorage.setItem('deliveryBoyLastLocation', JSON.stringify(newLocation))
                      debugLog('✅ Location obtained on retry:', newLocation)
                      
                      // Recenter map if already initialized, otherwise it will initialize when location is set
                      if (window.deliveryMapInstance) {
                        window.deliveryMapInstance.setCenter({ lat, lng })
                        window.deliveryMapInstance.setZoom(18)
                        debugLog('📍 Recentered map to GPS location')
                        
                        // Update bike marker
                        if (bikeMarkerRef.current) {
                          bikeMarkerRef.current.setPosition({ lat, lng })
                        } else if (window.deliveryMapInstance) {
                          createOrUpdateBikeMarker(lat, lng, null, true)
                        }
                      }
                    }
                  },
                  (err) => {
                    debugWarn("⚠️ Retry also failed:", err)
                    // Show toast to user to enable location
                    toast.error('Location access required. Please enable location permissions.')
                  },
                  { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                )
              }
            }, 3000)
          } else {
            debugLog('📍 Using saved location from previous session')
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )

      // NOTE: watchPosition will be started/stopped based on isOnline status
      // This is handled in a separate useEffect that depends on isOnline
    } else {
      // Geolocation not available - show error
      debugError('❌ Geolocation API not available in this browser')
      toast.error('Location services not available. Please use a device with GPS.')
    }
  }, []) // Run only on mount - get initial location

  // Watch position updates - ONLY when online (Production Level Implementation)
  useEffect(() => {
    if (!navigator.geolocation) {
      return
    }

    // Clear any existing watch before starting new one
    if (watchPositionIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchPositionIdRef.current)
      watchPositionIdRef.current = null
    }

    // Keep location tracking running even when offline (bike should always show on map)
    // But only send location to backend when online (for order assignment)
    debugLog('📍 Starting live location tracking (offline/online)')

    // Watch position updates for live tracking with STABLE TRACKING SYSTEM
    const watchId = navigator.geolocation.watchPosition(
        (position) => {
          // Validate coordinates first
          const latitude = position.coords.latitude
          const longitude = position.coords.longitude
          const accuracy = position.coords.accuracy || 0
          
          // Basic validation
          if (typeof latitude !== 'number' || typeof longitude !== 'number' || 
              isNaN(latitude) || isNaN(longitude) ||
              latitude < -90 || latitude > 90 || 
              longitude < -180 || longitude > 180) {
            debugWarn("⚠️ Invalid coordinates received:", { latitude, longitude })
            return
          }
          
          // ============================================
          // STABLE TRACKING FILTERING (RAPIDO STYLE)
          // ============================================
          
          // Apply filtering: accuracy, distance jump, speed checks
          const shouldAccept = shouldAcceptLocation(
            position, 
            lastValidLocationRef.current, 
            lastLocationTimeRef.current
          )
          
          if (!shouldAccept) {
            // Location rejected by filter - keep the realtime stream alive with the last valid point.
            // This ensures admin map always shows delivery boy even with poor GPS
            if (isOnlineRef.current && lastValidLocationRef.current) {
              const now = Date.now();
              const lastSentTime = window.lastLocationSentTime || 0;
              const timeSinceLastSend = now - lastSentTime;
              
              if (timeSinceLastSend >= DELIVERY_LOCATION_FALLBACK_INTERVAL_MS) {
                const [lat, lng] = lastValidLocationRef.current;
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                  debugLog('📤 Sending fallback location to backend (filter rejected new location):', { 
                    lat, 
                    lng,
                    accuracy: accuracy.toFixed(2) + 'm',
                    timeSinceLastSend: (timeSinceLastSend / 1000).toFixed(0) + 's'
                  });
                  deliveryAPI.updateLocation(lat, lng, true, {
                    heading: typeof position.coords.heading === 'number' ? position.coords.heading : 0,
                    speed: typeof position.coords.speed === 'number' ? position.coords.speed : 0,
                    accuracy
                  })
                    .then(() => {
                      window.lastLocationSentTime = now;
                      debugLog('✅ Fallback location sent to backend successfully');
                    })
                    .catch(error => {
                      if (error.code !== 'ERR_NETWORK' && error.message !== 'Network Error') {
                        debugError('❌ Error sending fallback location:', error);
                      }
                    });
                }
              }
            }
            // Keep using last valid location
            return
          }
          
          // Location passed filter - add to history
          const rawLocation = [latitude, longitude]
          locationHistoryRef.current.push(rawLocation)
          
          // Keep only last 5 points for moving average
          if (locationHistoryRef.current.length > 5) {
            locationHistoryRef.current.shift()
          }
          
          // Apply moving average smoothing
          const smoothedLocation = smoothLocation(locationHistoryRef.current)
          
          if (!smoothedLocation) {
            // Not enough points yet, use raw location
            const newLocation = rawLocation
            lastValidLocationRef.current = newLocation
            lastLocationTimeRef.current = Date.now()
            smoothedLocationRef.current = newLocation
            
            // Initialize if first location
            if (!lastLocationRef.current) {
              setRiderLocation(newLocation)
              lastLocationRef.current = newLocation
              routeHistoryRef.current = [{
                lat: newLocation[0],
                lng: newLocation[1]
              }]
              
              // Save to localStorage
              localStorage.setItem('deliveryBoyLastLocation', JSON.stringify(newLocation))
              
              // Update marker with correct location
              if (window.deliveryMapInstance) {
                const [lat, lng] = newLocation
                debugLog('📍 Updating bike marker with first location:', { lat, lng })
                
                // Validate coordinates
                if (typeof lat === 'number' && typeof lng === 'number' &&
                    !isNaN(lat) && !isNaN(lng) &&
                    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                  if (bikeMarkerRef.current) {
                    bikeMarkerRef.current.setPosition({ lat, lng })
                    debugLog('✅ Bike marker position updated to first location')
                  } else {
                    // Create marker if it doesn't exist
                    createOrUpdateBikeMarker(lat, lng, null, true)
                    debugLog('✅ Bike marker created with first location')
                  }
                } else {
                  debugError('❌ Invalid coordinates for bike marker:', { lat, lng })
                }
              }
            }
            
            // Send raw location to backend even if not smoothed yet
            if (isOnlineRef.current) {
              const [lat, lng] = newLocation
              const now = Date.now();
              const lastSentTime = window.lastLocationSentTime || 0;
              const timeSinceLastSend = now - lastSentTime;
              
              // Push initial accepted GPS points on the same cadence as realtime socket updates.
              if (timeSinceLastSend >= DELIVERY_LOCATION_SEND_INTERVAL_MS) {
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                  debugLog('📤 Sending raw location to backend (not smoothed yet):', { lat, lng })
                  deliveryAPI.updateLocation(lat, lng, true, {
                    heading: typeof position.coords.heading === 'number' ? position.coords.heading : 0,
                    speed: typeof position.coords.speed === 'number' ? position.coords.speed : 0,
                    accuracy
                  })
                    .then(() => {
                      window.lastLocationSentTime = now;
                      window.lastSentLocation = newLocation;
                      debugLog('✅ Raw location sent to backend successfully')
                    })
                    .catch(error => {
                      if (error.code !== 'ERR_NETWORK' && error.message !== 'Network Error') {
                        debugError('❌ Error sending raw location to backend:', error);
                      }
                    });
                }
              }
            }
            
            return
          }
          
          // ============================================
          // SMOOTH MARKER ANIMATION (NO INSTANT JUMPS)
          // ============================================
          
          const [smoothedLat, smoothedLng] = smoothedLocation
          const newSmoothedLocation = { lat: smoothedLat, lng: smoothedLng }
          
          // Calculate heading
          let heading = position.coords.heading !== null && position.coords.heading !== undefined 
            ? position.coords.heading 
            : null
          
          if (heading === null && smoothedLocationRef.current) {
            const [prevLat, prevLng] = smoothedLocationRef.current
            heading = calculateHeading(prevLat, prevLng, smoothedLat, smoothedLng)
          }
          
          // Update refs
          lastValidLocationRef.current = smoothedLocation
          lastLocationTimeRef.current = Date.now()
          smoothedLocationRef.current = smoothedLocation
          
          // Update route history with smoothed location
          routeHistoryRef.current.push({
            lat: smoothedLat,
            lng: smoothedLng
          })
          if (routeHistoryRef.current.length > 1000) {
            routeHistoryRef.current.shift()
          }
          
          // Save smoothed location to localStorage
          localStorage.setItem('deliveryBoyLastLocation', JSON.stringify(smoothedLocation))
          
          // Update live tracking polyline for any active route (pickup or delivery)
          const currentDirectionsResponse = directionsResponseRef.current;
          if (currentDirectionsResponse && currentDirectionsResponse.routes && currentDirectionsResponse.routes.length > 0) {
            updateLiveTrackingPolyline(currentDirectionsResponse, smoothedLocation);
          }
          
          // ============================================
          // SMOOTH MARKER ANIMATION (1-2 seconds)
          // ============================================
          
          // Update state with smoothed location FIRST
          setRiderLocation(smoothedLocation)
          lastLocationRef.current = smoothedLocation
          
          // Always update bike marker with latest smoothed location
          if (window.deliveryMapInstance) {
            if (bikeMarkerRef.current) {
              // Marker exists - animate smoothly to new position
              animateMarkerSmoothly(bikeMarkerRef.current, newSmoothedLocation, 1500, markerAnimationRef)
            } else {
              // Marker doesn't exist yet, create it immediately with correct location
              debugLog('📍 Creating bike marker with smoothed location:', { lat: smoothedLat, lng: smoothedLng })
              createOrUpdateBikeMarker(smoothedLat, smoothedLng, heading, !isUserPanningRef.current)
            }
          }
          
          // Update route polyline
          updateRoutePolyline()
          
          debugLog("📍 Live location updated (smoothed):", { 
            raw: { lat: latitude, lng: longitude },
            smoothed: { lat: smoothedLat, lng: smoothedLng },
            heading,
            accuracy: `${accuracy.toFixed(0)}m`,
            isOnline: isOnlineRef.current,
            timestamp: new Date().toISOString()
          })
          
          // Send smoothed location to backend on the realtime cadence used for socket updates.
          if (isOnlineRef.current && smoothedLocation) {
            const now = Date.now();
            const lastSentTime = window.lastLocationSentTime || 0;
            const timeSinceLastSend = now - lastSentTime;
            
            // Use smoothed location for backend (not raw GPS) - already declared above
            
            // Simple distance check using Haversine formula
            const calculateDistance = (lat1, lng1, lat2, lng2) => {
              const R = 6371; // Earth's radius in km
              const dLat = (lat2 - lat1) * Math.PI / 180;
              const dLng = (lng2 - lng1) * Math.PI / 180;
              const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              return R * c;
            };
            
            // Get last sent location for distance check
            const lastSentLocation = window.lastSentLocation || null;
            
            const shouldSend = timeSinceLastSend >= DELIVERY_LOCATION_SEND_INTERVAL_MS || 
              (lastSentLocation && 
               calculateDistance(lastSentLocation[0], lastSentLocation[1], smoothedLat, smoothedLng) > 0.001);
            
            if (shouldSend) {
              // Final validation before sending to backend
              // Ensure coordinates are in correct format [lat, lng] and within valid ranges
              if (smoothedLat >= -90 && smoothedLat <= 90 && smoothedLng >= -180 && smoothedLng <= 180) {
                debugLog('📤 Sending smoothed location to backend:', { 
                  smoothed: { lat: smoothedLat, lng: smoothedLng },
                  raw: { lat: latitude, lng: longitude },
                  accuracy: `${accuracy.toFixed(0)}m`,
                  timeSinceLastSend: `${(timeSinceLastSend / 1000).toFixed(1)}s`
                });
                
                deliveryAPI.updateLocation(smoothedLat, smoothedLng, true, {
                  heading: typeof heading === 'number' ? heading : 0,
                  speed: typeof position.coords.speed === 'number' ? position.coords.speed : 0,
                  accuracy
                })
                  .then(() => {
                    window.lastLocationSentTime = now;
                    window.lastSentLocation = smoothedLocation; // Store last sent location
                    debugLog('✅ Smoothed location sent to backend successfully:', { 
                      latitude: smoothedLat, 
                      longitude: smoothedLng,
                      format: "lat, lng (correct order)",
                      accuracy: `${accuracy.toFixed(0)}m`
                    });
                  })
                  .catch(error => {
                    // Only log non-network errors (backend might be down, which is expected in dev)
                    if (error.code !== 'ERR_NETWORK' && error.message !== 'Network Error') {
                      debugError('❌ Error sending location to backend:', error);
                    } else {
                      // Silently handle network errors - backend might not be running
                      // Socket.IO will handle reconnection automatically
                    }
                  });
              } else {
                debugError('❌ Invalid smoothed coordinates - not sending to backend:', { 
                  smoothedLat, 
                  smoothedLng,
                  raw: { latitude, longitude }
                });
              }
            }
          }
        },
        (error) => {
          debugWarn("⚠️ Error watching location:", error)
        },
        { 
          enableHighAccuracy: true, 
          maximumAge: 0, // Always use fresh location
          timeout: 10000
        }
      )

      watchPositionIdRef.current = watchId

      // Show bike marker immediately if we have last known location and map is ready
      if (window.deliveryMapInstance && lastLocationRef.current && lastLocationRef.current.length === 2) {
        const [lat, lng] = lastLocationRef.current
        // Get heading from route history if available
        let heading = null
        if (routeHistoryRef.current.length > 1) {
          const prev = routeHistoryRef.current[routeHistoryRef.current.length - 2]
          heading = calculateHeading(prev.lat, prev.lng, lat, lng)
        }
        createOrUpdateBikeMarker(lat, lng, heading, !isUserPanningRef.current)
      }

      return () => {
        if (watchPositionIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchPositionIdRef.current)
          watchPositionIdRef.current = null
        }
      }
  }, [isOnline]) // Re-run when online status changes - this controls start/stop of tracking

  // WebView-safe touch extractor: Flutter InAppWebView may emit inconsistent touchend payloads.
  const getTouchPoint = (e) => {
    const touch = e?.touches?.[0] || e?.changedTouches?.[0]
    if (!touch) return null
    return { x: touch.clientX, y: touch.clientY }
  }

  // Handle new order popup accept button swipe
  const handleNewOrderAcceptTouchStart = (e) => {
    if (isAcceptingNewOrderRef.current) return
    const touch = getTouchPoint(e)
    if (!touch) return
    newOrderAcceptButtonSwipeStartX.current = touch.x
    newOrderAcceptButtonSwipeStartY.current = touch.y
    newOrderAcceptButtonIsSwiping.current = false
    setNewOrderIsAnimatingToComplete(false)
    setNewOrderAcceptButtonProgress(0)
  }

  const handleNewOrderAcceptTouchMove = (e) => {
    if (isAcceptingNewOrderRef.current) return
    const touch = getTouchPoint(e)
    if (!touch) return
    const deltaX = touch.x - newOrderAcceptButtonSwipeStartX.current
    const deltaY = touch.y - newOrderAcceptButtonSwipeStartY.current

    // Only handle horizontal swipes (swipe right)
    if (Math.abs(deltaX) > 5 && Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
      newOrderAcceptButtonIsSwiping.current = true
      // Don't call preventDefault - CSS touch-action handles scrolling prevention
      // safePreventDefault(e) // Removed to avoid passive listener error

      // Calculate max swipe distance
      const buttonWidth = newOrderAcceptButtonRef.current?.offsetWidth || 300
      const circleWidth = 56 // w-14 = 56px
      const padding = 16 // px-4 = 16px
      const maxSwipe = buttonWidth - circleWidth - (padding * 2)

      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1)
      setNewOrderAcceptButtonProgress(progress)
    }
  }

  const handleNewOrderAcceptTouchEnd = (e) => {
    if (isAcceptingNewOrderRef.current) return

    const touch = getTouchPoint(e)
    const deltaX = (touch?.x || newOrderAcceptButtonSwipeStartX.current) - newOrderAcceptButtonSwipeStartX.current
    if (!newOrderAcceptButtonIsSwiping.current && deltaX > 30) {
      newOrderAcceptButtonIsSwiping.current = true
    }

    if (!newOrderAcceptButtonIsSwiping.current) {
      setNewOrderAcceptButtonProgress(0)
      return
    }

    const buttonWidth = newOrderAcceptButtonRef.current?.offsetWidth || 300
    const circleWidth = 56
    const padding = 16
    const maxSwipe = buttonWidth - circleWidth - (padding * 2)
    const threshold = maxSwipe * 0.55 // smoother acceptance

    if (deltaX > threshold) {
      isAcceptingNewOrderRef.current = true
      setIsAcceptingNewOrder(true)
      // Stop audio immediately when user accepts
      if (alertAudioRef.current) {
        alertAudioRef.current.pause()
        alertAudioRef.current.currentTime = 0
        alertAudioRef.current = null
        debugLog('[NewOrder] 🔇 Audio stopped (order accepted)')
      }

      // Animate to completion
      setNewOrderIsAnimatingToComplete(true)
      setNewOrderAcceptButtonProgress(1)

      // Accept order via backend API and get route
      const acceptOrderAndShowRoute = async () => {
        // Resolve order ID from all known payload variants.
        const orderId =
          selectedRestaurant?.id ||
          selectedRestaurant?.orderId ||
          newOrder?.orderMongoId ||
          newOrder?.mongoId ||
          newOrder?.id ||
          newOrder?._id ||
          newOrder?.orderId
        
        debugLog('🔍 Order ID lookup:', {
          selectedRestaurantId: selectedRestaurant?.id,
          newOrderMongoId: newOrder?.orderMongoId,
          newOrderId: newOrder?.orderId,
          finalOrderId: orderId
        })
        
        if (!orderId) {
          debugError('❌ No order ID found to accept')
          toast.error('Order ID not found. Please try again.')
          setNewOrderAcceptButtonProgress(0)
          setNewOrderIsAnimatingToComplete(false)
          return
        }

        // Declare currentLocation in outer scope so it's accessible in catch block
        let currentLocation = null
        
        try {
          // Get current LIVE location (prioritize riderLocation which is updated in real-time)
          currentLocation = riderLocation
          
          // If riderLocation is not available, try to get from lastLocationRef
          if (!currentLocation || currentLocation.length !== 2) {
            currentLocation = lastLocationRef.current
          }
          
          // If still not available, try to get current position
          if (!currentLocation || currentLocation.length !== 2) {
            try {
              const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                  (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
                  reject,
                  { timeout: 5000, enableHighAccuracy: true }
                )
              })
              currentLocation = position
              debugLog('📍 Got fresh location from geolocation API')
            } catch (geoError) {
              debugError('❌ Could not get current location:', geoError)
              toast.error('Location not available. Please enable location services.')
              // Ensure currentLocation is set to null before returning
              currentLocation = null
              return
            }
          }
          
          // Validate currentLocation before proceeding
          if (!currentLocation || currentLocation.length !== 2) {
            debugError('❌ No valid location available')
            toast.error('Location not available. Please enable location services.')
            return
          }

          debugLog('📦 Accepting order:', orderId)
          debugLog('📍 Current LIVE location:', currentLocation)
          debugLog('📋 Order details:', {
            orderId: orderId,
            restaurantName: selectedRestaurant?.name || newOrder?.restaurantName,
            orderStatus: newOrder?.status
          })

          // Call backend API to accept order
          // Backend expects currentLat and currentLng
          const response = await deliveryAPI.acceptOrder(orderId, {
            // Backend expects currentLat/currentLng for acceptance validations.
            currentLat: currentLocation[0],
            currentLng: currentLocation[1],
            // Keep legacy keys for compatibility with any older handler.
            lat: currentLocation[0],
            lng: currentLocation[1]
          })
          
          debugLog('📡 API Response:', response.data)

          if (response.data?.success && response.data.data) {
            // Stop audio immediately when order is successfully accepted
            if (alertAudioRef.current) {
              alertAudioRef.current.pause()
              alertAudioRef.current.currentTime = 0
              alertAudioRef.current = null
              debugLog('[NewOrder] 🔇 Audio stopped (order accepted successfully)')
            }
            
            const orderData = response.data.data
            const order = orderData.order || orderData // Backend returns { order, route }
            const routeData = response.data.data.route

            debugLog('✅ Order accepted successfully')
            debugLog('📍 Route data:', routeData)
            debugLog('📋 Full order data from backend:', JSON.stringify(order, null, 2))
            debugLog('🏪 Restaurant name from backend:', {
              restaurantName: order.restaurantName,
              restaurantIdName: order.restaurantId?.name,
              restaurantIdType: typeof order.restaurantId,
              restaurantId: order.restaurantId
            })

            // Update selectedRestaurant with correct data from backend
            let restaurantInfo = null;
            if (order) {
              // Extract restaurant location (GeoJSON format: [longitude, latitude])
              const restaurantCoords = order.restaurantId?.location?.coordinates || []
              const restaurantLat = restaurantCoords[1] // Latitude is second element
              const restaurantLng = restaurantCoords[0] // Longitude is first element
              
              // Format restaurant address - check multiple possible locations
              let restaurantAddress = 'Restaurant Address'
              const restaurantLocation = order.restaurantId?.location
              
              // Debug: Log order structure to understand data format
              debugLog('🔍 Order structure for address extraction:', {
                hasRestaurantId: !!order.restaurantId,
                restaurantIdType: typeof order.restaurantId,
                restaurantIdKeys: order.restaurantId ? Object.keys(order.restaurantId) : [],
                hasLocation: !!restaurantLocation,
                locationKeys: restaurantLocation ? Object.keys(restaurantLocation) : [],
                restaurantIdAddress: order.restaurantId?.address,
                locationFormattedAddress: restaurantLocation?.formattedAddress,
                locationAddress: restaurantLocation?.address,
                locationStreet: restaurantLocation?.street,
                orderRestaurantAddress: order.restaurantAddress
              })
              
              // Priority 1: Direct address fields on restaurantId
              if (order.restaurantId?.address) {
                restaurantAddress = order.restaurantId.address
                debugLog('✅ Using restaurantId.address:', restaurantAddress)
              }
              // Priority 2: formattedAddress from location
              else if (restaurantLocation?.formattedAddress) {
                restaurantAddress = restaurantLocation.formattedAddress
                debugLog('✅ Using location.formattedAddress:', restaurantAddress)
              }
              // Priority 3: address from location
              else if (restaurantLocation?.address) {
                restaurantAddress = restaurantLocation.address
                debugLog('✅ Using location.address:', restaurantAddress)
              }
              // Priority 4: Build from addressLine1 (with zone and pin code)
              else if (restaurantLocation?.addressLine1) {
                const addressParts = [
                  restaurantLocation.addressLine1,
                  restaurantLocation.addressLine2,
                  restaurantLocation.area, // Zone
                  restaurantLocation.city,
                  restaurantLocation.state,
                  restaurantLocation.pincode || restaurantLocation.zipCode || restaurantLocation.postalCode
                ].filter(Boolean)
                restaurantAddress = addressParts.join(', ')
                debugLog('✅ Built address from addressLine1 with zone and pin:', restaurantAddress)
              }
              // Priority 5: Build from street components (with zone and pin code)
              else if (restaurantLocation?.street) {
                const addressParts = [
                  restaurantLocation.street,
                  restaurantLocation.area, // Zone
                  restaurantLocation.city,
                  restaurantLocation.state,
                  restaurantLocation.pincode || restaurantLocation.zipCode || restaurantLocation.postalCode
                ].filter(Boolean)
                restaurantAddress = addressParts.join(', ')
                debugLog('✅ Built address from street components with zone and pin:', restaurantAddress)
              }
              // Priority 6: Check restaurantId directly for address fields
              else if (order.restaurantId?.street || order.restaurantId?.city) {
                const addressParts = [
                  order.restaurantId.street,
                  order.restaurantId.area,
                  order.restaurantId.city,
                  order.restaurantId.state,
                  order.restaurantId.zipCode || order.restaurantId.pincode || order.restaurantId.postalCode
                ].filter(Boolean)
                restaurantAddress = addressParts.join(', ')
                debugLog('✅ Built address from restaurantId fields:', restaurantAddress)
              }
              // Priority 7: Check order.restaurantAddress (if exists)
              else if (order.restaurantAddress) {
                restaurantAddress = order.restaurantAddress
                debugLog('✅ Using order.restaurantAddress:', restaurantAddress)
              }
              // Priority 8: Use coordinates if address not available
              else if (restaurantLat && restaurantLng) {
                restaurantAddress = `${restaurantLat}, ${restaurantLng}`
                debugLog('⚠️ Using coordinates as address:', restaurantAddress)
              } else {
                debugWarn('⚠️ Restaurant address not found in order, will try to fetch from restaurant API')
                // Try to fetch restaurant address by ID if available
                const restaurantId = order.restaurantId
                if (restaurantId) {
                  // Handle both string and object restaurantId
                  const restaurantIdString = typeof restaurantId === 'string' 
                    ? restaurantId 
                    : (restaurantId._id || restaurantId.id || restaurantId.toString())
                  
                  if (restaurantIdString) {
                    try {
                      debugLog('🔄 Fetching restaurant address by ID:', restaurantIdString)
                      const restaurantResponse = await restaurantAPI.getRestaurantById(restaurantIdString)
                      if (restaurantResponse.data?.success && restaurantResponse.data.data) {
                        const restaurant = restaurantResponse.data.data.restaurant || restaurantResponse.data.data
                        const restLocation = restaurant.location
                        debugLog('✅ Fetched restaurant data:', { restaurant, restLocation })
                        
                        // Priority: location.formattedAddress (this is what user wants)
                        if (restLocation?.formattedAddress) {
                          restaurantAddress = restLocation.formattedAddress
                          debugLog('✅ Fetched restaurant.location.formattedAddress:', restaurantAddress)
                        } else if (restaurant.address) {
                          restaurantAddress = restaurant.address
                          debugLog('✅ Fetched restaurant.address:', restaurantAddress)
                        } else if (restLocation?.address) {
                          restaurantAddress = restLocation.address
                          debugLog('✅ Fetched restaurant.location.address:', restaurantAddress)
                        } else if (restLocation?.addressLine1) {
                          const addressParts = [
                            restLocation.addressLine1,
                            restLocation.addressLine2,
                            restLocation.area, // Zone
                            restLocation.city,
                            restLocation.state,
                            restLocation.pincode || restLocation.zipCode || restLocation.postalCode
                          ].filter(Boolean)
                          restaurantAddress = addressParts.join(', ')
                          debugLog('✅ Built address from restaurant location addressLine1 with zone and pin:', restaurantAddress)
                        } else if (restLocation?.street) {
                          const addressParts = [
                            restLocation.street,
                            restLocation.area, // Zone
                            restLocation.city,
                            restLocation.state,
                            restLocation.pincode || restLocation.zipCode || restLocation.postalCode
                          ].filter(Boolean)
                          restaurantAddress = addressParts.join(', ')
                          debugLog('✅ Built address from restaurant location components with zone and pin:', restaurantAddress)
                        }
                      }
                    } catch (restaurantError) {
                      debugError('❌ Error fetching restaurant address:', restaurantError)
                    }
                  }
                }
                
                if (restaurantAddress === 'Restaurant Address') {
                  debugWarn('⚠️ Restaurant address not found in any location, using default')
                }
              }
              
              // Extract restaurant name - priority: restaurantName field > restaurantId.name > fallback
              // Backend returns restaurantName as a direct field on order, and restaurantId is populated with name
              let restaurantName = null
              
              // Priority 1: Direct restaurantName field from order (stored in Order model)
              if (order.restaurantName && typeof order.restaurantName === 'string' && order.restaurantName.trim()) {
                restaurantName = order.restaurantName.trim()
                debugLog('✅ Using restaurantName from order:', restaurantName)
              } 
              // Priority 2: Name from populated restaurantId object
              else if (order.restaurantId && typeof order.restaurantId === 'object' && order.restaurantId.name) {
                restaurantName = order.restaurantId.name.trim()
                debugLog('✅ Using restaurantId.name:', restaurantName)
              }
              // Priority 3: Fallback to existing selectedRestaurant name
              else if (selectedRestaurant?.name) {
                restaurantName = selectedRestaurant.name
                debugWarn('⚠️ Restaurant name not found in order, using selectedRestaurant.name:', restaurantName)
              }
              // Final fallback
              else {
                restaurantName = 'Restaurant'
                debugError('❌ Restaurant name not found anywhere, using default:', restaurantName)
              }
              
              debugLog('🏪 Final extracted restaurant name:', restaurantName)
              
              // Extract earnings from backend response
              const backendEarnings = orderData.estimatedEarnings || response.data.data.estimatedEarnings;
              const earningsValue = backendEarnings 
                ? (typeof backendEarnings === 'object' ? backendEarnings.totalEarning : backendEarnings)
                : (selectedRestaurant?.estimatedEarnings || 0);
              
              debugLog('💰 Earnings from backend:', {
                backendEarnings,
                earningsValue,
                orderDataEarnings: orderData.estimatedEarnings,
                responseEarnings: response.data.data.estimatedEarnings
              });

              restaurantInfo = {
                id: order._id || order.orderId,
                orderId: order.orderId, // Correct order ID from backend
                name: restaurantName, // Restaurant name from backend (priority: restaurantName > restaurantId.name)
                address: restaurantAddress, // Restaurant address from backend
                lat: restaurantLat || selectedRestaurant?.lat,
                lng: restaurantLng || selectedRestaurant?.lng,
                distance: selectedRestaurant?.distance || '0 km',
                timeAway: selectedRestaurant?.timeAway || '0 mins',
                dropDistance: selectedRestaurant?.dropDistance || '0 km',
                pickupDistance: selectedRestaurant?.pickupDistance || '0 km',
                estimatedEarnings: backendEarnings || selectedRestaurant?.estimatedEarnings || 0,
                amount: earningsValue, // Also set amount for compatibility
                customerName: order.userId?.name || selectedRestaurant?.customerName,
                customerPhone: order.userId?.phone || selectedRestaurant?.customerPhone || null,
                customerAddress: order.address?.formattedAddress || 
                                (order.address?.street ? `${order.address.street}, ${order.address.city || ''}, ${order.address.state || ''}`.trim() : '') ||
                                selectedRestaurant?.customerAddress,
                customerLat: order.address?.location?.coordinates?.[1],
                customerLng: order.address?.location?.coordinates?.[0],
                items: order.items || [],
                total: order.pricing?.total || 0,
                paymentMethod: order.paymentMethod || order.payment?.method || 'razorpay', // backend-resolved first (COD vs Online)
                deliveryVerification: order.deliveryVerification || null,
                phone: order.restaurantId?.phone || order.restaurantId?.ownerPhone || null, // Restaurant phone number (prefer phone, fallback to ownerPhone)
                ownerPhone: order.restaurantId?.ownerPhone || null, // Owner phone number (separate field for direct access)
                orderStatus: order.status || 'preparing', // Store order status (pending, preparing, ready, out_for_delivery, delivered)
                deliveryState: {
                  ...(order.deliveryState || {}),
                  currentPhase: 'en_route_to_pickup', // CRITICAL: Set to en_route_to_pickup after order acceptance
                  status: 'accepted' // Set status to accepted
                }, // Store delivery state (currentPhase, status, etc.)
                deliveryPhase: 'en_route_to_pickup' // CRITICAL: Set to en_route_to_pickup after order acceptance so Reached Pickup popup can show
              }
              
              debugLog('🏪 Updated restaurant info from backend:', restaurantInfo)
              // Update state immediately
              setSelectedRestaurant(restaurantInfo)
            }

            // Ensure we have restaurantInfo before proceeding
            if (!restaurantInfo) {
              debugError('❌ Restaurant info not available, cannot proceed');
              return;
            }

            let routeCoordinates = null;
            let directionsResultForMap = null; // Store directions result for main map rendering

            // Use route from backend if available (for fallback/polyline)
            if (routeData && routeData.coordinates && routeData.coordinates.length > 0) {
              // Backend returns coordinates as [[lat, lng], ...]
              routeCoordinates = routeData.coordinates;
              setRoutePolyline(routeCoordinates);
              debugLog('✅ Route set from backend:', routeCoordinates.length, 'points');
            }
            
            // Calculate route using Google Maps Directions API (Zomato-style road-based routing)
            // Use LIVE location from delivery boy to restaurant
            // Use restaurantInfo directly (not selectedRestaurant) since state update is async
            if (restaurantInfo && restaurantInfo.lat && restaurantInfo.lng && currentLocation) {
              debugLog('🗺️ Calculating route with Google Maps Directions API...');
              debugLog('📍 From (Delivery Boy Live Location):', currentLocation);
              debugLog('📍 To (Restaurant):', { lat: restaurantInfo.lat, lng: restaurantInfo.lng });
              
              try {
                // Calculate route immediately with current live location
                const directionsResult = await calculateRouteWithDirectionsAPI(
                  currentLocation, // Delivery boy's current live location
                  { lat: restaurantInfo.lat, lng: restaurantInfo.lng } // Restaurant location
                );
                
                if (directionsResult) {
                  debugLog('✅ Route calculated with Directions API from live location');
                  debugLog('📍 Route distance:', directionsResult.routes[0]?.legs[0]?.distance?.text);
                  debugLog('📍 Route duration:', directionsResult.routes[0]?.legs[0]?.duration?.text);
                  
                  // Store pickup route distance and time
                  const pickupDistance = directionsResult.routes[0]?.legs[0]?.distance?.value || 0; // in meters
                  const pickupDuration = directionsResult.routes[0]?.legs[0]?.duration?.value || 0; // in seconds
                  pickupRouteDistanceRef.current = pickupDistance;
                  pickupRouteTimeRef.current = pickupDuration;
                  debugLog('📊 Pickup route stored:', { distance: pickupDistance, duration: pickupDuration });
                  
                  // Store directions result for rendering on main map
                  setDirectionsResponse(directionsResult);
                  directionsResponseRef.current = directionsResult; // Store in ref for callbacks
                  directionsResultForMap = directionsResult; // Store for use in setTimeout
                  
                  // Initialize live tracking polyline with full route (Delivery Boy → Restaurant)
                  if (currentLocation) {
                    // Ensure map is ready before updating polyline
                    if (window.deliveryMapInstance) {
                      updateLiveTrackingPolyline(directionsResult, currentLocation);
                      debugLog('✅ Live tracking polyline initialized for pickup route');
                    } else {
                      // Wait for map to be ready
                      setTimeout(() => {
                        if (window.deliveryMapInstance && currentLocation) {
                          updateLiveTrackingPolyline(directionsResult, currentLocation);
                          debugLog('✅ Live tracking polyline initialized for pickup route (delayed)');
                        }
                      }, 500);
                    }
                  }
                  
                  debugLog('✅ Route to restaurant initialized - polyline will update as delivery boy moves');
                } else {
                  // Fallback: Use backend route or OSRM
                  debugLog('⚠️ Directions API failed, using fallback...');
                  if (!routeCoordinates || routeCoordinates.length === 0) {
                    try {
                      const url = `https://router.project-osrm.org/route/v1/driving/${currentLocation[1]},${currentLocation[0]};${restaurantInfo.lng},${restaurantInfo.lat}?overview=full&geometries=geojson`;
                      const osrmResponse = await fetch(url);
                      const osrmData = await osrmResponse.json();
                      
                      if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
                        routeCoordinates = osrmData.routes[0].geometry.coordinates.map((coord) => [coord[1], coord[0]]);
                        setRoutePolyline(routeCoordinates);
                        debugLog('✅ Route calculated with OSRM:', routeCoordinates.length, 'points');
                      } else {
                        // Final fallback: straight line
                        routeCoordinates = [currentLocation, [restaurantInfo.lat, restaurantInfo.lng]];
                        setRoutePolyline(routeCoordinates);
                        debugLog('⚠️ Using straight line as fallback');
                      }
                    } catch (osrmError) {
                      debugError('❌ Error calculating route with OSRM:', osrmError);
                      // Final fallback: straight line
                      routeCoordinates = [currentLocation, [restaurantInfo.lat, restaurantInfo.lng]];
                      setRoutePolyline(routeCoordinates);
                    }
                  }
                }
              } catch (directionsError) {
                // Handle REQUEST_DENIED gracefully (billing/API key issue)
                if (directionsError.message?.includes('REQUEST_DENIED') || directionsError.message?.includes('not available')) {
                  debugWarn('⚠️ Google Maps Directions API not available (billing/API key issue). Using fallback route.');
                } else {
                  debugError('❌ Error calculating route with Directions API:', directionsError);
                }
                
                // Fallback to OSRM or straight line
                if (!routeCoordinates || routeCoordinates.length === 0) {
                  try {
                    // Try OSRM first
                    const url = `https://router.project-osrm.org/route/v1/driving/${currentLocation[1]},${currentLocation[0]};${restaurantInfo.lng},${restaurantInfo.lat}?overview=full&geometries=geojson`;
                    const osrmResponse = await fetch(url);
                    const osrmData = await osrmResponse.json();
                    
                    if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
                      routeCoordinates = osrmData.routes[0].geometry.coordinates.map((coord) => [coord[1], coord[0]]);
                      setRoutePolyline(routeCoordinates);
                      debugLog('✅ Route calculated with OSRM fallback:', routeCoordinates.length, 'points');
                    } else {
                      // Final fallback: straight line
                      routeCoordinates = [currentLocation, [restaurantInfo.lat, restaurantInfo.lng]];
                      setRoutePolyline(routeCoordinates);
                      debugLog('⚠️ Using straight line as final fallback');
                    }
                  } catch (osrmError) {
                    debugWarn('⚠️ OSRM fallback failed, using straight line');
                    // Final fallback: straight line
                    routeCoordinates = [currentLocation, [restaurantInfo.lat, restaurantInfo.lng]];
                    setRoutePolyline(routeCoordinates);
                  }
                }
              }
            } else {
              debugError('❌ Cannot calculate route: missing restaurant info or location', {
                restaurantInfo: !!restaurantInfo,
                restaurantLat: restaurantInfo?.lat,
                restaurantLng: restaurantInfo?.lng,
                currentLocation: !!currentLocation
              });
            }

            // Close popup and show route on main map (not full-screen directions map)
            setShowNewOrderPopup(false);
            // CRITICAL: Clear newOrder notification immediately to prevent duplicate notifications
            const acceptedOrderId = restaurantInfo.id || restaurantInfo.orderId || newOrder?.orderMongoId || newOrder?.orderId;
            if (acceptedOrderId) {
              acceptedOrderIdsRef.current.add(acceptedOrderId);
              debugLog('✅ Added order to accepted list:', acceptedOrderId);
            }
            clearNewOrder();
            
            // Ensure route path is visible
            setShowRoutePath(true);
            
            // Reached Pickup should open only after the rider is actually near the restaurant.
            setShowDirectionsMap(false);
            
            // Show route on main map instead of opening full-screen directions map
            setTimeout(() => {
              debugLog('✅ Showing route on main map from live location to restaurant');
              debugLog('📍 Flow: Order Accepted → Route to Restaurant → 500m Detection → Reached Pickup → Order ID → Route to Customer → 500m Detection → Reached Drop → Delivered → Review → Payment');
              
              // Show route on main map using DirectionsRenderer or polyline
              if (window.deliveryMapInstance && restaurantInfo) {
                // Use DirectionsRenderer on main map if we have directions result
                // Use directionsResponse state (which was set above) instead of local variable
                const directionsResult = directionsResultForMap || (directionsResponse && directionsResponse.routes && directionsResponse.routes.length > 0 ? directionsResponse : null);
                
                if (directionsResult && directionsResult.routes && directionsResult.routes.length > 0) {
                  debugLog('🗺️ Setting up DirectionsRenderer on main map with route:', directionsResult);
                  
                  // Initialize DirectionsRenderer for main map if not exists
                  // Don't create DirectionsRenderer - it adds dots
                  // We'll extract route path and use custom polyline instead
                  if (!directionsRendererRef.current) {
                    // Create DirectionsRenderer but don't set it on map (only for extracting route data)
                    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
                      suppressMarkers: true,
                      suppressInfoWindows: false,
                      polylineOptions: {
                        strokeColor: '#4285F4',
                        strokeWeight: 0,
                        strokeOpacity: 0,
                        zIndex: -1,
                        icons: []
                      },
                      preserveViewport: true
                    });
                    // Explicitly don't set map - we use custom polyline instead
                    debugLog('✅ DirectionsRenderer created (not on map - using custom polyline)');
                  }
                  
                  // Extract route path directly from directionsResult (don't use DirectionsRenderer - it adds dots)
                  try {
                    // Validate directionsResult is a valid DirectionsResult object
                    if (!directionsResult || typeof directionsResult !== 'object' || !directionsResult.routes || !Array.isArray(directionsResult.routes) || directionsResult.routes.length === 0) {
                      debugError('❌ Invalid directionsResult:', directionsResult);
                      return;
                    }

                    // Validate it's a Google Maps DirectionsResult (has request and legs)
                    if (!directionsResult.request || !directionsResult.routes[0]?.legs || !Array.isArray(directionsResult.routes[0].legs)) {
                      debugError('❌ directionsResult is not a valid Google Maps DirectionsResult');
                      return;
                    }

                    debugLog('📍 Route details:', {
                      routes: directionsResult.routes?.length || 0,
                      legs: directionsResult.routes?.[0]?.legs?.length || 0,
                      distance: directionsResult.routes?.[0]?.legs?.[0]?.distance?.text,
                      duration: directionsResult.routes?.[0]?.legs?.[0]?.duration?.text
                    });
                    
                    // Don't create main route polyline - only live tracking polyline will be shown
                    // Remove old custom polyline if exists (cleanup)
                    try {
                      if (routePolylineRef.current) {
                        routePolylineRef.current.setMap(null);
                        routePolylineRef.current = null;
                      }
                      
                      // Completely remove DirectionsRenderer from map to prevent any dots/icons
                      if (directionsRendererRef.current) {
                        directionsRendererRef.current.setMap(null);
                      }
                    } catch (e) {
                      debugWarn('⚠️ Error cleaning up polyline:', e);
                    }
                    
                    // Fit bounds to show entire route - but preserve zoom if user has zoomed in
                    const bounds = directionsResult.routes[0].bounds;
                    if (bounds) {
                      const currentZoom = window.deliveryMapInstance.getZoom();
                      window.deliveryMapInstance.fitBounds(bounds, { padding: 100 });
                      // Restore zoom if user had zoomed in more than fitBounds would set
                      setTimeout(() => {
                        const newZoom = window.deliveryMapInstance.getZoom();
                        if (currentZoom > newZoom && currentZoom >= 18) {
                          window.deliveryMapInstance.setZoom(currentZoom);
                        }
                      }, 100);
                      debugLog('✅ Map bounds fitted to route');
                    }
                    
                    debugLog('✅ Route displayed on main map using custom polyline');
                  } catch (error) {
                    debugError('❌ Error extracting route path:', error);
                    debugError('❌ directionsResult type:', typeof directionsResult);
                    debugError('❌ directionsResult:', directionsResult);
                  }
                } else if (routeCoordinates && routeCoordinates.length > 0) {
                  // Fallback: Use polyline if Directions API result not available
                  // setRoutePolyline will trigger useEffect that calls updateRoutePolyline
                  debugLog('📦 Using fallback polyline with', routeCoordinates.length, 'points');
                  setRoutePolyline(routeCoordinates);
                  debugLog('✅ Route polyline state set, will be displayed via useEffect');
                } else {
                  debugWarn('⚠️ No route data available to display (neither Directions API result nor coordinates)');
                }
                
                // Add restaurant marker to main map
                if (restaurantInfo.lat && restaurantInfo.lng) {
                  const restaurantLocation = {
                    lat: restaurantInfo.lat,
                    lng: restaurantInfo.lng
                  };
                  
                  createRestaurantMapMarker(restaurantLocation, restaurantInfo.name || 'Kitchen')
                  
                  debugLog('✅ Restaurant marker added to main map');
                }
              } else {
                debugWarn('⚠️ Main map not ready, will show route when map loads');
              }
              
              // Save accepted order to localStorage for refresh handling
              try {
                const activeOrderData = {
                  orderId: restaurantInfo.id || restaurantInfo.orderId,
                  restaurantInfo: restaurantInfo,
                  // Don't save directionsResponse - Google Maps objects can't be serialized to JSON
                  // Route will be recalculated on restore using Directions API
                  routeCoordinates: routeCoordinates, // Save coordinates for fallback polyline
                  acceptedAt: new Date().toISOString(),
                  hasDirectionsAPI: !!directionsResultForMap, // Flag to indicate we should recalculate with Directions API
                  uiStage: 'en_route_to_pickup'
                };
                localStorage.setItem(DELIVERY_ACTIVE_ORDER_KEY, JSON.stringify(activeOrderData));
                debugLog('💾 Saved active order to localStorage for refresh handling');
              } catch (storageError) {
                debugError('❌ Error saving active order to localStorage:', storageError);
              }

              // Keep the pickup slider visible after acceptance.
              // The swipe action stays locked until the rider is actually near the restaurant.
              setShowreachedPickupPopup(true)
            }, 300); // Wait for popup close animation

          } else {
            debugError('❌ Failed to accept order:', response.data)
            // Show error message to user
            toast.error(response.data?.message || 'Failed to accept order. Please try again.')
            // Still close popup
            setShowNewOrderPopup(false)
            setIsNewOrderPopupMinimized(false) // Reset minimized state
            setNewOrderDragY(0) // Reset drag position
          }
        } catch (error) {
          debugError('❌ Error accepting order:', error)
          debugError('❌ Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            orderId: orderId || 'unknown',
            code: error.code,
            isNetworkError: error.code === 'ERR_NETWORK',
            currentLocation: currentLocation && currentLocation.length === 2 ? 'available' : 'not available'
          })
          
          // Log full error response for debugging
          if (error.response?.data) {
            debugError('❌ Backend error response:', JSON.stringify(error.response.data, null, 2))
          }
          
          // Show user-friendly error message
          let errorMessage = 'Failed to accept order. Please try again.'
          if (error.code === 'ERR_NETWORK') {
            errorMessage = 'Network error. Please check your internet connection and try again.'
          } else if (error.response?.data?.message) {
            errorMessage = error.response.data.message
            // Also log the full error if available
            if (error.response.data.error) {
              debugError('❌ Backend error details:', error.response.data.error)
            }
          } else if (error.message) {
            errorMessage = error.message
          }
          
          toast.error(errorMessage)
          
          // Close popup even on error
          setShowNewOrderPopup(false)
          setIsNewOrderPopupMinimized(false) // Reset minimized state
          setNewOrderDragY(0) // Reset drag position
        } finally {
          isAcceptingNewOrderRef.current = false
          setIsAcceptingNewOrder(false)
          // Reset after animation
          setTimeout(() => {
            setNewOrderAcceptButtonProgress(0)
            setNewOrderIsAnimatingToComplete(false)
          }, 500)
        }
      }

      // Start accepting order
      acceptOrderAndShowRoute()
    } else {
      // Reset smoothly
      setNewOrderAcceptButtonProgress(0)
    }

    newOrderAcceptButtonSwipeStartX.current = 0
    newOrderAcceptButtonSwipeStartY.current = 0
    newOrderAcceptButtonIsSwiping.current = false
  }

  const handleNewOrderAcceptTouchCancel = () => {
    if (isAcceptingNewOrderRef.current) return
    newOrderAcceptButtonSwipeStartX.current = 0
    newOrderAcceptButtonSwipeStartY.current = 0
    newOrderAcceptButtonIsSwiping.current = false
    setNewOrderAcceptButtonProgress(0)
    setNewOrderIsAnimatingToComplete(false)
  }

  // Handle new order popup swipe down to minimize (not close)
  // Popup should stay visible until accept/reject is clicked
  const handleNewOrderPopupTouchStart = (e) => {
    // Allow touch start from anywhere when minimized (for swipe up from handle)
    if (isNewOrderPopupMinimized) {
      e.stopPropagation()
      newOrderSwipeStartY.current = e.touches[0].clientY
      newOrderIsSwiping.current = true
      setIsDraggingNewOrderPopup(true)
      return
    }

    // When visible, only allow swipe from top handle area
    const target = e.target
    const rect = newOrderPopupRef.current?.getBoundingClientRect()
    if (!rect) return

    const touchY = e.touches[0].clientY
    const handleArea = rect.top + 100 // Top 100px is swipeable area

    if (touchY <= handleArea) {
      e.stopPropagation()
      newOrderSwipeStartY.current = touchY
      newOrderIsSwiping.current = true
      setIsDraggingNewOrderPopup(true)
    }
  }

  const handleNewOrderPopupTouchMove = (e) => {
    if (!newOrderIsSwiping.current) return

    const currentY = e.touches[0].clientY
    const deltaY = currentY - newOrderSwipeStartY.current
    const popupHeight = newOrderPopupRef.current?.offsetHeight || 600

    e.stopPropagation()

    if (isNewOrderPopupMinimized) {
      // Currently minimized - swiping up (negative deltaY) should restore
      if (deltaY < 0) {
        // Calculate new position: start from popupHeight, subtract the upward swipe distance
        const newPosition = popupHeight + deltaY // deltaY is negative, so this reduces the position
        setNewOrderDragY(Math.max(0, newPosition)) // Don't go above 0 (fully visible)
      }
    } else {
      // Currently visible - swiping down (positive deltaY) should minimize
      if (deltaY > 0) {
        setNewOrderDragY(deltaY) // Direct deltaY, will be clamped to popupHeight in touchEnd
      }
    }
  }

  const handleNewOrderPopupTouchEnd = (e) => {
    if (!newOrderIsSwiping.current) {
      newOrderIsSwiping.current = false
      setIsDraggingNewOrderPopup(false)
      return
    }

    e.stopPropagation()

    const deltaY = e.changedTouches[0].clientY - newOrderSwipeStartY.current
    const threshold = 100
    const popupHeight = newOrderPopupRef.current?.offsetHeight || 600

    if (isNewOrderPopupMinimized) {
      // Currently minimized - check if swiping up enough to restore
      if (deltaY < -threshold) {
        // Swipe up enough - restore popup
        setIsNewOrderPopupMinimized(false)
        setNewOrderDragY(0)
      } else {
        // Not enough swipe - keep minimized
        setIsNewOrderPopupMinimized(true)
        setNewOrderDragY(popupHeight)
        // Delay stopping drag to allow position to be set
        setTimeout(() => {
          setIsDraggingNewOrderPopup(false)
        }, 10)
      }
    } else {
      // Currently visible - check if swiping down enough to minimize
      if (deltaY > threshold) {
        // Swipe down enough - minimize popup (but don't close)
        // Set dragY first to current position
        setNewOrderDragY(deltaY)
        // Then set minimized state and update dragY to full height
        setIsNewOrderPopupMinimized(true)
        // Use requestAnimationFrame to ensure state updates are batched
        requestAnimationFrame(() => {
          setNewOrderDragY(popupHeight)
          // Stop dragging after state is set
          setTimeout(() => {
            setIsDraggingNewOrderPopup(false)
          }, 50)
        })
      } else {
        // Not enough swipe - restore to visible (snap back)
        setIsNewOrderPopupMinimized(false)
        setNewOrderDragY(0)
        setIsDraggingNewOrderPopup(false)
      }
    }

    newOrderIsSwiping.current = false
    newOrderSwipeStartY.current = 0
  }

  // Handle Reached Pickup button swipe
  const handlereachedPickupTouchStart = (e) => {
    const touch = getTouchPoint(e)
    if (!touch) return
    reachedPickupSwipeStartX.current = touch.x
    reachedPickupSwipeStartY.current = touch.y
    reachedPickupIsSwiping.current = false
    setreachedPickupIsAnimatingToComplete(false)
    setreachedPickupButtonProgress(0)
  }

  const handlereachedPickupTouchMove = (e) => {
    const touch = getTouchPoint(e)
    if (!touch) return
    const deltaX = touch.x - reachedPickupSwipeStartX.current
    const deltaY = touch.y - reachedPickupSwipeStartY.current

    // Only handle horizontal swipes (swipe right)
    if (Math.abs(deltaX) > 5 && Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
      reachedPickupIsSwiping.current = true
      // Don't call preventDefault - CSS touch-action handles scrolling prevention
      // safePreventDefault(e) // Removed to avoid passive listener error

      // Calculate max swipe distance
      const buttonWidth = reachedPickupButtonRef.current?.offsetWidth || 300
      const circleWidth = 56 // w-14 = 56px
      const padding = 16 // px-4 = 16px
      const maxSwipe = buttonWidth - circleWidth - (padding * 2)

      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1)
      setreachedPickupButtonProgress(progress)
    }
  }

  const handlereachedPickupTouchEnd = (e) => {
    if (!reachedPickupIsSwiping.current) {
      setreachedPickupButtonProgress(0)
      return
    }

    const touch = getTouchPoint(e)
    const deltaX = (touch?.x || reachedPickupSwipeStartX.current) - reachedPickupSwipeStartX.current
    const buttonWidth = reachedPickupButtonRef.current?.offsetWidth || 300
    const circleWidth = 56
    const padding = 16
    const maxSwipe = buttonWidth - circleWidth - (padding * 2)
    const threshold = maxSwipe * 0.7 // 70% of max swipe

    if (deltaX > threshold) {
      // Animate to completion
      setreachedPickupIsAnimatingToComplete(true)
      setreachedPickupButtonProgress(1)

      // Close popup after animation, confirm reached pickup, then show order ID confirmation popup
      setTimeout(async () => {
        setShowreachedPickupPopup(false)
        
        // Get order ID - prioritize orderId (string) over id (MongoDB _id) for better compatibility
        // Backend accepts both _id and orderId, but orderId is more reliable
        const orderId = selectedRestaurant?.orderId || selectedRestaurant?.id || newOrder?.orderId || newOrder?.orderMongoId
        
        debugLog('🔍 Order ID lookup for reached pickup:', {
          selectedRestaurantId: selectedRestaurant?.id,
          selectedRestaurantOrderId: selectedRestaurant?.orderId,
          newOrderMongoId: newOrder?.orderMongoId,
          newOrderId: newOrder?.orderId,
          finalOrderId: orderId
        })
        
        // CRITICAL: Check if order is already delivered/completed - don't call API
        const orderStatus = selectedRestaurant?.orderStatus || selectedRestaurant?.status || ''
        const deliveryPhase = selectedRestaurant?.deliveryPhase || selectedRestaurant?.deliveryState?.currentPhase || ''
        const deliveryStateStatus = selectedRestaurant?.deliveryState?.status || ''
        
        const isDelivered = orderStatus === 'delivered' || 
                            deliveryPhase === 'completed' || 
                            deliveryPhase === 'delivered' ||
                            deliveryStateStatus === 'delivered'
        
        if (isDelivered) {
          debugWarn('⚠️ Order is already delivered, skipping reached pickup confirmation')
          toast.error('Order is already delivered. Cannot confirm reached pickup.')
          setShowreachedPickupPopup(false)
          return
        }
        
        // CRITICAL: Check if order is already past pickup phase (order ID confirmed or out for delivery)
        const isPastPickupPhase = orderStatus === 'out_for_delivery' ||
                                  deliveryPhase === 'en_route_to_delivery' ||
                                  deliveryPhase === 'picked_up' ||
                                  deliveryStateStatus === 'order_confirmed' ||
                                  deliveryStateStatus === 'reached_pickup' ||
                                  deliveryPhase === 'at_pickup'
        
        if (isPastPickupPhase) {
          debugWarn('⚠️ Order is already past pickup phase, skipping reached pickup confirmation:', {
            orderStatus,
            deliveryPhase,
            deliveryStateStatus
          })
          // If already at pickup or order ID confirmed, just show order ID popup after delay
          if (deliveryPhase === 'at_pickup' || deliveryStateStatus === 'reached_pickup') {
            // Ensure reached pickup popup is closed first
            setShowreachedPickupPopup(false)
            setTimeout(() => {
              setShowOrderIdConfirmationPopup(true)
            }, 300) // Delay to ensure reached pickup popup closes first
            toast.info('Order is already at pickup. Showing order ID confirmation.')
          } else {
            toast.info('Order is already out for delivery.')
          }
          return
        }
        
        if (orderId) {
          try {
            // Call backend API to confirm reached pickup and save status in database
            debugLog('📦 Confirming reached pickup for order:', orderId)
            debugLog('📦 API endpoint: /delivery/orders/:orderId/reached-pickup')
            const response = await deliveryAPI.confirmReachedPickup(orderId)
            
            debugLog('📦 Reached pickup API response:', response.data)
            
            if (response.data?.success) {
              debugLog('✅ Reached pickup confirmed and status saved in database')
              toast.success('Reached pickup confirmed!')
              
              // Update local state to reflect the new status
              if (selectedRestaurant) {
                setSelectedRestaurant(prev => ({
                  ...prev,
                  deliveryState: {
                    ...(prev?.deliveryState || {}),
                    currentPhase: 'at_pickup',
                    status: 'reached_pickup'
                  }
                }))
              }
              
              // Ensure reached pickup popup is closed first
              setShowreachedPickupPopup(false)
              // Wait for reached pickup popup to close, then show order ID confirmation popup
              setTimeout(() => {
                setShowOrderIdConfirmationPopup(true)
                debugLog('✅ Showing Order ID confirmation popup')
              }, 300) // 300ms delay for smooth transition
            } else {
              debugError('❌ Failed to confirm reached pickup:', response.data)
              toast.error(response.data?.message || 'Failed to confirm reached pickup. Please try again.')
              // Ensure reached pickup popup is closed
              setShowreachedPickupPopup(false)
              // Still show order ID popup even if API call fails, after delay
              setTimeout(() => {
                setShowOrderIdConfirmationPopup(true)
                debugLog('⚠️ Showing Order ID confirmation popup despite API failure')
              }, 300)
            }
          } catch (error) {
            debugError('❌ Error confirming reached pickup:', error)
            debugError('❌ Error details:', {
              message: error.message,
              response: error.response?.data,
              status: error.response?.status,
              orderId: orderId || 'unknown',
              selectedRestaurant: selectedRestaurant
            })
            
            // Show specific error message
            const errorMessage = error.response?.data?.message || 
                               (error.response?.status === 404 ? 'Order not found. Please refresh and try again.' : 'Failed to confirm reached pickup. Please try again.')
            toast.error(errorMessage)
            
            // Ensure reached pickup popup is closed
            setShowreachedPickupPopup(false)
            // Still show order ID popup even if API call fails, after delay
            setTimeout(() => {
              setShowOrderIdConfirmationPopup(true)
              debugLog('⚠️ Showing Order ID confirmation popup despite error')
            }, 300)
          }
        } else {
          debugError('❌ No order ID found for reached pickup confirmation')
          toast.error('Order ID not found. Please refresh and try again.')
          // Ensure reached pickup popup is closed
          setShowreachedPickupPopup(false)
          // Show order ID popup even if no order ID (fallback), after delay
          setTimeout(() => {
            setShowOrderIdConfirmationPopup(true)
            debugLog('⚠️ Showing Order ID confirmation popup without order ID (fallback)')
          }, 300)
        }
        
        // DO NOT show reached drop here - it will only show after order ID is confirmed
        
        // Reset after animation
        setTimeout(() => {
          setreachedPickupButtonProgress(0)
          setreachedPickupIsAnimatingToComplete(false)
        }, 500)
      }, 200)
    } else {
      // Reset smoothly
      setreachedPickupButtonProgress(0)
    }

    reachedPickupSwipeStartX.current = 0
    reachedPickupSwipeStartY.current = 0
    reachedPickupIsSwiping.current = false
  }

  const handlereachedPickupTouchCancel = () => {
    reachedPickupSwipeStartX.current = 0
    reachedPickupSwipeStartY.current = 0
    reachedPickupIsSwiping.current = false
    setreachedPickupButtonProgress(0)
    setreachedPickupIsAnimatingToComplete(false)
  }

  const handleReachedPickupMouseDown = (e) => {
    reachedPickupSwipeStartX.current = e.clientX
    reachedPickupSwipeStartY.current = e.clientY
    reachedPickupIsSwiping.current = false
    setIsDraggingReachedPickup(true)
    setreachedPickupIsAnimatingToComplete(false)
    setreachedPickupButtonProgress(0)
  }

  const handleReachedPickupMouseMove = (e) => {
    if (!isDraggingReachedPickup) return

    const deltaX = e.clientX - reachedPickupSwipeStartX.current
    const deltaY = e.clientY - reachedPickupSwipeStartY.current

    if (Math.abs(deltaX) > 5 && Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
      reachedPickupIsSwiping.current = true

      const buttonWidth = reachedPickupButtonRef.current?.offsetWidth || 300
      const circleWidth = 56
      const padding = 16
      const maxSwipe = buttonWidth - circleWidth - (padding * 2)

      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1)
      setreachedPickupButtonProgress(progress)
    }
  }

  const handleReachedPickupMouseUp = (e) => {
    if (!isDraggingReachedPickup) return
    setIsDraggingReachedPickup(false)

    if (!reachedPickupIsSwiping.current) {
      setreachedPickupButtonProgress(0)
      return
    }

    handlereachedPickupTouchEnd({
      changedTouches: [
        {
          clientX: e.clientX,
          clientY: e.clientY
        }
      ]
    })
  }

  useEffect(() => {
    if (!isDraggingReachedPickup) return undefined

    document.addEventListener('mousemove', handleReachedPickupMouseMove)
    document.addEventListener('mouseup', handleReachedPickupMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleReachedPickupMouseMove)
      document.removeEventListener('mouseup', handleReachedPickupMouseUp)
    }
  }, [isDraggingReachedPickup])

  const HOLD_TO_CONFIRM_MS = 3000

  const clearReachedDropHoldTimer = useCallback(() => {
    if (reachedDropHoldTimerRef.current) {
      clearTimeout(reachedDropHoldTimerRef.current)
      reachedDropHoldTimerRef.current = null
    }
  }, [])

  const clearOrderDeliveredHoldTimer = useCallback(() => {
    if (orderDeliveredHoldTimerRef.current) {
      clearTimeout(orderDeliveredHoldTimerRef.current)
      orderDeliveredHoldTimerRef.current = null
    }
  }, [])

  const confirmReachedDropFlow = useCallback(() => {
    // Animate to completion
    setReachedDropIsAnimatingToComplete(true)
    setReachedDropButtonProgress(1)

    // Close reached drop popup first
    setShowReachedDropPopup(false)

    // Show Order Delivered popup instantly after Reached Drop is confirmed
    debugLog('✅ Showing Order Delivered popup instantly after Reached Drop confirmation')
    setShowOrderDeliveredAnimation(true)

    // API call in background (async, doesn't block popup)
    ;(async () => {
      // Get order ID - prioritize MongoDB _id over orderId string for API call
      // Backend expects _id (MongoDB ObjectId) in the URL parameter
      const orderIdForApi = selectedRestaurant?.id ||
                           newOrder?.orderMongoId ||
                           newOrder?._id ||
                           selectedRestaurant?.orderId ||
                           newOrder?.orderId

      debugLog('🔍 Order ID lookup for reached drop:', {
        selectedRestaurantId: selectedRestaurant?.id,
        selectedRestaurantOrderId: selectedRestaurant?.orderId,
        newOrderMongoId: newOrder?.orderMongoId,
        newOrderId: newOrder?.orderId,
        finalOrderIdForApi: orderIdForApi
      })

      if (orderIdForApi) {
        try {
          // Call backend API to confirm reached drop (in background, don't block popup)
          // Use MongoDB _id for API call to avoid ObjectId casting errors
          debugLog('📦 Confirming reached drop for order:', orderIdForApi)
          const response = await deliveryAPI.confirmReachedDrop(orderIdForApi)

          if (response.data?.success) {
            debugLog('✅ Reached drop confirmed')
          } else {
            debugError('❌ Failed to confirm reached drop:', response.data)
            toast.error(response.data?.message || 'Failed to confirm reached drop. Please try again.')
          }
        } catch (error) {
          const status = error.response?.status

          // Handle 500 errors gracefully (server-side issue, popup already shown)
          if (status === 500) {
            debugWarn('⚠️ Server error confirming reached drop (500), but popup is shown. Backend will sync status automatically.', {
              orderIdForApi: orderIdForApi || 'unknown',
              message: error.response?.data?.message || error.message
            })
            return
          }

          // For other errors, log and show error message
          debugError('❌ Error confirming reached drop:', error)
          debugError('❌ Error details:', {
            message: error.message,
            response: error.response?.data,
            status: status,
            orderIdForApi: orderIdForApi || 'unknown',
            selectedRestaurant: selectedRestaurant,
            newOrder: newOrder
          })

          // Show specific error message based on status code
          let errorMessage = 'Failed to confirm reached drop. Please try again.'
          if (status === 404) {
            errorMessage = 'Order not found. Please refresh and try again.'
          } else if (error.response?.data?.message) {
            errorMessage = error.response.data.message
          }

          toast.error(errorMessage)
        }
      }
    })()
  }, [newOrder, selectedRestaurant])

  // Handle Reached Drop button swipe
  const handleReachedDropTouchStart = (e) => {
    const touch = getTouchPoint(e)
    if (!touch) return
    clearReachedDropHoldTimer()
    reachedDropSwipeStartX.current = touch.x
    reachedDropSwipeStartY.current = touch.y
    reachedDropIsSwiping.current = false
    reachedDropHoldTriggeredRef.current = false
    reachedDropLastProgressRef.current = 0
    setReachedDropIsAnimatingToComplete(false)
    setReachedDropButtonProgress(0)

    reachedDropHoldTimerRef.current = setTimeout(() => {
      reachedDropHoldTriggeredRef.current = true
      reachedDropIsSwiping.current = true
      confirmReachedDropFlow()
    }, HOLD_TO_CONFIRM_MS)
  }

  const handleReachedDropTouchMove = (e) => {
    const touch = getTouchPoint(e)
    if (!touch) return
    const deltaX = touch.x - reachedDropSwipeStartX.current
    const deltaY = touch.y - reachedDropSwipeStartY.current

    if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
      clearReachedDropHoldTimer()
    }

    // Only handle horizontal swipes (swipe right)
    if (Math.abs(deltaX) > 5 && Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
      reachedDropIsSwiping.current = true
      // Don't call preventDefault - CSS touch-action handles scrolling prevention
      // safePreventDefault(e) // Removed to avoid passive listener error

      // Calculate max swipe distance
      const buttonWidth = reachedDropButtonRef.current?.offsetWidth || 300
      const circleWidth = 56 // w-14 = 56px
      const padding = 16 // px-4 = 16px
      const maxSwipe = buttonWidth - circleWidth - (padding * 2)

      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1)
      reachedDropLastProgressRef.current = progress
      setReachedDropButtonProgress(progress)
    }
  }

  const handleReachedDropTouchEnd = (e) => {
    clearReachedDropHoldTimer()

    if (reachedDropHoldTriggeredRef.current) {
      reachedDropSwipeStartX.current = 0
      reachedDropSwipeStartY.current = 0
      reachedDropIsSwiping.current = false
      reachedDropHoldTriggeredRef.current = false
      return
    }

    if (!reachedDropIsSwiping.current) {
      setReachedDropButtonProgress(0)
      return
    }

    const touch = getTouchPoint(e)
    const deltaX = (touch?.x || reachedDropSwipeStartX.current) - reachedDropSwipeStartX.current
    const buttonWidth = reachedDropButtonRef.current?.offsetWidth || 300
    const circleWidth = 56
    const padding = 16
    const maxSwipe = buttonWidth - circleWidth - (padding * 2)
    const threshold = maxSwipe * 0.5 // 50% of max swipe — half slide completes and goes to next step

    const progressFromDelta = maxSwipe > 0 ? Math.min(Math.max(deltaX / maxSwipe, 0), 1) : 0
    const lastProgress = reachedDropLastProgressRef.current
    const shouldConfirm = deltaX > threshold || lastProgress >= 0.5 || progressFromDelta >= 0.5

    if (shouldConfirm) {
      confirmReachedDropFlow()
    } else {
      // Reset smoothly
      setReachedDropButtonProgress(0)
    }

    reachedDropLastProgressRef.current = 0
    reachedDropSwipeStartX.current = 0
    reachedDropSwipeStartY.current = 0
    reachedDropIsSwiping.current = false
    reachedDropHoldTriggeredRef.current = false
  }

  const handleReachedDropTouchCancel = () => {
    clearReachedDropHoldTimer()
    reachedDropLastProgressRef.current = 0
    reachedDropSwipeStartX.current = 0
    reachedDropSwipeStartY.current = 0
    reachedDropIsSwiping.current = false
    reachedDropHoldTriggeredRef.current = false
    setReachedDropButtonProgress(0)
    setReachedDropIsAnimatingToComplete(false)
  }

  // Handle Order ID Confirmation button swipe
  const handleOrderIdConfirmTouchStart = (e) => {
    const touch = getTouchPoint(e)
    if (!touch) return
    orderIdConfirmSwipeStartX.current = touch.x
    orderIdConfirmSwipeStartY.current = touch.y
    orderIdConfirmIsSwiping.current = false
    setOrderIdConfirmIsAnimatingToComplete(false)
    setOrderIdConfirmButtonProgress(0)
  }

  const handleOrderIdConfirmTouchMove = (e) => {
    const touch = getTouchPoint(e)
    if (!touch) return
    const deltaX = touch.x - orderIdConfirmSwipeStartX.current
    const deltaY = touch.y - orderIdConfirmSwipeStartY.current

    // Only handle horizontal swipes (swipe right)
    if (Math.abs(deltaX) > 5 && Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
      orderIdConfirmIsSwiping.current = true
      // Don't call preventDefault - CSS touch-action handles scrolling prevention
      // safePreventDefault(e) // Removed to avoid passive listener error

      // Calculate max swipe distance
      const buttonWidth = orderIdConfirmButtonRef.current?.offsetWidth || 300
      const circleWidth = 56 // w-14 = 56px
      const padding = 16 // px-4 = 16px
      const maxSwipe = buttonWidth - circleWidth - (padding * 2)

      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1)
      setOrderIdConfirmButtonProgress(progress)
    }
  }

  /**
   * Handle camera capture for bill image - Flutter InAppWebView compatible
   * 
   * Flutter Handler Requirements:
   * Handler name: 'openCamera'
   * Expected response format:
   * {
   *   success: true,
   *   file?: File,              // Preferred: JavaScript File object
   *   base64?: string,          // Alternative: Base64 encoded image (with or without data:image/jpeg;base64, prefix)
   *   mimeType?: string,        // MIME type (e.g., 'image/jpeg', 'image/png')
   *   fileName?: string,        // File name (e.g., 'bill-image.jpg')
   *   filePath?: string         // Not recommended: File path (requires additional handler to read)
   * }
   * 
   * If user cancels:
   * { success: false } or null
   */
  const handleCameraCapture = async () => {
    try {
      // Check if Flutter InAppWebView handler is available
      if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function') {
        debugLog('📸 Using Flutter InAppWebView camera handler')
        
        // Call Flutter handler to open camera
        const result = await window.flutter_inappwebview.callHandler('openCamera', {
          source: 'camera', // 'camera' for camera, 'gallery' for file picker
          accept: 'image/*',
          multiple: false,
          quality: 0.8 // Image quality (0.0 to 1.0)
        })
        
        debugLog('📸 Flutter handler response:', result)
        
        if (result && result.success) {
          // Handle the result - could be base64, file path, or file object
          let file = null
          
          if (result.file) {
            // If Flutter returns a File object (preferred method)
            file = result.file
            debugLog('✅ Received File object from Flutter')
          } else if (result.base64) {
            // If Flutter returns base64, convert to File
            debugLog('📸 Converting base64 to File object')
            let base64Data = result.base64
            
            // Remove data URL prefix if present
            if (base64Data.includes(',')) {
              base64Data = base64Data.split(',')[1]
            }
            
            try {
              const byteCharacters = atob(base64Data)
              const byteNumbers = new Array(byteCharacters.length)
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i)
              }
              const byteArray = new Uint8Array(byteNumbers)
              const mimeType = result.mimeType || 'image/jpeg'
              const blob = new Blob([byteArray], { type: mimeType })
              file = new File([blob], result.fileName || `bill-image-${Date.now()}.jpg`, { type: mimeType })
              debugLog('✅ Converted base64 to File:', { name: file.name, size: file.size, type: file.type })
            } catch (base64Error) {
              debugError('❌ Error converting base64 to File:', base64Error)
              toast.error('Failed to process image. Please try again.')
              return
            }
          } else if (result.filePath) {
            // If Flutter returns file path, we need to fetch it
            // This would require additional Flutter handler to read file
            debugWarn('⚠️ File path returned, but file reading not implemented')
            toast.error('File path handling not implemented. Please use base64 or File object.')
            return
          }
          
          if (file) {
            // Process the file the same way as handleBillImageSelect
            await processBillImageFile(file)
          } else {
            debugError('❌ No file data in Flutter response:', result)
            toast.error('Failed to get image from camera')
          }
        } else {
          debugLog('ℹ️ Camera cancelled by user or failed')
        }
      } else {
        // Fallback to standard file input for web browsers
        debugLog('📸 Flutter handler not available, using standard file input')
        if (cameraInputRef.current) {
          cameraInputRef.current.click()
        }
      }
    } catch (error) {
      debugError('❌ Error opening camera:', error)
      toast.error('Failed to open camera. Please try again.')
      
      // Fallback to standard file input
      if (cameraInputRef.current) {
        cameraInputRef.current.click()
      }
    }
  }

  // Process bill image file (extracted from handleBillImageSelect for reuse)
  const processBillImageFile = async (file) => {
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB')
      return
    }

    setIsUploadingBill(true)

    try {
      debugLog('📸 Uploading bill image to Cloudinary...')
      
      // Upload to Cloudinary via backend
      const uploadResponse = await uploadAPI.uploadMedia(file, {
        folder: 'appzeto/delivery/bills'
      })

      if (uploadResponse?.data?.success && uploadResponse?.data?.data) {
        const imageUrl = uploadResponse.data.data.url || uploadResponse.data.data.secure_url
        const publicId = uploadResponse.data.data.publicId || uploadResponse.data.data.public_id

        if (imageUrl) {
          debugLog('✅ Bill image uploaded to Cloudinary:', imageUrl)
          setBillImageUrl(imageUrl)
          
          // Bill image is uploaded to Cloudinary, now enable the button
          // The bill image URL will be sent when confirming order ID
          debugLog('✅ Bill image uploaded to Cloudinary, ready to save to database')
          setBillImageUploaded(true)
          toast.success('Bill image uploaded! You can now confirm order ID.')
        } else {
          throw new Error('Failed to get image URL from upload response')
        }
      } else {
        throw new Error('Upload failed')
      }
    } catch (error) {
      debugError('❌ Error uploading bill image:', error)
      toast.error('Failed to upload bill image. Please try again.')
      setBillImageUrl(null)
      setBillImageUploaded(false)
    } finally {
      setIsUploadingBill(false)
      // Reset file input
      if (cameraInputRef.current) {
        cameraInputRef.current.value = ''
      }
    }
  }

  // Handle bill image file selection and upload (fallback for web browsers)
  const handleBillImageSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    await processBillImageFile(file)
  }

  const handleOrderIdConfirmTouchEnd = (e) => {
    // Disable swipe if bill image is not uploaded
    if (!billImageUploaded) {
      toast.error('Please upload bill image first')
      setOrderIdConfirmButtonProgress(0)
      return
    }

    if (!orderIdConfirmIsSwiping.current) {
      setOrderIdConfirmButtonProgress(0)
      return
    }

    const touch = getTouchPoint(e)
    const deltaX = (touch?.x || orderIdConfirmSwipeStartX.current) - orderIdConfirmSwipeStartX.current
    const buttonWidth = orderIdConfirmButtonRef.current?.offsetWidth || 300
    const circleWidth = 56
    const padding = 16
    const maxSwipe = buttonWidth - circleWidth - (padding * 2)
    const threshold = maxSwipe * 0.7 // 70% of max swipe

    if (deltaX > threshold) {
      // Animate to completion
      setOrderIdConfirmIsAnimatingToComplete(true)
      setOrderIdConfirmButtonProgress(1)

      // Close popup after animation, then confirm order ID and show polyline to customer
      setTimeout(async () => {
        setShowOrderIdConfirmationPopup(false)
        
        // Get order ID from selectedRestaurant
        const orderId = selectedRestaurant?.id || selectedRestaurant?.orderId
        const confirmedOrderId = selectedRestaurant?.orderId
        
        // CRITICAL: Check if order is already delivered/completed - don't call API
        const orderStatus = selectedRestaurant?.orderStatus || selectedRestaurant?.status || ''
        const deliveryPhase = selectedRestaurant?.deliveryPhase || selectedRestaurant?.deliveryState?.currentPhase || ''
        const deliveryStateStatus = selectedRestaurant?.deliveryState?.status || ''
        
        const isDelivered = orderStatus === 'delivered' || 
                            deliveryPhase === 'completed' || 
                            deliveryPhase === 'delivered' ||
                            deliveryStateStatus === 'delivered'
        
        if (isDelivered) {
          debugWarn('⚠️ Order is already delivered, skipping order ID confirmation')
          toast.error('Order is already delivered. Cannot confirm order ID.')
          setShowOrderIdConfirmationPopup(false)
          return
        }
        
        // CRITICAL: Check if order ID is already confirmed - don't call API again
        const isOrderIdAlreadyConfirmed = orderStatus === 'out_for_delivery' ||
                                          deliveryPhase === 'en_route_to_delivery' ||
                                          deliveryPhase === 'picked_up' ||
                                          deliveryStateStatus === 'order_confirmed' ||
                                          selectedRestaurant?.deliveryState?.orderIdConfirmedAt
        
        if (isOrderIdAlreadyConfirmed) {
          debugWarn('⚠️ Order ID is already confirmed, skipping confirmation:', {
            orderStatus,
            deliveryPhase,
            deliveryStateStatus,
            orderIdConfirmedAt: selectedRestaurant?.deliveryState?.orderIdConfirmedAt
          })
          // Don't show error, just update the UI state and close popup
          setSelectedRestaurant(prev => ({
            ...prev,
            orderStatus: 'out_for_delivery',
            status: 'out_for_delivery',
            deliveryPhase: 'en_route_to_delivery',
            deliveryState: {
              ...prev.deliveryState,
              currentPhase: 'en_route_to_delivery',
              status: 'order_confirmed'
            }
          }))
          setShowOrderIdConfirmationPopup(false)
          toast.info('Order ID is already confirmed. Order is out for delivery.')
          return
        }
        
        if (!orderId) {
          debugError('❌ No order ID found to confirm')
          toast.error('Order ID not found. Please try again.')
          return
        }

        // Get current LIVE location
        let currentLocation = riderLocation
        if (!currentLocation || currentLocation.length !== 2) {
          currentLocation = lastLocationRef.current
        }
        
        if (!currentLocation || currentLocation.length !== 2) {
          try {
            const position = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(
                (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
                reject,
                { timeout: 5000, enableHighAccuracy: true }
              )
            })
            currentLocation = position
          } catch (geoError) {
            debugError('❌ Could not get current location:', geoError)
            toast.error('Location not available. Please enable location services.')
            return
          }
        }

        try {
          // Prefer string orderId (ORD-xxx) for URL; backend accepts both _id and orderId
          const orderIdForApi = selectedRestaurant?.orderId || selectedRestaurant?.id
          const confirmedOrderIdForApi = selectedRestaurant?.orderId || (orderIdForApi && String(orderIdForApi).startsWith('ORD-') ? orderIdForApi : undefined)

          // Call backend API to confirm order ID with bill image
          debugLog('📦 Confirming order ID:', { 
            orderIdForApi, 
            confirmedOrderIdForApi, 
            lat: currentLocation[0], 
            lng: currentLocation[1],
            billImageUrl 
          })
          
          // Update API call to include bill image URL
          const response = await deliveryAPI.confirmOrderId(orderIdForApi, confirmedOrderIdForApi, {
            lat: currentLocation[0],
            lng: currentLocation[1]
          }, {
            billImageUrl: billImageUrl
          })
          
          debugLog('✅ Order ID confirmed, response:', response.data)
          
          if (response.data?.success && response.data.data) {
            const orderData = response.data.data
            const order = orderData.order || orderData
            const routeData = orderData.route || order.deliveryState?.routeToDelivery
            
            // Update selectedRestaurant with customer address
            if (order && selectedRestaurant) {
              const customerCoords = order.address?.location?.coordinates
              const customerLat = customerCoords?.[1]
              const customerLng = customerCoords?.[0]
              
              if (Number.isFinite(customerLat) && Number.isFinite(customerLng)) {
                const updatedRestaurant = {
                  ...selectedRestaurant,
                  customerName: order.userId?.name || selectedRestaurant.customerName,
                  customerAddress: order.address?.formattedAddress ||
                                  (order.address?.street ? `${order.address.street}, ${order.address.city || ''}, ${order.address.state || ''}`.trim() : '') ||
                                  selectedRestaurant.customerAddress,
                  customerLat,
                  customerLng
                }
                setSelectedRestaurant(updatedRestaurant)

                // Calculate route from delivery boy's live location to customer using Directions API
                debugLog('🗺️ Calculating route to customer using Directions API...')
                debugLog('📍 From (Delivery Boy Live Location):', currentLocation)
                debugLog('📍 To (Customer):', { lat: customerLat, lng: customerLng })

                try {
                  const directionsResult = await calculateRouteWithDirectionsAPI(
                    currentLocation,
                    { lat: customerLat, lng: customerLng }
                  )

                  if (directionsResult) {
                    debugLog('✅ Route to customer calculated with Directions API')
                    
                    // Store delivery route distance and time
                    const deliveryDistance = directionsResult.routes[0]?.legs[0]?.distance?.value || 0; // in meters
                    const deliveryDuration = directionsResult.routes[0]?.legs[0]?.duration?.value || 0; // in seconds
                    deliveryRouteDistanceRef.current = deliveryDistance;
                    deliveryRouteTimeRef.current = deliveryDuration;
                    debugLog('📊 Delivery route stored:', { distance: deliveryDistance, duration: deliveryDuration });
                    
                    // Calculate total trip distance and time
                    const totalDistance = pickupRouteDistanceRef.current + deliveryDistance;
                    const totalTime = pickupRouteTimeRef.current + deliveryDuration;
                    setTripDistance(totalDistance);
                    setTripTime(totalTime);
                    debugLog('📊 Total trip calculated:', { 
                      totalDistance: totalDistance, 
                      totalTime: totalTime,
                      pickupDistance: pickupRouteDistanceRef.current,
                      pickupTime: pickupRouteTimeRef.current,
                      deliveryDistance: deliveryDistance,
                      deliveryTime: deliveryDuration
                    });
                    
                    setDirectionsResponse(directionsResult)
                    directionsResponseRef.current = directionsResult

                    // Initialize / update live tracking polyline for customer delivery route
                    updateLiveTrackingPolyline(directionsResult, currentLocation)
                    debugLog('✅ Live tracking polyline initialized for customer delivery route')

                    // Show route polyline on main Feed map
                    if (window.deliveryMapInstance && window.google?.maps) {
                      if (!directionsRendererRef.current) {
                        directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
                          suppressMarkers: true,
                          polylineOptions: { strokeColor: '#4285F4', strokeWeight: 0, strokeOpacity: 0, icons: [], zIndex: -1 },
                          preserveViewport: true
                        })
                      }
                      // Don't create main route polyline - only live tracking polyline will be shown
                      // Remove old custom polyline if exists (cleanup)
                      try {
                        if (routePolylineRef.current) {
                          routePolylineRef.current.setMap(null);
                          routePolylineRef.current = null;
                        }
                        
                        // Remove DirectionsRenderer from map
                        if (directionsRendererRef.current) {
                          directionsRendererRef.current.setMap(null);
                        }
                      } catch (e) {
                        debugWarn('⚠️ Error cleaning up polyline:', e);
                      }
                      
                      const bounds = directionsResult.routes?.[0]?.bounds
                      if (bounds) {
                        const currentZoomBeforeFit = window.deliveryMapInstance.getZoom();
                        window.deliveryMapInstance.fitBounds(bounds, { padding: 100 });
                        // Preserve zoom if user had zoomed in
                        setTimeout(() => {
                          const newZoom = window.deliveryMapInstance.getZoom();
                          if (currentZoomBeforeFit > newZoom && currentZoomBeforeFit >= 18) {
                            window.deliveryMapInstance.setZoom(currentZoomBeforeFit);
                          }
                        }, 100);
                      }
                    }
                    setShowRoutePath(true)
                  } else if (routeData?.coordinates?.length > 0) {
                    setRoutePolyline(routeData.coordinates)
                    updateRoutePolyline(routeData.coordinates)
                    setShowRoutePath(true)
                  }
                } catch (routeError) {
                  if (routeError.message?.includes('REQUEST_DENIED') || routeError.message?.includes('not available')) {
                    debugLog('⚠️ Directions API not available, using backend route fallback')
                  } else {
                    debugError('❌ Error calculating route to customer:', routeError)
                  }
                  if (routeData?.coordinates?.length > 0) {
                    setRoutePolyline(routeData.coordinates)
                    updateRoutePolyline(routeData.coordinates)
                    setShowRoutePath(true)
                  }
                }
              }
            }

            // Update status to out_for_delivery (merge if customer block didn't run)
            setSelectedRestaurant(prev => ({
              ...prev,
              orderStatus: 'out_for_delivery',
              status: 'out_for_delivery',
              deliveryPhase: 'en_route_to_delivery',
              deliveryState: {
                ...prev.deliveryState,
                currentPhase: 'en_route_to_delivery',
                status: 'order_confirmed'
              }
            }))

            // CRITICAL: Close Reached Pickup popup if it's still showing (shouldn't happen, but defensive)
            setShowreachedPickupPopup(false)
            
            // Close Order ID confirmation popup
            setShowOrderIdConfirmationPopup(false)

            toast.success('Order is out for delivery. Route to customer is on the map.', { duration: 4000 })
            
            debugLog('✅ Waiting for rider to get near customer before showing Reached Drop popup')
            
          } else {
            debugError('❌ Failed to confirm order ID:', response.data)
            toast.error(response.data?.message || 'Failed to confirm order ID. Please try again.')
          }
        } catch (error) {
          const status = error.response?.status
          const msg = error.response?.data?.message || error.message || ''
          debugError('❌ Error confirming order ID:', { status, message: msg, data: error.response?.data })
          toast.error(msg || 'Failed to confirm order ID. Please try again.')
        }
        
        // Reset after animation
        setTimeout(() => {
          setOrderIdConfirmButtonProgress(0)
          setOrderIdConfirmIsAnimatingToComplete(false)
        }, 500)
      }, 200)
    } else {
      // Reset smoothly
      setOrderIdConfirmButtonProgress(0)
    }

    orderIdConfirmSwipeStartX.current = 0
    orderIdConfirmSwipeStartY.current = 0
    orderIdConfirmIsSwiping.current = false
  }

  const handleOrderIdConfirmTouchCancel = () => {
    orderIdConfirmSwipeStartX.current = 0
    orderIdConfirmSwipeStartY.current = 0
    orderIdConfirmIsSwiping.current = false
    setOrderIdConfirmButtonProgress(0)
    setOrderIdConfirmIsAnimatingToComplete(false)
  }

  // Handle Order Delivered button swipe
  const requestDeliveryOtpFromModal = useCallback(() => {
    return new Promise((resolve) => {
      deliveryOtpResolveRef.current = resolve
      setDeliveryOtpDigits(Array(DELIVERY_DROP_OTP_LENGTH).fill(""))
      setDeliveryOtpValue("")
      setDeliveryOtpError("")
      setShowDeliveryOtpModal(true)
    })
  }, [DELIVERY_DROP_OTP_LENGTH])

  const closeDeliveryOtpModal = useCallback((otpValue = null) => {
    if (deliveryOtpResolveRef.current) {
      deliveryOtpResolveRef.current(otpValue)
      deliveryOtpResolveRef.current = null
    }
    setShowDeliveryOtpModal(false)
    setDeliveryOtpDigits(Array(DELIVERY_DROP_OTP_LENGTH).fill(""))
    setDeliveryOtpValue("")
    setDeliveryOtpError("")
  }, [DELIVERY_DROP_OTP_LENGTH])

  const handleDeliveryOtpDigitChange = (index, value) => {
    const digit = String(value || "").replace(/\D/g, "").slice(-1)
    const next = [...deliveryOtpDigits]
    next[index] = digit
    setDeliveryOtpDigits(next)
    setDeliveryOtpError("")

    if (digit && index < DELIVERY_DROP_OTP_LENGTH - 1) {
      deliveryOtpInputRefs.current[index + 1]?.focus()
    }
  }

  const handleDeliveryOtpKeyDown = (index, event) => {
    if (event.key === "Backspace" && !deliveryOtpDigits[index] && index > 0) {
      const next = [...deliveryOtpDigits]
      next[index - 1] = ""
      setDeliveryOtpDigits(next)
      deliveryOtpInputRefs.current[index - 1]?.focus()
    }
  }

  const handleDeliveryOtpPaste = (event) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, DELIVERY_DROP_OTP_LENGTH)
    if (!pasted) return

    const next = Array(DELIVERY_DROP_OTP_LENGTH).fill("")
    pasted.split("").forEach((digit, index) => {
      next[index] = digit
    })
    setDeliveryOtpDigits(next)
    setDeliveryOtpError("")

    const focusIndex = Math.min(pasted.length, DELIVERY_DROP_OTP_LENGTH - 1)
    deliveryOtpInputRefs.current[focusIndex]?.focus()
  }

  const submitDeliveryOtpModal = () => {
    const otpValue = (deliveryOtpValue || deliveryOtpDigits.join("")).trim()
    if (otpValue.length !== DELIVERY_DROP_OTP_LENGTH) {
      setDeliveryOtpError(`Please enter a valid ${DELIVERY_DROP_OTP_LENGTH}-digit OTP`)
      return
    }
    closeDeliveryOtpModal(otpValue)
  }

  const handleDeliveryOtpSingleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, DELIVERY_DROP_OTP_LENGTH)
    setDeliveryOtpValue(raw)
    setDeliveryOtpError("")
    if (raw.length === DELIVERY_DROP_OTP_LENGTH) {
      closeDeliveryOtpModal(raw)
    }
  }

  const handleDeliveryOtpSinglePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, DELIVERY_DROP_OTP_LENGTH)
    if (!pasted) return
    setDeliveryOtpValue(pasted)
    setDeliveryOtpError("")
    if (pasted.length === DELIVERY_DROP_OTP_LENGTH) {
      closeDeliveryOtpModal(pasted)
    } else {
      deliveryOtpSingleInputRef.current?.focus()
    }
  }

  const verifyDropOtpForCurrentOrder = useCallback(async (orderIdForApi) => {
    const dropOtpRequired = Boolean(selectedRestaurant?.deliveryVerification?.dropOtp?.required)
    const dropOtpVerified = Boolean(selectedRestaurant?.deliveryVerification?.dropOtp?.verified)

    if (!dropOtpRequired || dropOtpVerified) {
      return true
    }

    setShowOrderDeliveredAnimation(false)
    const enteredOtp = await requestDeliveryOtpFromModal()
    const normalizedOtp = (enteredOtp || "").trim()

    if (!normalizedOtp) {
      toast.error("Delivery OTP is required before completing this order.")
      return false
    }

    try {
      setIsVerifyingDeliveryOtp(true)
      const otpVerifyResponse = await deliveryAPI.verifyDropOtp(orderIdForApi, normalizedOtp)

      if (!otpVerifyResponse.data?.success) {
        toast.error(otpVerifyResponse.data?.message || "Invalid delivery OTP. Please try again.")
        return false
      }

      setSelectedRestaurant((prev) => (
        prev
          ? {
            ...prev,
            deliveryVerification: otpVerifyResponse.data?.data?.order?.deliveryVerification || {
              dropOtp: { required: true, verified: true }
            }
          }
          : prev
      ))

      return true
    } catch (otpError) {
      toast.error(otpError?.response?.data?.message || "Failed to verify delivery OTP.")
      return false
    } finally {
      setIsVerifyingDeliveryOtp(false)
    }
  }, [requestDeliveryOtpFromModal, selectedRestaurant])

  const confirmOrderDeliveredFlow = useCallback(async () => {
    if (orderDeliveredFlowInProgressRef.current) {
      return
    }
    orderDeliveredFlowInProgressRef.current = true

    const orderIdForApi = selectedRestaurant?.id ||
      newOrder?.orderMongoId ||
      newOrder?._id ||
      selectedRestaurant?.orderId ||
      newOrder?.orderId

    if (!orderIdForApi) {
      toast.error('Order details not found for OTP verification.')
      setOrderDeliveredButtonProgress(0)
      setOrderDeliveredIsAnimatingToComplete(false)
      orderDeliveredFlowInProgressRef.current = false
      return
    }

    // Animate to completion
    setOrderDeliveredIsAnimatingToComplete(true)
    setOrderDeliveredButtonProgress(1)

    // After slider completes, ask for OTP in popup if required, then continue
    setTimeout(async () => {
      const otpVerified = await verifyDropOtpForCurrentOrder(orderIdForApi)
      if (!otpVerified) {
        setShowOrderDeliveredAnimation(true)
        setOrderDeliveredButtonProgress(0)
        setOrderDeliveredIsAnimatingToComplete(false)
        orderDeliveredFlowInProgressRef.current = false
        return
      }

      setShowOrderDeliveredAnimation(false)

      // CRITICAL: Clear all pickup/delivery related popups
      setShowReachedDropPopup(false)
      setShowreachedPickupPopup(false)
      setShowOrderIdConfirmationPopup(false)

      // Show customer review popup after successful slide + OTP verification
      setShowCustomerReviewPopup(true)

      setTimeout(() => {
        setOrderDeliveredButtonProgress(0)
        setOrderDeliveredIsAnimatingToComplete(false)
        orderDeliveredFlowInProgressRef.current = false
      }, 500)
    }, 200)
  }, [newOrder, selectedRestaurant, verifyDropOtpForCurrentOrder])

  useEffect(() => {
    if (!showOrderDeliveredAnimation) {
      orderDeliveredAutoFlowStartedRef.current = false
      return
    }

    if (showCustomerReviewPopup || showPaymentPage) return
    if (orderDeliveredAutoFlowStartedRef.current) return

    orderDeliveredAutoFlowStartedRef.current = true

    const timer = setTimeout(() => {
      confirmOrderDeliveredFlow()
    }, 120)

    return () => clearTimeout(timer)
  }, [
    confirmOrderDeliveredFlow,
    showCustomerReviewPopup,
    showOrderDeliveredAnimation,
    showPaymentPage
  ])

  const handleOrderDeliveredTouchStart = (e) => {
    if (showDeliveryOtpModal || isVerifyingDeliveryOtp || orderDeliveredFlowInProgressRef.current) return
    const touch = getTouchPoint(e)
    if (!touch) return
    clearOrderDeliveredHoldTimer()
    orderDeliveredSwipeStartX.current = touch.x
    orderDeliveredSwipeStartY.current = touch.y
    orderDeliveredIsSwiping.current = false
    orderDeliveredHoldTriggeredRef.current = false
    orderDeliveredLastProgressRef.current = 0
    setOrderDeliveredIsAnimatingToComplete(false)
    setOrderDeliveredButtonProgress(0)

    orderDeliveredHoldTimerRef.current = setTimeout(() => {
      orderDeliveredHoldTriggeredRef.current = true
      orderDeliveredIsSwiping.current = true
      confirmOrderDeliveredFlow()
    }, HOLD_TO_CONFIRM_MS)
  }

  const handleOrderDeliveredTouchMove = (e) => {
    if (showDeliveryOtpModal || isVerifyingDeliveryOtp || orderDeliveredFlowInProgressRef.current) return
    const touch = getTouchPoint(e)
    if (!touch) return
    const deltaX = touch.x - orderDeliveredSwipeStartX.current
    const deltaY = touch.y - orderDeliveredSwipeStartY.current

    if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
      clearOrderDeliveredHoldTimer()
    }

    // Only handle horizontal swipes (swipe right)
    if (Math.abs(deltaX) > 5 && Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
      orderDeliveredIsSwiping.current = true
      // Don't call preventDefault - CSS touch-action handles scrolling prevention
      // safePreventDefault(e) // Removed to avoid passive listener error

      // Calculate max swipe distance
      const buttonWidth = orderDeliveredButtonRef.current?.offsetWidth || 300
      const circleWidth = 56 // w-14 = 56px
      const padding = 16 // px-4 = 16px
      const maxSwipe = buttonWidth - circleWidth - (padding * 2)

      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1)
      orderDeliveredLastProgressRef.current = progress
      setOrderDeliveredButtonProgress(progress)
    }
  }

  const handleOrderDeliveredTouchEnd = async (e) => {
    if (showDeliveryOtpModal || isVerifyingDeliveryOtp || orderDeliveredFlowInProgressRef.current) return
    clearOrderDeliveredHoldTimer()

    if (orderDeliveredHoldTriggeredRef.current) {
      orderDeliveredSwipeStartX.current = 0
      orderDeliveredSwipeStartY.current = 0
      orderDeliveredIsSwiping.current = false
      orderDeliveredHoldTriggeredRef.current = false
      return
    }

    if (!orderDeliveredIsSwiping.current) {
      setOrderDeliveredButtonProgress(0)
      return
    }

    const touch = getTouchPoint(e)
    const deltaX = (touch?.x || orderDeliveredSwipeStartX.current) - orderDeliveredSwipeStartX.current
    const buttonWidth = orderDeliveredButtonRef.current?.offsetWidth || 300
    const circleWidth = 56
    const padding = 16
    const maxSwipe = buttonWidth - circleWidth - (padding * 2)
    const threshold = maxSwipe * 0.5 // 50% — half slide completes and goes to next step

    const progressFromDelta = maxSwipe > 0 ? Math.min(Math.max(deltaX / maxSwipe, 0), 1) : 0
    const lastProgress = orderDeliveredLastProgressRef.current
    const shouldConfirm = deltaX > threshold || lastProgress >= 0.5 || progressFromDelta >= 0.5

    if (shouldConfirm) {
      await confirmOrderDeliveredFlow()
    } else {
      setOrderDeliveredButtonProgress(0)
    }

    orderDeliveredLastProgressRef.current = 0
    orderDeliveredSwipeStartX.current = 0
    orderDeliveredSwipeStartY.current = 0
    orderDeliveredIsSwiping.current = false
    orderDeliveredHoldTriggeredRef.current = false
  }

  const handleOrderDeliveredTouchCancel = () => {
    if (showDeliveryOtpModal || isVerifyingDeliveryOtp || orderDeliveredFlowInProgressRef.current) return
    clearOrderDeliveredHoldTimer()
    orderDeliveredLastProgressRef.current = 0
    orderDeliveredSwipeStartX.current = 0
    orderDeliveredSwipeStartY.current = 0
    orderDeliveredIsSwiping.current = false
    orderDeliveredHoldTriggeredRef.current = false
    setOrderDeliveredButtonProgress(0)
    setOrderDeliveredIsAnimatingToComplete(false)
  }

  // Handle accept orders button swipe
  const handleAcceptOrdersTouchStart = (e) => {
    const touch = getTouchPoint(e)
    if (!touch) return
    acceptButtonSwipeStartX.current = touch.x
    acceptButtonSwipeStartY.current = touch.y
    acceptButtonIsSwiping.current = false
    setIsAnimatingToComplete(false)
    setAcceptButtonProgress(0)
  }

  const handleAcceptOrdersTouchMove = (e) => {
    const touch = getTouchPoint(e)
    if (!touch) return
    const deltaX = touch.x - acceptButtonSwipeStartX.current
    const deltaY = touch.y - acceptButtonSwipeStartY.current

    // Only handle horizontal swipes (swipe right)
    if (Math.abs(deltaX) > 5 && Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
      acceptButtonIsSwiping.current = true
      // Don't call preventDefault - CSS touch-action handles scrolling prevention
      // safePreventDefault(e) // Removed to avoid passive listener error

      // Calculate max swipe distance
      const buttonWidth = acceptButtonRef.current?.offsetWidth || 300
      const circleWidth = 56 // w-14 = 56px
      const padding = 16 // px-4 = 16px
      const maxSwipe = buttonWidth - circleWidth - (padding * 2)

      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1)
      setAcceptButtonProgress(progress)
    }
  }

  const handleAcceptOrdersTouchEnd = (e) => {
    if (!acceptButtonIsSwiping.current) {
      setAcceptButtonProgress(0)
      return
    }

    const touch = getTouchPoint(e)
    const deltaX = (touch?.x || acceptButtonSwipeStartX.current) - acceptButtonSwipeStartX.current
    const buttonWidth = acceptButtonRef.current?.offsetWidth || 300
    const circleWidth = 56
    const padding = 16
    const maxSwipe = buttonWidth - circleWidth - (padding * 2)
    const threshold = maxSwipe * 0.7 // 70% of max swipe

    if (deltaX > threshold) {
      // Animate to completion
      setIsAnimatingToComplete(true)
      setAcceptButtonProgress(1)

      // Navigate to pickup directions page after animation
      setTimeout(() => {
        navigate("/delivery/pickup-directions", {
          state: { restaurants: mockRestaurants },
          replace: false
        })

        // Reset after navigation
        setTimeout(() => {
          setAcceptButtonProgress(0)
          setIsAnimatingToComplete(false)
        }, 500)
      }, 200)
    } else {
      // Reset smoothly
      setAcceptButtonProgress(0)
    }

    acceptButtonSwipeStartX.current = 0
    acceptButtonSwipeStartY.current = 0
    acceptButtonIsSwiping.current = false
  }

  const handleAcceptOrdersTouchCancel = () => {
    acceptButtonSwipeStartX.current = 0
    acceptButtonSwipeStartY.current = 0
    acceptButtonIsSwiping.current = false
    setAcceptButtonProgress(0)
    setIsAnimatingToComplete(false)
  }

  // Handle bottom sheet swipe
  const handleBottomSheetTouchStart = (e) => {
    const target = e.target
    const isHandle = handleRef.current?.contains(target)

    // Check if touch is in handle area or top 15% of bottom sheet
    const rect = bottomSheetRef.current?.getBoundingClientRect()
    if (!rect) return

    const touchY = e.touches[0].clientY
    const handleArea = rect.top + 60 // Top 60px is handle area

    // Allow swipe if touching handle or top area
    if (isHandle || touchY <= handleArea) {
      e.stopPropagation()
      swipeStartY.current = touchY
      isSwiping.current = true
    }
  }

  const handleBottomSheetTouchMove = (e) => {
    if (!isSwiping.current) return

    const deltaY = swipeStartY.current - e.touches[0].clientY

    if (Math.abs(deltaY) > 5) {
      e.stopPropagation()

      // Swipe up to expand
      if (deltaY > 0 && !bottomSheetExpanded && bottomSheetRef.current) {
        // Don't call preventDefault - CSS touch-action handles scrolling prevention
        // safePreventDefault(e) // Removed to avoid passive listener error
        bottomSheetRef.current.style.transform = `translateY(${-deltaY}px)`
      }
      // Swipe down to collapse
      else if (deltaY < 0 && bottomSheetExpanded && bottomSheetRef.current) {
        // Don't call preventDefault - CSS touch-action handles scrolling prevention
        // safePreventDefault(e) // Removed to avoid passive listener error
        bottomSheetRef.current.style.transform = `translateY(${-deltaY}px)`
      }
    }
  }

  const handleBottomSheetTouchEnd = (e) => {
    if (!isSwiping.current) {
      isSwiping.current = false
      return
    }

    e.stopPropagation()

    const deltaY = swipeStartY.current - e.changedTouches[0].clientY
    const threshold = 50

    if (bottomSheetRef.current) {
      if (deltaY > threshold && !bottomSheetExpanded) {
        setBottomSheetExpanded(true)
      } else if (deltaY < -threshold && bottomSheetExpanded) {
        setBottomSheetExpanded(false)
      }
      // Reset transform
      bottomSheetRef.current.style.transform = ''
    }

    isSwiping.current = false
    swipeStartY.current = 0
  }

  // Listen for refresh events
  useEffect(() => {
    const handleRefresh = () => {
      setAnimationKey(prev => prev + 1)
    }

    const handleActiveOrderUpdate = () => {
      const stored = localStorage.getItem('activeOrder')
      setActiveOrder(stored ? JSON.parse(stored) : null)
    }

    const handleNotificationUpdate = () => {
      setUnreadNotificationCount(getUnreadDeliveryNotificationCount())
    }

    window.addEventListener('deliveryHomeRefresh', handleRefresh)
    window.addEventListener('gigStateUpdated', handleRefresh)
    window.addEventListener('deliveryOrderStatusUpdated', handleRefresh)
    window.addEventListener('activeOrderUpdated', handleActiveOrderUpdate)
    window.addEventListener('storage', handleActiveOrderUpdate)
    window.addEventListener('deliveryNotificationsUpdated', handleNotificationUpdate)

    return () => {
      window.removeEventListener('deliveryHomeRefresh', handleRefresh)
      window.removeEventListener('gigStateUpdated', handleRefresh)
      window.removeEventListener('deliveryOrderStatusUpdated', handleRefresh)
      window.removeEventListener('activeOrderUpdated', handleActiveOrderUpdate)
      window.removeEventListener('storage', handleActiveOrderUpdate)
      window.removeEventListener('deliveryNotificationsUpdated', handleNotificationUpdate)
    }
  }, [])

  // Helper function to calculate time away from distance
  const calculateTimeAway = useCallback((distanceStr) => {
    if (!distanceStr) return '0 mins'
    const distance = parseFloat(distanceStr.replace(' km', ''))
    if (isNaN(distance)) return '0 mins'
    // Assume average speed of 30 km/h for delivery
    const minutes = Math.ceil((distance / 30) * 60)
    return `${minutes} mins`
  }, [])

  const dialPhoneNumber = useCallback((phoneNumber, missingMessage = 'Phone number not available') => {
    const cleanPhone = String(phoneNumber || '').replace(/[^\d+]/g, '')
    if (!cleanPhone) {
      toast.error(missingMessage)
      return false
    }
    window.location.href = `tel:${cleanPhone}`
    return true
  }, [])

  // Show new order popup when order is received from Socket.IO
  useEffect(() => {
    if (newOrder) {
      const orderId = newOrder.orderMongoId || newOrder.orderId;
      
      // Check if this order has already been accepted
      if (acceptedOrderIdsRef.current.has(orderId)) {
        debugLog('⚠️ Order already accepted, ignoring duplicate notification:', orderId);
        clearNewOrder();
        return;
      }
      
      // Check if order is already in localStorage (accepted order)
      try {
        const activeOrderData = localStorage.getItem(DELIVERY_ACTIVE_ORDER_KEY);
        if (activeOrderData) {
          const activeOrder = JSON.parse(activeOrderData);
          const activeOrderId = activeOrder.orderId || activeOrder.restaurantInfo?.id || activeOrder.restaurantInfo?.orderId;
          if (activeOrderId === orderId) {
            debugLog('⚠️ Order already accepted (found in localStorage), ignoring notification:', orderId);
            acceptedOrderIdsRef.current.add(orderId);
            clearNewOrder();
            return;
          }
        }
      } catch (e) {
        // Ignore localStorage errors
      }
      
      debugLog('📦 New order received from Socket.IO:', newOrder)
      
      // Transform newOrder data to match selectedRestaurant format
      // Extract restaurant address with proper priority
      let restaurantAddress = 'Restaurant address';
      if (newOrder.restaurantLocation?.address) {
        restaurantAddress = newOrder.restaurantLocation.address;
      } else if (newOrder.restaurantLocation?.formattedAddress) {
        restaurantAddress = newOrder.restaurantLocation.formattedAddress;
      } else if (newOrder.restaurantAddress) {
        restaurantAddress = newOrder.restaurantAddress;
      }
      
      // Extract earnings from notification - backend now calculates and sends estimatedEarnings
      const deliveryFee = newOrder.deliveryFee || 0;
      const earned = newOrder.estimatedEarnings;
      let earnedValue = 0;
      
      if (earned) {
        if (typeof earned === 'object' && earned.totalEarning != null) {
          earnedValue = Number(earned.totalEarning) || 0;
        } else if (typeof earned === 'number') {
          earnedValue = earned;
        }
      }
      
      // Use calculated earnings if available, otherwise fallback to deliveryFee
      const effectiveEarnings = earnedValue > 0 ? earned : (deliveryFee > 0 ? deliveryFee : 0);
      
      debugLog('💰 Earnings from notification:', {
        earned,
        earnedValue,
        deliveryFee,
        effectiveEarnings,
        type: typeof effectiveEarnings
      });

      // Calculate pickup distance if not provided
      let pickupDistance = newOrder.pickupDistance;
      if (!pickupDistance || pickupDistance === '0 km') {
        // Try to calculate from driver's current location to restaurant
        const currentLocation = riderLocation || lastLocationRef.current;
        const restaurantLat = newOrder.restaurantLocation?.latitude;
        const restaurantLng = newOrder.restaurantLocation?.longitude;
        
        if (currentLocation && currentLocation.length === 2 && 
            restaurantLat && restaurantLng && 
            !isNaN(restaurantLat) && !isNaN(restaurantLng)) {
          // Calculate distance in meters, then convert to km
          const distanceInMeters = calculateDistance(
            currentLocation[0], 
            currentLocation[1], 
            restaurantLat, 
            restaurantLng
          );
          const distanceInKm = distanceInMeters / 1000;
          pickupDistance = `${distanceInKm.toFixed(2)} km`;
          debugLog('📍 Calculated pickup distance:', pickupDistance);
        }
      }
      
      // Default to 'Calculating...' if still no distance
      if (!pickupDistance || pickupDistance === '0 km') {
        pickupDistance = 'Calculating...';
      }

      const restaurantData = {
        id: newOrder.orderMongoId || newOrder.orderId,
        orderId: newOrder.orderId,
        name: newOrder.restaurantName,
        address: restaurantAddress,
        lat: newOrder.restaurantLocation?.latitude,
        lng: newOrder.restaurantLocation?.longitude,
        distance: pickupDistance,
        timeAway: pickupDistance !== 'Calculating...' ? calculateTimeAway(pickupDistance) : 'Calculating...',
        dropDistance: newOrder.deliveryDistance || 'Calculating...',
        pickupDistance: pickupDistance,
        estimatedEarnings: effectiveEarnings,
        deliveryFee,
        amount: earnedValue > 0 ? earnedValue : (deliveryFee > 0 ? deliveryFee : 0),
        customerName: newOrder.customerName,
        customerAddress: newOrder.customerLocation?.address || 'Customer address',
        customerLat: newOrder.customerLocation?.latitude,
        customerLng: newOrder.customerLocation?.longitude,
        items: newOrder.items || [],
        total: Number(newOrder.total ?? newOrder.pricing?.total ?? 0) || 0,
        paymentMethod: newOrder.paymentMethod || newOrder.payment?.method || newOrder.payment || 'cod'
      }
      
      setSelectedRestaurant(restaurantData)
      setShowNewOrderPopup(true)
      setCountdownSeconds(300) // Reset countdown to 5 minutes
    }
  }, [newOrder, calculateTimeAway, riderLocation])

  // Recalculate distance when rider location becomes available
  useEffect(() => {
    if (!selectedRestaurant || !showNewOrderPopup) return
    
    // Only recalculate if distance is missing or showing '0 km' or 'Calculating...'
    const currentDistance = selectedRestaurant.distance || selectedRestaurant.pickupDistance
    if (currentDistance && currentDistance !== '0 km' && currentDistance !== 'Calculating...') {
      return // Distance already calculated
    }
    
    const currentLocation = riderLocation || lastLocationRef.current
    const restaurantLat = selectedRestaurant.lat
    const restaurantLng = selectedRestaurant.lng
    
    if (currentLocation && currentLocation.length === 2 && 
        restaurantLat && restaurantLng && 
        !isNaN(restaurantLat) && !isNaN(restaurantLng)) {
      // Calculate distance in meters, then convert to km
      const distanceInMeters = calculateDistance(
        currentLocation[0], 
        currentLocation[1], 
        restaurantLat, 
        restaurantLng
      )
      const distanceInKm = distanceInMeters / 1000
      const pickupDistance = `${distanceInKm.toFixed(2)} km`
      
      debugLog('📍 Recalculated pickup distance:', pickupDistance)
      
      setSelectedRestaurant(prev => ({
        ...prev,
        distance: pickupDistance,
        pickupDistance: pickupDistance,
        timeAway: calculateTimeAway(pickupDistance)
      }))
    }
  }, [riderLocation, selectedRestaurant, showNewOrderPopup, calculateTimeAway])

  // Fetch restaurant address if missing when selectedRestaurant is set
  useEffect(() => {
    if (!selectedRestaurant?.orderId && !selectedRestaurant?.id) return
    if (!selectedRestaurant?.address || 
        selectedRestaurant.address === 'Restaurant address' || 
        selectedRestaurant.address === 'Restaurant Address') {
      // Address is missing, fetch order details to get restaurant address
      const orderId = selectedRestaurant.orderId || selectedRestaurant.id
      debugLog('🔄 Fetching restaurant address for order:', orderId)
      
      const fetchAddress = async () => {
        try {
          const response = await deliveryAPI.getOrderDetails(orderId)
          if (response?.data?.success && response?.data?.data) {
            const order = response.data.data.order || response.data.data
            
            // Extract restaurant address
            let restaurantAddress = null
            if (order.restaurantId?.address) {
              restaurantAddress = order.restaurantId.address
            } else if (order.restaurantId?.location?.formattedAddress) {
              restaurantAddress = order.restaurantId.location.formattedAddress
            } else if (order.restaurantId?.location?.address) {
              restaurantAddress = order.restaurantId.location.address
            }
            
            if (restaurantAddress && restaurantAddress !== 'Restaurant address' && restaurantAddress !== 'Restaurant Address') {
              setSelectedRestaurant(prev => ({
                ...prev,
                address: restaurantAddress
              }))
              debugLog('✅ Restaurant address fetched and updated:', restaurantAddress)
            }
          }
        } catch (error) {
          debugError('❌ Error fetching restaurant address:', error)
        }
      }
      
      fetchAddress()
    }
  }, [selectedRestaurant?.orderId, selectedRestaurant?.id, selectedRestaurant?.address])

  // Handle online toggle - check for booked gigs
  const handleToggleOnline = () => {
    if (isOnline) {
      goOffline()
    } else {
      if (isCashLimitBlocked) {
        toast.error(cashLimitBlockedMessage || "Deposit cash to continue")
        navigate("/delivery/pocket")
        return
      }
      // Check if there are any booked gigs
      // if (bookedGigs.length === 0) {
      //   // Show popup to book gigs
      //   setShowBookGigsPopup(true)
      //   return
      // }
      
      // // If gigs exist, proceed with going online
      // const success = goOnline()
      // if (!success) {
      //   // If goOnline fails (no gig), just set online status directly
      //   useGigStore.setState({ isOnline: true })
      //   localStorage.setItem('delivery_online_status', 'true')
      //   window.dispatchEvent(new CustomEvent('deliveryOnlineStatusChanged'))
      // }
      goOnline()
    }
  }

  // Carousel state
  const [currentCarouselSlide, setCurrentCarouselSlide] = useState(0)
  const carouselRef = useRef(null)
  const carouselStartX = useRef(0)
  const carouselIsSwiping = useRef(false)
  const carouselAutoRotateRef = useRef(null)

  // Map view toggle state - Hotspot or Select drop (both show map, just different views)
  const [mapViewMode, setMapViewMode] = useState("hotspot") // "hotspot" or "selectDrop"

  // Swipe bar state - controls whether map or home sections are visible
  const [showHomeSections, setShowHomeSections] = useState(false) // false = map view, true = home sections
  const [swipeBarPosition, setSwipeBarPosition] = useState(0) // 0 = bottom (map), 1 = top (home)
  const [isDraggingSwipeBar, setIsDraggingSwipeBar] = useState(false)
  const swipeBarRef = useRef(null)
  const swipeBarStartY = useRef(0)
  const isSwipingBar = useRef(false)
  const homeSectionsScrollRef = useRef(null)
  const isScrollingHomeSections = useRef(false)

  // Emergency help popup state
  const [showEmergencyPopup, setShowEmergencyPopup] = useState(false)

  // Help popup state
  const [showHelpPopup, setShowHelpPopup] = useState(false)

  // Book gigs popup state
  const [showBookGigsPopup, setShowBookGigsPopup] = useState(false)

  // Drop location selection popup state
  const [showDropLocationPopup, setShowDropLocationPopup] = useState(false)
  const [selectedDropLocation, setSelectedDropLocation] = useState(() => {
    return localStorage.getItem('selectedDropLocation') || null
  })

  // Help options - using paths from DeliveryRouter
  const helpOptions = [
    {
      id: "supportTickets",
      title: "Support tickets",
      subtitle: "Check status of tickets raised",
      icon: "ticket",
      path: "/delivery/help/tickets"
    },
    {
      id: "idCard",
      title: "Show ID card",
      subtitle: `See your ${companyName} ID card`,
      icon: "idCard",
      path: "/delivery/help/id-card"
    }
  ]

  // Handle help option click - navigate to the correct route
  const handleHelpOptionClick = (option) => {
    if (option.path) {
      setShowHelpPopup(false)
      navigate(option.path)
    }
  }

  // Emergency options with phone numbers
  const emergencyOptions = [
    {
      id: "ambulance",
      title: "Call ambulance (10 mins)",
      subtitle: "For medical emergencies",
      phone: "108", // Indian emergency ambulance number
      icon: "ambulance"
    },
    {
      id: "accident",
      title: "Call accident helpline",
      subtitle: "Talk to our emergency team",
      phone: "1073", // Indian accident helpline
      icon: "siren"
    },
    {
      id: "police",
      title: "Call police",
      subtitle: "Report a crime",
      phone: "100", // Indian police emergency number
      icon: "police"
    },
    {
      id: "insurance",
      title: "Insurance card",
      subtitle: "View your insurance details",
      phone: null, // No phone call for insurance
      icon: "insurance"
    }
  ]

  // Handle emergency option click
  const handleEmergencyOptionClick = (option) => {
    if (option.phone) {
      window.location.href = `tel:${option.phone}`
    } else if (option.id === "insurance") {
      // Navigate to insurance page or show insurance details
      navigate("/delivery/insurance")
    }
    setShowEmergencyPopup(false)
  }

  // Fetch wallet data from API
  useEffect(() => {
    const fetchWalletData = async () => {
      // Skip wallet fetch if status is pending
      if (deliveryStatus === 'pending') {
        setWalletState({
          totalBalance: 0,
          cashInHand: 0,
          totalWithdrawn: 0,
          totalEarned: 0,
          transactions: [],
          joiningBonusClaimed: false
        })
        return
      }

      try {
        const walletData = await fetchDeliveryWallet()
        setWalletState(walletData)
      } catch (error) {
        // Only log error if it's not a network error (backend might be down)
        if (error.code !== 'ERR_NETWORK') {
          debugError('Error fetching wallet data:', error)
        }
        // Keep empty state on error
        setWalletState({
          totalBalance: 0,
          cashInHand: 0,
          totalWithdrawn: 0,
          totalEarned: 0,
          transactions: [],
          joiningBonusClaimed: false
        })
      }
    }

    // Only fetch if status is known and not pending
    if (deliveryStatus !== null && deliveryStatus !== 'pending') {
      fetchWalletData()
    } else if (deliveryStatus === null) {
      // If status is not yet loaded, wait for it
      fetchWalletData()
    }
  }, [deliveryStatus])

  useEffect(() => {
    if (!isCashLimitBlocked) {
      hasShownCashLimitToastRef.current = false
      return
    }

    if (!hasShownCashLimitToastRef.current) {
      toast.error(cashLimitBlockedMessage, { duration: 3500 })
      hasShownCashLimitToastRef.current = true
    }
  }, [isCashLimitBlocked, cashLimitBlockedMessage])

  // Fetch assigned orders from API when delivery person goes online
  const fetchAssignedOrders = useCallback(async () => {
    if (!isOnline) {
      debugLog('⚠️ Delivery person is offline, skipping order fetch')
      return
    }

    try {
      debugLog('📦 Fetching assigned orders from API...')
      const response = await deliveryAPI.getOrders({
        limit: 50, // Get up to 50 pending orders
        page: 1,
        includeDelivered: false, // Only get active orders
        discover: true // Include unassigned preparing/ready orders for pickup discovery
      })

      const ordersPayload = response?.data?.data || {}
      if (ordersPayload?.canReceiveNewOrders === false) {
        setCashLimitWarningMessage(
          ordersPayload?.cashLimitWarning || "Deposit cash to continue"
        )
      } else {
        setCashLimitWarningMessage("")
      }

      if (response?.data?.success && response?.data?.data?.orders) {
        const orders = response.data.data.orders
        debugLog(`✅ Found ${orders.length} assigned order(s)`)
        
        // Filter out orders that are already accepted or delivered
        const pendingOrders = orders.filter(order => {
          const orderStatus = order.status
          const deliveryPhase = order.deliveryState?.currentPhase
          
          // Skip if already delivered or completed
          if (orderStatus === 'delivered' || deliveryPhase === 'completed') {
            return false
          }
          
          // Skip if already accepted (has deliveryState with accepted status)
          if (order.deliveryState?.status === 'accepted' || 
              order.deliveryState?.status === 'reached_pickup' ||
              order.deliveryState?.status === 'order_confirmed' ||
              deliveryPhase === 'en_route_to_pickup' ||
              deliveryPhase === 'at_pickup' ||
              deliveryPhase === 'en_route_to_delivery' ||
              deliveryPhase === 'at_delivery') {
            return false
          }
          
          return true
        })

        if (pendingOrders.length > 0) {
          debugLog(`📦 Found ${pendingOrders.length} new pending order(s) to show`)
          
          // Show the first pending order as a new order notification
          const firstOrder = pendingOrders[0]
          const orderId = firstOrder.orderId || firstOrder._id?.toString()
          
          // Check if this order is already being shown or accepted
          if (acceptedOrderIdsRef.current.has(orderId)) {
            debugLog('⚠️ Order already accepted, skipping:', orderId)
            return
          }

          // Transform order data to match selectedRestaurant format
          // Fetch restaurant address with proper priority
          let restaurantAddress = 'Restaurant address';
          if (firstOrder.restaurantId?.address) {
            restaurantAddress = firstOrder.restaurantId.address;
          } else if (firstOrder.restaurantId?.location?.formattedAddress) {
            restaurantAddress = firstOrder.restaurantId.location.formattedAddress;
          } else if (firstOrder.restaurantId?.location?.address) {
            restaurantAddress = firstOrder.restaurantId.location.address;
          } else if (firstOrder.restaurantId?.location?.street) {
            // Build address from location fields
            const loc = firstOrder.restaurantId.location;
            const parts = [loc.street, loc.city, loc.state, loc.pincode].filter(Boolean);
            restaurantAddress = parts.join(', ') || 'Restaurant address';
          }
          
          debugLog('📍 Restaurant address extracted from assigned order:', {
            address: restaurantAddress,
            hasRestaurantId: !!firstOrder.restaurantId,
            hasLocation: !!firstOrder.restaurantId?.location
          });
          
          // Calculate pickup distance if not provided
          let pickupDistance = null;
          if (firstOrder.assignmentInfo?.distance) {
            pickupDistance = `${firstOrder.assignmentInfo.distance.toFixed(2)} km`;
          } else {
            // Try to calculate from driver's current location to restaurant
            const currentLocation = riderLocation || lastLocationRef.current;
            const restaurantLat = firstOrder.restaurantId?.location?.coordinates?.[1];
            const restaurantLng = firstOrder.restaurantId?.location?.coordinates?.[0];
            
            if (currentLocation && currentLocation.length === 2 && 
                restaurantLat && restaurantLng && 
                !isNaN(restaurantLat) && !isNaN(restaurantLng)) {
              // Calculate distance in meters, then convert to km
              const distanceInMeters = calculateDistance(
                currentLocation[0], 
                currentLocation[1], 
                restaurantLat, 
                restaurantLng
              );
              const distanceInKm = distanceInMeters / 1000;
              pickupDistance = `${distanceInKm.toFixed(2)} km`;
              debugLog('📍 Calculated pickup distance from assigned order:', pickupDistance);
            }
          }
          
          // Default to 'Calculating...' if still no distance
          if (!pickupDistance || pickupDistance === '0 km') {
            pickupDistance = 'Calculating...';
          }
          
          const restaurantData = {
            id: firstOrder._id?.toString() || firstOrder.orderId,
            orderId: firstOrder.orderId,
            name: firstOrder.restaurantId?.name || 'Restaurant',
            address: restaurantAddress,
            lat: firstOrder.restaurantId?.location?.coordinates?.[1],
            lng: firstOrder.restaurantId?.location?.coordinates?.[0],
            distance: pickupDistance,
            timeAway: pickupDistance !== 'Calculating...' ? calculateTimeAway(pickupDistance) : 'Calculating...',
            dropDistance: firstOrder.address?.location?.coordinates 
              ? 'Calculating...' 
              : '0 km',
            pickupDistance: pickupDistance,
            estimatedEarnings: firstOrder.pricing?.deliveryFee || 0,
            customerName: firstOrder.userId?.name || 'Customer',
            customerAddress: firstOrder.address?.formattedAddress || 
                           (firstOrder.address?.street 
                             ? `${firstOrder.address.street}, ${firstOrder.address.city || ''}, ${firstOrder.address.state || ''}`.trim()
                             : 'Customer address'),
            customerLat: firstOrder.address?.location?.coordinates?.[1],
            customerLng: firstOrder.address?.location?.coordinates?.[0],
            items: firstOrder.items || [],
            total: firstOrder.pricing?.total || 0,
            paymentMethod: firstOrder.paymentMethod || firstOrder.payment?.method || 'cod',
            amount: firstOrder.pricing?.total || 0,
            deliveryVerification: firstOrder.deliveryVerification || null
          }
          
          setSelectedRestaurant(restaurantData)
          setShowNewOrderPopup(true)
          setCountdownSeconds(300) // Reset countdown to 5 minutes
          debugLog('✅ Showing pending order notification:', orderId)
        } else {
          debugLog('ℹ️ No pending orders found')
        }
      } else {
        debugLog('ℹ️ No orders in response or response format unexpected')
      }
    } catch (error) {
      debugError('❌ Error fetching assigned orders:', error)
      // Don't show error to user, just log it
    }
  }, [isOnline, calculateTimeAway])

  // Fetch assigned orders when delivery person goes online
  useEffect(() => {
    if (isOnline) {
      // Small delay to ensure socket connection is established
      const timeoutId = setTimeout(() => {
        fetchAssignedOrders()
      }, 2000) // Wait 2 seconds after going online

      return () => clearTimeout(timeoutId)
    }
  }, [isOnline, fetchAssignedOrders])

  // Re-check available assignments whenever the delivery socket connects.
  // This covers cases where an order was assigned before the room join finished.
  useEffect(() => {
    if (!isOnline || !isConnected) {
      return
    }

    const timeoutId = setTimeout(() => {
      fetchAssignedOrders()
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [isOnline, isConnected, fetchAssignedOrders])

  // Keep a lightweight background sync running while online so riders do not
  // have to manually refresh if a realtime event is missed.
  useEffect(() => {
    if (!isOnline) {
      return
    }

    const intervalId = setInterval(() => {
      if (showNewOrderPopup || activeOrder || selectedRestaurant) {
        return
      }

      fetchAssignedOrders()
    }, 15000)

    return () => clearInterval(intervalId)
  }, [isOnline, showNewOrderPopup, activeOrder, selectedRestaurant, fetchAssignedOrders])

  // Also fetch orders on initial page load if already online
  useEffect(() => {
    // Check if delivery person is already online when component mounts
    const storedOnlineStatus = localStorage.getItem('delivery_online_status')
    const isCurrentlyOnline = storedOnlineStatus === 'true' || isOnline
    
    if (isCurrentlyOnline) {
      // Fetch orders after a short delay to ensure everything is initialized
      const timeoutId = setTimeout(() => {
        fetchAssignedOrders()
      }, 3000) // Wait 3 seconds on page load

      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // Fetch bank details status and delivery partner status
  useEffect(() => {
    const checkBankDetails = async () => {
      try {
        const response = await deliveryAPI.getProfile()
        if (response?.data?.success && response?.data?.data?.profile) {
          const profile = response.data.data.profile
          const bankDetails = profile?.documents?.bankDetails
          
          // Store delivery partner status first
          if (profile?.status) {
            setDeliveryStatus(profile.status)
          }
          
          // Store rejection reason if status is blocked
          if (profile?.status === 'blocked' && profile?.rejectionReason) {
            setRejectionReason(profile.rejectionReason)
          } else {
            setRejectionReason(null)
          }
          
          // Only check bank details if status is approved/active
          // Pending users don't need bank details check
          if (profile?.status && profile.status !== 'pending') {
            // Check if all required bank details fields are filled
            const isFilled = !!(
              bankDetails?.accountHolderName?.trim() &&
              bankDetails?.accountNumber?.trim() &&
              bankDetails?.ifscCode?.trim() &&
              bankDetails?.bankName?.trim()
            )
            
            setBankDetailsFilled(isFilled)
          } else {
            // For pending status, don't show bank details banner
            setBankDetailsFilled(true) // Set to true to hide banner
          }
        }
      } catch (error) {
        // Only log error if it's not a network or timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          debugError("Error checking bank details:", error)
        }
        // Default to showing the bank details banner if we can't check (only for approved users)
        // For network/timeout errors, DON'T override deliveryStatus to 'pending'
        // so that already-approved riders don't see the verification banner again.
        if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          // Keep existing deliveryStatus; just hide bank-details banner so UI doesn't block
          setBankDetailsFilled(true)
        } else {
          setBankDetailsFilled(false)
        }
      }
    }

    checkBankDetails()

    // Listen for profile updates
    const handleProfileRefresh = () => {
      checkBankDetails()
    }

    window.addEventListener('deliveryProfileRefresh', handleProfileRefresh)
    
    return () => {
      window.removeEventListener('deliveryProfileRefresh', handleProfileRefresh)
    }
  }, [])

  // Handle reverify (resubmit for approval)
  const handleReverify = async () => {
    try {
      setIsReverifying(true)
      await deliveryAPI.reverify()
      
      // Refresh profile to get updated status
      const response = await deliveryAPI.getProfile()
      if (response?.data?.success && response?.data?.data?.profile) {
        const profile = response.data.data.profile
        setDeliveryStatus(profile.status)
        setRejectionReason(null)
      }
      
      alert("Your request has been resubmitted for verification. Admin will review it soon.")
    } catch (err) {
      debugError("Error reverifying:", err)
      alert(err.response?.data?.message || "Failed to resubmit request. Please try again.")
    } finally {
      setIsReverifying(false)
    }
  }

  // Ola Maps SDK check removed

  // Re-run map init when container might have become available (ref can be null on first run)
  const [mapInitRetry, setMapInitRetry] = useState(0)

  // Initialize Google Map - Preserve map across navigation, re-attach when returning
  useEffect(() => {
    if (showHomeSections) {
      debugLog('📍 Map view hidden (showHomeSections is true)');
      return;
    }

    if (!mapContainerRef.current) {
      debugLog('📍 Map container ref not available yet, will retry...');
      if (mapInitRetry < 10) {
        const timer = setTimeout(() => setMapInitRetry((r) => r + 1), 200);
        return () => clearTimeout(timer);
      }
      return;
    }

    // Store preserved state for re-initialization after navigation
    let preservedState = null;
    
    // If map instance exists, preserve state before re-initializing
    if (window.deliveryMapInstance) {
      const existingMap = window.deliveryMapInstance;
      const existingBikeMarker = bikeMarkerRef.current;
      const existingPolyline = routePolylineRef.current;
      
      debugLog('📍 Map instance exists, preserving state for re-initialization...');
      
      // Check if map is already attached to current container
      try {
        const mapDiv = existingMap.getDiv();
        if (mapDiv && mapDiv === mapContainerRef.current) {
          debugLog('📍 Map already attached to current container, skipping re-initialization');
          return; // Map is already properly attached, no need to re-initialize
        }
      } catch (error) {
        // Map div check failed, will re-initialize
        debugLog('📍 Map container check failed, will re-initialize');
      }
      
      // Store map state safely
      try {
        preservedState = {
          center: existingMap.getCenter(),
          zoom: existingMap.getZoom(),
          bikeMarkerPosition: null,
          bikeMarkerHeading: null,
          hasPolyline: !!existingPolyline
        };
        
        // Store bike marker state
        if (existingBikeMarker) {
          const pos = existingBikeMarker.getPosition();
          if (pos) {
            preservedState.bikeMarkerPosition = { lat: pos.lat(), lng: pos.lng() };
            // Get heading from icon rotation if available
            const icon = existingBikeMarker.getIcon();
            if (icon && typeof icon === 'object' && icon.rotation !== undefined) {
              preservedState.bikeMarkerHeading = icon.rotation;
            }
          }
        }
      } catch (error) {
        debugWarn('⚠️ Error preserving map state:', error);
        preservedState = null;
      }
      
      // Remove markers from old map before clearing (safely)
      try {
        if (existingBikeMarker && typeof existingBikeMarker.setMap === 'function') {
          existingBikeMarker.setMap(null);
        }
        if (existingPolyline && typeof existingPolyline.setMap === 'function') {
          existingPolyline.setMap(null);
        }
      } catch (error) {
        debugWarn('⚠️ Error removing markers from old map:', error);
      }
      
      // Clear old map instance reference (will be re-created below)
      // Markers preserved in refs, will be re-attached after map initialization
      window.deliveryMapInstance = null;
    }

    debugLog('📍 Starting map initialization...');

    // Load Google Maps if not already loaded
    const loadGoogleMapsIfNeeded = async () => {
      // Check if already loaded
      if (window.google && window.google.maps) {
        debugLog('✅ Google Maps already loaded');
        // Wait a bit to ensure ref is available
        await new Promise(resolve => setTimeout(resolve, 100));
        initializeGoogleMap();
        return;
      }
      
      // Check if script tag is already present (from main.jsx)
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript || window.__googleMapsLoading) {
        debugLog('📍 Google Maps is already being loaded, waiting...');
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        
        while ((!window.google || !window.google.maps) && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (window.google && window.google.maps) {
          debugLog('✅ Google Maps loaded via script tag');
          await initializeGoogleMap();
          return;
        }
      }
      
      // Only use Loader if no script tag exists and not already loading
      if (!existingScript && !window.__googleMapsLoading) {
        debugLog('📍 Google Maps not loaded, using Loader as fallback...');
        window.__googleMapsLoading = true;
        try {
          const apiKey = await getGoogleMapsApiKey();
          if (apiKey) {
            const loader = new Loader({
              apiKey: apiKey,
              version: "weekly",
              libraries: ["places", "geometry", "drawing"]
            });
            await loader.load();
            debugLog('✅ Google Maps loaded via Loader');
            window.__googleMapsLoaded = true;
            window.__googleMapsLoading = false;
            await initializeGoogleMap();
            return;
          } else {
            debugError('❌ No Google Maps API key found');
            window.__googleMapsLoading = false;
            setMapLoading(false);
            return;
          }
        } catch (error) {
          debugError('❌ Error loading Google Maps:', error);
          window.__googleMapsLoading = false;
          setMapLoading(false);
          return;
        }
      } else {
        // Wait a bit more if script is loading
        let attempts = 0;
        const maxAttempts = 30; // 3 seconds
        while ((!window.google || !window.google.maps) && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (window.google && window.google.maps) {
          debugLog('✅ Google Maps loaded via script tag');
          await initializeGoogleMap();
          return;
        } else {
          debugError('❌ Google Maps failed to load');
          setMapLoading(false);
          return;
        }
      }
      // IMPORTANT: initializeGoogleMap() is intentionally called once per load path above.

    };

    loadGoogleMapsIfNeeded();

    async function initializeGoogleMap() {
      try {
        // Wait for map container ref to be available
        if (!mapContainerRef.current) {
          debugLog('📍 Map container ref not available yet, waiting...');
          let attempts = 0;
          const maxAttempts = 50; // 5 seconds max wait
          
          while (!mapContainerRef.current && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
          }
          
          if (!mapContainerRef.current) {
            debugError('❌ Map container ref is still null after waiting');
            setMapLoading(false);
            return;
          }
        }

        if (!window.google || !window.google.maps) {
          debugError('❌ Google Maps API not available');
          setMapLoading(false);
          return;
        }

        debugLog('📍 Initializing Google Map with container:', mapContainerRef.current);
        setMapLoading(true);
        
        // Get location from multiple sources (priority: riderLocation > saved location > wait for GPS)
        let initialCenter = null;
        
        if (riderLocation && riderLocation.length === 2) {
          // Use current rider location
          initialCenter = { lat: riderLocation[0], lng: riderLocation[1] };
          debugLog('📍 Using current rider location for map center:', initialCenter);
        } else {
          // Try to get from localStorage (saved location from previous session)
          const savedLocation = localStorage.getItem('deliveryBoyLastLocation');
          if (savedLocation) {
            try {
              const parsed = JSON.parse(savedLocation);
              if (parsed && Array.isArray(parsed) && parsed.length === 2) {
                const [lat, lng] = parsed;
                // Validate coordinates
                if (typeof lat === 'number' && typeof lng === 'number' &&
                    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                  initialCenter = { lat, lng };
                  debugLog('📍 Using saved location from localStorage for map center:', initialCenter);
                }
              }
            } catch (e) {
              debugWarn('⚠️ Error parsing saved location:', e);
            }
          }
        }
        
        // If still no location, use default India center so map always loads.
        // When GPS location is received, map will recenter and show bike marker.
        if (!initialCenter) {
          initialCenter = { lat: 20.5937, lng: 78.9629 };
          debugLog('📍 No location yet, using default center (India). Map will recenter when GPS is available.');
        }
        
        debugLog('📍 Map center:', initialCenter);
        
        // Check if MapTypeId is available, use string fallback if not
        // Always use string 'roadmap' to avoid MapTypeId enum issues
        const mapTypeId = (window.google?.maps?.MapTypeId?.ROADMAP !== undefined) 
          ? window.google.maps.MapTypeId.ROADMAP 
          : 'roadmap';
        
        debugLog('📍 MapTypeId:', mapTypeId);
        debugLog('📍 Google Maps API check:', {
          google: !!window.google,
          maps: !!window.google?.maps,
          MapTypeId: !!window.google?.maps?.MapTypeId,
          ROADMAP: window.google?.maps?.MapTypeId?.ROADMAP !== undefined
        });
        
        // Wrap map initialization in try-catch to handle any Google Maps internal errors
        let map;
        try {
          map = new window.google.maps.Map(mapContainerRef.current, {
            center: initialCenter,
            zoom: 18,
            minZoom: 10, // Minimum zoom level (city/area view)
            maxZoom: 21, // Maximum zoom level - allow full zoom
            mapTypeId: mapTypeId,
            tilt: 45,
            heading: 0,
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false
          });
        } catch (mapError) {
          debugError('❌ Error creating Google Map:', mapError);
          debugError('❌ Error details:', {
            message: mapError.message,
            name: mapError.name,
            stack: mapError.stack
          });
          setMapLoading(false);
          return;
        }

        // Store map instance
        window.deliveryMapInstance = map;
        debugLog('✅ Map instance created and stored');
        
        // Add error listener for map errors (if available)
        try {
          if (window.google.maps.event) {
            window.google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
              debugLog('✅ Map tiles loaded successfully');
            });
          }
        } catch (eventError) {
          debugWarn('⚠️ Could not add map event listeners:', eventError);
        }
        
        // Add error listener for map errors
        window.google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
          debugLog('✅ Map tiles loaded successfully');
        });
        
        // Handle map errors
        window.google.maps.event.addListener(map, 'error', (error) => {
          debugError('❌ Google Map error:', error);
        });

        // Track user panning to disable auto-center when user manually moves map
        let isUserPanning = false;
        let panTimeout = null;
        
        map.addListener('dragstart', () => {
          isUserPanning = true;
          isUserPanningRef.current = true;
          if (panTimeout) clearTimeout(panTimeout);
        });
        
        map.addListener('dragend', () => {
          // Re-enable auto-center after 5 seconds of no panning
          panTimeout = setTimeout(() => {
            isUserPanning = false;
            isUserPanningRef.current = false;
          }, 5000);
        });
        
        // Also track zoom changes as user interaction
        map.addListener('zoom_changed', () => {
          isUserPanning = true;
          isUserPanningRef.current = true;
          if (panTimeout) clearTimeout(panTimeout);
          panTimeout = setTimeout(() => {
            isUserPanning = false;
            isUserPanningRef.current = false;
          }, 5000);
          
          // Allow full zoom - no limit
          // Removed zoom limit to allow full zoom in
        });

        // Restore preserved state if coming back from navigation
        if (preservedState) {
          if (preservedState.center && preservedState.zoom) {
            map.setCenter(preservedState.center);
            map.setZoom(preservedState.zoom);
            debugLog('📍 Restored map center and zoom after navigation');
          }
          
          // Re-create bike marker if it existed before navigation
          if (preservedState.bikeMarkerPosition && isOnlineRef.current) {
            debugLog('📍 Re-creating bike marker after navigation:', preservedState.bikeMarkerPosition);
            createOrUpdateBikeMarker(
              preservedState.bikeMarkerPosition.lat, 
              preservedState.bikeMarkerPosition.lng, 
              preservedState.bikeMarkerHeading,
              false // Don't center when restoring from navigation
            );
          }
          
          // Don't re-attach route polyline on refresh - only show if there's an active order
          // This prevents showing default/mock polylines on page refresh
          if (preservedState.hasPolyline && routePolylineRef.current && selectedRestaurant) {
            // Only re-attach if we have an active order
            if (routeHistoryRef.current.length >= 2) {
              routePolylineRef.current.setMap(map);
              debugLog('✅ Route polyline re-attached after navigation');
            }
          } else if (!selectedRestaurant && routePolylineRef.current) {
            // Clear polyline if no active order
            routePolylineRef.current.setMap(null);
            routePolylineRef.current = null;
          }
          
          // Clear live tracking polyline if no active order
          if (!selectedRestaurant && liveTrackingPolylineRef.current) {
            liveTrackingPolylineRef.current.setMap(null);
            liveTrackingPolylineRef.current = null;
          }
          if (!selectedRestaurant && liveTrackingPolylineShadowRef.current) {
            liveTrackingPolylineShadowRef.current.setMap(null);
            liveTrackingPolylineShadowRef.current = null;
          }
        } else {
          // Initialize route history with current location (first time initialization)
          if (riderLocation && riderLocation.length === 2) {
            routeHistoryRef.current = [{
              lat: riderLocation[0],
              lng: riderLocation[1]
            }];
            lastLocationRef.current = riderLocation;
            
            // Always add bike marker if location is available (both online and offline)
            debugLog('📍 Creating bike marker on map init');
            createOrUpdateBikeMarker(riderLocation[0], riderLocation[1], null, true);
          }
        }

        map.addListener('tilesloaded', () => {
          setMapLoading(false);
          // Ensure bike marker is visible after tiles load (always show, both online and offline)
          if (riderLocation && riderLocation.length === 2) {
            setTimeout(() => {
              if (!bikeMarkerRef.current || bikeMarkerRef.current.getMap() === null) {
                debugLog('📍 Re-adding bike marker after tiles loaded');
                createOrUpdateBikeMarker(riderLocation[0], riderLocation[1], null);
              }
            }, 500);
          } else {
            // Try to get location from localStorage if current location not available
            const savedLocation = localStorage.getItem('deliveryBoyLastLocation');
            if (savedLocation) {
              try {
                const parsed = JSON.parse(savedLocation);
                if (parsed && Array.isArray(parsed) && parsed.length === 2) {
                  debugLog('📍 Creating bike marker from saved location after tiles loaded');
                  setTimeout(() => {
                    createOrUpdateBikeMarker(parsed[0], parsed[1], null);
                  }, 500);
                }
              } catch (e) {
                debugWarn('⚠️ Error using saved location:', e);
              }
            }
          }
          
          // Ensure restaurant marker is visible if we have a selected restaurant
          if (selectedRestaurant && selectedRestaurant.lat && selectedRestaurant.lng) {
            setTimeout(() => {
              if (!restaurantMarkerRef.current || restaurantMarkerRef.current.getMap() === null) {
                debugLog('📍 Re-adding restaurant marker after tiles loaded');
                const restaurantLocation = {
                  lat: selectedRestaurant.lat,
                  lng: selectedRestaurant.lng
                };
                
                createRestaurantMapMarker(restaurantLocation, selectedRestaurant.name || 'Restaurant')
              }
            }, 500);
          }
          
          // Load and draw nearby zones after map is ready
          setTimeout(() => {
            fetchAndDrawNearbyZones();
          }, 1000);
        });

        debugLog('✅ Google Map initialized');
      } catch (error) {
        debugError('❌ Error initializing Google Map:', error);
        setMapLoading(false);
      }
    }

    // Cleanup function - DON'T clear map instance on navigation (preserve it for return)
    return () => {
      // Preserve map instance and markers for navigation
      // Map will be re-initialized when component mounts again
      debugLog('📍 Component cleanup - preserving map instance for navigation');
      
      // Don't clear map instance - preserve it in window.deliveryMapInstance
      // Don't clear bike marker - preserve it in bikeMarkerRef
      // Only temporarily remove polyline from map (preserve reference)
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        // Don't set to null - preserve reference for re-attachment
      }
    }
  }, [showHomeSections, mapInitRetry]) // Re-run when showHomeSections or container retry

  // Map is initialized by the primary loader effect above.
  // Keep this no-op to avoid duplicate initialization flicker/glitches.
  useEffect(() => {}, [riderLocation, showHomeSections])

  // Update bike marker when going online - ensure bike appears immediately
  useEffect(() => {
    debugLog('🔄 Online status effect triggered:', { 
      isOnline, 
      showHomeSections, 
      hasMap: !!window.deliveryMapInstance,
      riderLocation 
    });

    if (showHomeSections || !window.deliveryMapInstance) {
      return;
    }

    // Always show bike marker on map (both offline and online)
    // When going online/offline, ensure bike marker is visible at current location IMMEDIATELY
    if (riderLocation && riderLocation.length === 2) {
      // Calculate heading if we have previous location
      let heading = null;
      if (lastLocationRef.current) {
        const [prevLat, prevLng] = lastLocationRef.current;
        heading = calculateHeading(prevLat, prevLng, riderLocation[0], riderLocation[1]);
      }

      debugLog('✅ User went ONLINE - creating/updating bike marker immediately at:', riderLocation);

      // Create or update bike marker IMMEDIATELY (blue dot à¤•à¥€ à¤œà¤—à¤¹ bike icon)
      createOrUpdateBikeMarker(riderLocation[0], riderLocation[1], heading, true);
      
      // Center map on bike location smoothly
      window.deliveryMapInstance.panTo({
        lat: riderLocation[0],
        lng: riderLocation[1]
      });

      // Initialize route history if empty
      if (routeHistoryRef.current.length === 0) {
        routeHistoryRef.current = [{
          lat: riderLocation[0],
          lng: riderLocation[1]
        }];
      }

      // Update route polyline only if there's an active order
      if (selectedRestaurant) {
        updateRoutePolyline();
      } else {
        // Clear any existing polylines if no active order
        if (routePolylineRef.current) {
          routePolylineRef.current.setMap(null);
          routePolylineRef.current = null;
        }
        if (liveTrackingPolylineRef.current) {
          liveTrackingPolylineRef.current.setMap(null);
          liveTrackingPolylineRef.current = null;
        }
        if (liveTrackingPolylineShadowRef.current) {
          liveTrackingPolylineShadowRef.current.setMap(null);
          liveTrackingPolylineShadowRef.current = null;
        }
      }

      debugLog('✅ Bike marker created/updated when going online:', riderLocation);
    } else {
      // Try to get location from localStorage if current location not available
      const savedLocation = localStorage.getItem('deliveryBoyLastLocation')
      if (savedLocation) {
        try {
          const parsed = JSON.parse(savedLocation)
          if (parsed && Array.isArray(parsed) && parsed.length === 2) {
            const [lat, lng] = parsed
            
            // Validate and check for coordinate swap
            if (typeof lat === 'number' && typeof lng === 'number' &&
                lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
              const mightBeSwapped = (lat >= 68 && lat <= 98 && lng >= 8 && lng <= 38)
              
              if (mightBeSwapped) {
                debugWarn('⚠️ Saved coordinates might be swapped - correcting:', {
                  original: [lat, lng],
                  corrected: [lng, lat]
                })
                createOrUpdateBikeMarker(lng, lat, null, true)
              } else {
                debugLog('📍 Using saved location from localStorage:', {
                  location: parsed,
                  format: "[lat, lng]"
                })
                createOrUpdateBikeMarker(parsed[0], parsed[1], null, true)
              }
            } else {
              debugWarn('⚠️ Invalid saved coordinates:', parsed)
            }
          }
        } catch (e) {
          debugWarn('⚠️ Error using saved location:', e)
        }
      } else {
        debugWarn('⚠️ Cannot create bike marker - invalid rider location:', riderLocation);
      }
    }
  }, [isOnline, riderLocation, showHomeSections])

  // Safeguard: Ensure bike marker and restaurant marker stay on map (prevent them from disappearing)
  // Always show bike marker regardless of online/offline status
  useEffect(() => {
    if (showHomeSections || !window.deliveryMapInstance) return;

    // Check every 2 seconds if markers are still on map
    const checkInterval = setInterval(() => {
      // Check bike marker
      if (riderLocation && riderLocation.length === 2) {
        if (bikeMarkerRef.current) {
          const markerMap = bikeMarkerRef.current.getMap();
          if (markerMap === null) {
            debugWarn('⚠️ Bike marker lost map reference, re-adding...');
            createOrUpdateBikeMarker(riderLocation[0], riderLocation[1], null, false);
          }
        } else {
          // Marker doesn't exist, create it
          debugWarn('⚠️ Bike marker missing, creating...');
          createOrUpdateBikeMarker(riderLocation[0], riderLocation[1], null, false);
        }
      }
      
      // Check restaurant marker
      if (selectedRestaurant && selectedRestaurant.lat && selectedRestaurant.lng) {
        if (restaurantMarkerRef.current) {
          const markerMap = restaurantMarkerRef.current.getMap();
          if (markerMap === null || markerMap !== window.deliveryMapInstance) {
            debugWarn('⚠️ Restaurant marker lost map reference, re-adding...');
            const restaurantLocation = {
              lat: selectedRestaurant.lat,
              lng: selectedRestaurant.lng
            };
            
            restaurantMarkerRef.current.setMap(window.deliveryMapInstance);
            restaurantMarkerRef.current.setPosition(restaurantLocation);
            restaurantMarkerRef.current.setIcon(getRestaurantMarkerIcon());
            restaurantMarkerRef.current.setTitle(selectedRestaurant.name || 'Restaurant');
            restaurantMarkerRef.current.setZIndex(1200);
          }
        } else {
          // Marker doesn't exist, create it
          debugWarn('⚠️ Restaurant marker missing, creating...');
          const restaurantLocation = {
            lat: selectedRestaurant.lat,
            lng: selectedRestaurant.lng
          };
          
          createRestaurantMapMarker(restaurantLocation, selectedRestaurant.name || 'Restaurant')
        }
      }

      // Check customer marker
      const customerDestination = getCustomerDestination(selectedRestaurant)
      if (selectedRestaurant && customerDestination) {
        const customerLocation = {
          lat: customerDestination.lat,
          lng: customerDestination.lng
        };

        if (customerMarkerRef.current) {
          const markerMap = customerMarkerRef.current.getMap();
          if (markerMap === null || markerMap !== window.deliveryMapInstance) {
            customerMarkerRef.current.setMap(window.deliveryMapInstance);
            customerMarkerRef.current.setPosition(customerLocation);
          }
        } else if (window.google?.maps && window.deliveryMapInstance) {
          customerMarkerRef.current = new window.google.maps.Marker({
            position: customerLocation,
            map: window.deliveryMapInstance,
            icon: {
              url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="11" fill="#10B981" stroke="#FFFFFF" stroke-width="2"/>
                  <circle cx="12" cy="9" r="3" fill="#FFFFFF"/>
                  <path d="M7.5 16.5c0-2 1.8-3.5 4.5-3.5s4.5 1.5 4.5 3.5" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              `),
              scaledSize: new window.google.maps.Size(48, 48),
              anchor: new window.google.maps.Point(24, 48)
            },
            title: selectedRestaurant.customerName || 'Customer',
            zIndex: 1150
          });
        }
      }
    }, 2000); // Check every 2 seconds

    return () => clearInterval(checkInterval);
  }, [createRestaurantMapMarker, getRestaurantMarkerIcon, riderLocation, selectedRestaurant, showHomeSections])

  // Create restaurant marker when selectedRestaurant changes
  useEffect(() => {
    if (!window.deliveryMapInstance || !selectedRestaurant || !selectedRestaurant.lat || !selectedRestaurant.lng) {
      return;
    }

    // Only create marker if it doesn't exist or is on wrong map
    if (!restaurantMarkerRef.current || restaurantMarkerRef.current.getMap() !== window.deliveryMapInstance) {
      const restaurantLocation = {
        lat: selectedRestaurant.lat,
        lng: selectedRestaurant.lng
      };
      
      // Remove old marker if exists
      if (directionsDestinationMarkerRef.current) {
        directionsDestinationMarkerRef.current.setMap(null);
      }
      
      // Create new restaurant marker
          createRestaurantMapMarker(restaurantLocation, selectedRestaurant.name || 'Restaurant')
          
          debugLog('✅ Restaurant marker created/updated on main map');
        } else {
          // Update position if marker exists
          restaurantMarkerRef.current.setPosition({
            lat: selectedRestaurant.lat,
            lng: selectedRestaurant.lng
          });
          restaurantMarkerRef.current.setIcon(getRestaurantMarkerIcon());
          restaurantMarkerRef.current.setMap(window.deliveryMapInstance);
          restaurantMarkerRef.current.setTitle(selectedRestaurant.name || 'Restaurant');
          restaurantMarkerRef.current.setZIndex(1200);
        }
  }, [createRestaurantMapMarker, getRestaurantMarkerIcon, selectedRestaurant?.lat, selectedRestaurant?.lng, selectedRestaurant?.name])

  // Create/update customer marker on main map so delivery destination icon is always visible.
  useEffect(() => {
    if (!window.deliveryMapInstance || !selectedRestaurant) return;

    const hasCustomerCoords =
      selectedRestaurant?.customerLat != null &&
      selectedRestaurant?.customerLng != null &&
      Number.isFinite(Number(selectedRestaurant.customerLat)) &&
      Number.isFinite(Number(selectedRestaurant.customerLng));

    if (!hasCustomerCoords) {
      if (customerMarkerRef.current) {
        customerMarkerRef.current.setMap(null);
        customerMarkerRef.current = null;
      }
      return;
    }

    const customerLocation = {
      lat: Number(selectedRestaurant.customerLat),
      lng: Number(selectedRestaurant.customerLng)
    };

    const customerIcon = {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="11" fill="#10B981" stroke="#FFFFFF" stroke-width="2"/>
          <circle cx="12" cy="9" r="3" fill="#FFFFFF"/>
          <path d="M7.5 16.5c0-2 1.8-3.5 4.5-3.5s4.5 1.5 4.5 3.5" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      `),
      scaledSize: new window.google.maps.Size(48, 48),
      anchor: new window.google.maps.Point(24, 48)
    };

    if (!customerMarkerRef.current) {
      customerMarkerRef.current = new window.google.maps.Marker({
        position: customerLocation,
        map: window.deliveryMapInstance,
        icon: customerIcon,
        title: selectedRestaurant.customerName || 'Customer',
        zIndex: 1150
      });
    } else {
      customerMarkerRef.current.setPosition(customerLocation);
      customerMarkerRef.current.setIcon(customerIcon);
      customerMarkerRef.current.setTitle(selectedRestaurant.customerName || 'Customer');
      customerMarkerRef.current.setMap(window.deliveryMapInstance);
    }
  }, [selectedRestaurant?.customerLat, selectedRestaurant?.customerLng, selectedRestaurant?.customerName])

  useEffect(() => {
    if (selectedRestaurant) return;
    if (customerMarkerRef.current) {
      customerMarkerRef.current.setMap(null);
      customerMarkerRef.current = null;
    }
  }, [selectedRestaurant])

  // Calculate route using Google Maps Directions API (Zomato-style road-based routing)
  // Optimized for TWO_WHEELER mode with DRIVING fallback
  // NOTE: Must be defined BEFORE the useEffect that uses it (Rules of Hooks)
  const calculateRouteWithDirectionsAPI = useCallback(async (origin, destination) => {
    if (!ENABLE_GOOGLE_DIRECTIONS) {
      return null;
    }
    if (!window.google || !window.google.maps || !window.google.maps.DirectionsService) {
      debugWarn('⚠️ Google Maps Directions API not available');
      return null;
    }

    if (!Array.isArray(origin) || origin.length < 2 || !destination) {
      return null;
    }

    const originLat = Number(origin[0]);
    const originLng = Number(origin[1]);
    const destLat = Number(destination.lat);
    const destLng = Number(destination.lng);
    if (
      !Number.isFinite(originLat) ||
      !Number.isFinite(originLng) ||
      !Number.isFinite(destLat) ||
      !Number.isFinite(destLng)
    ) {
      return null;
    }

    const round = (v) => Math.round(v * 10000) / 10000; // ~11m precision
    const routeKey = `${round(originLat)},${round(originLng)}|${round(destLat)},${round(destLng)}`;
    const now = Date.now();

    // Reuse recently fetched route to minimize Google Directions calls.
    const cached = directionsApiCacheRef.current.get(routeKey);
    if (cached && (now - cached.timestamp) < 180000) { // 3 minutes
      setDirectionsResponse(cached.result);
      directionsResponseRef.current = cached.result;
      return cached.result;
    }

    // Skip duplicate back-to-back requests for same route.
    if (
      directionsApiLastRequestRef.current.key === routeKey &&
      (now - directionsApiLastRequestRef.current.timestamp) < 10000
    ) {
      return directionsResponseRef.current || null;
    }
    directionsApiLastRequestRef.current = { key: routeKey, timestamp: now };

    try {
      // Initialize Directions Service if not already created
      if (!directionsServiceRef.current) {
        directionsServiceRef.current = new window.google.maps.DirectionsService();
      }

      // Try TWO_WHEELER first (optimized for bike/delivery), fallback to DRIVING
      const tryRoute = (travelMode, modeName) => {
        return new Promise((resolve, reject) => {
          directionsServiceRef.current.route(
            {
              origin: { lat: origin[0], lng: origin[1] },
              destination: { lat: destination.lat, lng: destination.lng },
              travelMode: travelMode,
              provideRouteAlternatives: false, // Save API cost - don't get alternatives
              avoidHighways: false,
              avoidTolls: false,
              optimizeWaypoints: false
            },
            (result, status) => {
              if (status === window.google.maps.DirectionsStatus.OK) {
                debugLog(`✅ Directions API route calculated successfully (${modeName})`);
                debugLog('📍 Route details:', {
                  distance: result.routes[0].legs[0].distance?.text,
                  duration: result.routes[0].legs[0].duration?.text,
                  steps: result.routes[0].legs[0].steps?.length,
                  travelMode: modeName
                });
                setDirectionsResponse(result);
                directionsResponseRef.current = result; // Store in ref for callbacks
                directionsApiCacheRef.current.set(routeKey, { result, timestamp: Date.now() });
                // Cleanup old cache entries (>10 min)
                const cutoff = Date.now() - 600000;
                for (const [key, value] of directionsApiCacheRef.current.entries()) {
                  if (!value?.timestamp || value.timestamp < cutoff) {
                    directionsApiCacheRef.current.delete(key);
                  }
                }
                resolve(result);
              } else {
                // Handle specific error cases - suppress console errors for REQUEST_DENIED
                if (status === 'REQUEST_DENIED') {
                  // Don't log as error - this is expected when billing is not enabled
                  // Just reject silently to trigger fallback
                  reject(new Error(`Directions API not available: ${status}`));
                } else if (status === 'OVER_QUERY_LIMIT') {
                  debugWarn(`⚠️ Directions API quota exceeded (${modeName})`);
                  reject(new Error(`Directions request failed: ${status}`));
                } else {
                  debugWarn(`⚠️ Directions API failed with ${modeName}: ${status}`);
                  reject(new Error(`Directions request failed: ${status}`));
                }
              }
            }
          );
        });
      };

      // Try TWO_WHEELER first (if available in region)
      try {
        if (window.google.maps.TravelMode.TWO_WHEELER) {
          return await tryRoute(window.google.maps.TravelMode.TWO_WHEELER, 'TWO_WHEELER');
        }
      } catch (twoWheelerError) {
        debugLog('⚠️ TWO_WHEELER mode not available, trying DRIVING...');
      }

      // Fallback to DRIVING mode
      return await tryRoute(window.google.maps.TravelMode.DRIVING, 'DRIVING');
    } catch (error) {
      // Handle REQUEST_DENIED and other errors gracefully
      if (error.message?.includes('REQUEST_DENIED') || error.message?.includes('not available')) {
        debugWarn('⚠️ Google Maps Directions API not available (billing/API key issue). Will use fallback route.');
      } else {
        debugError('❌ Error calculating route with Directions API:', error);
      }
      return null; // Return null to trigger fallback
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ENABLE_GOOGLE_DIRECTIONS]);

  /**
   * Update live tracking polyline - Rapido/Zomato style
   * Removes polyline points behind the rider and keeps only forward route
   * @param {Object} directionsResult - Google Maps DirectionsResult
   * @param {Array} riderPosition - [lat, lng] Current rider position
   */
  const updateLiveTrackingPolyline = useCallback((directionsResult, riderPosition) => {
    if (!directionsResult || !riderPosition || !window.google || !window.google.maps) {
      return;
    }

    // CRITICAL: Don't create/update polyline if there's no active order
    // This prevents showing default/mock polylines on page refresh
    // But allow it if we're going to restaurant (not customer)
    // Note: We can't use selectedRestaurant directly in callback, so we'll check it in the calling code
    // For now, just proceed - the calling code will handle the checks

    try {
      // Extract and decode full polyline from directions result
      const fullPolyline = extractPolylineFromDirections(directionsResult);
      
      if (fullPolyline.length < 2) {
        debugWarn('⚠️ Invalid polyline from directions result');
        return;
      }

      // Store full polyline for future updates
      fullRoutePolylineRef.current = fullPolyline;

      // Convert rider position to object format
      const riderPos = { lat: riderPosition[0], lng: riderPosition[1] };

      const routeState = buildVisibleRouteFromRiderPosition(fullPolyline, riderPos, {
        offRouteThresholdMeters: ROUTE_OFF_TRACK_THRESHOLD_METERS
      });
      const visiblePolyline = Array.isArray(routeState.visiblePolyline) && routeState.visiblePolyline.length > 1
        ? routeState.visiblePolyline
        : fullPolyline;
      const path = visiblePolyline.map((point) =>
        new window.google.maps.LatLng(point.lat, point.lng)
      );

      // Update or create live tracking polyline with Zomato/Rapido style
      if (liveTrackingPolylineRef.current) {
        // Update existing polyline path smoothly
        liveTrackingPolylineRef.current.setPath(path);
        // Ensure it's on the map
        if (liveTrackingPolylineRef.current.getMap() === null) {
          liveTrackingPolylineRef.current.setMap(window.deliveryMapInstance);
        }
        // Update shadow polyline if it exists
        if (liveTrackingPolylineShadowRef.current) {
          liveTrackingPolylineShadowRef.current.setPath(path);
          if (liveTrackingPolylineShadowRef.current.getMap() === null) {
            liveTrackingPolylineShadowRef.current.setMap(window.deliveryMapInstance);
          }
        }
        debugLog('✅ Updated existing live tracking polyline');
      } else {
        // Create new polyline with professional Zomato/Rapido styling
        if (!window.deliveryMapInstance) {
          debugWarn('⚠️ Cannot create polyline - map instance not ready');
          return;
        }
        
        // Create main polyline with vibrant blue color (Zomato style)
        liveTrackingPolylineRef.current = new window.google.maps.Polyline({
          path: path,
          geodesic: true,
          strokeColor: '#1E88E5', // Vibrant blue like Zomato (more visible than #4285F4)
          strokeOpacity: 1.0,
          strokeWeight: 6, // Optimal thickness for visibility
          zIndex: 1000, // High z-index to be above other map elements
          icons: [], // No icons/dots - clean solid line
          map: window.deliveryMapInstance
        });
        
        // Create shadow/outline polyline for better visibility (like Zomato/Rapido)
        // This creates a subtle outline effect for better contrast
        if (!liveTrackingPolylineShadowRef.current) {
          liveTrackingPolylineShadowRef.current = new window.google.maps.Polyline({
            path: path,
            geodesic: true,
            strokeColor: '#FFFFFF', // White shadow/outline
            strokeOpacity: 0.6,
            strokeWeight: 10, // Slightly thicker for shadow effect
            zIndex: 999, // Behind main polyline
            icons: [],
            map: window.deliveryMapInstance
          });
        } else {
          liveTrackingPolylineShadowRef.current.setPath(path);
        }
        
        debugLog('✅ Created new live tracking polyline on map with Zomato/Rapido styling');
      }

      debugLog(`✅ Live tracking polyline updated: ${visiblePolyline.length} points remaining, ${Number(routeState.distanceFromRoute || 0).toFixed(2)}m from route`);
      debugLog(`📍 Polyline path has ${path.length} points, map: ${window.deliveryMapInstance ? 'ready' : 'not ready'}`);
    } catch (error) {
      debugError('❌ Error updating live tracking polyline:', error);
    }
  }, []);

  /**
   * Smoothly animate rider marker to new position with rotation
   * @param {Array} newPosition - [lat, lng] New rider position
   * @param {number} heading - Heading/bearing in degrees (0-360)
   */
  const animateRiderMarker = useCallback((newPosition, heading) => {
    if (!window.google || !window.google.maps || !bikeMarkerRef.current) {
      return;
    }

    const [newLat, newLng] = newPosition;
    const currentPosition = lastRiderPositionRef.current || { lat: newLat, lng: newLng };

    // Cancel any existing animation
    if (markerAnimationCancelRef.current) {
      markerAnimationCancelRef.current();
    }

    // Animate marker smoothly
    const cancelAnimation = animateMarker(
      currentPosition,
      { lat: newLat, lng: newLng },
      500, // 500ms animation duration
      (interpolated) => {
        if (bikeMarkerRef.current) {
          // Update marker position
          bikeMarkerRef.current.setPosition({
            lat: interpolated.lat,
            lng: interpolated.lng
          });

          // Update rotation if heading available
          if (heading !== null && heading !== undefined) {
            getRotatedBikeIcon(heading).then(rotatedIconUrl => {
              if (bikeMarkerRef.current) {
                const currentIcon = bikeMarkerRef.current.getIcon();
                bikeMarkerRef.current.setIcon({
                  url: rotatedIconUrl,
                  scaledSize: currentIcon?.scaledSize || new window.google.maps.Size(60, 60),
                  anchor: currentIcon?.anchor || new window.google.maps.Point(30, 30)
                });
              }
            });
          }
        }
      }
    );

    markerAnimationCancelRef.current = cancelAnimation;
    lastRiderPositionRef.current = { lat: newLat, lng: newLng };
  }, []);

  // Initialize Directions Map with Google Maps Directions API (Zomato-style)
  useEffect(() => {
    if (!showDirectionsMap || !selectedRestaurant) {
      setDirectionsMapLoading(false)
      return
    }

    // Re-initialize if navigation mode changed (restaurant -> customer or vice versa)
    if (directionsMapInstanceRef.current) {
      // Clear existing map to re-initialize with new destination
      directionsMapInstanceRef.current = null;
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }
      if (restaurantMarkerRef.current) {
        restaurantMarkerRef.current.setMap(null);
      }
      if (directionsBikeMarkerRef.current) {
        directionsBikeMarkerRef.current.setMap(null);
      }
    }

    const initializeDirectionsMap = async () => {
      if (!window.google || !window.google.maps) {
        debugWarn('⚠️ Google Maps API not loaded, waiting...');
        setTimeout(initializeDirectionsMap, 200);
        return;
      }

      if (!directionsMapContainerRef.current) {
        debugWarn('⚠️ Directions map container not ready');
        return;
      }

      try {
        setDirectionsMapLoading(true);
        
        // Get current LIVE location (delivery boy) - prioritize riderLocation which is updated in real-time
        // Use rider location or last known location, don't use default
        const currentLocation = riderLocation || lastLocationRef.current;
        if (!currentLocation) {
          debugWarn('⚠️ No location available for navigation')
          return
        }
        
        // Determine destination based on navigation mode
        let destinationLocation;
        let destinationName;
        const customerDestination = getCustomerDestination(selectedRestaurant)
        if (navigationMode === 'customer' && customerDestination) {
          destinationLocation = {
            lat: customerDestination.lat,
            lng: customerDestination.lng
          };
          destinationName = selectedRestaurant.customerName || 'Customer';
        } else {
          destinationLocation = {
            lat: selectedRestaurant.lat,
            lng: selectedRestaurant.lng
          };
          destinationName = selectedRestaurant.name || 'Restaurant';
        }

        debugLog('🗺️ Initializing Directions Map with LIVE location...');
        debugLog('📍 Origin (Delivery Boy LIVE Location):', currentLocation);
        debugLog('📍 Destination:', destinationName, destinationLocation);

        // Create map instance
        const map = new window.google.maps.Map(directionsMapContainerRef.current, {
          center: { lat: currentLocation[0], lng: currentLocation[1] },
          zoom: 18,
          minZoom: 10, // Minimum zoom level (city/area view)
          maxZoom: 21, // Maximum zoom level - allow full zoom
          mapTypeId: window.google.maps.MapTypeId.ROADMAP || 'roadmap',
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        });

        directionsMapInstanceRef.current = map;

        // Initialize Directions Service
        if (!directionsServiceRef.current) {
          directionsServiceRef.current = new window.google.maps.DirectionsService();
        }

        // Initialize Directions Renderer
        if (!directionsRendererRef.current) {
          // Don't create DirectionsRenderer with map - it adds dots
          // We'll extract route path and use custom polyline instead
          directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: '#4285F4',
              strokeWeight: 0,
              strokeOpacity: 0,
              zIndex: -1,
              icons: []
            },
            preserveViewport: true
          });
          // Explicitly don't set map - we use custom polyline instead
        } else {
          // Don't set map - we use custom polyline instead
          // directionsRendererRef.current.setMap(map);
        }

        // Calculate route using Directions API
        const routeResult = await calculateRouteWithDirectionsAPI(currentLocation, destinationLocation);
        
        if (routeResult) {
          // Don't create main route polyline - only live tracking polyline will be shown
          // Remove old custom polyline if exists (cleanup)
          try {
            if (routePolylineRef.current) {
              routePolylineRef.current.setMap(null);
              routePolylineRef.current = null;
            }
            
            // Remove DirectionsRenderer from map
            if (directionsRendererRef.current) {
              directionsRendererRef.current.setMap(null);
            }
          } catch (e) {
            debugWarn('⚠️ Error cleaning up polyline:', e);
          }
          
          // Fit bounds to show entire route
          const bounds = routeResult.routes[0].bounds;
          if (bounds) {
            map.fitBounds(bounds, { padding: 50 });
          }

          // Add custom Destination Marker (Restaurant or Customer)
          const markerIcon = navigationMode === 'customer' 
            ? `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#10B981">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/>
                  <circle cx="12" cy="9" r="3" fill="#FFFFFF"/>
                </svg>
              `)}`
            : `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#FF6B35">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/>
                  <circle cx="12" cy="9" r="3" fill="#FFFFFF"/>
                  <path d="M8 16h2v6H8zm6 0h2v6h-2z" fill="#FFFFFF"/>
                </svg>
              `)}`;
          
          if (!directionsDestinationMarkerRef.current) {
            directionsDestinationMarkerRef.current = new window.google.maps.Marker({
              position: destinationLocation,
              map: map,
              icon: {
                url: markerIcon,
                scaledSize: new window.google.maps.Size(48, 48),
                anchor: new window.google.maps.Point(24, 48)
              },
              title: destinationName,
              animation: window.google.maps.Animation.DROP
            });
          } else {
            directionsDestinationMarkerRef.current.setPosition(destinationLocation);
            directionsDestinationMarkerRef.current.setIcon({
              url: markerIcon,
              scaledSize: new window.google.maps.Size(48, 48),
              anchor: new window.google.maps.Point(24, 48)
            });
            directionsDestinationMarkerRef.current.setTitle(destinationName);
            directionsDestinationMarkerRef.current.setMap(map);
          }

          // Add custom Bike Marker (Delivery Boy)
          if (!directionsBikeMarkerRef.current) {
            directionsBikeMarkerRef.current = new window.google.maps.Marker({
              position: { lat: currentLocation[0], lng: currentLocation[1] },
              map: map,
              icon: {
                url: bikeLogo,
                scaledSize: new window.google.maps.Size(50, 50),
                anchor: new window.google.maps.Point(25, 25)
              },
              title: 'Your Location',
              zIndex: 100 // Bike marker should be on top
            });
          } else {
            directionsBikeMarkerRef.current.setPosition({ lat: currentLocation[0], lng: currentLocation[1] });
            directionsBikeMarkerRef.current.setMap(map);
          }

          debugLog('✅ Directions Map initialized with route');
        } else {
          debugWarn('⚠️ Failed to calculate route, using fallback polyline');
          // Fallback to simple polyline if Directions API fails
          if (routePolyline && routePolyline.length > 0) {
            updateRoutePolyline();
          }
        }

        setDirectionsMapLoading(false);
      } catch (error) {
        debugError('❌ Error initializing directions map:', error);
        debugError('❌ Error stack:', error.stack);
        setDirectionsMapLoading(false);
        // Don't crash - show error message instead
        try {
          // Fallback to simple polyline
          if (routePolyline && routePolyline.length > 0) {
            updateRoutePolyline();
          }
        } catch (fallbackError) {
          debugError('❌ Fallback also failed:', fallbackError);
        }
      }
    };

    initializeDirectionsMap();

    // Cleanup function - only cleanup when showDirectionsMap becomes false
    return () => {
      if (!showDirectionsMap) {
        debugLog('🧹 Cleaning up directions map...');
        // Clean up directions renderer when map is closed
        try {
          if (directionsRendererRef.current) {
            directionsRendererRef.current.setMap(null);
          }
          if (directionsDestinationMarkerRef.current) {
            directionsDestinationMarkerRef.current.setMap(null);
          }
          if (directionsBikeMarkerRef.current) {
            directionsBikeMarkerRef.current.setMap(null);
          }
          directionsMapInstanceRef.current = null;
        } catch (cleanupError) {
          debugError('❌ Error during cleanup:', cleanupError);
        }
      }
    };
    // Only re-initialize if showDirectionsMap, selectedRestaurant.id, or navigationMode changes
    // Don't include calculateRouteWithDirectionsAPI to prevent unnecessary re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDirectionsMap, selectedRestaurant?.id, navigationMode, selectedRestaurant?.customerLat, selectedRestaurant?.customerLng, riderLocation])

  // Helper function to calculate distance in meters (Haversine formula)
  const calculateDistanceInMeters = useCallback((lat1, lng1, lat2, lng2) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in meters
  }, []);

  // Update bike marker position on directions map when rider location changes
  // Optimized: Only update marker position, don't recalculate route (saves API cost)
  useEffect(() => {
    if (!showDirectionsMap || !directionsMapInstanceRef.current || !directionsBikeMarkerRef.current) {
      return;
    }

    if (riderLocation && riderLocation.length === 2) {
      const newPosition = { lat: riderLocation[0], lng: riderLocation[1] };
      
      // Update bike marker position (smooth movement)
      directionsBikeMarkerRef.current.setPosition(newPosition);
      
      // Optional: Auto-center map on bike (like Zomato) - smooth pan
      // Uncomment if you want map to follow bike movement
      // directionsMapInstanceRef.current.panTo(newPosition);
      
      // API Cost Optimization: Only recalculate route if bike deviates significantly (>50m from route)
      // This prevents unnecessary API calls on every location update
      if (lastBikePositionRef.current) {
        const distance = calculateDistanceInMeters(
          lastBikePositionRef.current.lat,
          lastBikePositionRef.current.lng,
          newPosition.lat,
          newPosition.lng
        );
        
        // Only recalculate if moved >50 meters AND last recalculation was >30 seconds ago
        const timeSinceLastRecalc = Date.now() - (lastRouteRecalculationRef.current || 0);
        if (distance > 50 && timeSinceLastRecalc > 30000 && selectedRestaurant) {
          const phase = selectedRestaurant?.deliveryPhase || selectedRestaurant?.deliveryState?.currentPhase || '';
          const isToCustomerPhase =
            phase === 'en_route_to_delivery' ||
            phase === 'at_delivery' ||
            selectedRestaurant?.orderStatus === 'out_for_delivery' ||
            selectedRestaurant?.status === 'out_for_delivery';
          const customerDestination = getCustomerDestination(selectedRestaurant)
          const restaurantDestination = {
            lat: toFiniteCoordinate(selectedRestaurant?.lat),
            lng: toFiniteCoordinate(selectedRestaurant?.lng)
          }
          const destination = isToCustomerPhase && customerDestination
            ? customerDestination
            : restaurantDestination;

          if (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
            return
          }

          debugLog('🔄 Significant deviation detected, recalculating route...');
          lastRouteRecalculationRef.current = Date.now();
          calculateRouteWithDirectionsAPI(
            [newPosition.lat, newPosition.lng],
            destination
          ).then(result => {
            if (result && result.routes && result.routes[0]) {
              // Extract route and create custom polyline (don't use DirectionsRenderer - it adds dots)
              try {
                const route = result.routes[0];
                if (route && route.overview_path && window.deliveryMapInstance) {
                  // Don't create main route polyline - only live tracking polyline will be shown
                  // Remove old custom polyline if exists (cleanup)
                  if (routePolylineRef.current) {
                    routePolylineRef.current.setMap(null);
                    routePolylineRef.current = null;
                  }
                  
                  // Remove DirectionsRenderer from map
                  if (directionsRendererRef.current) {
                    directionsRendererRef.current.setMap(null);
                  }
                }
              } catch (e) {
                debugWarn('⚠️ Could not create custom polyline:', e);
              }
            }
          }).catch(err => {
            // Handle REQUEST_DENIED gracefully - don't spam console
            if (err.message?.includes('REQUEST_DENIED') || err.message?.includes('not available')) {
              debugLog('⚠️ Directions API not available, route update skipped');
            } else {
              debugWarn('⚠️ Route recalculation failed:', err);
            }
          });
        }
      }
      
      lastBikePositionRef.current = newPosition;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDirectionsMap, riderLocation, selectedRestaurant?.id, calculateDistanceInMeters])

  // Handle route polyline visibility and updates
  // Always use custom polyline (DirectionsRenderer is never active - it adds dots)
  useEffect(() => {
    // DirectionsRenderer is never used - we always use custom polyline
    // Remove DirectionsRenderer if it somehow got attached
    if (directionsRendererRef.current && directionsRendererRef.current.getMap()) {
      directionsRendererRef.current.setMap(null);
    }
    
    // Only show fallback polyline if DirectionsRenderer is NOT active
    if (routePolyline && routePolyline.length > 0 && window.deliveryMapInstance) {
      updateRoutePolyline();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePolyline, directionsResponse])

  // Handle directionsResponse updates - Show route on main map when directions are calculated
  useEffect(() => {
    // Only show route if there's an active order (selectedRestaurant)
    if (!selectedRestaurant) {
      // Clear route if no active order
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }
      return;
    }

    if (!directionsResponse || !directionsResponse.routes || directionsResponse.routes.length === 0) {
      return;
    }

    if (!window.deliveryMapInstance || !window.google || !window.google.maps) {
      debugWarn('⚠️ Map not ready for directions display');
      return;
    }

    debugLog('🗺️ Showing directions route on main map:', directionsResponse);

    // Clear any existing fallback polyline to avoid conflicts
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
    }

    // Initialize DirectionsRenderer for main map if not exists
    if (!directionsRendererRef.current) {
      debugLog('📦 Creating DirectionsRenderer for main map');
      // Don't create DirectionsRenderer with map - it adds dots
      // We'll extract route path and use custom polyline instead
      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
        suppressMarkers: true,
        suppressInfoWindows: false,
        polylineOptions: {
          strokeColor: '#4285F4',
          strokeWeight: 0,
          strokeOpacity: 0,
          zIndex: -1,
          icons: []
        },
        markerOptions: {
          visible: false
        },
        preserveViewport: true
      });
      // Explicitly don't set map - we use custom polyline instead
      debugLog('✅ DirectionsRenderer created with bright blue polyline (markers suppressed)');
      
      // Ensure it's visible by explicitly setting map
      directionsRendererRef.current.setMap(window.deliveryMapInstance);
    } else {
      // Ensure renderer is attached to main map
      directionsRendererRef.current.setMap(window.deliveryMapInstance);
      // Update polyline options to ensure visibility and suppress markers
      directionsRendererRef.current.setOptions({
        suppressMarkers: true, // Hide default markers including car icon
        suppressInfoWindows: false,
        polylineOptions: {
          strokeColor: '#4285F4', // Bright blue like Zomato
          strokeWeight: 0, // Completely hide DirectionsRenderer polyline (has dots)
          strokeOpacity: 0, // Hide completely
          zIndex: -1, // Put behind everything
          icons: [] // No custom icons
        },
        markerOptions: {
          visible: false // Explicitly hide all markers
        },
        preserveViewport: true
      });
      debugLog('✅ DirectionsRenderer re-attached to main map with updated styling (markers suppressed)');
    }

    // Set directions response to renderer
    try {
      // Validate directionsResponse is a valid DirectionsResult object
      if (!directionsResponse || typeof directionsResponse !== 'object' || !directionsResponse.routes || !Array.isArray(directionsResponse.routes) || directionsResponse.routes.length === 0) {
        debugError('❌ Invalid directionsResponse:', directionsResponse);
        return;
      }

      // Validate it's a Google Maps DirectionsResult (has status property)
      if (!directionsResponse.request || !directionsResponse.routes[0]?.legs) {
        debugError('❌ directionsResponse is not a valid Google Maps DirectionsResult');
        return;
      }

      // Clear any existing polyline first to ensure clean render
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }

      // Extract route path and create custom clean polyline without dots
      // Don't use DirectionsRenderer on map - it adds dots/icons
      try {
        const route = directionsResponse.routes[0];
        if (route && route.overview_path) {
          // Don't create main route polyline - only live tracking polyline will be shown
          // Remove old custom polyline if exists (cleanup)
          if (routePolylineRef.current) {
            routePolylineRef.current.setMap(null);
            routePolylineRef.current = null;
          }
          
          debugLog('📍 Route details:', {
            routes: directionsResponse.routes?.length || 0,
            legs: directionsResponse.routes?.[0]?.legs?.length || 0,
            distance: directionsResponse.routes?.[0]?.legs?.[0]?.distance?.text,
            duration: directionsResponse.routes?.[0]?.legs?.[0]?.duration?.text
          });
          
          // Completely remove DirectionsRenderer from map to prevent any dots/icons
          if (directionsRendererRef.current) {
            directionsRendererRef.current.setMap(null);
          }
        }
      } catch (e) {
        debugWarn('⚠️ Could not create custom polyline:', e);
      }

      // Fit bounds to show entire route - but preserve zoom if user has zoomed in
      const bounds = directionsResponse.routes[0].bounds;
      if (bounds) {
        const currentZoomBeforeFit = window.deliveryMapInstance.getZoom();
        window.deliveryMapInstance.fitBounds(bounds, { padding: 100 });
        // Preserve zoom if user had zoomed in more than fitBounds would set
        setTimeout(() => {
          const newZoom = window.deliveryMapInstance.getZoom();
          if (currentZoomBeforeFit > newZoom && currentZoomBeforeFit >= 18) {
            window.deliveryMapInstance.setZoom(currentZoomBeforeFit);
          }
        }, 100);
        debugLog('✅ Map bounds fitted to route');
      }

      // Ensure DirectionsRenderer is removed from map (we use custom polyline instead)
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }
    } catch (error) {
      debugError('❌ Error setting directions on renderer:', error);
      debugError('❌ directionsResponse type:', typeof directionsResponse);
      debugError('❌ directionsResponse:', directionsResponse);
    }
  }, [directionsResponse, selectedRestaurant])

  // Restore active order from localStorage on page load/refresh
  useEffect(() => {
    const restoreActiveOrder = async () => {
      try {
        const savedOrder = localStorage.getItem(DELIVERY_ACTIVE_ORDER_KEY);
        if (!savedOrder) {
          debugLog('📦 No active order found in localStorage');
          return;
        }

        const activeOrderData = JSON.parse(savedOrder);
        debugLog('📦 Found active order in localStorage:', activeOrderData);

        // Get order ID from saved data
        const orderId = activeOrderData.orderId || activeOrderData.restaurantInfo?.id || activeOrderData.restaurantInfo?.orderId;
        
        if (!orderId) {
          debugLog('⚠️ No order ID found in saved data, removing from localStorage');
          localStorage.removeItem(DELIVERY_ACTIVE_ORDER_KEY);
          setSelectedRestaurant(null);
          return;
        }

        // Verify order still exists in database before restoring
        let verifiedOrder = null;
        try {
          debugLog('🔍 Verifying order exists in database:', orderId);
          const orderResponse = await deliveryAPI.getOrderDetails(orderId);
          
          if (!orderResponse.data?.success || !orderResponse.data?.data) {
            debugLog('⚠️ Order not found in database, removing from localStorage');
            localStorage.removeItem(DELIVERY_ACTIVE_ORDER_KEY);
            setSelectedRestaurant(null);
            return;
          }

          const orderPayload = orderResponse.data.data;
          verifiedOrder = orderPayload?.order || orderPayload;
          
          // Check if order is cancelled or deleted
          if (verifiedOrder.status === 'cancelled' || verifiedOrder.status === 'delivered') {
            debugLog(`⚠️ Order is ${verifiedOrder.status}, removing from localStorage`);
            if (verifiedOrder.status === 'cancelled') {
              markOrderAsCancelled(verifiedOrder);
            }
            localStorage.removeItem(DELIVERY_ACTIVE_ORDER_KEY);
            setSelectedRestaurant(null);
            return;
          }

          // Check if order is still assigned to current delivery partner
          // (This check will be done by backend, but we can verify here too)
          debugLog('✅ Order verified in database, restoring...');
        } catch (verifyError) {
          // If order doesn't exist (404) or any other error, clear localStorage
          debugLog('⚠️ Error verifying order or order not found:', verifyError.response?.status || verifyError.message);
          if (verifyError.response?.status === 404 || verifyError.response?.status === 403) {
            debugLog('⚠️ Order not found or not assigned, removing from localStorage');
            localStorage.removeItem(DELIVERY_ACTIVE_ORDER_KEY);
            setSelectedRestaurant(null);
            return;
          }
          // For other errors (network, etc.), still try to restore but log warning
          debugWarn('⚠️ Could not verify order, but restoring anyway:', verifyError.message);
        }

        // Check if order is still valid (not too old - e.g., within 24 hours)
        const acceptedAt = new Date(activeOrderData.acceptedAt);
        const hoursSinceAccepted = (Date.now() - acceptedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceAccepted > 24) {
          debugLog('⚠️ Active order is too old, removing from localStorage');
          localStorage.removeItem(DELIVERY_ACTIVE_ORDER_KEY);
          setSelectedRestaurant(null);
          return;
        }

        // Restore selectedRestaurant state
        if (activeOrderData.restaurantInfo) {
          const customerCoords = verifiedOrder?.address?.location?.coordinates;
          const restaurantCoords = verifiedOrder?.restaurantId?.location?.coordinates;
          const mergedRestaurantInfo = {
            ...activeOrderData.restaurantInfo,
            orderId: verifiedOrder?.orderId || activeOrderData.restaurantInfo?.orderId || activeOrderData.orderId,
            id: verifiedOrder?._id?.toString?.() || activeOrderData.restaurantInfo?.id || activeOrderData.orderId,
            orderStatus: verifiedOrder?.status || activeOrderData.restaurantInfo?.orderStatus || activeOrderData.restaurantInfo?.status,
            status: verifiedOrder?.status || activeOrderData.restaurantInfo?.status,
            deliveryPhase: verifiedOrder?.deliveryState?.currentPhase || activeOrderData.restaurantInfo?.deliveryPhase,
            deliveryState: verifiedOrder?.deliveryState || activeOrderData.restaurantInfo?.deliveryState,
            lat: restaurantCoords?.[1] ?? activeOrderData.restaurantInfo?.lat,
            lng: restaurantCoords?.[0] ?? activeOrderData.restaurantInfo?.lng,
            customerName: verifiedOrder?.userId?.name || activeOrderData.restaurantInfo?.customerName,
            total:
              Number(
                verifiedOrder?.pricing?.total ??
                verifiedOrder?.total ??
                activeOrderData.restaurantInfo?.total ??
                0
              ) || 0,
            paymentMethod:
              verifiedOrder?.paymentMethod ||
              verifiedOrder?.payment?.method ||
              activeOrderData.restaurantInfo?.paymentMethod ||
              activeOrderData.restaurantInfo?.payment ||
              'cod',
            customerAddress:
              verifiedOrder?.address?.formattedAddress ||
              (verifiedOrder?.address?.street
                ? `${verifiedOrder.address.street}, ${verifiedOrder.address.city || ''}, ${verifiedOrder.address.state || ''}`.trim()
                : '') ||
              activeOrderData.restaurantInfo?.customerAddress,
            customerLat: customerCoords?.[1] ?? activeOrderData.restaurantInfo?.customerLat,
            customerLng: customerCoords?.[0] ?? activeOrderData.restaurantInfo?.customerLng
          };
          setSelectedRestaurant(mergedRestaurantInfo);
          debugLog('✅ Restored selectedRestaurant from localStorage');
        }

        const restoredStage = activeOrderData.uiStage
        if (restoredStage) {
          setTimeout(() => {
            if (restoredStage === 'en_route_to_pickup' || restoredStage === 'reached_pickup') {
              setShowreachedPickupPopup(true)
            } else if (restoredStage === 'order_id_confirmation') {
              setShowOrderIdConfirmationPopup(true)
            } else if (restoredStage === 'reached_drop' || restoredStage === 'en_route_to_drop') {
              setShowReachedDropPopup(true)
            } else if (restoredStage === 'order_delivered') {
              setShowOrderDeliveredAnimation(true)
            } else if (restoredStage === 'review') {
              setShowCustomerReviewPopup(true)
            } else if (restoredStage === 'payment') {
              setShowPaymentPage(true)
            }
          }, 250)
        }

        // Wait for map to be ready
        const waitForMap = () => {
          if (!window.deliveryMapInstance || !window.google || !window.google.maps) {
            setTimeout(waitForMap, 200);
            return;
          }

          debugLog('🗺️ Map ready, restoring route...');

          // Recalculate route using Directions API (preferred) or use saved coordinates (fallback)
          // Don't restore directionsResponse from localStorage - Google Maps objects can't be serialized
          const restoredInfo = activeOrderData.restaurantInfo;
          const restoredPhase = String(
            verifiedOrder?.deliveryState?.currentPhase ||
            restoredInfo?.deliveryPhase ||
            restoredInfo?.deliveryState?.currentPhase ||
            ''
          ).toLowerCase();
          const restoredStatus = String(
            verifiedOrder?.deliveryState?.status ||
            restoredInfo?.deliveryState?.status ||
            verifiedOrder?.status ||
            restoredInfo?.orderStatus ||
            restoredInfo?.status ||
            ''
          ).toLowerCase();
          const isDeliveryLeg =
            restoredPhase === 'en_route_to_delivery' ||
            restoredPhase === 'at_delivery' ||
            restoredStatus === 'order_confirmed' ||
            restoredStatus === 'en_route_to_delivery' ||
            restoredStatus === 'out_for_delivery';
          const destinationLat = isDeliveryLeg
            ? (verifiedOrder?.address?.location?.coordinates?.[1] ?? restoredInfo?.customerLat)
            : restoredInfo?.lat;
          const destinationLng = isDeliveryLeg
            ? (verifiedOrder?.address?.location?.coordinates?.[0] ?? restoredInfo?.customerLng)
            : restoredInfo?.lng;

          if (destinationLat != null && destinationLng != null && riderLocation && riderLocation.length === 2) {
            // Try to recalculate with Directions API first (if flag indicates we had Directions API before)
            if (activeOrderData.hasDirectionsAPI) {
              debugLog('🔄 Recalculating route with Directions API for restored order...');
              calculateRouteWithDirectionsAPI(
                riderLocation,
                { lat: destinationLat, lng: destinationLng }
              ).then(result => {
                if (result && result.routes && result.routes.length > 0) {
                  setDirectionsResponse(result);
                  directionsResponseRef.current = result; // Store in ref for callbacks
                  debugLog('✅ Route recalculated with Directions API and restored');
                  
                  // Initialize live tracking polyline for restored route
                  if (riderLocation && riderLocation.length === 2) {
                    updateLiveTrackingPolyline(result, riderLocation);
                  }
                } else {
                  // Fallback to coordinates if Directions API fails
                  if (activeOrderData.routeCoordinates && activeOrderData.routeCoordinates.length > 0) {
                    setRoutePolyline(activeOrderData.routeCoordinates);
                    debugLog('✅ Using fallback route coordinates from localStorage');
                  }
                }
              }).catch(err => {
                debugError('❌ Error recalculating route with Directions API:', err);
                // Fallback to coordinates
                if (activeOrderData.routeCoordinates && activeOrderData.routeCoordinates.length > 0) {
                  setRoutePolyline(activeOrderData.routeCoordinates);
                  debugLog('✅ Using fallback route coordinates from localStorage');
                }
              });
            } else if (activeOrderData.routeCoordinates && activeOrderData.routeCoordinates.length > 0) {
              // Use saved coordinates if we don't have Directions API flag
              setRoutePolyline(activeOrderData.routeCoordinates);
              debugLog('✅ Restored route polyline from localStorage');
            }
          } else if (activeOrderData.routeCoordinates && activeOrderData.routeCoordinates.length > 0) {
            // Fallback: Use coordinates if restaurant info or rider location not available
            setRoutePolyline(activeOrderData.routeCoordinates);
            debugLog('✅ Restored route polyline from localStorage (fallback)');
          }
        };

        waitForMap();
      } catch (error) {
        debugError('❌ Error restoring active order:', error);
        // Clear localStorage and state if there's an error
        localStorage.removeItem(DELIVERY_ACTIVE_ORDER_KEY);
        setSelectedRestaurant(null);
        setShowReachedDropPopup(false);
        setShowOrderDeliveredAnimation(false);
        setShowCustomerReviewPopup(false);
        setShowPaymentPage(false);
      }
    };

    restoreActiveOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run only on mount - calculateRouteWithDirectionsAPI is stable

  // Keep active order progress synced to localStorage so app restarts don't reset flow.
  useEffect(() => {
    if (!selectedRestaurant) return

    const orderStatus = selectedRestaurant?.orderStatus || selectedRestaurant?.status || ''
    const deliveryPhase = selectedRestaurant?.deliveryPhase || selectedRestaurant?.deliveryState?.currentPhase || ''
    const isTerminalOrder = orderStatus === 'delivered' || orderStatus === 'cancelled' || deliveryPhase === 'completed' || deliveryPhase === 'delivered'

    if (isTerminalOrder) {
      localStorage.removeItem(DELIVERY_ACTIVE_ORDER_KEY)
      return
    }

    const orderId = selectedRestaurant?.id || selectedRestaurant?.orderId
    if (!orderId) return

    let existing = null
    try {
      const raw = localStorage.getItem(DELIVERY_ACTIVE_ORDER_KEY)
      existing = raw ? JSON.parse(raw) : null
    } catch {
      existing = null
    }

    const payload = {
      orderId,
      restaurantInfo: selectedRestaurant,
      routeCoordinates: routePolyline && routePolyline.length > 0 ? routePolyline : (existing?.routeCoordinates || []),
      acceptedAt: existing?.acceptedAt || new Date().toISOString(),
      hasDirectionsAPI: Boolean(directionsResponse || existing?.hasDirectionsAPI),
      uiStage: getDeliveryFlowStage(),
      lastUpdatedAt: new Date().toISOString()
    }

    const serialized = JSON.stringify(payload)
    if (lastPersistedActiveOrderRef.current === serialized) return
    lastPersistedActiveOrderRef.current = serialized
    localStorage.setItem(DELIVERY_ACTIVE_ORDER_KEY, serialized)
  }, [
    DELIVERY_ACTIVE_ORDER_KEY,
    directionsResponse,
    getDeliveryFlowStage,
    routePolyline,
    selectedRestaurant
  ])

  // Ensure polyline is displayed when map becomes ready and there's an active route
  useEffect(() => {
    if (!selectedRestaurant || !window.deliveryMapInstance || !window.google || !window.google.maps) {
      return;
    }

    const currentDirectionsResponse = directionsResponseRef.current;
    const currentRiderLocation = riderLocation || lastLocationRef.current;

    // If we have a directions response and rider location, but no polyline, create it
    if (currentDirectionsResponse && 
        currentDirectionsResponse.routes && 
        currentDirectionsResponse.routes.length > 0 &&
        currentRiderLocation && 
        currentRiderLocation.length === 2 &&
        !liveTrackingPolylineRef.current) {
      debugLog('🗺️ Map ready with active route - initializing polyline');
      updateLiveTrackingPolyline(currentDirectionsResponse, currentRiderLocation);
    } else if (currentDirectionsResponse && 
               currentRiderLocation && 
               liveTrackingPolylineRef.current &&
               liveTrackingPolylineRef.current.getMap() === null) {
      // Polyline exists but not on map - reattach it
      debugLog('🗺️ Reattaching polyline to map');
      liveTrackingPolylineRef.current.setMap(window.deliveryMapInstance);
      // Also reattach shadow polyline if it exists
      if (liveTrackingPolylineShadowRef.current) {
        liveTrackingPolylineShadowRef.current.setMap(window.deliveryMapInstance);
      }
    }
  }, [selectedRestaurant, riderLocation, updateLiveTrackingPolyline]);

  // Clear any default/mock routes on mount if there's no active order
  useEffect(() => {
    // Clear immediately on mount if no active order
    if (!selectedRestaurant && window.deliveryMapInstance) {
      debugLog('🧹 No active order - clearing any default/mock routes immediately');
      // Clear route polyline
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
      // Clear live tracking polyline (customer route)
      if (liveTrackingPolylineRef.current) {
        liveTrackingPolylineRef.current.setMap(null);
        liveTrackingPolylineRef.current = null;
      }
      // Clear directions renderer
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }
      // Clear full route polyline ref
      fullRoutePolylineRef.current = [];
      // Clear route polyline state
      setRoutePolyline([]);
      setDirectionsResponse(null);
      directionsResponseRef.current = null;
      setShowRoutePath(false);
    }
    
    // Wait a bit for restoreActiveOrder to complete, then check again
    const timer = setTimeout(() => {
      if (!selectedRestaurant && window.deliveryMapInstance) {
        debugLog('🧹 No active order after restore - clearing any default/mock routes');
        // Clear route polyline
        if (routePolylineRef.current) {
          routePolylineRef.current.setMap(null);
          routePolylineRef.current = null;
        }
        // Clear live tracking polyline (customer route)
        if (liveTrackingPolylineRef.current) {
          liveTrackingPolylineRef.current.setMap(null);
          liveTrackingPolylineRef.current = null;
        }
        if (liveTrackingPolylineShadowRef.current) {
          liveTrackingPolylineShadowRef.current.setMap(null);
          liveTrackingPolylineShadowRef.current = null;
        }
        // Clear directions renderer
        if (directionsRendererRef.current) {
          directionsRendererRef.current.setMap(null);
        }
        // Clear full route polyline ref
        fullRoutePolylineRef.current = [];
        // Clear route polyline state
        setRoutePolyline([]);
        setDirectionsResponse(null);
        directionsResponseRef.current = null;
        setShowRoutePath(false);
      }
    }, 1000); // Wait 1 second for restoreActiveOrder to complete

    return () => clearTimeout(timer);
  }, [selectedRestaurant])

  const markOrderAsCancelled = useCallback((orderData = null) => {
    try {
      const orderExternalId = String(
        orderData?.orderId ||
        selectedRestaurant?.orderId ||
        selectedRestaurant?.id ||
        ''
      ).trim();
      const orderMongoId = String(
        orderData?.id ||
        orderData?._id ||
        orderData?.orderMongoId ||
        selectedRestaurant?.id ||
        ''
      ).trim();

      const statusDate = orderData?.cancelledAt || orderData?.updatedAt || new Date().toISOString();
      if (orderExternalId) {
        saveDeliveryOrderStatus(orderExternalId, DELIVERY_ORDER_STATUS.CANCELLED);
        localStorage.setItem(`delivery_order_date_${orderExternalId}`, statusDate);
      }
      if (orderMongoId && orderMongoId !== orderExternalId) {
        saveDeliveryOrderStatus(orderMongoId, DELIVERY_ORDER_STATUS.CANCELLED);
        localStorage.setItem(`delivery_order_date_${orderMongoId}`, statusDate);
      }
    } catch (statusSaveError) {
      debugWarn('Failed to persist cancelled order status:', statusSaveError);
    }
  }, [selectedRestaurant?.id, selectedRestaurant?.orderId]);

  // Utility function to clear order data when order is deleted or cancelled
  const clearOrderData = useCallback((options = {}) => {
    const { reason = '', orderData = null, showToast = false } = options;
    if (reason === 'cancelled') {
      markOrderAsCancelled(orderData);
      if (showToast) {
        const orderLabel = orderData?.orderId || selectedRestaurant?.orderId || selectedRestaurant?.id || '';
        toast.error(orderLabel ? `Order ${orderLabel} was cancelled` : 'Order was cancelled');
      }
    }

    debugLog('🧹 Clearing order data...');
    localStorage.removeItem(DELIVERY_ACTIVE_ORDER_KEY);
    setSelectedRestaurant(null);
    setShowReachedDropPopup(false);
    setShowOrderDeliveredAnimation(false);
    setShowCustomerReviewPopup(false);
    setShowPaymentPage(false);
    setShowNewOrderPopup(false);
    setShowreachedPickupPopup(false);
    setShowOrderIdConfirmationPopup(false);
    clearNewOrder();
    clearOrderReady();
    // Clear accepted orders list when going offline
    acceptedOrderIdsRef.current.clear();
    // Clear route polyline and directions response when order is cleared
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
    }
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
    }
    setDirectionsResponse(null);
    directionsResponseRef.current = null;
    setRoutePolyline([]);
    setShowRoutePath(false);
  }, [clearNewOrder, clearOrderReady, markOrderAsCancelled, selectedRestaurant?.id, selectedRestaurant?.orderId])

  useEffect(() => {
    if (!orderStatusUpdate) return

    const updateStatus = String(
      orderStatusUpdate?.status ||
      orderStatusUpdate?.orderStatus ||
      orderStatusUpdate?.newStatus ||
      ''
    ).toLowerCase().trim()

    const updateIds = new Set(
      [
        orderStatusUpdate?.orderId,
        orderStatusUpdate?.order_id,
        orderStatusUpdate?.orderMongoId,
        orderStatusUpdate?.order_mongo_id,
        orderStatusUpdate?.id,
        orderStatusUpdate?._id
      ]
        .map((value) => (value == null ? '' : String(value).trim()))
        .filter(Boolean)
    )

    const activeIds = new Set(
      [
        selectedRestaurant?.orderId,
        selectedRestaurant?.id,
        selectedRestaurant?._id,
        newOrder?.orderId,
        newOrder?.orderMongoId,
        newOrder?._id
      ]
        .map((value) => (value == null ? '' : String(value).trim()))
        .filter(Boolean)
    )

    const isActiveOrderUpdate =
      updateIds.size === 0 ||
      [...updateIds].some((id) => activeIds.has(id))

    if (updateStatus === 'cancelled' || updateStatus === 'canceled') {
      markOrderAsCancelled(orderStatusUpdate)
      if (isActiveOrderUpdate) {
        clearOrderData({
          reason: 'cancelled',
          orderData: orderStatusUpdate,
          showToast: true
        })
      }
    }

    clearOrderStatusUpdate()
  }, [
    clearOrderData,
    clearOrderStatusUpdate,
    markOrderAsCancelled,
    newOrder?._id,
    newOrder?.orderId,
    newOrder?.orderMongoId,
    orderStatusUpdate,
    selectedRestaurant?._id,
    selectedRestaurant?.id,
    selectedRestaurant?.orderId
  ])

  // Periodically verify order still exists (every 30 seconds) to catch deletions
  useEffect(() => {
    if (!selectedRestaurant?.id && !selectedRestaurant?.orderId) {
      return; // No active order to verify
    }

    const orderId = selectedRestaurant.orderId || selectedRestaurant.id;
    
    const verifyOrderInterval = setInterval(async () => {
      try {
        const orderResponse = await deliveryAPI.getOrderDetails(orderId);
        
        if (!orderResponse.data?.success || !orderResponse.data?.data) {
          debugLog('⚠️ Order no longer exists, clearing data');
          clearOrderData();
          return;
        }

        const order = orderResponse.data.data;
        
        // Check if order is cancelled, deleted, or delivered/completed
        if (order.status === 'cancelled') {
          debugLog('⚠️ Order is cancelled, clearing data');
          clearOrderData({
            reason: 'cancelled',
            orderData: order,
            showToast: true
          });
          return;
        }

        // Check if order is delivered/completed - clear it from UI
        const isOrderDelivered = order.status === 'delivered' || 
                                order.status === 'completed' ||
                                order.deliveryState?.currentPhase === 'completed' ||
                                order.deliveryState?.status === 'delivered'
        
        if (isOrderDelivered && !showPaymentPage && !showCustomerReviewPopup && !showOrderDeliveredAnimation) {
          debugLog('✅ Order is delivered/completed, clearing from UI');
          clearOrderData();
          return;
        }

        // Update order status if it changed
        if (order.status && order.status !== selectedRestaurant.orderStatus) {
          setSelectedRestaurant(prev => ({
            ...prev,
            orderStatus: order.status,
            status: order.status,
            deliveryPhase: order.deliveryState?.currentPhase || prev?.deliveryPhase,
            deliveryState: order.deliveryState || prev?.deliveryState
          }));
        }
      } catch (error) {
        if (error.response?.status === 404 || error.response?.status === 403) {
          debugLog('⚠️ Order not found or not assigned, clearing data');
          clearOrderData();
        }
        // Ignore other errors (network issues, etc.)
      }
    }, 30000); // Check every 30 seconds

    return () => {
      clearInterval(verifyOrderInterval);
    };
  }, [selectedRestaurant?.id, selectedRestaurant?.orderId, clearOrderData])

  // Handle route polyline visibility toggle
  // Only show fallback polyline if DirectionsRenderer is NOT active
  useEffect(() => {
    // Only show route if there's an active order (selectedRestaurant)
    if (!selectedRestaurant) {
      // Clear route if no active order
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }
      if (directionsRendererRef.current && directionsRendererRef.current.getMap()) {
        directionsRendererRef.current.setMap(null);
      }
      return;
    }

    // DirectionsRenderer is never used - we always use custom polyline
    // Remove DirectionsRenderer if it somehow got attached
    if (directionsRendererRef.current && directionsRendererRef.current.getMap()) {
      directionsRendererRef.current.setMap(null);
    }

    // Always use custom polyline (DirectionsRenderer is never active - it adds dots)
    if (routePolylineRef.current) {
      if (showRoutePath && routeHistoryRef.current.length >= 2) {
        routePolylineRef.current.setMap(window.deliveryMapInstance);
      } else if (routePolyline && routePolyline.length > 0) {
        // Show route polyline if we have route data (from order acceptance)
        routePolylineRef.current.setMap(window.deliveryMapInstance);
      } else {
        routePolylineRef.current.setMap(null);
      }
    }
  }, [showRoutePath, routePolyline, directionsResponse, selectedRestaurant])

  // Listen for order ready event from backend (when restaurant marks order ready)
  useEffect(() => {
    if (!orderReady) return
    debugLog('✅ Order ready event received:', orderReady)

    let restaurantInfo = selectedRestaurant
    const order = orderReady.order || orderReady

    // Update selectedRestaurant with order data from orderReady if we don't have it
    if ((orderReady.orderId || order?.orderId) && order && !selectedRestaurant?.orderId) {
      // Extract restaurant address with multiple fallbacks
      let restaurantAddress = selectedRestaurant?.address || 'Restaurant Address'
      const restaurantLocation = order.restaurantId?.location
      
      if (order.restaurantId?.address) {
        restaurantAddress = order.restaurantId.address
      } else if (restaurantLocation?.formattedAddress) {
        restaurantAddress = restaurantLocation.formattedAddress
      } else if (restaurantLocation?.address) {
        restaurantAddress = restaurantLocation.address
      } else if (restaurantLocation?.street) {
        const addressParts = [
          restaurantLocation.street,
          restaurantLocation.area,
          restaurantLocation.city,
          restaurantLocation.state,
          restaurantLocation.zipCode || restaurantLocation.pincode || restaurantLocation.postalCode
        ].filter(Boolean)
        restaurantAddress = addressParts.join(', ')
      } else if (restaurantLocation?.addressLine1) {
        const addressParts = [
          restaurantLocation.addressLine1,
          restaurantLocation.addressLine2,
          restaurantLocation.city,
          restaurantLocation.state
        ].filter(Boolean)
        restaurantAddress = addressParts.join(', ')
      } else if (order.restaurantId?.addressLine1) {
        const addressParts = [
          order.restaurantId.addressLine1,
          order.restaurantId.addressLine2,
          order.restaurantId.area, // Zone
          order.restaurantId.city,
          order.restaurantId.state,
          order.restaurantId.pincode || order.restaurantId.zipCode || order.restaurantId.postalCode
        ].filter(Boolean)
        restaurantAddress = addressParts.join(', ')
      } else if (order.restaurantId?.street || order.restaurantId?.city) {
        const addressParts = [
          order.restaurantId.street,
          order.restaurantId.area, // Zone
          order.restaurantId.city,
          order.restaurantId.state,
          order.restaurantId.pincode || order.restaurantId.zipCode || order.restaurantId.postalCode
        ].filter(Boolean)
        restaurantAddress = addressParts.join(', ')
      } else if (order.restaurantAddress) {
        restaurantAddress = order.restaurantAddress
      } else if (orderReady.restaurantAddress) {
        restaurantAddress = orderReady.restaurantAddress
      }
      
      restaurantInfo = {
        ...selectedRestaurant,
        orderId: order.orderId || orderReady.orderId || selectedRestaurant?.orderId,
        name: order.restaurantName || orderReady.restaurantName || order.restaurantId?.name || selectedRestaurant?.name,
        address: restaurantAddress,
        lat: order.restaurantId?.location?.coordinates?.[1] || orderReady.restaurantLat || selectedRestaurant?.lat,
        lng: order.restaurantId?.location?.coordinates?.[0] || orderReady.restaurantLng || selectedRestaurant?.lng,
        orderStatus: 'ready'
      }
      setSelectedRestaurant(restaurantInfo)
      debugLog('🏪 Updated restaurant info from orderReady event:', restaurantInfo)
    } else if (selectedRestaurant) {
      // Always set orderStatus to 'ready' so location monitor shows Reached Pickup when rider is within 500m
      setSelectedRestaurant(prev => ({ ...prev, orderStatus: 'ready' }))
    }

    setShowDirectionsMap(false)

    const currentRestaurantInfo = {
      ...(restaurantInfo || selectedRestaurant || {}),
      lat: (restaurantInfo || selectedRestaurant)?.lat || orderReady?.restaurantLat,
      lng: (restaurantInfo || selectedRestaurant)?.lng || orderReady?.restaurantLng
    }
    const orderStatus = currentRestaurantInfo?.orderStatus || currentRestaurantInfo?.status || ''
    const deliveryPhase = currentRestaurantInfo?.deliveryPhase || currentRestaurantInfo?.deliveryState?.currentPhase || ''
    const isDelivered = orderStatus === 'delivered' ||
      deliveryPhase === 'completed' ||
      deliveryPhase === 'delivered' ||
      currentRestaurantInfo?.deliveryState?.status === 'delivered'

    if (isDelivered) {
      clearOrderReady()
      return
    }

    debugLog('✅ Order ready – pickup popup will open after proximity check')

    clearOrderReady()
  }, [orderReady, selectedRestaurant])

  // Fetch order details when Reached Pickup popup is shown to ensure we have restaurant address
  useEffect(() => {
    // Always log to see if useEffect is running
    debugLog('🔍 Reached Pickup popup useEffect triggered:', {
      showreachedPickupPopup,
      hasOrderId: !!selectedRestaurant?.orderId,
      hasId: !!selectedRestaurant?.id,
      currentAddress: selectedRestaurant?.address,
      orderId: selectedRestaurant?.orderId,
      id: selectedRestaurant?.id,
      selectedRestaurantKeys: selectedRestaurant ? Object.keys(selectedRestaurant) : []
    })
    
    if (!showreachedPickupPopup) {
      debugLog('⏭️ Skipping fetch - popup not shown')
      return
    }
    
    const orderId = selectedRestaurant?.orderId || selectedRestaurant?.id
    if (!orderId) {
      debugLog('⏭️ Skipping fetch - no orderId or id found')
      return
    }

    // Always fetch to ensure we have the latest address (even if one exists, it might be incomplete)
    // Only skip if we have a valid non-default address
    if (selectedRestaurant?.address && 
        selectedRestaurant.address !== 'Restaurant Address' && 
        selectedRestaurant.address.length > 20) { // Valid address should be longer than default
      debugLog('⏭️ Skipping fetch - address already exists and seems valid:', selectedRestaurant.address)
      return
    }

    const fetchOrderDetails = async () => {
      try {
        debugLog('📋 Fetching order details for restaurant address, orderId:', orderId)
        
        const response = await deliveryAPI.getOrderDetails(orderId)
        
        if (response.data?.success && response.data.data) {
          const orderData = response.data.data
          const order = orderData.order || orderData
          
          // Debug: Log full order structure
          debugLog('🔍 Full order structure:', JSON.stringify(order, null, 2))
          debugLog('🔍 order.restaurantId:', order.restaurantId)
          debugLog('🔍 order.restaurantId?.location:', order.restaurantId?.location)
          
          // Extract restaurant address with multiple fallbacks
          let restaurantAddress = selectedRestaurant?.address || 'Restaurant Address'
          const restaurantLocation = order.restaurantId?.location
          
          if (order.restaurantId?.address) {
            restaurantAddress = order.restaurantId.address
            debugLog('✅ Fetched restaurantId.address:', restaurantAddress)
          } else if (restaurantLocation?.formattedAddress) {
            restaurantAddress = restaurantLocation.formattedAddress
            debugLog('✅ Fetched location.formattedAddress:', restaurantAddress)
          } else if (restaurantLocation?.address) {
            restaurantAddress = restaurantLocation.address
            debugLog('✅ Fetched location.address:', restaurantAddress)
          } else if (restaurantLocation?.street) {
            const addressParts = [
              restaurantLocation.street,
              restaurantLocation.area,
              restaurantLocation.city,
              restaurantLocation.state,
              restaurantLocation.zipCode || restaurantLocation.pincode || restaurantLocation.postalCode
            ].filter(Boolean)
            restaurantAddress = addressParts.join(', ')
            debugLog('✅ Built address from components:', restaurantAddress)
          } else if (restaurantLocation?.addressLine1) {
            const addressParts = [
              restaurantLocation.addressLine1,
              restaurantLocation.addressLine2,
              restaurantLocation.city,
              restaurantLocation.state
            ].filter(Boolean)
            restaurantAddress = addressParts.join(', ')
            debugLog('✅ Built address from addressLine1:', restaurantAddress)
          } else if (order.restaurantId?.street || order.restaurantId?.city) {
            const addressParts = [
              order.restaurantId.street,
              order.restaurantId.area,
              order.restaurantId.city,
              order.restaurantId.state,
              order.restaurantId.zipCode || order.restaurantId.pincode || order.restaurantId.postalCode
            ].filter(Boolean)
            restaurantAddress = addressParts.join(', ')
            debugLog('✅ Built address from restaurantId fields:', restaurantAddress)
          } else if (order.restaurantAddress) {
            restaurantAddress = order.restaurantAddress
            debugLog('✅ Fetched order.restaurantAddress:', restaurantAddress)
          } else if (order.restaurant?.address) {
            restaurantAddress = order.restaurant.address
            debugLog('✅ Fetched order.restaurant.address:', restaurantAddress)
          } else if (order.restaurant?.location?.formattedAddress) {
            restaurantAddress = order.restaurant.location.formattedAddress
            debugLog('✅ Fetched order.restaurant.location.formattedAddress:', restaurantAddress)
          } else if (order.restaurant?.location?.address) {
            restaurantAddress = order.restaurant.location.address
            debugLog('✅ Fetched order.restaurant.location.address:', restaurantAddress)
          }
          
          // Update selectedRestaurant with fetched address
          if (restaurantAddress && restaurantAddress !== 'Restaurant Address') {
            setSelectedRestaurant(prev => {
              const updated = {
                ...prev,
                address: restaurantAddress
              }
              debugLog('✅ Updated selectedRestaurant with fetched address:', {
                oldAddress: prev?.address,
                newAddress: restaurantAddress,
                fullUpdated: updated
              })
              return updated
            })
          } else {
            // If address not found in order, try fetching restaurant details by ID
            const restaurantId = order.restaurantId
            if (restaurantId && (typeof restaurantId === 'string' || typeof restaurantId === 'object')) {
              const restaurantIdString = typeof restaurantId === 'string' ? restaurantId : (restaurantId._id || restaurantId.id || restaurantId.toString())
              debugLog('🔄 Address not found in order, fetching restaurant details by ID:', restaurantIdString)
              
              try {
                const restaurantResponse = await restaurantAPI.getRestaurantById(restaurantIdString)
                if (restaurantResponse.data?.success && restaurantResponse.data.data) {
                  const restaurant = restaurantResponse.data.data.restaurant || restaurantResponse.data.data
                  debugLog('✅ Fetched restaurant details:', restaurant)
                  
                  // Extract address from restaurant location.formattedAddress (priority)
                  let fetchedAddress = 'Restaurant Address'
                  const restLocation = restaurant.location
                  
                  if (restLocation?.formattedAddress) {
                    fetchedAddress = restLocation.formattedAddress
                    debugLog('✅ Using restaurant.location.formattedAddress:', fetchedAddress)
                  } else if (restaurant.address) {
                    fetchedAddress = restaurant.address
                    debugLog('✅ Using restaurant.address:', fetchedAddress)
                  } else if (restLocation?.address) {
                    fetchedAddress = restLocation.address
                    debugLog('✅ Using restaurant.location.address:', fetchedAddress)
                  } else if (restLocation?.street) {
                    const addressParts = [
                      restLocation.street,
                      restLocation.area,
                      restLocation.city,
                      restLocation.state,
                      restLocation.zipCode || restLocation.pincode || restLocation.postalCode
                    ].filter(Boolean)
                    fetchedAddress = addressParts.join(', ')
                    debugLog('✅ Built address from restaurant location components:', fetchedAddress)
                  } else if (restLocation?.addressLine1) {
                    const addressParts = [
                      restLocation.addressLine1,
                      restLocation.addressLine2,
                      restLocation.city,
                      restLocation.state
                    ].filter(Boolean)
                    fetchedAddress = addressParts.join(', ')
                    debugLog('✅ Built address from restaurant location addressLine1:', fetchedAddress)
                  } else if (restaurant.street || restaurant.city) {
                    const addressParts = [
                      restaurant.street,
                      restaurant.area,
                      restaurant.city,
                      restaurant.state,
                      restaurant.zipCode || restaurant.pincode || restaurant.postalCode
                    ].filter(Boolean)
                    fetchedAddress = addressParts.join(', ')
                    debugLog('✅ Built address from restaurant fields:', fetchedAddress)
                  }
                  
                  // Update selectedRestaurant with fetched address and phone
                  const updates = {}
                  if (fetchedAddress && fetchedAddress !== 'Restaurant Address') {
                    updates.address = fetchedAddress
                  }
                  
                  // Also fetch phone number from restaurant data
                  const restaurantPhone = restaurant.phone || restaurant.ownerPhone || restaurant.primaryContactNumber
                  if (restaurantPhone) {
                    updates.phone = restaurantPhone
                    updates.ownerPhone = restaurant.ownerPhone || restaurantPhone
                    debugLog('✅ Fetched restaurant phone:', restaurantPhone)
                  }
                  
                  if (Object.keys(updates).length > 0) {
                    setSelectedRestaurant(prev => ({
                      ...prev,
                      ...updates
                    }))
                    debugLog('✅ Updated selectedRestaurant with restaurant API data:', updates)
                    return // Exit early since we got the data
                  } else {
                    debugWarn('⚠️ Could not extract address or phone from restaurant data:', {
                      restaurantKeys: Object.keys(restaurant),
                      hasLocation: !!restLocation,
                      locationKeys: restLocation ? Object.keys(restLocation) : [],
                      hasPhone: !!restaurant.phone,
                      hasOwnerPhone: !!restaurant.ownerPhone,
                      hasPrimaryContact: !!restaurant.primaryContactNumber
                    })
                  }
                }
              } catch (restaurantError) {
                debugError('❌ Error fetching restaurant details:', restaurantError)
              }
            }
            
            debugWarn('⚠️ Could not extract restaurant address from order or restaurant API:', {
              orderKeys: Object.keys(order),
              hasRestaurantId: !!order.restaurantId,
              restaurantIdType: typeof order.restaurantId,
              restaurantIdValue: order.restaurantId
            })
          }
        }
      } catch (error) {
        debugError('❌ Error fetching order details for restaurant address:', error)
      }
    }

    fetchOrderDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showreachedPickupPopup, selectedRestaurant?.orderId, selectedRestaurant?.id])

  // Monitor delivery boy's location for "Reached Pickup" detection
  // Show "Reached Pickup" popup when delivery boy is within 500 meters of restaurant location
  useEffect(() => {
    // Don't show if popup is already showing, or if order hasn't been accepted yet
    if (showreachedPickupPopup || 
        showNewOrderPopup || 
        showOrderIdConfirmationPopup || // Don't show if order ID is already being confirmed
        showReachedDropPopup || // Don't show if already reached drop
        showOrderDeliveredAnimation || // Don't show if order is delivered
        showCustomerReviewPopup || // Don't show if showing review popup
        showPaymentPage || // Don't show if showing payment page
        !selectedRestaurant?.lat || 
        !selectedRestaurant?.lng || 
        !riderLocation || 
        riderLocation.length !== 2) {
      return
    }

    // Only show for orders that are in pickup phase (en_route_to_pickup or at_pickup)
    const deliveryPhase = selectedRestaurant?.deliveryPhase || selectedRestaurant?.deliveryState?.currentPhase || ''
    const orderStatus = selectedRestaurant?.orderStatus || selectedRestaurant?.status || ''
    
    // CRITICAL: Don't show if order is already delivered/completed
    const isDelivered = orderStatus === 'delivered' || 
                        deliveryPhase === 'completed' || 
                        deliveryPhase === 'delivered' ||
                        selectedRestaurant?.deliveryState?.status === 'delivered'

    if (isDelivered) {
      // Hide popup if it's showing and order is delivered
      if (showreachedPickupPopup) {
        setShowreachedPickupPopup(false)
      }
      return
    }
    
    // CRITICAL: Don't show if order ID is already confirmed (en_route_to_delivery or order_confirmed)
    const isOrderIdConfirmed = deliveryPhase === 'en_route_to_delivery' ||
                               deliveryPhase === 'picked_up' ||
                               deliveryPhase === 'en_route_to_drop' ||
                               orderStatus === 'out_for_delivery' ||
                               selectedRestaurant?.deliveryState?.status === 'order_confirmed' ||
                               selectedRestaurant?.deliveryState?.currentPhase === 'en_route_to_delivery' ||
                               selectedRestaurant?.deliveryState?.currentPhase === 'en_route_to_drop'
    
    if (isOrderIdConfirmed) {
      // Order ID is already confirmed, don't show Reached Pickup popup
      if (showreachedPickupPopup) {
        debugLog('🚫 Order ID already confirmed, closing Reached Pickup popup')
        setShowreachedPickupPopup(false)
      }
      return
    }
    
    // Only show if order is accepted and on the way to pickup or at pickup
    const isInPickupPhase = deliveryPhase === 'en_route_to_pickup' || 
                            deliveryPhase === 'at_pickup' ||
                            orderStatus === 'ready' ||
                            orderStatus === 'preparing'

    if (!isInPickupPhase) {
      return
    }

    const distanceInMeters = calculateDistanceInMeters(
      riderLocation[0],
      riderLocation[1],
      selectedRestaurant.lat,
      selectedRestaurant.lng
    )

    if (distanceInMeters <= PICKUP_REACHED_THRESHOLD_METERS && !showreachedPickupPopup) {
      debugLog('✅ Rider reached pickup proximity, opening popup', {
        distanceInMeters,
        threshold: PICKUP_REACHED_THRESHOLD_METERS
      })
      setShowreachedPickupPopup(true)
      setShowDirectionsMap(false)
      return
    }

    if (distanceInMeters <= PICKUP_REACHED_THRESHOLD_METERS * 2) {
      debugLog('📍 Rider approaching pickup', {
        distanceInMeters,
        threshold: PICKUP_REACHED_THRESHOLD_METERS
      })
    }
  }, [
riderLocation?.[0] || null, 
riderLocation?.[1] || null, 
selectedRestaurant?.lat || null, 
selectedRestaurant?.lng || null,
    selectedRestaurant?.deliveryPhase || selectedRestaurant?.deliveryState?.currentPhase || null,
    selectedRestaurant?.orderStatus || selectedRestaurant?.status || null,
    Boolean(showNewOrderPopup), 
    Boolean(showOrderIdConfirmationPopup), 
    Boolean(showreachedPickupPopup),
    Boolean(showReachedDropPopup),
    Boolean(showOrderDeliveredAnimation),
    Boolean(showCustomerReviewPopup),
    Boolean(showPaymentPage),
    selectedRestaurant?.orderStatus,
    selectedRestaurant?.status,
    selectedRestaurant?.deliveryPhase,
    selectedRestaurant?.deliveryState?.status,
    calculateDistanceInMeters
  ])

  // CRITICAL: Monitor order status and close all pickup/delivery popups when order is delivered
  // Also clear selectedRestaurant if order is completed and payment page is closed
  useEffect(() => {
    const orderStatus = selectedRestaurant?.orderStatus || selectedRestaurant?.status || ''
    const deliveryPhase = selectedRestaurant?.deliveryPhase || selectedRestaurant?.deliveryState?.currentPhase || ''
    const deliveryStateStatus = selectedRestaurant?.deliveryState?.status || ''
    
    const isDelivered = orderStatus === 'delivered' || 
                        orderStatus === 'completed' ||
                        deliveryPhase === 'completed' || 
                        deliveryPhase === 'delivered' ||
                        deliveryStateStatus === 'delivered' ||
                        showPaymentPage ||
                        showOrderDeliveredAnimation

    if (isDelivered) {
      // Close all pickup/delivery related popups when order is delivered
      if (showreachedPickupPopup) {
        debugLog('🚫 Order is delivered, closing Reached Pickup popup')
        setShowreachedPickupPopup(false)
      }
      if (showOrderIdConfirmationPopup) {
        debugLog('🚫 Order is delivered, closing Order ID Confirmation popup')
        setShowOrderIdConfirmationPopup(false)
      }
      if (showReachedDropPopup && !showOrderDeliveredAnimation && !showCustomerReviewPopup) {
        debugLog('🚫 Order is delivered, closing Reached Drop popup')
        setShowReachedDropPopup(false)
      }
      
      // If payment page is closed and order is delivered, clear selectedRestaurant
      if (!showPaymentPage && !showCustomerReviewPopup && !showOrderDeliveredAnimation && selectedRestaurant) {
        debugLog('✅ Order is delivered and payment completed, clearing selectedRestaurant')
        setSelectedRestaurant(null)
        localStorage.removeItem(DELIVERY_ACTIVE_ORDER_KEY)
        localStorage.removeItem('activeOrder')
        if (typeof clearNewOrder === 'function') {
          clearNewOrder()
        }
        acceptedOrderIdsRef.current.clear()
        
        // Clear map markers and polylines
        if (routePolylineRef.current) {
          routePolylineRef.current.setMap(null)
        }
        if (liveTrackingPolylineRef.current) {
          liveTrackingPolylineRef.current.setMap(null)
        }
        if (directionsRendererRef.current) {
          directionsRendererRef.current.setMap(null)
        }
      }
    }
  }, [
    selectedRestaurant?.orderStatus,
    selectedRestaurant?.status,
    selectedRestaurant?.deliveryPhase,
    selectedRestaurant?.deliveryState?.currentPhase,
    selectedRestaurant?.deliveryState?.status,
    showPaymentPage,
    showOrderDeliveredAnimation,
    showCustomerReviewPopup,
    showreachedPickupPopup,
    showOrderIdConfirmationPopup,
    showReachedDropPopup,
    clearNewOrder
  ])

  // Monitor order status and switch route from restaurant to customer when order is picked up
  useEffect(() => {
    const orderStatus = selectedRestaurant?.orderStatus || selectedRestaurant?.status || '';
    const deliveryPhase = selectedRestaurant?.deliveryPhase || selectedRestaurant?.deliveryState?.currentPhase || '';
    const customerDestination = getCustomerDestination(selectedRestaurant)
    
    // Check if order is picked up or out for delivery
    const isPickedUp = orderStatus === 'out_for_delivery' || 
                       orderStatus === 'picked_up' ||
                       deliveryPhase === 'en_route_to_delivery' ||
                       deliveryPhase === 'picked_up';
    
    // Check if we have customer location
    const hasCustomerLocation = !!customerDestination;
    
    // Only switch route if order is picked up and we have customer location
    if (isPickedUp && hasCustomerLocation && riderLocation && riderLocation.length === 2) {
      // Ensure customer route layer is visible in delivery phase.
      setShowRoutePath(true);

      // Check if current route is already heading to customer.
      const currentDirections = directionsResponseRef.current;
      const isCurrentRouteToCustomer = isDirectionsResultNearDestination(currentDirections, customerDestination);
      const needsCustomerRoute = !isCurrentRouteToCustomer;
      
      if (needsCustomerRoute) {
        debugLog('🔄 Order picked up - switching route to customer location');
        
        // Calculate route from current location to customer
        calculateRouteWithDirectionsAPI(
          riderLocation,
          customerDestination
        ).then(directionsResult => {
          if (directionsResult) {
            debugLog('✅ Route to customer calculated after pickup');
            setDirectionsResponse(directionsResult);
            directionsResponseRef.current = directionsResult;
            
            // Show polyline for customer route - update live tracking polyline with new route
            if (riderLocation && window.deliveryMapInstance) {
              // Update live tracking polyline with route to customer (Restaurant → Customer)
              updateLiveTrackingPolyline(directionsResult, riderLocation);
              debugLog('✅ Live tracking polyline updated for delivery route (Restaurant → Customer)');
            } else {
              // Wait for map to be ready
              setTimeout(() => {
                if (riderLocation && window.deliveryMapInstance) {
                  updateLiveTrackingPolyline(directionsResult, riderLocation);
                  debugLog('✅ Live tracking polyline updated for delivery route (delayed)');
                }
              }, 500);
            }
            
            // Clean up old fallback polyline if exists
            if (window.deliveryMapInstance) {
              try {
                if (routePolylineRef.current) {
                  routePolylineRef.current.setMap(null);
                  routePolylineRef.current = null;
                }
                
                // Remove DirectionsRenderer from map (we use custom polyline instead)
                if (directionsRendererRef.current) {
                  directionsRendererRef.current.setMap(null);
                }
              } catch (e) {
                debugWarn('⚠️ Error cleaning up old polyline:', e);
              }
              
              // Fit map bounds to show entire route
              const bounds = directionsResult.routes[0].bounds;
              if (bounds) {
                const currentZoomBeforeFit = window.deliveryMapInstance.getZoom();
                window.deliveryMapInstance.fitBounds(bounds, { padding: 100 });
                // Preserve zoom if user had zoomed in
                setTimeout(() => {
                  const newZoom = window.deliveryMapInstance.getZoom();
                  if (currentZoomBeforeFit > newZoom && currentZoomBeforeFit >= 18) {
                    window.deliveryMapInstance.setZoom(currentZoomBeforeFit);
                  }
                }, 100);
              }
            }
          }
        }).catch(error => {
          debugWarn('⚠️ Error calculating route to customer after pickup:', error);
        });
      }
    }
  }, [
    selectedRestaurant?.orderStatus,
    selectedRestaurant?.status,
    selectedRestaurant?.deliveryPhase,
    selectedRestaurant?.deliveryState?.currentPhase,
    selectedRestaurant?.customerLat,
    selectedRestaurant?.customerLng,
    riderLocation,
    calculateRouteWithDirectionsAPI,
    updateLiveTrackingPolyline
  ]);

  // When out_for_delivery but customerLat/customerLng missing, fetch order details and set them
  useEffect(() => {
    if (!selectedRestaurant) {
      fetchedOrderDetailsForDropRef.current = null
      return
    }
    const orderStatus = selectedRestaurant?.orderStatus || selectedRestaurant?.status || ''
    const deliveryPhase = selectedRestaurant?.deliveryPhase || selectedRestaurant?.deliveryState?.currentPhase || ''
    const isOutForDelivery = orderStatus === 'out_for_delivery' || deliveryPhase === 'en_route_to_delivery'
    const customerLat = toFiniteCoordinate(selectedRestaurant?.customerLat)
    const customerLng = toFiniteCoordinate(selectedRestaurant?.customerLng)
    const hasCustomerCoords = Number.isFinite(customerLat) && Number.isFinite(customerLng) &&
      !(customerLat === 0 && customerLng === 0)
    const orderId = selectedRestaurant?.orderId || selectedRestaurant?.id

    if (!isOutForDelivery || hasCustomerCoords || !orderId || fetchedOrderDetailsForDropRef.current === orderId) return

    fetchedOrderDetailsForDropRef.current = orderId
    deliveryAPI.getOrderDetails(orderId)
      .then(res => {
        const order = res.data?.data?.order || res.data?.order
        const coords = order?.address?.location?.coordinates
        const lat = coords?.[1]
        const lng = coords?.[0]
        if (lat != null && lng != null && !(lat === 0 && lng === 0) && selectedRestaurant) {
          setSelectedRestaurant(prev => prev ? { ...prev, customerLat: lat, customerLng: lng } : null)
          debugLog('✅ Reached Drop: customer location loaded from getOrderDetails', { lat, lng })
        }
      })
      .catch(err => {
        debugWarn('⚠️ Reached Drop: getOrderDetails failed for customer coords:', err?.response?.data?.message || err.message)
      })
  }, [selectedRestaurant?.orderStatus, selectedRestaurant?.deliveryPhase, selectedRestaurant?.deliveryState?.currentPhase, selectedRestaurant?.customerLat, selectedRestaurant?.customerLng, selectedRestaurant?.orderId, selectedRestaurant?.id])

  // Monitor delivery boy's location for "Reached Drop" detection
  // Show "Reached Drop" popup when delivery boy is within 500 meters of customer location
  // Use useMemo to ensure deliveryStateStatus is always defined (prevents dependency array size changes)
  const deliveryStateStatus = useMemo(() => {
    return selectedRestaurant?.deliveryState?.status ?? null
  }, [selectedRestaurant?.deliveryState?.status])
  
  useEffect(() => {
    // CRITICAL: If payment page is showing, delivery is completed - do NOT show reached drop popup
    if (showPaymentPage || showCustomerReviewPopup || showOrderDeliveredAnimation) {
      if (showReachedDropPopup) setShowReachedDropPopup(false)
      return
    }

    const orderStatus = selectedRestaurant?.orderStatus || selectedRestaurant?.status || newOrder?.status || ''
    const deliveryPhase = selectedRestaurant?.deliveryState?.currentPhase || selectedRestaurant?.deliveryPhase || ''
    const isDeliveredOrCompleted = orderStatus === 'delivered' || 
                                   orderStatus === 'completed' || 
                                   deliveryPhase === 'completed' ||
                                   deliveryPhase === 'at_delivery'
    // deliveryStateStatus is defined outside useEffect using useMemo (prevents dependency array size changes)
    // More lenient check: allow if order ID is confirmed or order is out for delivery
    const isOutForDelivery = !isDeliveredOrCompleted && (
                             orderStatus === 'out_for_delivery' || 
                             deliveryPhase === 'en_route_to_delivery' ||
                             deliveryPhase === 'picked_up' ||
                             deliveryPhase === 'at_delivery' ||
                             deliveryStateStatus === 'order_confirmed' ||
                             deliveryStateStatus === 'en_route_to_delivery' ||
                             orderStatus === 'ready')

    // Rider position: prefer riderLocation, fallback lastLocationRef
    const riderPos = (riderLocation && riderLocation.length === 2) ? riderLocation : (lastLocationRef.current && lastLocationRef.current.length === 2 ? lastLocationRef.current : null)

    const customerDestination = getCustomerDestination(selectedRestaurant)
    const hasCustomerCoords = !!customerDestination &&
      !(customerDestination.lat === 0 && customerDestination.lng === 0)

    if (!hasCustomerCoords) {
      // Don't spam; only log when we're otherwise ready to monitor
      if (isOutForDelivery && !isDeliveredOrCompleted && selectedRestaurant) {
        debugWarn('[Reached Drop] Customer location missing. Ensure order has delivery address or wait for fetch.')
      }
      return
    }
    if (!riderPos) {
      debugLog('[Reached Drop] No rider position available')
      return
    }
    
    // Don't show if other popups are active (but allow if Order ID confirmation was just completed)
    // NOTE: If showReachedDropPopup is already true, don't hide it - it was explicitly set after Order ID confirmation
    if (isDeliveredOrCompleted || showNewOrderPopup || showreachedPickupPopup) {
      return
    }
    
    // If Reached Drop popup is already showing, don't interfere (it was explicitly set)
    if (showReachedDropPopup) {
      return
    }
    
    // Only block if Order ID confirmation popup is still actively showing
    // If it was just closed, allow Reached Drop to show
    if (showOrderIdConfirmationPopup) {
      return
    }
    
    // CRITICAL: Must be in delivery phase (after Order ID confirmation)
    // Also allow if order ID confirmation was just completed (picked_up phase)
    const isInDeliveryPhase = isOutForDelivery || 
                              deliveryPhase === 'picked_up' ||
                              deliveryStateStatus === 'order_confirmed' ||
                              orderStatus === 'out_for_delivery'
    
    if (!isInDeliveryPhase) {
      debugLog('[Reached Drop] Order not in delivery phase:', {
        orderStatus,
        deliveryPhase,
        deliveryStateStatus,
        isOutForDelivery,
        isInDeliveryPhase
      })
      return
    }

    const distanceInMeters = calculateDistanceInMeters(
      riderPos[0],
      riderPos[1],
      customerDestination.lat,
      customerDestination.lng
    )

    if (distanceInMeters <= DROP_REACHED_THRESHOLD_METERS && !showReachedDropPopup) {
      debugLog('✅ Rider reached drop proximity, opening popup', {
        distanceInMeters,
        threshold: DROP_REACHED_THRESHOLD_METERS
      })
      setShowReachedDropPopup(true)
      setShowDirectionsMap(false)
      return
    }

    // Log distance check more frequently for debugging
    if (distanceInMeters <= 200) {
      debugLog(`📍 Distance to customer: ${distanceInMeters.toFixed(2)} meters`, {
        riderPos: riderPos,
        customerLat: customerDestination.lat,
        customerLng: customerDestination.lng,
        orderId: selectedRestaurant?.orderId || selectedRestaurant?.id,
        orderStatus,
        deliveryPhase,
        deliveryStateStatus,
        isOutForDelivery,
        isInDeliveryPhase,
        showReachedDropPopup,
        showOrderIdConfirmationPopup,
        showreachedPickupPopup
      })
    }

    if (distanceInMeters <= 400) {
      debugLog(`📍 Distance to customer: ${distanceInMeters.toFixed(2)} meters`, {
        orderId: selectedRestaurant?.orderId || selectedRestaurant?.id,
        customerLocation: customerDestination,
        riderLocation: riderPos,
        orderStatus,
        deliveryPhase,
        deliveryStateStatus
      })
    }
    
    // Live tracking polyline is already updated automatically via watchPosition callback
    // No need to recalculate route here - it's handled in handleOrderIdConfirmTouchEnd
  }, [
    riderLocation?.[0] ?? null,
    riderLocation?.[1] ?? null,
    selectedRestaurant?.customerLat ?? null,
    selectedRestaurant?.customerLng ?? null,
    selectedRestaurant?.orderStatus || newOrder?.status || null,
    selectedRestaurant?.deliveryPhase || selectedRestaurant?.deliveryState?.currentPhase || null,
    deliveryStateStatus, // Use memoized value to ensure consistent dependency array size
    Boolean(showNewOrderPopup), 
    Boolean(showOrderIdConfirmationPopup), 
    Boolean(showreachedPickupPopup), 
    Boolean(showReachedDropPopup), 
    Boolean(showOrderDeliveredAnimation),
    Boolean(showCustomerReviewPopup),
    Boolean(showPaymentPage),
    calculateDistanceInMeters
  ])

  // Calculate heading from two coordinates (in degrees, 0-360)
  const calculateHeading = (lat1, lng1, lat2, lng2) => {
    const dLng = (lng2 - lng1) * Math.PI / 180
    const lat1Rad = lat1 * Math.PI / 180
    const lat2Rad = lat2 * Math.PI / 180
    
    const y = Math.sin(dLng) * Math.cos(lat2Rad)
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng)
    
    let heading = Math.atan2(y, x) * 180 / Math.PI
    heading = (heading + 360) % 360 // Normalize to 0-360
    
    return heading
  }

  // Cache for rotated icons to avoid recreating them
  const rotatedIconCache = useRef(new Map());

  // Function to rotate bike logo image based on heading
  const getRotatedBikeIcon = (heading = 0) => {
    // Round heading to nearest 5 degrees for caching
    const roundedHeading = Math.round(heading / 5) * 5;
    const cacheKey = `${roundedHeading}`;
    
    // Check cache first
    if (rotatedIconCache.current.has(cacheKey)) {
      return Promise.resolve(rotatedIconCache.current.get(cacheKey));
    }

    return new Promise((resolve) => {
      const img = new Image();
      // Don't set crossOrigin for local images - it causes CORS issues
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const size = 60; // Icon size
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          
          // Clear canvas
          ctx.clearRect(0, 0, size, size);
          
          // Move to center, rotate, then draw image
          ctx.save();
          ctx.translate(size / 2, size / 2);
          ctx.rotate((roundedHeading * Math.PI) / 180); // Convert degrees to radians
          ctx.drawImage(img, -size / 2, -size / 2, size, size);
          ctx.restore();
          
          // Get data URL and cache it
          const dataUrl = canvas.toDataURL();
          rotatedIconCache.current.set(cacheKey, dataUrl);
          resolve(dataUrl);
        } catch (error) {
          debugWarn('⚠️ Error rotating bike icon:', error);
          // Fallback to original image if rotation fails
          resolve(bikeLogo);
        }
      };
      img.onerror = () => {
        debugWarn('⚠️ Bike logo image failed to load:', bikeLogo);
        // Fallback to original image if loading fails
        resolve(bikeLogo);
      };
      img.src = bikeLogo;
      
      // If image is already loaded (cached), resolve immediately
      if (img.complete) {
        // Image already loaded, process it
        img.onload();
      }
    });
  };

  // Google Maps marker functions - Zomato style exact location tracking
  const createOrUpdateBikeMarker = async (latitude, longitude, heading = null, shouldCenterMap = true) => {
    if (!window.google || !window.google.maps || !window.deliveryMapInstance) {
      debugWarn("⚠️ Google Maps not available");
      return;
    }

    const position = new window.google.maps.LatLng(latitude, longitude);
    const map = window.deliveryMapInstance;

    // Get rotated icon URL
    const rotatedIconUrl = await getRotatedBikeIcon(heading || 0);

    if (!bikeMarkerRef.current) {
      debugLog('📍 Creating new bike marker at:', { lat: latitude, lng: longitude });
      // Create bike marker with rotated icon - exact position
      const bikeIcon = {
        url: rotatedIconUrl,
        scaledSize: new window.google.maps.Size(60, 60), // Larger size for better visibility
        anchor: new window.google.maps.Point(30, 30) // Center point
      };

      bikeMarkerRef.current = new window.google.maps.Marker({
        position: position,
        map: map,
        icon: bikeIcon,
        optimized: false, // Disable optimization for exact positioning
        animation: window.google.maps.Animation.DROP, // Drop animation on first appearance
        zIndex: 1000 // High z-index to ensure it's above other markers
      });
      
      debugLog('✅ Bike marker created:', {
        position: { lat: latitude, lng: longitude },
        map: map,
        iconUrl: rotatedIconUrl,
        marker: bikeMarkerRef.current
      });
      
      // Center map on bike location initially - preserve current zoom if user has zoomed in
      if (shouldCenterMap) {
        const currentZoom = map.getZoom();
        map.setCenter(position);
        // Only set zoom to 18 if current zoom is less than 18 (don't reduce user's zoom)
        if (currentZoom < 18) {
          map.setZoom(18); // Full zoom in for better visibility
        }
      }
      
      // Remove animation after drop completes
      setTimeout(() => {
        if (bikeMarkerRef.current) {
          bikeMarkerRef.current.setAnimation(null);
        }
      }, 2000);
    } else {
      // ALWAYS ensure marker is on the map (prevent it from disappearing)
      const currentMap = bikeMarkerRef.current.getMap();
      if (currentMap === null || currentMap !== map) {
        debugWarn('⚠️ Bike marker not on correct map, re-adding...', {
          currentMap: currentMap,
          expectedMap: map
        });
        bikeMarkerRef.current.setMap(map);
      }
      
      // Update position EXACTLY - use setPosition for precise location
      // Verify coordinates are correct before setting
      debugLog('📍 Updating bike marker position:', { 
        lat: latitude, 
        lng: longitude,
        heading: heading || 0,
        currentMarkerPos: bikeMarkerRef.current.getPosition() 
          ? { lat: bikeMarkerRef.current.getPosition().lat(), lng: bikeMarkerRef.current.getPosition().lng() }
          : 'null'
      });
      
      // Validate coordinates before setting
      if (typeof latitude === 'number' && typeof longitude === 'number' &&
          !isNaN(latitude) && !isNaN(longitude) &&
          latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        bikeMarkerRef.current.setPosition(position);
        debugLog('✅ Bike marker position updated successfully');
      } else {
        debugError('❌ Invalid coordinates for bike marker:', { latitude, longitude });
        return; // Don't update if coordinates are invalid
      }
      
      // Update icon with rotation for smooth movement
      const currentHeading = heading !== null && heading !== undefined ? heading : 0;
      const rotatedIconUrl = await getRotatedBikeIcon(currentHeading);
      const bikeIcon = {
        url: rotatedIconUrl,
        scaledSize: new window.google.maps.Size(60, 60),
        anchor: new window.google.maps.Point(30, 30)
      };
      bikeMarkerRef.current.setIcon(bikeIcon);
      
      // Ensure z-index is high
      bikeMarkerRef.current.setZIndex(1000);
      
      // Auto-center map on bike location (like Zomato) - only if user hasn't manually panned
      if (shouldCenterMap && !isUserPanningRef.current) {
        // Smooth pan to bike location
        map.panTo(position);
      }
      
      // Double-check marker is still on map after update
      if (bikeMarkerRef.current.getMap() === null) {
        debugWarn('⚠️ Bike marker lost map reference after update, re-adding...');
        bikeMarkerRef.current.setMap(map);
      }
    }
  }

  // Create or update route polyline (blue line showing traveled path) - LEGACY/FALLBACK
  // Accepts optional coordinates parameter to draw route immediately without waiting for state update
  // This is a FALLBACK polyline - should only be used when DirectionsRenderer is NOT available
  const updateRoutePolyline = (coordinates = null) => {
    // Only show route if there's an active order (selectedRestaurant)
    if (!selectedRestaurant) {
      // Clear route if no active order
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }
      return;
    }

    // Keep DirectionsRenderer detached so Firebase/custom polyline remains the visible source of truth.
    if (directionsRendererRef.current && directionsRendererRef.current.getMap()) {
      directionsRendererRef.current.setMap(null);
    }

    if (!window.google || !window.google.maps || !window.deliveryMapInstance) {
      debugWarn('⚠️ Map not ready for polyline update');
      return;
    }

    const map = window.deliveryMapInstance;

    // Use provided coordinates or fallback to state
    const coordsToUse = coordinates || routePolyline;

    if (coordsToUse && coordsToUse.length > 0) {
      // Convert coordinates to Google Maps LatLng format
      const path = coordsToUse.map(coord => {
        if (Array.isArray(coord) && coord.length >= 2) {
          return new window.google.maps.LatLng(coord[0], coord[1]);
        }
        return null;
      }).filter(coord => coord !== null);

      if (path.length > 0) {
        if (routePolylineRef.current) {
          routePolylineRef.current.setMap(null);
          routePolylineRef.current = null;
        }

        routePolylineRef.current = new window.google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: '#2563eb',
          strokeOpacity: 0.9,
          strokeWeight: 5,
          map,
          zIndex: 980
        });

        // Fit map bounds to show entire route - but preserve zoom if user has zoomed in
        if (path.length > 1) {
          const bounds = new window.google.maps.LatLngBounds();
          path.forEach(point => bounds.extend(point));
          // Add padding to bounds for better visibility
          const currentZoomBeforeFit = map.getZoom();
          map.fitBounds(bounds, { padding: 50 });
          // Preserve zoom if user had zoomed in more than fitBounds would set
          setTimeout(() => {
            const newZoom = map.getZoom();
            if (currentZoomBeforeFit > newZoom && currentZoomBeforeFit >= 18) {
              map.setZoom(currentZoomBeforeFit);
            }
          }, 100);
          debugLog('✅ Map bounds adjusted to show route');
        }
      }
    } else {
      // Hide polyline if no route data
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }
    }
  }

  // Removed createOrUpdateBlueDotMarker - not needed, using bike icon instead


  // Bike marker update removed (Ola Maps removed)

  // Keep the home carousel visible even after bank details are complete.
  const carouselSlides = useMemo(() => [
    ...(bankDetailsFilled ? [] : [{
      id: 2,
      title: "Submit bank details",
      subtitle: "PAN & bank details required for payouts",
      icon: "bank",
      buttonText: "Submit",
      bgColor: "bg-yellow-400",
      actionPath: "/delivery/profile/details",
    }]),
    {
      id: 3,
      title: "Check pocket balance",
      subtitle: "Track deposits, cash in hand, and settlements",
      icon: "bank",
      buttonText: "Open",
      bgColor: "bg-gray-700",
      actionPath: "/delivery/pocket",
    },
    {
      id: 4,
      title: "View trip history",
      subtitle: "Review your completed deliveries and earnings",
      icon: "bag",
      buttonText: "View",
      bgColor: "bg-orange-400",
      actionPath: "/delivery/trip-history",
    }
  ], [bankDetailsFilled])

  // Auto-rotate carousel
  useEffect(() => {
    if (carouselAutoRotateRef.current) {
      clearInterval(carouselAutoRotateRef.current)
      carouselAutoRotateRef.current = null
    }

    // Reset to first slide if current slide is out of bounds
    setCurrentCarouselSlide((prev) => {
      if (prev >= carouselSlides.length) {
        return 0
      }
      return prev
    })

    // No rotation needed for 0/1 slides and avoids modulo edge cases in WebView.
    if (carouselSlides.length <= 1) {
      return () => {}
    }

    carouselAutoRotateRef.current = setInterval(() => {
      setCurrentCarouselSlide((prev) => (prev + 1) % carouselSlides.length)
    }, 3000)

    return () => {
      if (carouselAutoRotateRef.current) {
        clearInterval(carouselAutoRotateRef.current)
        carouselAutoRotateRef.current = null
      }
    }
  }, [carouselSlides])

  // Reset auto-rotate timer after manual swipe
  const resetCarouselAutoRotate = useCallback(() => {
    if (carouselSlides.length <= 1) return
    if (carouselAutoRotateRef.current) {
      clearInterval(carouselAutoRotateRef.current)
    }
    carouselAutoRotateRef.current = setInterval(() => {
      setCurrentCarouselSlide((prev) => (prev + 1) % carouselSlides.length)
    }, 3000)
  }, [carouselSlides.length])

  // Handle carousel swipe touch events
  const carouselStartY = useRef(0)

  const handleCarouselTouchStart = useCallback((e) => {
    carouselIsSwiping.current = true
    carouselStartX.current = e.touches[0].clientX
    carouselStartY.current = e.touches[0].clientY
  }, [])

  const handleCarouselTouchMove = useCallback((e) => {
    if (!carouselIsSwiping.current) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const deltaX = Math.abs(currentX - carouselStartX.current)
    const deltaY = Math.abs(currentY - carouselStartY.current)

    // Only prevent default if horizontal swipe is dominant
    // Don't call preventDefault - CSS touch-action handles scrolling prevention
    if (deltaX > deltaY && deltaX > 10) {
      // safePreventDefault(e) // Removed to avoid passive listener error
    }
  }, [])

  const handleCarouselTouchEnd = useCallback((e) => {
    if (!carouselIsSwiping.current) return
    if (carouselSlides.length <= 1) {
      carouselIsSwiping.current = false
      carouselStartX.current = 0
      carouselStartY.current = 0
      return
    }

    const endX = e.changedTouches[0].clientX
    const endY = e.changedTouches[0].clientY
    const deltaX = carouselStartX.current - endX
    const deltaY = Math.abs(carouselStartY.current - endY)
    const threshold = 50 // Minimum swipe distance

    // Only trigger if horizontal swipe is dominant
    if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        // Swiped left - go to next slide
        setCurrentCarouselSlide((prev) => (prev + 1) % carouselSlides.length)
      } else {
        // Swiped right - go to previous slide
        setCurrentCarouselSlide((prev) => (prev - 1 + carouselSlides.length) % carouselSlides.length)
      }
      resetCarouselAutoRotate()
    }

    carouselIsSwiping.current = false
    carouselStartX.current = 0
    carouselStartY.current = 0
  }, [carouselSlides.length, resetCarouselAutoRotate])

  const handleCarouselTouchCancel = useCallback(() => {
    carouselIsSwiping.current = false
    carouselStartX.current = 0
    carouselStartY.current = 0
  }, [])

  // Handle carousel mouse events for desktop
  const handleCarouselMouseDown = (e) => {
    carouselIsSwiping.current = true
    carouselStartX.current = e.clientX

    const handleMouseMove = (moveEvent) => {
      if (!carouselIsSwiping.current) return
      // Don't call preventDefault - CSS touch-action handles scrolling prevention
      // safePreventDefault(moveEvent) // Removed for consistency (mouse events aren't passive but removed anyway)
    }

    const handleMouseUp = (upEvent) => {
      if (!carouselIsSwiping.current) {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        return
      }

      const endX = upEvent.clientX
      const deltaX = carouselStartX.current - endX
      const threshold = 50

      if (Math.abs(deltaX) > threshold) {
        if (deltaX > 0) {
          // Swiped left - go to next slide
          setCurrentCarouselSlide((prev) => (prev + 1) % carouselSlides.length)
        } else {
          // Swiped right - go to previous slide
          setCurrentCarouselSlide((prev) => (prev - 1 + carouselSlides.length) % carouselSlides.length)
        }
        resetCarouselAutoRotate()
      }

      carouselIsSwiping.current = false
      carouselStartX.current = 0
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Setup non-passive touch event listeners for carousel to allow preventDefault
  useEffect(() => {
    const carouselElement = carouselRef.current
    if (!carouselElement) return

    // Add event listeners with { passive: false } for touchmove to allow preventDefault
    carouselElement.addEventListener('touchstart', handleCarouselTouchStart, { passive: true })
    carouselElement.addEventListener('touchmove', handleCarouselTouchMove, { passive: false })
    carouselElement.addEventListener('touchend', handleCarouselTouchEnd, { passive: true })
    carouselElement.addEventListener('touchcancel', handleCarouselTouchCancel, { passive: true })

    return () => {
      carouselElement.removeEventListener('touchstart', handleCarouselTouchStart)
      carouselElement.removeEventListener('touchmove', handleCarouselTouchMove)
      carouselElement.removeEventListener('touchend', handleCarouselTouchEnd)
      carouselElement.removeEventListener('touchcancel', handleCarouselTouchCancel)
    }
  }, [handleCarouselTouchStart, handleCarouselTouchMove, handleCarouselTouchEnd, handleCarouselTouchCancel])

  // Handle swipe bar touch events
  const handleSwipeBarTouchStart = (e) => {
    // Check if touch is on a button or interactive element
    const target = e.target
    const isInteractive = target.closest('button') || target.closest('a') || target.closest('[role="button"]')
    
    // If touching an interactive element, don't start swipe
    if (isInteractive && !target.closest('[data-swipe-handle]')) {
      return
    }
    
    // Check if touch is on scrollable content area
    const isOnScrollableContent = target.closest('[ref="homeSectionsScrollRef"]') || 
                                  target.closest('.overflow-y-auto') ||
                                  (homeSectionsScrollRef.current && homeSectionsScrollRef.current.contains(target))
    
    // Check if we're scrolling vs dragging
    if (showHomeSections && homeSectionsScrollRef.current && isOnScrollableContent) {
      const scrollTop = homeSectionsScrollRef.current.scrollTop
      const scrollHeight = homeSectionsScrollRef.current.scrollHeight
      const clientHeight = homeSectionsScrollRef.current.clientHeight
      const isScrollable = scrollHeight > clientHeight
      
      // If content is scrollable and not at top/bottom, allow scrolling
      if (isScrollable && (scrollTop > 10 || scrollTop < (scrollHeight - clientHeight - 10))) {
        // User is scrolling, not dragging
        isScrollingHomeSections.current = true
        isSwipingBar.current = false
        return
      }
    }
    
    // Only start swipe if touch is on swipe handle or at top/bottom of scrollable area
    isSwipingBar.current = true
    swipeBarStartY.current = e.touches[0].clientY
    setIsDraggingSwipeBar(true)
    isScrollingHomeSections.current = false
  }

  const handleSwipeBarTouchMove = (e) => {
    if (!isSwipingBar.current) return
    
    const currentY = e.touches[0].clientY
    const deltaY = swipeBarStartY.current - currentY // Positive = swiping up, Negative = swiping down
    const windowHeight = window.innerHeight

    // Check if user is scrolling content vs dragging swipe bar
    if (showHomeSections && homeSectionsScrollRef.current) {
      const scrollTop = homeSectionsScrollRef.current.scrollTop
      const scrollHeight = homeSectionsScrollRef.current.scrollHeight
      const clientHeight = homeSectionsScrollRef.current.clientHeight
      const isScrollable = scrollHeight > clientHeight
      
      // If content is scrollable and user is trying to scroll
      if (isScrollable) {
        // Scrolling down (deltaY < 0) - allow scroll if not at top
        if (deltaY < 0 && scrollTop > 0) {
          isScrollingHomeSections.current = true
          isSwipingBar.current = false
          setIsDraggingSwipeBar(false)
          return // Allow native scroll
        }
        
        // Scrolling up (deltaY > 0) - allow scroll if not at bottom
        if (deltaY > 0 && scrollTop < (scrollHeight - clientHeight - 10)) {
          isScrollingHomeSections.current = true
          isSwipingBar.current = false
          setIsDraggingSwipeBar(false)
          return // Allow native scroll
        }
      }
    }

    // If user was scrolling, don't handle as swipe
    if (isScrollingHomeSections.current) {
      return
    }

    // Only prevent default if we're actually dragging swipe bar (not scrolling)
    // Only prevent if drag is significant enough
    // Don't call preventDefault - CSS touch-action handles scrolling prevention
    if (Math.abs(deltaY) > 10) {
      // safePreventDefault(e) // Removed to avoid passive listener error
    }

    if (showHomeSections) {
      // Currently showing home sections - swiping down should go back to map
      // Calculate position from 1 (top) to 0 (bottom)
      const newPosition = Math.max(0, Math.min(1, 1 + (deltaY / windowHeight)))
      setSwipeBarPosition(newPosition)
    } else {
      // Currently showing map - swiping up should show home sections
      // Calculate position from 0 (bottom) to 1 (top)
      const newPosition = Math.max(0, Math.min(1, deltaY / windowHeight))
      setSwipeBarPosition(newPosition)
    }
  }

  const handleSwipeBarTouchEnd = (e) => {
    if (!isSwipingBar.current) return
    
    // If user was scrolling, don't handle as swipe
    if (isScrollingHomeSections.current) {
      isSwipingBar.current = false
      setIsDraggingSwipeBar(false)
      isScrollingHomeSections.current = false
      return
    }

    const windowHeight = window.innerHeight
    const threshold = 50 // Small threshold - just 50px to trigger
    const finalY = e.changedTouches[0].clientY
    const finalDeltaY = swipeBarStartY.current - finalY

    if (showHomeSections) {
      // If showing home sections and swiped down, go back to map
      if (finalDeltaY < -threshold || swipeBarPosition < 0.95) {
        setShowHomeSections(false)
        setSwipeBarPosition(0)
      } else {
        // Keep it open
        setSwipeBarPosition(1)
        setShowHomeSections(true)
      }
    } else {
      // If showing map and swiped up, show home sections
      if (finalDeltaY > threshold || swipeBarPosition > 0.05) {
        setSwipeBarPosition(1)
        setShowHomeSections(true)
      } else {
        setSwipeBarPosition(0)
        setShowHomeSections(false)
      }
    }

    isSwipingBar.current = false
    setIsDraggingSwipeBar(false)
    swipeBarStartY.current = 0
    isScrollingHomeSections.current = false
  }

  // Handle mouse events for desktop
  const handleSwipeBarMouseDown = (e) => {
    // Check if click is on a button or interactive element
    const target = e.target
    const isInteractive = target.closest('button') || target.closest('a') || target.closest('[role="button"]')
    
    // If clicking an interactive element, don't start swipe
    if (isInteractive && !target.closest('[data-swipe-handle]')) {
      return
    }
    
    isSwipingBar.current = true
    swipeBarStartY.current = e.clientY
    setIsDraggingSwipeBar(true)
  }

  const handleSwipeBarMouseMove = (e) => {
    if (!isSwipingBar.current) return

    const currentY = e.clientY
    const deltaY = swipeBarStartY.current - currentY
    const windowHeight = window.innerHeight

    // Prevent default to avoid text selection
    // Don't call preventDefault - CSS touch-action handles scrolling prevention
    // safePreventDefault(e) // Removed to avoid passive listener error

    if (showHomeSections) {
      // Currently showing home sections - swiping down should go back to map
      // Calculate position from 1 (top) to 0 (bottom)
      const newPosition = Math.max(0, Math.min(1, 1 + (deltaY / windowHeight)))
      setSwipeBarPosition(newPosition)
    } else {
      // Currently showing map - swiping up should show home sections
      // Calculate position from 0 (bottom) to 1 (top)
      const newPosition = Math.max(0, Math.min(1, deltaY / windowHeight))
      setSwipeBarPosition(newPosition)
    }
  }

  const handleSwipeBarMouseUp = (e) => {
    if (!isSwipingBar.current) return

    const windowHeight = window.innerHeight
    const threshold = 50 // Small threshold - just 50px to trigger
    const finalY = e.clientY
    const finalDeltaY = swipeBarStartY.current - finalY

    if (showHomeSections) {
      // If showing home sections and swiped down, go back to map
      if (finalDeltaY < -threshold || swipeBarPosition < 0.95) {
        setShowHomeSections(false)
        setSwipeBarPosition(0)
      } else {
        // Keep it open
        setSwipeBarPosition(1)
        setShowHomeSections(true)
      }
    } else {
      // If showing map and swiped up, show home sections
      if (finalDeltaY > threshold || swipeBarPosition > 0.05) {
        setSwipeBarPosition(1)
        setShowHomeSections(true)
      } else {
        setSwipeBarPosition(0)
        setShowHomeSections(false)
      }
    }

    isSwipingBar.current = false
    setIsDraggingSwipeBar(false)
    swipeBarStartY.current = 0
  }

  // Handle chevron click to slide down swipe bar
  const handleChevronDownClick = () => {
    if (showHomeSections) {
      setShowHomeSections(false)
      setSwipeBarPosition(0)
      setIsDraggingSwipeBar(false)
    }
  }

  // Handle chevron click to slide up swipe bar
  const handleChevronUpClick = () => {
    if (!showHomeSections) {
      setShowHomeSections(true)
      setSwipeBarPosition(1)
      setIsDraggingSwipeBar(false)
    }
  }

  // Add global mouse event listeners
  useEffect(() => {
    if (isDraggingSwipeBar) {
      document.addEventListener('mousemove', handleSwipeBarMouseMove)
      document.addEventListener('mouseup', handleSwipeBarMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleSwipeBarMouseMove)
        document.removeEventListener('mouseup', handleSwipeBarMouseUp)
      }
    }
  }, [isDraggingSwipeBar, swipeBarPosition])

  // Get next available slot for booking
  const getNextAvailableSlot = () => {
    if (!todayGig) return null

    const now = new Date()
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()
    const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`

    // Find next slot after current gig ends
    if (todayGig.endTime && todayGig.endTime > currentTime) {
      const [hours, minutes] = todayGig.endTime.split(':').map(Number)
      const nextStartHour = hours
      const nextEndHour = hours + 1
      return {
        start: `${String(nextStartHour).padStart(2, '0')}:00`,
        end: `${String(nextEndHour).padStart(2, '0')}:00`
      }
    }
    return null
  }

  const nextSlot = getNextAvailableSlot()

  // Fetch zones within 70km radius from backend
  const fetchAndDrawNearbyZones = async () => {
    if (!riderLocation || riderLocation.length !== 2 || !window.google || !window.deliveryMapInstance) {
      return
    }

    try {
      const [riderLat, riderLng] = riderLocation
      const response = await deliveryAPI.getZonesInRadius(riderLat, riderLng, 70)
      
      if (response.data?.success && response.data.data?.zones) {
        const nearbyZones = response.data.data.zones
        setZones(nearbyZones)
        drawZonesOnMap(nearbyZones)
      }
    } catch (error) {
      // Suppress network errors - backend might be down or endpoint not available
      if (error.code === 'ERR_NETWORK') {
        // Silently handle network errors - backend might not be running
        return
      }
      // Only log non-network errors
      if (error.response) {
        debugError("Error fetching zones:", error.response?.data || error.message)
      }
    }
  }

  // Draw zones on map
  const drawZonesOnMap = (zonesToDraw) => {
    if (!window.google || !window.deliveryMapInstance || !zonesToDraw || zonesToDraw.length === 0) {
      return
    }

    // Clear previous zones
    zonesPolygonsRef.current.forEach(polygon => {
      if (polygon) polygon.setMap(null)
    })
    zonesPolygonsRef.current = []

    const map = window.deliveryMapInstance
    // Light orange color for all zones
    const lightOrangeColor = "#FFB84D" // Light orange
    const strokeColor = "#FF9500" // Slightly darker orange for border

    zonesToDraw.forEach((zone, index) => {
      if (!zone.coordinates || zone.coordinates.length < 3) return

      // Convert coordinates to LatLng array
      const path = zone.coordinates.map(coord => {
        const lat = typeof coord === 'object' ? (coord.latitude || coord.lat) : null
        const lng = typeof coord === 'object' ? (coord.longitude || coord.lng) : null
        if (lat === null || lng === null) return null
        return new window.google.maps.LatLng(lat, lng)
      }).filter(Boolean)

      if (path.length < 3) return

      // Create polygon with light orange fill
      const polygon = new window.google.maps.Polygon({
        paths: path,
        strokeColor: strokeColor,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: lightOrangeColor,
        fillOpacity: 0.3, // Light fill opacity for better visibility
        editable: false,
        draggable: false,
        clickable: true,
        zIndex: 1
      })

      polygon.setMap(map)
      zonesPolygonsRef.current.push(polygon)

      // InfoWindow removed - no popup on zone click
    })
  }

  // Fetch zones when map is ready and location changes
  useEffect(() => {
    if (!mapLoading && window.deliveryMapInstance && riderLocation && riderLocation.length === 2) {
      fetchAndDrawNearbyZones()
    }
  }, [mapLoading, riderLocation])

  // Render normal feed view when offline or no gig booked
  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden flex flex-col" style={{ height: '100vh' }}>
      {/* Top Navigation Bar */}
      <FeedNavbar
        isOnline={isOnline}
        onToggleOnline={handleToggleOnline}
        onEmergencyClick={() => setShowEmergencyPopup(true)}
        onHelpClick={() => setShowHelpPopup(true)}
      />

      {isCashLimitBlocked && (
        <div className="mx-3 mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-red-700">
              Deposit cash to continue
            </p>
            <button
              type="button"
              onClick={() => navigate("/delivery/pocket")}
              className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
            >
              Deposit now
            </button>
          </div>
        </div>
      )}

      {/* Carousel - Only show if there are slides */}
      {carouselSlides.length > 0 && (
      <div
        ref={carouselRef}
        className="relative overflow-hidden bg-gray-700 cursor-grab active:cursor-grabbing select-none flex-shrink-0"
        style={{ touchAction: 'pan-y' }}
        onMouseDown={handleCarouselMouseDown}
      >
        <div className="flex transition-transform duration-500 ease-in-out" style={{ transform: `translateX(-${currentCarouselSlide * 100}%)` }}>
          {carouselSlides.map((slide) => (
            <div key={slide.id} className="min-w-full">
              <div className={`${slide.bgColor} px-4 py-3 flex items-center gap-3 min-h-[80px]`}>
                {/* Icon */}
                <div className="flex-shrink-0">
                  {slide.icon === "bag" ? (
                    <div className="relative">
                      {/* Delivery Bag Icon - Reduced size */}
                      <div className="w-12 h-12 bg-black rounded-lg flex items-center justify-center shadow-lg relative">
                        {/* Bag shape */}
                        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                      </div>
                      {/* Shadow */}
                      <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-black/30 rounded-full blur-sm"></div>
                    </div>
                  ) : (
                    <div className="relative w-10 h-10">
                      {/* Bank/Rupee Icon - Reduced size */}
                      <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center relative">
                        {/* Rupee symbol */}
                        <svg className="w-12 h-12 text-white absolute" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>

                {/* Text Content */}
                <div className="flex-1">
                  <h3 className={`${slide.bgColor === "bg-gray-700" ? "text-white" : "text-black"} text-sm font-semibold mb-0.5`}>
                    {slide.title}
                  </h3>
                  <p className={`${slide.bgColor === "bg-gray-700" ? "text-white/90" : "text-black/80"} text-xs`}>
                    {slide.subtitle}
                  </p>
                </div>

                {/* Button */}
                <button 
                  onClick={() => {
                    if (slide.actionPath) {
                      navigate(slide.actionPath)
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-colors ${slide.bgColor === "bg-gray-700"
                    ? "bg-gray-600 text-white hover:bg-gray-500"
                    : "bg-yellow-300 text-black hover:bg-yellow-200"
                  }`}>
                  {slide.buttonText}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Carousel Indicators */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {carouselSlides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentCarouselSlide(index)}
              className={`h-1.5 rounded-full transition-all duration-300 ${index === currentCarouselSlide
                  ? (currentCarouselSlide === 0 ? "w-6 bg-white" : "w-6 bg-black")
                  : (index === 0 ? "w-1.5 bg-white/50" : "w-1.5 bg-black/30")
                }`}
            />
          ))}
        </div>
      </div>
      )}


      {/* Conditional Content Based on Swipe Bar Position */}
      {!showHomeSections ? (
        <>
          {/* Map View - Shows map with Hotspot or Select drop mode */}
          <div className="relative flex-1 overflow-hidden pb-16 md:pb-0" style={{ minHeight: 0, pointerEvents: 'auto' }}>
          {/* Google Maps Container */}
          <div
            ref={mapContainerRef}
            className="w-full h-full"
            style={{ 
              height: '100%', 
              width: '100%', 
              backgroundColor: '#e5e7eb', // Light gray background while loading
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'auto',
              zIndex: 0,
              filter: !isOnline ? 'grayscale(100%) brightness(0.78)' : 'none',
              transition: 'filter 220ms ease'
            }}
          />

          {!isOnline && (
            <div className="absolute inset-0 z-[6] pointer-events-none bg-slate-500/20">
              <div className="absolute top-3 right-3 rounded-full bg-slate-800/80 text-white text-xs font-medium px-3 py-1">
                Offline
              </div>
            </div>
          )}
          
          {/* Loading indicator */}
          {mapLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <div className="flex flex-col items-center gap-2">
                <div className="text-gray-600 font-medium">Loading map...</div>
                <div className="text-xs text-gray-500">Please wait</div>
              </div>
            </div>
          )}

          {/* Map Refresh Overlay - Professional Loading Indicator */}
          {isRefreshingLocation && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
            >
              {/* Loading indicator container */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                className="relative"
              >
                {/* Outer pulsing ring */}
                <motion.div
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.6, 0.3, 0.6]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: [0.4, 0, 0.6, 1], // Smooth ease-in-out
                    type: "tween",
                    times: [0, 0.5, 1]
                  }}
                  className="absolute inset-0 w-20 h-20 bg-blue-500/20 rounded-full"
                />
                
                {/* Middle ring */}
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 0.2, 0.5]
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: [0.4, 0, 0.6, 1], // Smooth ease-in-out
                    type: "tween",
                    delay: 0.3,
                    times: [0, 0.5, 1]
                  }}
                  className="absolute inset-0 w-16 h-16 bg-blue-500/30 rounded-full m-2"
                />
                
                {/* Inner spinner */}
                <div className="relative w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      ease: "linear",
                      type: "tween"
                    }}
                    className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full"
                  />
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Floating Action Button - My Location */}
          <motion.button
            onClick={() => {
              if (navigator.geolocation) {
                setIsRefreshingLocation(true)
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    // Validate coordinates
                    const latitude = position.coords.latitude
                    const longitude = position.coords.longitude
                    
                    // Validate coordinates are valid numbers
                    if (typeof latitude !== 'number' || typeof longitude !== 'number' || 
                        isNaN(latitude) || isNaN(longitude) ||
                        latitude < -90 || latitude > 90 || 
                        longitude < -180 || longitude > 180) {
                      debugWarn("⚠️ Invalid coordinates received:", { latitude, longitude })
                      setIsRefreshingLocation(false)
                      return
                    }
                    
                    const newLocation = [latitude, longitude] // [lat, lng] format
                    
                    // Calculate heading from previous location
                    let heading = null
                    if (lastLocationRef.current) {
                      const [prevLat, prevLng] = lastLocationRef.current
                      heading = calculateHeading(prevLat, prevLng, latitude, longitude)
                    }
                    
                    // Save location to localStorage (for refresh handling)
                    localStorage.setItem('deliveryBoyLastLocation', JSON.stringify(newLocation))
                    
                    // Update route history
                    if (lastLocationRef.current) {
                      routeHistoryRef.current.push({
                        lat: latitude,
                        lng: longitude
                      })
                      if (routeHistoryRef.current.length > 1000) {
                        routeHistoryRef.current.shift()
                      }
                    } else {
                      routeHistoryRef.current = [{
                        lat: latitude,
                        lng: longitude
                      }]
                    }
                    
                    // Update bike marker (only if online - blue dot à¤¨à¤¹à¥€à¤‚, bike icon)
                    if (window.deliveryMapInstance) {
                      // Always show bike marker on map (both offline and online)
                      // Center map automatically (Zomato style) unless user is panning
                      createOrUpdateBikeMarker(latitude, longitude, heading, !isUserPanningRef.current)
                      updateRoutePolyline()
                    }
                    
                    setRiderLocation(newLocation)
                    lastLocationRef.current = newLocation
                    
                    debugLog("📍 Location refreshed:", { 
                      latitude, 
                      longitude, 
                      heading,
                      accuracy: position.coords.accuracy,
                      isOnline: isOnlineRef.current
                    })
                    
                    // Stop refreshing animation after a short delay
                    setTimeout(() => {
                      setIsRefreshingLocation(false)
                    }, 800)
                  },
                  (error) => {
                    debugError('Error getting location:', error)
                    setIsRefreshingLocation(false)
                  },
                  { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                )
              }
            }}
            className="absolute bottom-44 right-3 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors z-20 overflow-visible"
            whileTap={{ scale: 0.92 }}
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 25,
              mass: 0.5
            }}
          >
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Ripple effect */}
              {isRefreshingLocation && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-blue-500/20"
                  initial={{ scale: 0.9, opacity: 0.6 }}
                  animate={{ 
                    scale: [0.9, 1.6, 1.8],
                    opacity: [0.6, 0.3, 0]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: [0.25, 0.46, 0.45, 0.94], // Smooth ease-out
                    times: [0, 0.5, 1]
                  }}
                />
              )}
              
              {/* Icon with smooth animations */}
              <motion.div
                className="relative z-10"
                animate={{
                  rotate: isRefreshingLocation ? 360 : 0,
                  scale: isRefreshingLocation ? [1, 1.1, 1] : 1,
                }}
                transition={{
                  rotate: {
                    duration: 2,
                    repeat: isRefreshingLocation ? Infinity : 0,
                    ease: "linear", // Linear for smooth continuous rotation
                    type: "tween"
                  },
                  scale: {
                    duration: 1.5,
                    repeat: isRefreshingLocation ? Infinity : 0,
                    ease: [0.4, 0, 0.6, 1], // Smooth ease-in-out
                    type: "tween",
                    times: [0, 0.5, 1]
                  }
                }}
              >
                <MapPin 
                  className={`w-6 h-6 transition-colors duration-500 ease-in-out ${
                    isRefreshingLocation ? 'text-blue-600' : 'text-gray-700'
                  }`} 
                />
              </motion.div>
            </div>
          </motion.button>

          {/* Floating Banner - Status Message */}
          {mapViewMode === "hotspot" && (deliveryStatus === "pending" || deliveryStatus === "blocked") && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-sm px-6 py-4 z-20 min-w-[96%] text-center"
            >
              {deliveryStatus === "pending" ? (
                <>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Verification Done in 24 Hours</h3>
                  <p className="text-sm text-gray-600">Your account is under verification. You'll be notified once approved.</p>
                </>
              ) : deliveryStatus === "blocked" ? (
                <>
                  <h3 className="text-lg font-bold text-red-600 mb-2">Denied Verification</h3>
                  {rejectionReason && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-left">
                      <p className="text-xs font-semibold text-red-800 mb-2">Reason for Rejection:</p>
                      <div className="text-xs text-red-700 space-y-1">
                        {rejectionReason.split('\n').filter(line => line.trim()).length > 1 ? (
                          <ul className="space-y-1 list-disc list-inside">
                            {rejectionReason.split('\n').map((point, index) => (
                              point.trim() && (
                                <li key={index}>{point.trim()}</li>
                              )
                            ))}
                          </ul>
                        ) : (
                          <p className="text-red-700">{rejectionReason}</p>
                        )}
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-gray-700 mb-3">
                    Please correct the above issues and click "Reverify" to resubmit your request for approval.
                  </p>
                  <button
                    onClick={handleReverify}
                    disabled={isReverifying}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mx-auto"
                  >
                    {isReverifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Reverify"
                    )}
                  </button>
                </>
              ) : null}
            </motion.div>
          )}

          {/* Bottom Swipeable Bar - Can be dragged up to show home sections */}
          {!showHomeSections && (
            <motion.div
              ref={swipeBarRef}
              initial={{ y: "100%" }}
              animate={{
                y: isDraggingSwipeBar
                  ? `${-swipeBarPosition * (window.innerHeight * 0.8)}px`
                  : 0
              }}
              transition={isDraggingSwipeBar ? { duration: 0 } : { type: "spring", damping: 30, stiffness: 300 }}
              onTouchStart={handleSwipeBarTouchStart}
              onTouchMove={handleSwipeBarTouchMove}
              onTouchEnd={handleSwipeBarTouchEnd}
              onMouseDown={handleSwipeBarMouseDown}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-20"
              style={{
                touchAction: 'pan-y',
                pointerEvents: 'auto'
              }}
            >
              {/* Swipe Handle */}
              <div
                className="flex flex-col items-center pt-4 pb-2 cursor-grab active:cursor-grabbing"
                style={{ touchAction: 'none' }}
              >
                <motion.div
                  className="flex flex-col items-center gap-1"
                  animate={{
                    y: isDraggingSwipeBar ? swipeBarPosition * 5 : 0,
                    opacity: isDraggingSwipeBar ? 0.7 : 1
                  }}
                  transition={{ duration: 0.1 }}
                >
                  <button
                    onClick={handleChevronUpClick}
                    className="flex items-center justify-center p-2 -m-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
                    aria-label="Slide up"
                  >
                    <ChevronUp className="!w-12 !h-8 scale-x-150 text-gray-400 -mt-2 font-bold" strokeWidth={3} />
                  </button>
                </motion.div>
              </div>

              {/* Content Area - Shows map info when down */}
              <div className="px-4 pb-6">
                {mapViewMode === "hotspot" ? (
                  <div className="flex flex-col items-center">
                    {/* <h3 className="text-lg font-bold text-gray-900 mb-2">No hotspots are available</h3>
                  <p className="text-sm text-gray-600 mb-4">Please go online to see hotspots</p> */}
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    {/* <h3 className="text-lg font-bold text-gray-900 mb-2">Select drop location</h3>
                  <p className="text-sm text-gray-600 mb-4">Choose a drop location on the map</p> */}
                  </div>
                )}
              </div>
            </motion.div>
          )}
          </div>
        </>
      ) : (
        <>
          {/* Home Sections View - Full screen when swipe bar is dragged up */}
          <motion.div
          ref={swipeBarRef}
          initial={{ y: "100%" }}
          animate={{
            y: isDraggingSwipeBar
              ? `${(1 - swipeBarPosition) * (window.innerHeight * 0.8)}px`
              : 0
          }}
          exit={{ y: "100%" }}
          transition={isDraggingSwipeBar ? { duration: 0 } : { type: "spring", damping: 30, stiffness: 300 }}
          onTouchStart={handleSwipeBarTouchStart}
          onTouchMove={handleSwipeBarTouchMove}
          onTouchEnd={handleSwipeBarTouchEnd}
          onMouseDown={handleSwipeBarMouseDown}
          className="relative flex-1 bg-white rounded-t-3xl shadow-2xl overflow-hidden"
          style={{ height: 'calc(100vh - 200px)', touchAction: 'pan-y' }}
        >
          {/* Swipe Handle at Top - Can be dragged down to go back to map */}
          <div
            className="flex flex-col items-center pt-4 pb-2 cursor-grab active:cursor-grabbing bg-white sticky top-0 z-10"
            style={{ touchAction: 'none' }}
          >
            <motion.div
              className="flex flex-col items-center gap-1"
              animate={{
                y: isDraggingSwipeBar ? -swipeBarPosition * 5 : 0,
                opacity: isDraggingSwipeBar ? 0.7 : 1
              }}
              transition={{ duration: 0.1 }}
            >
              <button
                onClick={handleChevronDownClick}
                className="flex items-center justify-center p-2 -m-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
                aria-label="Slide down"
              >
                <ChevronDown
                  className="!w-12 !h-8 scale-x-150 text-gray-400 -mt-2 font-bold"
                  strokeWidth={3}
                />
              </button>
            </motion.div>
          </div>

          <div 
            ref={homeSectionsScrollRef}
            className="px-4 pt-4 pb-16 space-y-4 overflow-y-auto" 
            style={{ 
              height: 'calc(100vh - 250px)',
              touchAction: 'pan-y', // Allow vertical scrolling
              WebkitOverflowScrolling: 'touch' // Smooth scrolling on iOS
            }}
          >
            {/* Referral Bonus Banner */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => navigate("/delivery/refer-and-earn")}
              className="w-full rounded-xl p-6 shadow-lg relative overflow-hidden min-h-[70px] cursor-pointer"
              style={{
                backgroundImage: `url(${referralBonusBg})`,
                backgroundSize: '100% 100%',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
              }}
            >
              <div className="relative z-10">
                <div className="text-white text-3xl font-bold mb-1">₹6,000                 <span className="text-white/90 text-base font-medium mb-1">referral bonus</span>
                 </div>
                <div className="text-white/80 text-sm">Refer your friends now</div>
              </div>
            </motion.div>

            {/* Unlock Offer Card */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="w-full rounded-xl p-6 shadow-lg bg-black text-white"
            >
              <div className="flex items-center text-center justify-center gap-2 mb-2">
                <div className="text-4xl font-bold text-center">₹100</div>
                <Lock className="w-5 h-5 text-white" />
              </div>
              <p className="text-white/90 text-center text-sm mb-4">Complete 1 order to unlock ₹100</p>
              <div className="flex items-center text-center justify-center gap-2 text-white/70 text-xs mb-4">
                <Clock className="w-4 h-4" />
                <span className="text-center">Valid till 10 December 2025</span>
              </div>
              <button
                onClick={() => {
                  if (isOnline) {
                    goOffline()
                  } else {
                    // Always show the popup when offline (same as navbar behavior)
                    setShowBookGigsPopup(true)
                  }
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <span>Go online</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>

            
            {/* Earnings Guarantee Card */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
              className="w-full rounded-xl overflow-hidden shadow-lg bg-white"
            >
              {/* Header */}
              <div className="border-b  border-gray-100">
                <div className="flex p-2 px-3 items-center justify-between bg-black">
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-white mb-1">Earnings Guarantee</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white">Valid till {weekEndDate}</span>
                      {isOfferLive && (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-sm text-green-600 font-medium">Live</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Summary Box */}
                  <div className="bg-black text-white px-4 py-3 rounded-lg text-center min-w-[80px]">
                    <div className="text-2xl font-bold">₹{earningsGuaranteeTarget.toFixed(0)}</div>
                    <div className="text-xs text-white/80 mt-1">{earningsGuaranteeOrdersTarget} orders</div>
                  </div>
                </div>
              </div>

              {/* Progress Circles */}
              <div className="px-6 py-6">
                <div className="flex items-center justify-around gap-6">
                  {/* Orders Progress Circle */}
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.5, type: "spring" }}
                    className="flex flex-col items-center"
                  >
                    <div className="relative w-32 h-32">
                      <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
                        {/* Background circle */}
                        <circle
                          cx="60"
                          cy="60"
                          r="50"
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="8"
                        />
                        {/* Progress circle */}
                        <motion.circle
                          cx="60"
                          cy="60"
                          r="50"
                          fill="none"
                          stroke="#000000"
                          strokeWidth="8"
                          strokeLinecap="round"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: ordersProgress }}
                          transition={{ delay: 0.6, duration: 1, ease: "easeOut" }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-bold text-gray-900">{earningsGuaranteeCurrentOrders} of {earningsGuaranteeOrdersTarget || 0}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">Orders</span>
                    </div>
                  </motion.div>

                  {/* Earnings Progress Circle */}
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.5, type: "spring" }}
                    className="flex flex-col items-center"
                  >
                    <div className="relative w-32 h-32">
                      <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
                        {/* Background circle */}
                        <circle
                          cx="60"
                          cy="60"
                          r="50"
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="8"
                        />
                        {/* Progress circle */}
                        <motion.circle
                          cx="60"
                          cy="60"
                          r="50"
                          fill="none"
                          stroke="#000000"
                          strokeWidth="8"
                          strokeLinecap="round"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: earningsProgress }}
                          transition={{ delay: 0.7, duration: 1, ease: "easeOut" }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold text-gray-900">₹{earningsGuaranteeCurrentEarnings.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <IndianRupee className="w-5 h-5 text-gray-700" />
                      <span className="text-sm font-medium text-gray-700">Earnings</span>
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>

            {/* Today's Progress Card */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              className="w-full rounded-xl overflow-hidden shadow-lg bg-white"
            >
              {/* Header */}
              <div className="bg-black px-4 py-3 flex items-center gap-3">
                <div className="relative">
                  <Calendar className="w-5 h-5 text-white" />
                  <CheckCircle className="w-3 h-3 text-green-500 absolute -top-1 -right-1 bg-white rounded-full" fill="currentColor" />
                </div>
                <span className="text-white font-semibold">Today's progress</span>
              </div>

              {/* Content */}
              <div className="p-4">
                {/* Grid Layout - 2x2 */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Top Left - Earnings */}
                  <button
                    onClick={() => navigate("/delivery/earnings")}
                    className="flex flex-col items-start gap-1 hover:opacity-80 transition-opacity"
                  >
                    <span className="text-2xl font-bold text-gray-900">
                      {formatCurrency(todayEarnings)}
                    </span>
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <span>Earnings</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </button>

                  {/* Top Right - Trips */}
                  <button
                    onClick={() => navigate("/delivery/trip-history")}
                    className="flex flex-col items-end gap-1 hover:opacity-80 transition-opacity"
                  >
                    <span className="text-2xl font-bold text-gray-900">
                      {todayTrips}
                    </span>
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <span>Trips</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </button>

                  {/* Bottom Left - Time on orders */}
                  <button
                    onClick={() => navigate("/delivery/time-on-orders")}
                    className="flex flex-col items-start gap-1 hover:opacity-80 transition-opacity"
                  >
                    <span className="text-2xl font-bold text-gray-900">
                      {`${formatHours(todayHoursWorked)} hrs`}
                    </span>
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <span>Time on orders</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </button>

                  {/* Bottom Right - Gigs History */}
                  <button
                    onClick={() => navigate("/delivery/gig")}
                    className="flex flex-col items-end gap-1 hover:opacity-80 transition-opacity"
                  >
                    <span className="text-2xl font-bold text-gray-900">
                      {`${todayGigsCount} Gigs`}
                    </span>
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <span>History</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
        </>
      )}

      {/* Help Popup */}
      <BottomPopup
        isOpen={showHelpPopup}
        onClose={() => setShowHelpPopup(false)}
        title="How can we help?"
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="70vh"
      >
        <div className="py-2">
          {helpOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => handleHelpOptionClick(option)}
              className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              {/* Icon */}
              <div className="shrink-0 w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                {option.icon === "helpCenter" && (
                  <HelpCircle className="w-6 h-6 text-gray-700" />
                )}
                {option.icon === "ticket" && (
                  <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                  </svg>
                )}
                {option.icon === "idCard" && (
                  <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                  </svg>
                )}
                {option.icon === "language" && (
                  <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                )}
              </div>

              {/* Text Content */}
              <div className="flex-1 text-left">
                <h3 className="text-base font-semibold text-gray-900 mb-1">{option.title}</h3>
                <p className="text-sm text-gray-600">{option.subtitle}</p>
              </div>

              {/* Arrow Icon */}
              <ArrowRight className="w-5 h-5 text-gray-400 shrink-0" />
            </button>
          ))}
        </div>
      </BottomPopup>

      {/* Emergency Help Popup */}
      <BottomPopup
        isOpen={showEmergencyPopup}
        onClose={() => setShowEmergencyPopup(false)}
        title="Emergency help"
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="70vh"
      >
        <div className="py-2">
          {emergencyOptions.map((option, index) => (
            <button
              key={option.id}
              onClick={() => handleEmergencyOptionClick(option)}
              className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              {/* Icon */}
              <div className="shrink-0 w-14 h-14 rounded-lg flex items-center justify-center">
                {option.icon === "ambulance" && (
                  <div className="w-14 h-14 bg-white rounded-lg flex items-center justify-center shadow-sm border border-gray-200 relative overflow-hidden">
                    {/* Ambulance vehicle */}
                    <div className="absolute inset-0 bg-blue-500"></div>
                    {/* Red and blue lights on roof */}
                    <div className="absolute top-1 left-2 w-2 h-3 bg-red-500 rounded-sm"></div>
                    <div className="absolute top-1 right-2 w-2 h-3 bg-blue-500 rounded-sm"></div>
                    {/* Star of Life emblem */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2L2 7v10l10 5 10-5V7l-10-5zm0 2.18l8 4v7.64l-8 4-8-4V8.18l8-4z" />
                        <path d="M12 8L6 11v6l6 3 6-3v-6l-6-3z" />
                      </svg>
                    </div>
                    {/* AMBULANCE text */}
                    <div className="absolute bottom-1 left-0 right-0 text-[6px] font-bold text-white text-center">AMBULANCE</div>
                  </div>
                )}
                {option.icon === "siren" && (
                  <div className="w-14 h-14 bg-white rounded-lg flex items-center justify-center shadow-sm border border-gray-200 relative">
                    {/* Red siren dome */}
                    <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center relative">
                      {/* Yellow light rays */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 border-2 border-yellow-400 rounded-full animate-pulse"></div>
                      </div>
                      {/* Phone icon inside */}
                      <Phone className="w-5 h-5 text-yellow-400 z-10" />
                    </div>
                  </div>
                )}
                {option.icon === "police" && (
                  <div className="w-14 h-14 bg-white rounded-lg flex items-center justify-center shadow-sm border border-gray-200">
                    {/* Police officer bust */}
                    <div className="relative">
                      {/* Head */}
                      <div className="w-10 h-10 bg-gray-300 rounded-full"></div>
                      {/* Cap */}
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-4 bg-amber-700 rounded-t-lg"></div>
                      {/* Cap peak */}
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-10 h-1 bg-amber-800"></div>
                      {/* Mustache */}
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-6 h-2 bg-gray-800 rounded-full"></div>
                    </div>
                  </div>
                )}
                {option.icon === "insurance" && (
                  <div className="w-14 h-14 bg-yellow-400 rounded-lg flex items-center justify-center shadow-sm border border-gray-200 relative">
                    {/* Card shape */}
                    <div className="w-12 h-8 bg-white rounded-sm relative">
                      {/* Red heart and cross on left */}
                      <div className="absolute left-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                        <div className="w-0.5 h-3 bg-red-500"></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Text Content */}
              <div className="flex-1 text-left">
                <h3 className="text-base font-semibold text-gray-900 mb-1">{option.title}</h3>
                <p className="text-sm text-gray-600">{option.subtitle}</p>
              </div>

              {/* Arrow Icon */}
              <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </button>
          ))}
        </div>
      </BottomPopup>

      {/* Book Gigs Popup */}
      <BottomPopup
        isOpen={showBookGigsPopup}
        onClose={() => setShowBookGigsPopup(false)}
        title="Book gigs to go online"
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="auto"
      >
        <div className="py-4">
          {/* Gig Details Card */}
          <div className="mb-6 rounded-lg overflow-hidden shadow-sm border border-gray-200">
            {/* Header - Teal background */}
            <div className="bg-teal-100 px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">g</span>
              </div>
              <span className="text-teal-700 font-semibold">Gig details</span>
            </div>
            
            {/* Body - White background */}
            <div className="bg-white px-4 py-4">
              <p className="text-gray-900 text-sm">Gig booking open in your zone</p>
            </div>
          </div>

          {/* Description */}
          <p className="text-gray-900 text-sm mb-6">
            Book your Gigs now to go online and start delivering orders
          </p>

          {/* Book Gigs Button */}
          <button
            onClick={() => {
              setShowBookGigsPopup(false)
              navigate("/delivery/gig")
            }}
            className="w-full bg-black hover:bg-gray-800 text-white font-semibold py-4 rounded-lg transition-colors"
          >
            Book gigs
          </button>
        </div>
      </BottomPopup>

      {/* New Order Popup with Countdown Timer - Custom Implementation */}
      <AnimatePresence>
        {showNewOrderPopup && (newOrder || selectedRestaurant) && isOnline && (
          <>
            {/* Backdrop */}
            {!isNewOrderPopupMinimized && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/50 z-[100]"
              />
            )}

            {/* Minimized Handle - Show when minimized for swipe up */}
            {isNewOrderPopupMinimized && (
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="fixed bottom-0 left-0 right-0 z-[115] flex justify-center pb-2"
                onTouchStart={handleNewOrderPopupTouchStart}
                onTouchMove={handleNewOrderPopupTouchMove}
                onTouchEnd={handleNewOrderPopupTouchEnd}
                style={{ touchAction: 'none' }}
              >
                <div className="bg-green-500 rounded-t-2xl px-6 py-3 shadow-lg cursor-grab active:cursor-grabbing">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-1 bg-white/80 rounded-full" />
                    <span className="text-white text-sm font-semibold">Swipe up to view order</span>
                    <div className="w-8 h-1 bg-white/80 rounded-full" />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Popup */}
            <motion.div
              ref={newOrderPopupRef}
              initial={{ y: "100%" }}
              animate={{ 
                y: isDraggingNewOrderPopup 
                  ? newOrderDragY 
                  : isNewOrderPopupMinimized 
                    ? (newOrderPopupRef.current?.offsetHeight || 600)
                    : 0
              }}
              transition={isDraggingNewOrderPopup 
                ? { duration: 0 } 
                : isNewOrderPopupMinimized
                  ? { duration: 0.3, ease: "easeOut" } // Smooth transition when minimizing
                  : { 
                      type: "spring", 
                      damping: 30, 
                      stiffness: 300 
                    }
              }
              exit={{ y: "100%" }}
              onTouchStart={handleNewOrderPopupTouchStart}
              onTouchMove={handleNewOrderPopupTouchMove}
              onTouchEnd={handleNewOrderPopupTouchEnd}
              className="fixed bottom-0 left-0 right-0 bg-transparent rounded-t-3xl z-[110] overflow-visible"
              style={{ touchAction: 'none' }}
            >
              {/* Swipe Handle */}
              <div className="flex justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing">
                <div className="w-12 h-1.5 bg-white/30 rounded-full" />
              </div>

              {/* Green Countdown Header */}
              <div className="relative scale-110 mb-0 bg-green-500 rounded-t-3xl overflow-visible">
                {/* Small countdown badge - positioned at center edge, half above popup */}
                <div className="absolute left-1/2 -translate-x-1/2 -top-5 z-20">
                  <div className="relative inline-flex items-center justify-center">
                    {/* Animated green border around badge - positioned behind badge, wider */}
                    <svg 
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                      style={{ 
                        width: 'calc(100% + 10px)', 
                        height: 'calc(100% + 10px)',
                        zIndex: 35
                      }}
                      viewBox="0 0 200 60"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <defs>
                        <linearGradient id="newOrderCountdownGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity="1" />
                          <stop offset="100%" stopColor="#16a34a" stopOpacity="1" />
                        </linearGradient>
                      </defs>
                      
                      {/* Full white border path - rounded rectangle (background) */}
                      <path
                        d="M 30,5 L 170,5 A 25,25 0 0,1 195,30 L 195,30 A 25,25 0 0,1 170,55 L 30,55 A 25,25 0 0,1 5,30 L 5,30 A 25,25 0 0,1 30,5 Z"
                        fill="none"
                        stroke="white"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      
                      {/* Animated green progress border - starts from top center, decreases clockwise */}
                      <motion.path
                        d="M 100,5 L 170,5 A 25,25 0 0,1 195,30 L 195,30 A 25,25 0 0,1 170,55 L 30,55 A 25,25 0 0,1 5,30 L 5,30 A 25,25 0 0,1 30,5 L 100,5"
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="450"
                        initial={{ strokeDashoffset: 0 }}
                        animate={{
                          strokeDashoffset: `${450 * (1 - countdownSeconds / 300)}`
                        }}
                        transition={{ duration: 1, ease: "linear" }}
                      />
                      
                      {/* White segment indicator at top center */}
                      <rect
                        x="95"
                        y="0"
                        width="10"
                        height="8"
                        fill="white"
                        rx="1"
                      />
                    </svg>
                    
                    {/* White pill-shaped badge - positioned above SVG */}
                    <div className="relative bg-white rounded-full px-6 py-2 shadow-lg" style={{ zIndex: 30 }}>
                      <div className="text-sm font-bold text-gray-900">
                        New order
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* White Content Card */}
              <div className="bg-white rounded-t-3xl">
                <div className="p-6">
                  {/* Estimated Earnings */}

                  <div className="mb-5">
                    <p className="text-gray-500 text-sm mb-1">Estimated earnings</p>
                    <p className="text-4xl font-bold text-gray-900 mb-2">
                      ₹{(() => {
                        const earnings = newOrder?.estimatedEarnings || selectedRestaurant?.estimatedEarnings || 0;
                        const fallback =
                          Number(newOrder?.deliveryFee ?? selectedRestaurant?.deliveryFee ?? selectedRestaurant?.amount) || 0;
                        let value = 0;
                        
                        debugLog('💰 Display earnings calculation:', {
                          earnings,
                          earningsType: typeof earnings,
                          newOrderEarnings: newOrder?.estimatedEarnings,
                          selectedRestaurantEarnings: selectedRestaurant?.estimatedEarnings,
                          fallback
                        });
                        
                        if (earnings) {
                          if (typeof earnings === 'object') {
                            // Handle earnings object
                            if (earnings.totalEarning != null) {
                              value = Number(earnings.totalEarning) || 0;
                            } else if (earnings.basePayout != null) {
                              // If only basePayout is available, use it
                              value = Number(earnings.basePayout) || 0;
                            }
                          } else if (typeof earnings === 'number') {
                            value = earnings > 0 ? earnings : 0;
                          }
                        }
                        
                        // If value is still 0, try fallback
                        if (value <= 0 && fallback > 0) {
                          value = Number(fallback);
                        }
                        
                        debugLog('💰 Final earnings value to display:', value);
                        return value > 0 ? value.toFixed(2) : '0.00';
                      })()}
                    </p>
                    {/* Earnings Breakdown */}
                    {(() => {
                      const earnings = newOrder?.estimatedEarnings || selectedRestaurant?.estimatedEarnings || 0;
                      if (typeof earnings === 'object' && earnings.breakdown) {
                        return (
                          <div className="bg-green-50 rounded-lg p-3 mb-2">
                            <p className="text-green-800 text-xs font-medium mb-1">Earnings Breakdown:</p>
                            <p className="text-green-700 text-xs">
                              Base: ₹{earnings.basePayout?.toFixed(0) || '0'}
                              {earnings.distanceCommission > 0 && (
                                <> + Extra Distance ({Math.max(0, (earnings.distance || 0) - (earnings.minDistance || 0)).toFixed(1)} km × ₹{earnings.commissionPerKm?.toFixed(0)}/km) = ₹{earnings.distanceCommission?.toFixed(0)}</>
                              )}
                            </p>
                            {earnings.distance <= earnings.minDistance && earnings.distanceCommission === 0 && (
                              <p className="text-green-600 text-xs mt-1">
                                Note: Distance {earnings.distance?.toFixed(1)} km ≤ {earnings.minDistance} km, per km commission not applicable
                              </p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <p className="text-gray-400 text-xs">
                      Pickup: {newOrder?.pickupDistance || selectedRestaurant?.pickupDistance || '0 km'} | Drop: {newOrder?.deliveryDistance || selectedRestaurant?.dropDistance || '0 km'}
                    </p>
                  </div>

                  {/* Order ID */}
                  <div className="mb-4">
                    <p className="text-gray-500 text-xs mb-1">Order ID</p>
                    <p className="text-base font-semibold text-gray-900">
                      {newOrder?.orderId || selectedRestaurant?.orderId || 'ORD1234567890'}
                    </p>
                  </div>

                  {/* Pickup Details */}
                  <div className="bg-gray-50 rounded-xl p-4 mb-6">
                    <div className="mb-3">
                      <span className="bg-gray-200 text-gray-700 text-xs font-medium px-2 py-1 rounded-lg">
                        Pick up
                      </span>
                    </div>
                    
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      {newOrder?.restaurantName || selectedRestaurant?.name || 'Restaurant'}
                    </h3>
                    <p className="text-sm text-gray-600 mb-3 leading-relaxed">
                      {newOrder?.restaurantLocation?.address || selectedRestaurant?.address || 'Address'}
                    </p>
                    
                    <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-2">
                      <Clock className="w-4 h-4" />
                      <span>
                        {selectedRestaurant?.timeAway && selectedRestaurant.timeAway !== 'Calculating...' 
                          ? `${selectedRestaurant.timeAway} away`
                          : (newOrder?.pickupDistance && newOrder.pickupDistance !== '0 km' && newOrder.pickupDistance !== 'Calculating...'
                            ? `${calculateTimeAway(newOrder.pickupDistance)} away`
                            : 'Calculating...')}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 text-gray-500 text-sm">
                      <MapPin className="w-4 h-4" />
                      <span>
                        {selectedRestaurant?.distance && selectedRestaurant.distance !== '0 km' && selectedRestaurant.distance !== 'Calculating...'
                          ? `${selectedRestaurant.distance} away`
                          : (newOrder?.pickupDistance && newOrder.pickupDistance !== '0 km' && newOrder.pickupDistance !== 'Calculating...'
                            ? `${newOrder.pickupDistance} away`
                            : 'Calculating...')}
                      </span>
                    </div>
                  </div>

                  {/* Accept Order Button with Swipe */}
                  <div className="relative w-full">
                    <motion.div
                      ref={newOrderAcceptButtonRef}
                      className="relative w-full bg-green-600 rounded-full overflow-hidden shadow-xl"
                      style={{ touchAction: 'pan-x' }} // Prevent vertical scrolling, allow horizontal pan
                      onTouchStart={handleNewOrderAcceptTouchStart}
                      onTouchMove={handleNewOrderAcceptTouchMove}
                      onTouchEnd={handleNewOrderAcceptTouchEnd}
                      onTouchCancel={handleNewOrderAcceptTouchCancel}
                      whileTap={{ scale: 0.98 }}
                    >
                      {/* Swipe progress background */}
                      <motion.div
                        className="absolute inset-0 bg-green-500 rounded-full"
                        animate={{
                          width: `${newOrderAcceptButtonProgress * 100}%`
                        }}
                        transition={newOrderIsAnimatingToComplete ? {
                          type: "spring",
                          stiffness: 200,
                          damping: 25
                        } : { duration: 0 }}
                      />

                      {/* Button content container */}
                      <div className="relative flex items-center h-[64px] px-1">
                        {/* Left: Black circle with arrow */}
                        <motion.div
                          className="w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center shrink-0 relative z-20 shadow-2xl"
                          animate={{
                            x: newOrderAcceptButtonProgress * (newOrderAcceptButtonRef.current ? (newOrderAcceptButtonRef.current.offsetWidth - 56 - 32) : 240)
                          }}
                          transition={newOrderIsAnimatingToComplete ? {
                            type: "spring",
                            stiffness: 300,
                            damping: 30
                          } : { duration: 0 }}
                        >
                          <ArrowRight className="w-5 h-5 text-white" />
                        </motion.div>

                        {/* Text - centered and stays visible */}
                        <div className="absolute inset-0 flex items-center justify-center left-16 right-4 pointer-events-none">
                          <motion.span
                            className="text-white font-semibold flex items-center justify-center text-center text-base select-none"
                            animate={{
                              opacity: newOrderAcceptButtonProgress > 0.5 ? Math.max(0.2, 1 - newOrderAcceptButtonProgress * 0.8) : 1,
                              x: newOrderAcceptButtonProgress > 0.5 ? newOrderAcceptButtonProgress * 15 : 0
                            }}
                            transition={newOrderIsAnimatingToComplete ? {
                              type: "spring",
                              stiffness: 200,
                              damping: 25
                            } : { duration: 0 }}
                          >
                            {isAcceptingNewOrder ? 'Accepting...' : (newOrderAcceptButtonProgress > 0.5 ? 'Release to Accept' : 'Accept order')}
                          </motion.span>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Reject Button - Outside the popup, positioned below */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="fixed top-4 right-4 z-[115]"
            >
              <button
                onClick={handleRejectConfirm}
                className="  bg-black border-2 border-white text-white text-bold px-5 p-2 rounded-full font-semibold text-sm hover:bg-red-50 transition-colors shadow-2xl"
              >
                Deny
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Reject Order Popup */}
      <AnimatePresence>
        {showRejectPopup && (
          <>
            <motion.div
              className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleRejectCancel}
            >
              <motion.div
                className="w-[90%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-4 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">Can't Accept Order</h3>
                  <p className="text-sm text-gray-500 mt-1">Please select a reason for not accepting this order</p>
                </div>

                {/* Content */}
                <div className="px-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div className="space-y-2">
                    {rejectReasons.map((reason) => (
                      <button
                        key={reason}
                        onClick={() => setRejectReason(reason)}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                          rejectReason === reason
                            ? "border-black bg-red-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-medium ${
                            rejectReason === reason ? "text-black" : "text-gray-900"
                          }`}>
                            {reason}
                          </span>
                          {rejectReason === reason && (
                            <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
                  <button
                    onClick={handleRejectCancel}
                    className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRejectConfirm}
                    disabled={!rejectReason}
                    className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${
                      rejectReason
                        ? "!bg-black !text-white"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Confirm
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Directions Map View */}
      <AnimatePresence>
        {showDirectionsMap && selectedRestaurant && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[120] bg-white"
          >
            {/* Ola Maps Container for Directions */}
            <div
              ref={directionsMapContainerRef}
              key="directions-map-container" // Fixed key - don't remount on location change
              style={{ height: '100%', width: '100%', zIndex: 1 }}
            />
            
            {/* Loading indicator */}
            {directionsMapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
                <div className="text-gray-600">Loading map...</div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reached Pickup Popup - shown when order is ready (from order_ready socket) or when rider is within 500m */}
      {/* Don't show if Order ID confirmation popup is showing */}
      <BottomPopup
        isOpen={showreachedPickupPopup && !showOrderIdConfirmationPopup}
        onClose={() => setShowreachedPickupPopup(false)}
        showCloseButton={false}
        closeOnBackdropClick={false}
        disableSwipeToClose={true}
        maxHeight="70vh"
        showHandle={true}
        showBackdrop={false}
        backdropBlocksInteraction={false}
      >
        <div className="">
          {/* Pickup Label */}
          <div className="mb-4">
            <span className="bg-gray-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
              Pick up
            </span>
          </div>

          {/* Restaurant Info */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {selectedRestaurant?.name || 'Restaurant Name'}
            </h2>
            <p className="text-gray-600 mb-2 leading-relaxed">
              {(() => {
                const address = selectedRestaurant?.address;
                
                // If address is default or missing, try to find it in other fields
                if (!address || address === 'Restaurant Address' || address === 'Restaurant address') {
                  // Check if address might be in a different field
                  const possibleAddress = 
                    selectedRestaurant?.restaurantAddress ||
                    selectedRestaurant?.restaurant?.address ||
                    selectedRestaurant?.restaurantId?.address ||
                    selectedRestaurant?.restaurantId?.location?.formattedAddress ||
                    selectedRestaurant?.restaurantId?.location?.address ||
                    selectedRestaurant?.location?.address ||
                    selectedRestaurant?.location?.formattedAddress;
                  
                  if (possibleAddress && possibleAddress !== 'Restaurant Address' && possibleAddress !== 'Restaurant address') {
                    return possibleAddress;
                  }
                }
                
                return address && address !== 'Restaurant Address' && address !== 'Restaurant address' 
                  ? address 
                  : 'Address will be updated...';
              })()}
            </p>
            <p className="text-gray-500 text-sm font-medium">
              Order ID: {selectedRestaurant?.orderId || 'ORD1234567890'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mb-6">
            <button 
              onClick={async () => {
                // Try multiple paths to find restaurant phone number
                let restaurantPhone = selectedRestaurant?.phone || 
                                    selectedRestaurant?.restaurantId?.phone || 
                                    selectedRestaurant?.ownerPhone ||
                                    selectedRestaurant?.restaurant?.phone ||
                                    null
                
                debugLog('📞 Checking phone in selectedRestaurant:', {
                  phone: selectedRestaurant?.phone,
                  restaurantIdPhone: selectedRestaurant?.restaurantId?.phone,
                  ownerPhone: selectedRestaurant?.ownerPhone,
                  restaurantPhone: selectedRestaurant?.restaurant?.phone,
                  found: !!restaurantPhone
                })
                
                // If phone not found in selectedRestaurant, try to fetch order details from backend
                if (!restaurantPhone && selectedRestaurant?.orderId) {
                  try {
                    debugLog('📞 [CALL] Phone not found in selectedRestaurant, fetching order details from backend...')
                    const orderId = selectedRestaurant.orderId || selectedRestaurant.id
                    debugLog('📞 [CALL] Fetching order details for orderId:', orderId)
                    
                    const response = await deliveryAPI.getOrderDetails(orderId)
                    debugLog('📞 [CALL] Order details API response:', JSON.stringify(response.data, null, 2))
                    
                    // Check multiple response formats
                    const order = response.data?.data?.order || response.data?.order || null
                    
                    if (order) {
                      debugLog('📞 [CALL] Order data extracted from API:', {
                        hasRestaurantId: !!order.restaurantId,
                        restaurantIdType: typeof order.restaurantId,
                        restaurantIdPhone: order.restaurantId?.phone,
                        restaurantIdOwnerPhone: order.restaurantId?.ownerPhone,
                        restaurantIdObject: order.restaurantId ? Object.keys(order.restaurantId) : null
                      })
                      
                      // Try all possible paths in the API response
                      // Restaurant model has both 'phone' and 'ownerPhone' fields
                      restaurantPhone = order.restaurantId?.phone || 
                                       order.restaurantId?.ownerPhone ||
                                       order.restaurant?.phone ||
                                       order.restaurant?.ownerPhone ||
                                       order.restaurantId?.contact?.phone ||
                                       order.restaurantId?.owner?.phone ||
                                       null
                      
                      debugLog('📞 [CALL] Phone extracted from order:', restaurantPhone)
                      
                      // If phone found, update selectedRestaurant for future use
                      if (restaurantPhone && selectedRestaurant) {
                        setSelectedRestaurant({
                          ...selectedRestaurant,
                          phone: restaurantPhone,
                          ownerPhone: order.restaurantId?.ownerPhone || order.restaurant?.ownerPhone || restaurantPhone
                        })
                        debugLog('✅ [CALL] Updated selectedRestaurant with phone:', restaurantPhone)
                      }
                      
                      // If still not found, try restaurant API directly
                      if (!restaurantPhone && order.restaurantId) {
                        const restaurantId = typeof order.restaurantId === 'string' 
                          ? order.restaurantId 
                          : (order.restaurantId._id || order.restaurantId.id || order.restaurantId.toString())
                        
                        if (restaurantId) {
                          try {
                            debugLog('📞 [CALL] Trying restaurant API directly with ID:', restaurantId)
                            const restaurantResponse = await restaurantAPI.getRestaurantById(restaurantId)
                            if (restaurantResponse.data?.success && restaurantResponse.data.data) {
                              const restaurant = restaurantResponse.data.data.restaurant || restaurantResponse.data.data
                              restaurantPhone = restaurant.phone || restaurant.ownerPhone || restaurant.primaryContactNumber
                              
                              if (restaurantPhone) {
                                setSelectedRestaurant({
                                  ...selectedRestaurant,
                                  phone: restaurantPhone,
                                  ownerPhone: restaurant.ownerPhone || restaurantPhone
                                })
                                debugLog('✅ [CALL] Updated selectedRestaurant with phone from restaurant API:', restaurantPhone)
                              }
                            }
                          } catch (restaurantError) {
                            debugError('❌ [CALL] Error fetching restaurant by ID:', restaurantError)
                          }
                        }
                      }
                      
                      if (!restaurantPhone) {
                        debugWarn('⚠️ [CALL] Phone not found in order.restaurantId object:', order.restaurantId)
                      }
                    } else {
                      debugWarn('⚠️ [CALL] Order details API response format unexpected - order not found in response:', {
                        responseKeys: Object.keys(response.data || {}),
                        responseData: response.data
                      })
                    }
                  } catch (error) {
                    debugError('❌ [CALL] Error fetching order details for phone:', error)
                    debugError('❌ [CALL] Error message:', error.message)
                    debugError('❌ [CALL] Error response:', error.response?.data)
                    debugError('❌ [CALL] Error status:', error.response?.status)
                  }
                } else if (!selectedRestaurant?.orderId) {
                  debugWarn('⚠️ [CALL] Cannot fetch phone - orderId not found in selectedRestaurant:', selectedRestaurant)
                }
                
                if (restaurantPhone) {
                  const dialed = dialPhoneNumber(restaurantPhone, 'Restaurant phone number not available')
                  if (dialed) {
                    debugLog('📞 Calling restaurant:', { original: restaurantPhone })
                  }
                } else {
                  toast.error('Restaurant phone number not available')
                  debugError('❌ Restaurant phone not found in any path:', { 
                    selectedRestaurant,
                    hasPhone: !!selectedRestaurant?.phone,
                    hasRestaurantIdPhone: !!selectedRestaurant?.restaurantId?.phone,
                    hasOwnerPhone: !!selectedRestaurant?.ownerPhone,
                    orderId: selectedRestaurant?.orderId
                  })
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Phone className="w-5 h-5 text-gray-700" />
              <span className="text-gray-700 font-medium">Call</span>
            </button>
            <button 
              onClick={() => {
                // Get restaurant location coordinates
                const restaurantLat = selectedRestaurant?.lat
                const restaurantLng = selectedRestaurant?.lng
                
                if (!restaurantLat || !restaurantLng) {
                  toast.error('Restaurant location not available')
                  debugError('❌ Restaurant coordinates not found:', { 
                    lat: restaurantLat, 
                    lng: restaurantLng,
                    selectedRestaurant 
                  })
                  return
                }

                debugLog('🗺️ Opening Google Maps navigation to restaurant:', { 
                  lat: restaurantLat, 
                  lng: restaurantLng,
                  name: selectedRestaurant?.name 
                })

                // Detect platform (Android or iOS)
                const userAgent = navigator.userAgent || navigator.vendor || window.opera
                const isAndroid = /android/i.test(userAgent)
                const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream

                let mapsUrl = ''

                if (isAndroid) {
                  // Android: Use google.navigation: scheme (opens directly in navigation mode)
                  mapsUrl = `google.navigation:q=${restaurantLat},${restaurantLng}&mode=b`
                  
                  // Try to open Google Maps app first
                  window.location.href = mapsUrl
                  
                  // Fallback to web URL after a short delay (in case app is not installed)
                  setTimeout(() => {
                    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${restaurantLat},${restaurantLng}&travelmode=bicycling`
                    window.open(webUrl, '_blank')
                  }, 500)
                } else if (isIOS) {
                  // iOS: Use comgooglemaps:// scheme (opens Google Maps app)
                  mapsUrl = `comgooglemaps://?daddr=${restaurantLat},${restaurantLng}&directionsmode=bicycling`
                  
                  // Try to open Google Maps app first
                  window.location.href = mapsUrl
                  
                  // Fallback to web URL after a short delay (in case app is not installed)
                  setTimeout(() => {
                    const webUrl = `https://maps.google.com/?daddr=${restaurantLat},${restaurantLng}&directionsmode=bicycling`
                    window.open(webUrl, '_blank')
                  }, 500)
                } else {
                  // Web/Desktop: Use web URL with navigation
                  mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${restaurantLat},${restaurantLng}&travelmode=bicycling`
                  window.open(mapsUrl, '_blank')
                }

                // Show success message
                toast.success('Opening Google Maps navigation 🗺️', {
                  duration: 2000
                })
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              <MapPin className="w-5 h-5 text-white" />
              <span className="text-white font-medium">Map</span>
            </button>
          </div>

          {/* Reached Pickup Button with Swipe */}
          <div className="relative w-full">
            <motion.div
              ref={reachedPickupButtonRef}
              className="relative w-full bg-green-600 rounded-full overflow-hidden shadow-xl"
              style={{ touchAction: 'pan-x' }} // Prevent vertical scrolling, allow horizontal pan
              onTouchStart={handlereachedPickupTouchStart}
              onTouchMove={handlereachedPickupTouchMove}
              onTouchEnd={handlereachedPickupTouchEnd}
              onTouchCancel={handlereachedPickupTouchCancel}
              onMouseDown={handleReachedPickupMouseDown}
              whileTap={{ scale: 0.98 }}
            >
              {/* Swipe progress background */}
              <motion.div
                className="absolute inset-0 bg-green-500 rounded-full"
                animate={{
                  width: `${reachedPickupButtonProgress * 100}%`
                }}
                transition={reachedPickupIsAnimatingToComplete ? {
                  type: "spring",
                  stiffness: 200,
                  damping: 25
                } : { duration: 0 }}
              />

              {/* Button content container */}
              <div className="relative flex items-center h-[64px] px-1">
                {/* Left: Black circle with arrow */}
                <motion.div
                  className="w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center shrink-0 relative z-20 shadow-2xl"
                  animate={{
                    x: reachedPickupButtonProgress * (reachedPickupButtonRef.current ? (reachedPickupButtonRef.current.offsetWidth - 56 - 32) : 240)
                  }}
                  transition={reachedPickupIsAnimatingToComplete ? {
                    type: "spring",
                    stiffness: 300,
                    damping: 30
                  } : { duration: 0 }}
                >
                  <ArrowRight className="w-5 h-5 text-white" />
                </motion.div>

                {/* Text - centered and stays visible */}
                <div className="absolute inset-0 flex items-center justify-center left-16 right-4 pointer-events-none">
                  <motion.span
                    className="text-white font-semibold flex items-center justify-center text-center text-base select-none"
                    animate={{
                      opacity: reachedPickupButtonProgress > 0.5 ? Math.max(0.2, 1 - reachedPickupButtonProgress * 0.8) : 1,
                      x: reachedPickupButtonProgress > 0.5 ? reachedPickupButtonProgress * 15 : 0
                    }}
                    transition={reachedPickupIsAnimatingToComplete ? {
                      type: "spring",
                      stiffness: 200,
                      damping: 25
                    } : { duration: 0 }}
                  >
                    {reachedPickupButtonProgress > 0.5 ? 'Release to Confirm' : 'Reached Pickup'}
                  </motion.span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </BottomPopup>

      {/* Order ID Confirmation Popup - shown after Reached Pickup swipe is confirmed */}
      <BottomPopup
        isOpen={showOrderIdConfirmationPopup}
        onClose={() => setShowOrderIdConfirmationPopup(false)}
        showCloseButton={false}
        closeOnBackdropClick={false}
        maxHeight="60vh"
        showHandle={false}
        showBackdrop={false}
        backdropBlocksInteraction={false}
      >
        <div className="">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Confirm Order ID
            </h2>
            <p className="text-gray-600 text-sm mb-4">
              Please verify the order ID with the restaurant before pickup
            </p>
            
            {/* Order ID Display - single line, scroll horizontally if needed */}
            <div className="bg-gray-50 rounded-xl p-6 mb-6 overflow-hidden">
              <p className="text-gray-500 text-xs mb-2">Order ID</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-wider whitespace-nowrap overflow-x-auto min-w-0">
                {selectedRestaurant?.orderId || selectedRestaurant?.id || newOrder?.orderId || newOrder?.orderMongoId || 'ORD1234567890'}
              </p>
            </div>

            {/* Bill Image Upload Section */}
            <div className="mb-6">
              <p className="text-gray-600 text-sm mb-3 text-center">
                {billImageUploaded ? '✅ Bill image uploaded' : 'Please capture bill image'}
              </p>
              
              {/* Camera Button */}
              <div className="flex justify-center mb-4">
                <button
                  onClick={handleCameraCapture}
                  disabled={isUploadingBill}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg transition-colors ${
                    isUploadingBill
                      ? 'bg-gray-400 cursor-not-allowed'
                      : billImageUploaded
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  } text-white font-medium`}
                >
                  {isUploadingBill ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : billImageUploaded ? (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      <span>Bill Uploaded</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5" />
                      <span>Capture Bill</span>
                    </>
                  )}
                </button>
              </div>

              {/* Hidden file input for camera (sr-only keeps it in DOM for mobile camera) */}
              <input
                id="bill-camera-input"
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleBillImageSelect}
                className="sr-only"
              />
            </div>

            {/* Order Picked Up Button with Swipe */}
            <div className="relative w-full">
              <motion.div
                ref={orderIdConfirmButtonRef}
                className={`relative w-full rounded-full overflow-hidden shadow-xl ${
                  billImageUploaded ? 'bg-green-600' : 'bg-gray-400 cursor-not-allowed'
                }`}
                style={{ 
                  touchAction: billImageUploaded ? 'pan-x' : 'none',
                  opacity: billImageUploaded ? 1 : 0.6
                }}
                onTouchStart={billImageUploaded ? handleOrderIdConfirmTouchStart : undefined}
                onTouchMove={billImageUploaded ? handleOrderIdConfirmTouchMove : undefined}
                onTouchEnd={billImageUploaded ? handleOrderIdConfirmTouchEnd : undefined}
                onTouchCancel={billImageUploaded ? handleOrderIdConfirmTouchCancel : undefined}
                whileTap={billImageUploaded ? { scale: 0.98 } : {}}
              >
                {/* Swipe progress background */}
                <motion.div
                  className="absolute inset-0 bg-green-500 rounded-full"
                  animate={{
                    width: `${orderIdConfirmButtonProgress * 100}%`
                  }}
                  transition={orderIdConfirmIsAnimatingToComplete ? {
                    type: "spring",
                    stiffness: 200,
                    damping: 25
                  } : { duration: 0 }}
                />

                {/* Button content container */}
                <div className="relative flex items-center h-[64px] px-1">
                  {/* Left: Black circle with arrow */}
                  <motion.div
                    className="w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center shrink-0 relative z-20 shadow-2xl"
                    animate={{
                      x: orderIdConfirmButtonProgress * (orderIdConfirmButtonRef.current ? (orderIdConfirmButtonRef.current.offsetWidth - 56 - 32) : 240)
                    }}
                    transition={orderIdConfirmIsAnimatingToComplete ? {
                      type: "spring",
                      stiffness: 300,
                      damping: 30
                    } : { duration: 0 }}
                  >
                    <ArrowRight className="w-5 h-5 text-white" />
                  </motion.div>

                  {/* Text - centered and stays visible */}
                  <div className="absolute inset-0 flex items-center justify-center left-16 right-4 pointer-events-none">
                    <motion.span
                      className="text-white font-semibold flex items-center justify-center text-center text-base select-none"
                      animate={{
                        opacity: orderIdConfirmButtonProgress > 0.5 ? Math.max(0.2, 1 - orderIdConfirmButtonProgress * 0.8) : 1,
                        x: orderIdConfirmButtonProgress > 0.5 ? orderIdConfirmButtonProgress * 15 : 0
                      }}
                      transition={orderIdConfirmIsAnimatingToComplete ? {
                        type: "spring",
                        stiffness: 200,
                        damping: 25
                      } : { duration: 0 }}
                    >
                      {!billImageUploaded 
                        ? 'Upload Bill First' 
                        : orderIdConfirmButtonProgress > 0.5 
                        ? 'Release to Confirm' 
                        : 'Order Picked Up'}
                    </motion.span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </BottomPopup>

      {/* Reached Drop Popup - shown instantly after Order Picked Up confirmation */}
      <BottomPopup
        isOpen={showReachedDropPopup}
        onClose={() => setShowReachedDropPopup(false)}
        showCloseButton={false}
        closeOnBackdropClick={false}
        maxHeight="70vh"
        showHandle={true}
        showBackdrop={false}
        backdropBlocksInteraction={false}
      >
        <div className="">
          {/* Drop Label */}
          <div className="mb-4">
            <span className="bg-teal-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
              Drop
            </span>
          </div>

          {/* Customer Info */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {selectedRestaurant?.customerName || 'Customer Name'}
            </h2>
            <p className="text-gray-600 mb-2 leading-relaxed">
              {selectedRestaurant?.customerAddress || 'Customer Address'}
            </p>
            <p className="text-gray-500 text-sm font-medium">
              Order ID: {selectedRestaurant?.orderId || 'ORD1234567890'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => {
                const phone = selectedRestaurant?.customerPhone || selectedRestaurant?.userId?.phone || null
                dialPhoneNumber(phone, "Customer phone number not available")
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Phone className="w-5 h-5 text-gray-700" />
              <span className="text-gray-700 font-medium">Call</span>
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
              <MapPin className="w-5 h-5 text-white" />
              <span className="text-white font-medium">Map</span>
            </button>
          </div>

          {/* Reached Drop Button with Swipe */}
          <div className="relative w-full">
            <motion.div
              ref={reachedDropButtonRef}
              className="relative w-full bg-green-600 rounded-full overflow-hidden shadow-xl"
              style={{ touchAction: 'pan-x' }} // Prevent vertical scrolling, allow horizontal pan
              onTouchStart={handleReachedDropTouchStart}
              onTouchMove={handleReachedDropTouchMove}
              onTouchEnd={handleReachedDropTouchEnd}
              onTouchCancel={handleReachedDropTouchCancel}
              whileTap={{ scale: 0.98 }}
            >
              {/* Swipe progress background */}
              <motion.div
                className="absolute inset-0 bg-green-500 rounded-full"
                animate={{
                  width: `${reachedDropButtonProgress * 100}%`
                }}
                transition={reachedDropIsAnimatingToComplete ? {
                  type: "spring",
                  stiffness: 200,
                  damping: 25
                } : { duration: 0 }}
              />

              {/* Button content container */}
              <div className="relative flex items-center h-[64px] px-1">
                {/* Left: Black circle with arrow */}
                <motion.div
                  className="w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center shrink-0 relative z-20 shadow-2xl"
                  animate={{
                    x: reachedDropButtonProgress * (reachedDropButtonRef.current ? (reachedDropButtonRef.current.offsetWidth - 56 - 32) : 240)
                  }}
                  transition={reachedDropIsAnimatingToComplete ? {
                    type: "spring",
                    stiffness: 300,
                    damping: 30
                  } : { duration: 0 }}
                >
                  <ArrowRight className="w-5 h-5 text-white" />
                </motion.div>

                {/* Text - centered and stays visible */}
                <div className="absolute inset-0 flex items-center justify-center left-16 right-4 pointer-events-none">
                  <motion.span
                    className="text-white font-semibold flex items-center justify-center text-center text-base select-none"
                    animate={{
                      opacity: reachedDropButtonProgress > 0.5 ? Math.max(0.2, 1 - reachedDropButtonProgress * 0.8) : 1,
                      x: reachedDropButtonProgress > 0.5 ? reachedDropButtonProgress * 15 : 0
                    }}
                    transition={reachedDropIsAnimatingToComplete ? {
                      type: "spring",
                      stiffness: 200,
                      damping: 25
                    } : { duration: 0 }}
                  >
                    {reachedDropButtonProgress > 0.5 ? 'Release to Confirm' : 'Reached Drop'}
                  </motion.span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </BottomPopup>

      <BottomPopup
        isOpen={showDeliveryOtpModal}
        onClose={() => closeDeliveryOtpModal(null)}
        showCloseButton={false}
        closeOnBackdropClick={false}
        maxHeight="78vh"
        showHandle={false}
        disableSwipeToClose={true}
      >
        <div className="px-1 min-h-full flex flex-col">
          <div className="text-center mb-5">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <Lock className="w-7 h-7 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Verify Delivery OTP</h3>
            <p className="text-sm text-gray-600 mt-1">Enter the 4-digit OTP from customer (or paste it)</p>
          </div>

          <div className="mb-4">
            <input
              ref={deliveryOtpSingleInputRef}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={DELIVERY_DROP_OTP_LENGTH}
              value={deliveryOtpValue}
              onChange={handleDeliveryOtpSingleChange}
              onPaste={handleDeliveryOtpSinglePaste}
              onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" })}
              placeholder="0000"
              className="w-full h-14 rounded-xl border border-gray-300 text-center text-2xl font-bold text-gray-900 tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              aria-label="Delivery OTP"
            />
          </div>

          {deliveryOtpError && (
            <p className="text-center text-sm text-red-500 mb-4">{deliveryOtpError}</p>
          )}

          <div className="mt-auto sticky bottom-0 bg-white pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => closeDeliveryOtpModal(null)}
              className="h-12 rounded-xl border border-gray-300 text-gray-700 font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitDeliveryOtpModal}
              disabled={deliveryOtpValue.length !== DELIVERY_DROP_OTP_LENGTH}
              className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold"
            >
              Verify OTP
            </button>
            </div>
          </div>
        </div>
      </BottomPopup>

      {/* Order Delivered Bottom Popup - shown instantly after Reached Drop is confirmed */}
      <BottomPopup
        isOpen={showOrderDeliveredAnimation}
        onClose={() => {
          setShowOrderDeliveredAnimation(false)
          setShowCustomerReviewPopup(true)
        }}
        showCloseButton={false}
        closeOnBackdropClick={false}
        maxHeight="80vh"
        showHandle={false}
        disableSwipeToClose={true}
        showBackdrop={false}
        backdropBlocksInteraction={false}
      >
        <div className="">
          {/* Success Icon and Title */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Great job! Delivery complete 👍
            </h1>
          </div>

          {/* Trip Details */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-600" />
                  <span className="text-gray-600 text-sm">Trip distance</span>
                </div>
                <span className="text-gray-900 font-semibold">
                  {tripDistance !== null 
                    ? (tripDistance >= 1000 
                        ? `${(tripDistance / 1000).toFixed(1)} kms` 
                        : `${tripDistance.toFixed(0)} m`)
                    : (selectedRestaurant?.tripDistance || 'Calculating...')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-600" />
                  <span className="text-gray-600 text-sm">Trip time</span>
                </div>
                <span className="text-gray-900 font-semibold">
                  {tripTime !== null 
                    ? (tripTime >= 60 
                        ? `${Math.round(tripTime / 60)} mins` 
                        : `${tripTime} secs`)
                    : (selectedRestaurant?.tripTime || 'Calculating...')}
                </span>
              </div>
            </div>
          </div>

          {/* Payment info: Online = amount paid, COD = collect from customer */}
          {(() => {
            const m = String(
              selectedRestaurant?.paymentMethod ||
              selectedRestaurant?.payment ||
              selectedRestaurant?.payment?.method ||
              ''
            ).toLowerCase().trim()
            const isCod = m === 'cash' || m === 'cod' || m === 'cash_on_delivery'
            const total = Number(
              selectedRestaurant?.total ??
              selectedRestaurant?.pricing?.total ??
              selectedRestaurant?.payment?.amount ??
              0
            ) || 0
            if (!Number.isFinite(total) || total < 0) return null
            return (
              <div className={`rounded-xl p-4 mb-6 ${isCod ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IndianRupee className={`w-4 h-4 ${isCod ? 'text-amber-600' : 'text-emerald-600'}`} />
                    <span className={`text-sm font-medium ${isCod ? 'text-amber-800' : 'text-emerald-800'}`}>
                      {isCod ? 'Collect from customer (COD)' : 'Amount paid (Online)'}
                    </span>
                  </div>
                  <span className={`text-lg font-bold ${isCod ? 'text-amber-700' : 'text-emerald-700'}`}>
                    ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )
          })()}

          {/* Order Delivered Button with Swipe */}
          <div className="relative w-full">
            <motion.div
              ref={orderDeliveredButtonRef}
              className="relative w-full bg-green-600 rounded-full overflow-hidden shadow-xl"
              style={{ touchAction: 'pan-x' }} // Prevent vertical scrolling, allow horizontal pan
              onTouchStart={handleOrderDeliveredTouchStart}
              onTouchMove={handleOrderDeliveredTouchMove}
              onTouchEnd={handleOrderDeliveredTouchEnd}
              onTouchCancel={handleOrderDeliveredTouchCancel}
              whileTap={{ scale: 0.98 }}
            >
              {/* Swipe progress background */}
              <motion.div
                className="absolute inset-0 bg-green-500 rounded-full"
                animate={{
                  width: `${orderDeliveredButtonProgress * 100}%`
                }}
                transition={orderDeliveredIsAnimatingToComplete ? {
                  type: "spring",
                  stiffness: 200,
                  damping: 25
                } : { duration: 0 }}
              />

              {/* Button content container */}
              <div className="relative flex items-center h-[64px] px-1">
                {/* Left: Black circle with arrow */}
                <motion.div
                  className="w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center shrink-0 relative z-20 shadow-2xl"
                  animate={{
                    x: orderDeliveredButtonProgress * (orderDeliveredButtonRef.current ? (orderDeliveredButtonRef.current.offsetWidth - 56 - 32) : 240)
                  }}
                  transition={orderDeliveredIsAnimatingToComplete ? {
                    type: "spring",
                    stiffness: 300,
                    damping: 30
                  } : { duration: 0 }}
                >
                  <ArrowRight className="w-5 h-5 text-white" />
                </motion.div>

                {/* Text - centered and stays visible */}
                <div className="absolute inset-0 flex items-center justify-center left-16 right-4 pointer-events-none">
                  <motion.span
                    className="text-white font-semibold flex items-center justify-center text-center text-base select-none"
                    animate={{
                      opacity: orderDeliveredButtonProgress > 0.5 ? Math.max(0.2, 1 - orderDeliveredButtonProgress * 0.8) : 1,
                      x: orderDeliveredButtonProgress > 0.5 ? orderDeliveredButtonProgress * 15 : 0
                    }}
                    transition={orderDeliveredIsAnimatingToComplete ? {
                      type: "spring",
                      stiffness: 200,
                      damping: 25
                    } : { duration: 0 }}
                  >
                    {orderDeliveredButtonProgress > 0.5 ? 'Release to Confirm' : 'Order Delivered'}
                  </motion.span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </BottomPopup>

      {/* Customer Review Popup - shown after Order Delivered */}
      <BottomPopup
        isOpen={showCustomerReviewPopup}
        onClose={() => setShowCustomerReviewPopup(false)}
        showCloseButton={false}
        closeOnBackdropClick={false}
        maxHeight="80vh"
        showHandle={true}
      >
        <div className="">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Rate Your Experience
            </h2>
            <p className="text-gray-600 text-sm mb-6">
              How was your delivery experience?
            </p>
            
            {/* Star Rating */}
            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setCustomerRating(star)}
                  className="text-4xl transition-transform hover:scale-110"
                >
                  {star <= customerRating ? (
                    <span className="text-yellow-400">★</span>
                  ) : (
                    <span className="text-gray-300">★</span>
                  )}
                </button>
              ))}
            </div>

            {/* Optional Review Text */}
            <div className="mb-6">
              <label className="block text-left text-sm font-medium text-gray-700 mb-2">
                Review (Optional)
              </label>
              <textarea
                value={customerReviewText}
                onChange={(e) => setCustomerReviewText(e.target.value)}
                placeholder="Share your experience..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                rows={4}
              />
            </div>

            {/* Submit Button */}
            <button
              onClick={async () => {
                // Get order ID - use MongoDB _id for API call
                const orderIdForApi = selectedRestaurant?.id || 
                                    newOrder?.orderMongoId || 
                                    newOrder?._id ||
                                    selectedRestaurant?.orderId || 
                                    newOrder?.orderId
                
                // Save review by calling completeDelivery API with rating and review
                if (orderIdForApi) {
                  try {
                    debugLog('📝 Submitting review and completing delivery:', {
                      orderId: orderIdForApi,
                      rating: customerRating,
                      review: customerReviewText
                    })
                    
                    // Call completeDelivery API with rating and review
                    const response = await deliveryAPI.completeDelivery(
                      orderIdForApi,
                      customerRating > 0 ? customerRating : null,
                      customerReviewText.trim() || ''
                    )
                    
                    if (response.data?.success) {
                      // Get updated earnings from response
                      // Note: completeDelivery API already adds earnings and COD cash collected to wallet
                      const earnings = response.data.data?.earnings?.amount || 
                                     response.data.data?.totalEarning ||
                                     orderEarnings
                      setOrderEarnings(earnings)
                      
                      debugLog('✅ Delivery completed and earnings added to wallet:', earnings)
                      debugLog('✅ Wallet transaction:', response.data.data?.walletTransaction)
                      
                      // Notify wallet listeners (Pocket balance, Pocket page) so cash collected updates
                      window.dispatchEvent(new Event('deliveryWalletStateUpdated'))
                      
                      // Show success message
                      if (earnings > 0) {
                        toast.success(`₹${earnings.toFixed(2)} added to your wallet! 💰`)
                      }
                      
                      // Close review popup and show payment page
                      setShowCustomerReviewPopup(false)
                      setShowPaymentPage(true)
                    } else {
                      debugError('❌ Failed to submit review:', response.data)
                      toast.error(response.data?.message || 'Failed to submit review. Please try again.')
                    }
                  } catch (error) {
                    debugError('❌ Error submitting review:', error)
                    toast.error('Failed to submit review. Please try again.')
                    // Still show payment page even if review fails
                    setShowCustomerReviewPopup(false)
                    setShowPaymentPage(true)
                  }
                } else {
                  // If no order ID, just show payment page
                  setShowCustomerReviewPopup(false)
                  setShowPaymentPage(true)
                }
              }}
              className="w-full bg-green-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-green-700 transition-colors shadow-lg"
            >
              Submit Review
            </button>
          </div>
        </div>
      </BottomPopup>

      {/* Payment Page - shown after Customer Review is submitted */}
      <AnimatePresence>
        {showPaymentPage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[200] bg-white overflow-y-auto"
          >
            {/* Header */}
            <div className="bg-green-500 text-white px-6 py-6">
              <h1 className="text-2xl font-bold mb-2">Payment</h1>
              <p className="text-white/90 text-sm">Order ID: {selectedRestaurant?.orderId || 'ORD1234567890'}</p>
            </div>

            {/* Payment Amount */}
            <div className="px-6 py-8 text-center bg-gray-50">
              <p className="text-gray-600 text-sm mb-2">Earnings from this order</p>
              <p className="text-5xl font-bold text-gray-900">
                ₹{(() => {
                  if (orderEarnings > 0) {
                    return orderEarnings.toFixed(2);
                  }
                  // Handle estimatedEarnings - can be number or object
                  const earnings = selectedRestaurant?.amount || selectedRestaurant?.estimatedEarnings || 0;
                  if (typeof earnings === 'object' && earnings.totalEarning) {
                    return earnings.totalEarning.toFixed(2);
                  }
                  return typeof earnings === 'number' ? earnings.toFixed(2) : '0.00';
                })()}
              </p>
              <p className="text-green-600 text-sm mt-2">💰 Added to your wallet</p>
            </div>

            {/* Payment Details */}
            <div className="px-6 py-6 pb-6 h-full flex flex-col justify-between">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Payment Details</h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Trip pay</span>
                    <span className="text-gray-900 font-semibold">₹{(() => {
                      let earnings = 0;
                      if (orderEarnings > 0) {
                        earnings = orderEarnings;
                      } else {
                        const estEarnings = selectedRestaurant?.amount || selectedRestaurant?.estimatedEarnings || 0;
                        if (typeof estEarnings === 'object' && estEarnings.totalEarning) {
                          earnings = estEarnings.totalEarning;
                        } else if (typeof estEarnings === 'number') {
                          earnings = estEarnings;
                        }
                      }
                      return (earnings - 5).toFixed(2);
                    })()}</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Long distance return pay</span>
                    <span className="text-gray-900 font-semibold">₹5.00</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2">
                    <span className="text-lg font-bold text-gray-900">Total Earnings</span>
                    <span className="text-lg font-bold text-gray-900">₹{(() => {
                      if (orderEarnings > 0) {
                        return orderEarnings.toFixed(2);
                      }
                      // Handle estimatedEarnings - can be number or object
                      const earnings = selectedRestaurant?.amount || selectedRestaurant?.estimatedEarnings || 0;
                      if (typeof earnings === 'object' && earnings.totalEarning) {
                        return earnings.totalEarning.toFixed(2);
                      }
                      return typeof earnings === 'number' ? earnings.toFixed(2) : '0.00';
                    })()}</span>
                  </div>
                </div>
              </div>


              {/* Complete Button */}
              <button
                onClick={() => {
                  setShowPaymentPage(false)
                  // CRITICAL: Clear all order-related popups and states when completing
                  setShowreachedPickupPopup(false)
                  setShowOrderIdConfirmationPopup(false)
                  setShowReachedDropPopup(false)
                  setShowOrderDeliveredAnimation(false)
                  setShowCustomerReviewPopup(false)
                  
                  // Clear selected restaurant/order to prevent showing popups for delivered order
                  setSelectedRestaurant(null)
                  
                  // CRITICAL: Clear active order from localStorage to prevent it from showing again
                  localStorage.removeItem(DELIVERY_ACTIVE_ORDER_KEY)
                  localStorage.removeItem('activeOrder')
                  
                  // Clear newOrder from notifications hook (if available)
                  if (typeof clearNewOrder === 'function') {
                    clearNewOrder()
                  }
                  
                  // Clear accepted orders list when order is completed
                  acceptedOrderIdsRef.current.clear();
                  
                  navigate("/delivery")
                  // Reset states
                  setTimeout(() => {
                    setReachedDropButtonProgress(0)
                    setReachedDropIsAnimatingToComplete(false)
                    setCustomerRating(0)
                    setCustomerReviewText("")
                  }, 500)
                }}
                className="w-full sticky bottom-4 bg-black text-white py-4 rounded-xl font-semibold text-lg hover:bg-gray-800 transition-colors shadow-lg "
              >
                Complete
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isVerifyingDeliveryOtp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[260] bg-black/45 backdrop-blur-[2px] flex items-center justify-center px-6"
          >
            <div className="w-full max-w-xs rounded-2xl bg-white shadow-2xl p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
              </div>
              <p className="text-base font-semibold text-gray-900">Verifying OTP</p>
              <p className="text-sm text-gray-600 mt-1">Please wait...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

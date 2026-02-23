import { useEffect, useRef, useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { useGigStore } from "../store/gigStore"
import { 
  ChevronDown,
  Phone,
  MapPin,
  Navigation,
  X,
  RefreshCw,
  ArrowRight,
  CheckCircle2
} from "lucide-react"

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom icons
const createCustomIcon = (color, icon) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-center; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
      ${icon}
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  })
}

// Component to update map center
function MapUpdater({ center }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

export default function PickupDirectionsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { goOffline } = useGigStore()
  const [riderLocation, setRiderLocation] = useState([28.2849, 76.1209]) // Set default immediately
  const [expandedRestaurant, setExpandedRestaurant] = useState(null)
  const [routePolylines, setRoutePolylines] = useState([])
  const [reachedButtonProgress, setReachedButtonProgress] = useState(0)
  const [isAnimatingToComplete, setIsAnimatingToComplete] = useState(false)
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false)
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false)
  const reachedButtonRef = useRef(null)
  const bottomSheetRef = useRef(null)
  const handleRef = useRef(null)
  const reachedButtonSwipeStartX = useRef(0)
  const reachedButtonSwipeStartY = useRef(0)
  const reachedButtonIsSwiping = useRef(false)
  const swipeStartY = useRef(0)
  const isSwiping = useRef(false)
  
  // Get accepted restaurants from location state
  const acceptedRestaurants = location.state?.restaurants || []

  // Set first restaurant as expanded by default
  useEffect(() => {
    if (acceptedRestaurants.length > 0 && expandedRestaurant === null) {
      setExpandedRestaurant(acceptedRestaurants[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptedRestaurants])

  // Get rider location - update with actual location if available
  useEffect(() => {
    // Default location is already set, now try to get actual location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setRiderLocation([position.coords.latitude, position.coords.longitude])
        },
        () => {
          // Keep default location if geolocation fails
        }
      )
      
      // Watch position updates
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setRiderLocation([position.coords.latitude, position.coords.longitude])
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 10000 }
      )
      
      return () => navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  // Fetch routes
  useEffect(() => {
    if (acceptedRestaurants.length > 0 && riderLocation) {
      const fetchAllRoutes = async () => {
        const routes = []
        let currentLocation = riderLocation
        
        for (const restaurant of acceptedRestaurants) {
          try {
            const url = `https://router.project-osrm.org/route/v1/driving/${currentLocation[1]},${currentLocation[0]};${restaurant.lng},${restaurant.lat}?overview=full&geometries=geojson`
            const response = await fetch(url)
            const data = await response.json()
            
            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
              const coordinates = data.routes[0].geometry.coordinates.map((coord) => [coord[1], coord[0]])
              routes.push(coordinates)
              currentLocation = [restaurant.lat, restaurant.lng]
            } else {
              routes.push([currentLocation, [restaurant.lat, restaurant.lng]])
              currentLocation = [restaurant.lat, restaurant.lng]
            }
          } catch (error) {
            console.error('Error fetching route:', error)
            routes.push([currentLocation, [restaurant.lat, restaurant.lng]])
            currentLocation = [restaurant.lat, restaurant.lng]
          }
        }
        setRoutePolylines(routes)
      }
      
      fetchAllRoutes()
    }
  }, [acceptedRestaurants, riderLocation])

  const handleCall = (phoneNumber) => {
    window.location.href = `tel:${phoneNumber}`
  }

  const handleOpenMap = (lat, lng, address) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    window.open(url, '_blank')
  }

  const toggleRestaurantExpansion = (restaurantId) => {
    setExpandedRestaurant(expandedRestaurant === restaurantId ? null : restaurantId)
  }

  // Handle bottom sheet swipe
  const handleBottomSheetTouchStart = (e) => {
    const target = e.target
    const isHandle = handleRef.current?.contains(target)
    const isScrollableContent = target.closest('.scrollable-content')
    
    // Always allow swipe on handle
    if (isHandle) {
      e.stopPropagation()
      swipeStartY.current = e.touches[0].clientY
      isSwiping.current = true
      return
    }
    
    // Check if touch is in top area of bottom sheet
    const rect = bottomSheetRef.current?.getBoundingClientRect()
    if (!rect) return
    
    const touchY = e.touches[0].clientY
    const handleArea = rect.top + 80 // Top 80px is draggable area
    
    // If touching scrollable content, check if it's scrollable and at top
    if (isScrollableContent) {
      const scrollable = target.closest('.scrollable-content')
      if (scrollable && scrollable.scrollTop > 0) {
        return // Content is scrollable and not at top, let it scroll
      }
    }
    
    // Allow swipe if touching top area (not scrollable content)
    if (touchY <= handleArea && !isScrollableContent) {
      e.stopPropagation()
      swipeStartY.current = touchY
      isSwiping.current = true
    }
  }

  const handleBottomSheetTouchMove = (e) => {
    if (!isSwiping.current) return
    
    const deltaY = swipeStartY.current - e.touches[0].clientY
    
    if (Math.abs(deltaY) > 10) {
      e.stopPropagation()
      e.preventDefault()
      
      // Swipe up to expand
      if (deltaY > 0 && !bottomSheetExpanded && bottomSheetRef.current) {
        const maxMovement = window.innerHeight * 0.3
        const clampedDelta = Math.min(deltaY, maxMovement)
        bottomSheetRef.current.style.transform = `translateY(${-clampedDelta}px)`
        bottomSheetRef.current.style.transition = 'none' // Disable animation during drag
      }
      // Swipe down to collapse
      else if (deltaY < 0 && bottomSheetExpanded && bottomSheetRef.current) {
        const maxMovement = window.innerHeight * 0.3
        const clampedDelta = Math.max(deltaY, -maxMovement)
        bottomSheetRef.current.style.transform = `translateY(${-clampedDelta}px)`
        bottomSheetRef.current.style.transition = 'none' // Disable animation during drag
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
      // Re-enable transition
      bottomSheetRef.current.style.transition = ''
      
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

  // Handle reached pickup button swipe
  const handleReachedButtonTouchStart = (e) => {
    reachedButtonSwipeStartX.current = e.touches[0].clientX
    reachedButtonSwipeStartY.current = e.touches[0].clientY
    reachedButtonIsSwiping.current = false
    setReachedButtonProgress(0)
  }

  const handleReachedButtonTouchMove = (e) => {
    const deltaX = e.touches[0].clientX - reachedButtonSwipeStartX.current
    const deltaY = e.touches[0].clientY - reachedButtonSwipeStartY.current
    
    // Only handle horizontal swipes (swipe right)
    if (Math.abs(deltaX) > 5 && Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
      reachedButtonIsSwiping.current = true
      e.preventDefault()
      
      // Calculate max swipe distance
      const buttonWidth = reachedButtonRef.current?.offsetWidth || 300
      const circleWidth = 56
      const padding = 16
      const maxSwipe = buttonWidth - circleWidth - (padding * 2)
      
      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1)
      setReachedButtonProgress(progress)
    }
  }

  const handleReachedButtonTouchEnd = (e) => {
    if (!reachedButtonIsSwiping.current) {
      setReachedButtonProgress(0)
      return
    }

    const deltaX = e.changedTouches[0].clientX - reachedButtonSwipeStartX.current
    const buttonWidth = reachedButtonRef.current?.offsetWidth || 300
    const circleWidth = 56
    const padding = 16
    const maxSwipe = buttonWidth - circleWidth - (padding * 2)
    const threshold = maxSwipe * 0.7
    
    if (deltaX > threshold) {
      // Animate to completion
      setIsAnimatingToComplete(true)
      setReachedButtonProgress(1)
      
      // Show success animation after button animation completes
      setTimeout(() => {
        setShowSuccessAnimation(true)
        
        // Hide animation, go offline, and navigate to home after showing message
        setTimeout(() => {
          setShowSuccessAnimation(false)
          setReachedButtonProgress(0)
          setIsAnimatingToComplete(false)
          
          // Go offline and navigate to home
          goOffline()
          navigate("/delivery", { replace: true })
        }, 3000) // Show success message for 3 seconds
      }, 400) // Wait for button animation to complete
    } else {
      // Reset smoothly
      setReachedButtonProgress(0)
    }
    
    reachedButtonSwipeStartX.current = 0
    reachedButtonSwipeStartY.current = 0
    reachedButtonIsSwiping.current = false
  }

  if (acceptedRestaurants.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg mb-4">No restaurants selected</p>
          <button
            onClick={() => navigate("/delivery")}
            className="bg-[#ff8100] text-white px-6 py-2 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="min-h-screen bg-gray-900 overflow-hidden relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Top Bar */}
      <motion.div
        className="absolute top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between rounded-b-3xl md:rounded-b-none"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/delivery")}
            className="p-2 hover:bg-gray-800 rounded-full transition-colors"
          >
            <ChevronDown className="w-5 h-5 text-white" />
          </button>
          <span className="text-white font-semibold text-base">Reach pickup</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-gray-800 rounded-full transition-colors">
            <div className="w-5 h-5 bg-[#ff8100] rounded-full" />
          </button>
          <button className="p-2 hover:bg-gray-800 rounded-full transition-colors">
            <Navigation className="w-5 h-5 text-white" />
          </button>
          <button className="p-2 hover:bg-gray-800 rounded-full transition-colors">
            <RefreshCw className="w-5 h-5 text-white" />
          </button>
        </div>
      </motion.div>

      {/* Map */}
      <motion.div
        className="relative w-full"
        style={{ height: 'calc(100vh - 120px)', marginTop: '60px' }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        {riderLocation ? (
          <MapContainer
            key={`map-${riderLocation[0]}-${riderLocation[1]}`}
            center={riderLocation}
            zoom={13}
            style={{ height: '100%', width: '100%', zIndex: 1 }}
            zoomControl={false}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapUpdater center={riderLocation} />
            
            {/* Rider location marker */}
            <Marker
              position={riderLocation}
              icon={createCustomIcon('#10b981', '<div style="width: 20px; height: 20px; background: white; border-radius: 50%;"></div>')}
            >
              <Popup>Your Location</Popup>
            </Marker>

            {/* Restaurant markers */}
            {acceptedRestaurants.map((restaurant, index) => (
              <Marker
                key={restaurant.id}
                position={[restaurant.lat, restaurant.lng]}
                icon={createCustomIcon('#ff8100', '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>')}
              >
                <Popup>{restaurant.name}</Popup>
              </Marker>
            ))}

            {/* Route polylines */}
            {routePolylines.map((route, index) => (
              <Polyline
                key={`route-${index}`}
                positions={route}
                pathOptions={{ color: '#10b981', weight: 5, opacity: 0.9 }}
              />
            ))}
          </MapContainer>
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-200">
            <div className="text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-12 h-12 border-4 border-[#ff8100] border-t-transparent rounded-full mx-auto mb-4"
              />
              <p className="text-gray-600">Loading map...</p>
            </div>
          </div>
        )}

        {/* Map Zoom Controls */}
        <div className="absolute right-4 top-20 z-40 flex flex-col gap-2">
          <button className="w-10 h-10 bg-white rounded-lg shadow-lg flex items-center justify-center text-gray-700 text-xl font-semibold">
            +
          </button>
          <button className="w-10 h-10 bg-white rounded-lg shadow-lg flex items-center justify-center text-gray-700 text-xl font-semibold">
            −
          </button>
        </div>

        {/* Location Button */}
        <div className="absolute right-4 top-44 z-40">
          <button className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center">
            <Navigation className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </motion.div>

      {/* Bottom Sheet */}
      <motion.div
        ref={bottomSheetRef}
        className="absolute left-0 right-0 bg-gray-900 rounded-t-3xl z-40 overflow-hidden"
        initial={false}
        animate={{
          height: bottomSheetExpanded ? '70vh' : '40vh',
        }}
        style={{ 
          bottom: '88px'
        }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onTouchStart={handleBottomSheetTouchStart}
        onTouchMove={handleBottomSheetTouchMove}
        onTouchEnd={handleBottomSheetTouchEnd}
      >
        {/* Handle */}
        <div 
          ref={handleRef}
          className="flex justify-center pt-4 pb-3 cursor-grab active:cursor-grabbing relative z-50 bg-gray-900 rounded-t-3xl"
          onClick={() => setBottomSheetExpanded(!bottomSheetExpanded)}
          onTouchStart={(e) => {
            e.stopPropagation()
            handleBottomSheetTouchStart(e)
          }}
        >
          <div className="w-16 h-2 bg-white/50 rounded-full shadow-lg flex items-center justify-center border border-white/20">
            <div className="w-12 h-1 bg-white rounded-full" />
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-4 pb-8 mb-8 scrollable-content" style={{ maxHeight: bottomSheetExpanded ? 'calc(70vh - 60px)' : 'calc(40vh - 60px)' }}>
          <div className="space-y-4">
            {acceptedRestaurants.map((restaurant, index) => {
              const isExpanded = expandedRestaurant === restaurant.id
              return (
                <motion.div
                  key={restaurant.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="relative"
                >
                  {/* Vertical line */}
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-white/30">
                    {index < acceptedRestaurants.length - 1 && (
                      <div className="absolute top-12 left-0 w-full h-full bg-white/30" />
                    )}
                  </div>

                  {/* Number circle */}
                  <div className="absolute left-2 top-0 w-8 h-8 bg-white rounded-full flex items-center justify-center z-10">
                    <span className="text-gray-900 font-bold text-sm">{index + 1}</span>
                  </div>

                  {/* Restaurant card */}
                  <div className="ml-12">
                    <div
                      className="bg-gray-800 rounded-lg p-4 cursor-pointer"
                      onClick={() => toggleRestaurantExpansion(restaurant.id)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="bg-gray-700 rounded px-2 py-1 inline-block mb-2">
                            <span className="text-white text-xs font-medium">Pick up {index + 1}</span>
                          </div>
                          <h3 className="text-white font-bold text-lg mb-1">{restaurant.name}</h3>
                          <p className="text-white/70 text-sm">{restaurant.address}</p>
                        </div>
                      </div>

                      {/* Call and Map buttons - Animated */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="overflow-hidden"
                          >
                            <div className="flex gap-3 mt-3 pt-3 border-t border-gray-700">
                              <motion.button
                                initial={{ scale: 0.8 }}
                                animate={{ scale: 1 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCall(restaurant.phone || "+911234567890")
                                }}
                                className="flex-1 bg-gray-900 text-white py-3 rounded-lg flex items-center justify-center gap-2"
                              >
                                <Phone className="w-5 h-5" />
                                <span className="font-medium">Call</span>
                              </motion.button>
                              <motion.button
                                initial={{ scale: 0.8 }}
                                animate={{ scale: 1 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleOpenMap(restaurant.lat, restaurant.lng, restaurant.address)
                                }}
                                className="flex-1 bg-white text-gray-900 py-3 rounded-lg flex items-center justify-center gap-2"
                              >
                                <MapPin className="w-5 h-5" />
                                <span className="font-medium">Map</span>
                              </motion.button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* Reached Pickup Button - Sticky at bottom, above navigation */}
      <div className="fixed bottom-20 left-0 right-0 z-50 px-4 pb-4 bg-gray-900/95 backdrop-blur-sm md:bottom-4">
        <motion.div
          ref={reachedButtonRef}
          className="relative w-full bg-green-600 rounded-full overflow-hidden shadow-xl"
          onTouchStart={handleReachedButtonTouchStart}
          onTouchMove={handleReachedButtonTouchMove}
          onTouchEnd={handleReachedButtonTouchEnd}
          whileTap={{ scale: 0.98 }}
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 300, damping: 30 }}
        >
          {/* Swipe progress background */}
          <motion.div
            className="absolute inset-0 bg-green-500 rounded-full"
            animate={{
              width: `${reachedButtonProgress * 100}%`
            }}
            transition={isAnimatingToComplete ? {
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
                x: reachedButtonProgress * (reachedButtonRef.current ? (reachedButtonRef.current.offsetWidth - 56 - 32) : 240)
              }}
              transition={isAnimatingToComplete ? {
                type: "spring",
                stiffness: 300,
                damping: 30
              } : { duration: 0 }}
            >
              <div className="flex items-center justify-center gap-1.5">
                <ArrowRight className="w-5 h-5 text-white" />
              </div>
            </motion.div>
            
            {/* Text - centered and stays visible */}
            <div className="absolute inset-0 flex items-center justify-center left-16 right-4 pointer-events-none">
              <motion.span 
                className="text-gray-900 font-semibold flex items-center justify-center text-center text-base select-none"
                animate={{
                  opacity: reachedButtonProgress > 0.5 ? Math.max(0.2, 1 - reachedButtonProgress * 0.8) : 1,
                  x: reachedButtonProgress > 0.5 ? reachedButtonProgress * 15 : 0
                }}
                transition={isAnimatingToComplete ? {
                  type: "spring",
                  stiffness: 200,
                  damping: 25
                } : { duration: 0 }}
              >
                {reachedButtonProgress > 0.5 ? 'Release to Confirm' : 'Reached pickup'}
              </motion.span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Full Screen Success Animation */}
      <AnimatePresence>
        {showSuccessAnimation && (
          <motion.div
            className="fixed inset-0 z-[9999] bg-gray-900 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Success Icon with Animation */}
            <motion.div
              className="flex flex-col items-center justify-center"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ 
                type: "spring",
                stiffness: 200,
                damping: 20,
                delay: 0.1
              }}
            >
              {/* Checkmark Circle */}
              <motion.div
                className="relative mb-8"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  delay: 0.2
                }}
              >
                {/* Outer ring animation */}
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-green-500"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.2, opacity: 0 }}
                  transition={{
                    duration: 0.6,
                    delay: 0.3,
                    repeat: Infinity,
                    repeatDelay: 1
                  }}
                />
                {/* Inner circle */}
                <div className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center shadow-2xl">
                  <CheckCircle2 className="w-20 h-20 text-white" strokeWidth={2.5} />
                </div>
              </motion.div>

              {/* Success Message */}
              <motion.div
                className="text-center px-6"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <motion.h2
                  className="text-4xl font-bold text-white mb-4"
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                >
                  Pickup Confirmed!
                </motion.h2>
                <motion.p
                  className="text-xl text-white/80"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6, duration: 0.5 }}
                >
                  You have successfully reached the pickup location
                </motion.p>
              </motion.div>

              {/* Animated particles/confetti effect */}
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 bg-green-400 rounded-full"
                  initial={{
                    x: 0,
                    y: 0,
                    opacity: 1,
                    scale: 1
                  }}
                  animate={{
                    x: (Math.random() - 0.5) * 400,
                    y: (Math.random() - 0.5) * 400,
                    opacity: 0,
                    scale: 0
                  }}
                  transition={{
                    duration: 1.5,
                    delay: 0.5 + i * 0.05,
                    ease: "easeOut"
                  }}
                  style={{
                    left: '50%',
                    top: '50%'
                  }}
                />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}


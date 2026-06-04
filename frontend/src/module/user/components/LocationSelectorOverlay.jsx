import { useState, useEffect, useRef } from "react"
import { ChevronLeft, Search, ChevronRight, Plus, MapPin, MoreHorizontal, Navigation, Home, Building2, Briefcase, Phone, X, Crosshair } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useLocation as useGeoLocation } from "../hooks/useLocation"
import { useProfile } from "../context/ProfileContext"
import { toast } from "sonner"
import { locationAPI, userAPI } from "@/lib/api"
import { Loader } from '@googlemaps/js-api-loader'
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const USER_LOCATION_STORAGE_KEY = "userLocation"
const USER_LOCATION_PREFERENCE_KEY = "userLocationPreference"
const USER_LOCATION_PREFERENCE_EVENT = "user-location-preference-changed"
const USER_LOCATION_UPDATED_EVENT = "user-location-updated"


// Google Maps implementation - Leaflet components removed

// Google Maps implementation - removed Leaflet components

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3 // Earth's radius in meters
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  const deltaLat = (lat2 - lat1) * Math.PI / 180
  const deltaLon = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

const stripIndiaSuffix = (value = "") => value.replace(/,\s*India\s*$/i, "").trim()

const isCoordinateLike = (value = "") => /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test((value || "").trim())

const addressPartCount = (value = "") =>
  stripIndiaSuffix(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean).length

const pickBestAddressText = (...candidates) => {
  let best = ""

  for (const candidate of candidates) {
    const normalized = stripIndiaSuffix(candidate || "")
    if (!normalized || normalized === "Select location" || isCoordinateLike(normalized)) continue

    if (!best) {
      best = normalized
      continue
    }

    const normalizedParts = addressPartCount(normalized)
    const bestParts = addressPartCount(best)
    if (normalizedParts > bestParts || (normalizedParts === bestParts && normalized.length > best.length)) {
      best = normalized
    }
  }

  return best
}

const extractStreetLine = (fullAddress = "", fallback = "") => {
  const normalizedAddress = stripIndiaSuffix(fullAddress || "")
  if (normalizedAddress && !isCoordinateLike(normalizedAddress)) {
    const parts = normalizedAddress
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)

    if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`
    if (parts.length === 1) return parts[0]
  }

  return stripIndiaSuffix(fallback || "")
}

const extractAddressComponents = (addressComponents = []) => {
  let city = ""
  let state = ""
  let area = ""
  let street = ""
  let streetNumber = ""
  let postalCode = ""
  let pointOfInterest = ""
  let premise = ""

  for (const component of addressComponents) {
    const types = component.types || []
    if (types.includes("point_of_interest") && !pointOfInterest) pointOfInterest = component.long_name
    if (types.includes("premise") && !premise) premise = component.long_name
    if (types.includes("street_number") && !streetNumber) streetNumber = component.long_name
    if (types.includes("route") && !street) street = component.long_name
    if (
      (types.includes("sublocality") ||
        types.includes("sublocality_level_1") ||
        types.includes("neighborhood")) &&
      !area
    ) {
      area = component.long_name
    }
    if (types.includes("locality") && !city) city = component.long_name
    if (types.includes("administrative_area_level_2") && !city) city = component.long_name
    if (types.includes("administrative_area_level_1") && !state) state = component.long_name
    if (types.includes("postal_code") && !postalCode) postalCode = component.long_name
  }

  const streetLine = [streetNumber, street].filter(Boolean).join(" ").trim()
  const bestStreet = streetLine || premise || pointOfInterest || area || city

  return {
    city,
    state,
    area,
    street: bestStreet,
    postalCode,
    pointOfInterest,
    premise,
  }
}

const buildAddressPayloadFromPlace = (place) => {
  const formattedAddress = stripIndiaSuffix(
    place?.formatted_address ||
    place?.name ||
    ""
  )
  const components = extractAddressComponents(place?.address_components || [])
  const fallbackLine = extractStreetLine(formattedAddress, components.street)

  return {
    formattedAddress,
    street: fallbackLine,
    city: components.city,
    state: components.state,
    zipCode: components.postalCode,
    additionalDetails: pickBestAddressText(
      formattedAddress,
      [
        components.street,
        components.area,
        components.city,
        components.state,
        components.postalCode,
      ].filter(Boolean).join(", ")
    ),
  }
}

// Get icon based on address type/label
const getAddressIcon = (address) => {
  const label = (address.label || address.additionalDetails || "").toLowerCase()
  if (label.includes("home")) return Home
  if (label.includes("work") || label.includes("office")) return Briefcase
  if (label.includes("building") || label.includes("apt")) return Building2
  return Home
}

const ADDRESS_TYPE_OPTIONS = [
  { value: "Home", label: "Home" },
  { value: "Office", label: "Office" },
  { value: "Other", label: "Others" },
]

const setUserLocationPreference = (preference) => {
  try {
    localStorage.setItem(USER_LOCATION_PREFERENCE_KEY, preference)
  } catch {}

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(USER_LOCATION_PREFERENCE_EVENT, {
        detail: { preference },
      })
    )
  }
}

const setStoredUserLocation = (locationData) => {
  try {
    localStorage.setItem(USER_LOCATION_STORAGE_KEY, JSON.stringify(locationData))
  } catch {}

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(USER_LOCATION_UPDATED_EVENT, {
        detail: { location: locationData },
      })
    )
  }
}

const getAddressCoordinates = (address) => {
  const coordinates = address?.location?.coordinates
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    const longitude = Number(coordinates[0])
    const latitude = Number(coordinates[1])
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude }
    }
  }

  const latitude = Number(address?.latitude ?? address?.lat ?? address?.location?.latitude)
  const longitude = Number(address?.longitude ?? address?.lng ?? address?.location?.longitude)
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { latitude, longitude }
  }

  return { latitude: null, longitude: null }
}

export default function LocationSelectorOverlay({ isOpen, onClose }) {
  const inputRef = useRef(null)
  const [searchValue, setSearchValue] = useState("")
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const { location, loading, requestLocation } = useGeoLocation()
  const { addresses = [], addAddress, updateAddress, setDefaultAddress, userProfile } = useProfile()
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [mapPosition, setMapPosition] = useState([22.7196, 75.8577]) // Default Indore coordinates [lat, lng]
  const [addressFormData, setAddressFormData] = useState({
    recipientName: "",
    street: "",
    city: "",
    state: "",
    zipCode: "",
    additionalDetails: "",
    label: "Home",
    phone: "",
  })
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const [searchingLocation, setSearchingLocation] = useState(false)
  const mapContainerRef = useRef(null)
  const googleMapRef = useRef(null) // Google Maps instance
  const greenMarkerRef = useRef(null) // Green marker for address selection
  const blueDotCircleRef = useRef(null) // Blue dot circle for Google Maps
  const userLocationMarkerRef = useRef(null) // Blue dot marker for user location
  const userLocationAccuracyCircleRef = useRef(null) // Accuracy circle for MapLibre/Mapbox
  const watchPositionIdRef = useRef(null) // Geolocation watchPosition ID
  const lastUserLocationRef = useRef(null) // Last user location for tracking
  const locationUpdateTimeoutRef = useRef(null) // Timeout for location updates
  const [currentAddress, setCurrentAddress] = useState("")
  const [GOOGLE_MAPS_API_KEY, setGOOGLE_MAPS_API_KEY] = useState(null)
  const ENABLE_GOOGLE_GEOCODING = import.meta.env.VITE_ENABLE_GOOGLE_GEOCODING === "true"
  const ENABLE_GOOGLE_PLACES = false
  const getAddressId = (address) => address?.id || address?._id || null

  // Load Google Maps API key from backend
  useEffect(() => {
    import('@/lib/utils/googleMapsApiKey.js').then(({ getGoogleMapsApiKey }) => {
      getGoogleMapsApiKey().then(key => {
        setGOOGLE_MAPS_API_KEY(key)
      })
    })
  }, [])
  const reverseGeocodeTimeoutRef = useRef(null) // Debounce timeout for reverse geocoding
  const lastReverseGeocodeCoordsRef = useRef(null) // Track last coordinates to avoid duplicate calls
  const activePinLookupIdRef = useRef(0) // Ignore stale reverse-geocode responses from older pin moves
  const searchCacheRef = useRef(new Map())
  const autocompleteCacheRef = useRef(new Map())
  const autocompleteServiceRef = useRef(null)
  const placesServiceRef = useRef(null)
  const searchDebounceTimeoutRef = useRef(null)
  const activeAutocompleteRequestRef = useRef(0)
  const searchSessionTokenRef = useRef(null)
  const lastSearchQueryRef = useRef("")
  const lastSearchAtRef = useRef(0)

  const beginPinLookup = () => {
    activePinLookupIdRef.current += 1
    return activePinLookupIdRef.current
  }

  const isLatestPinLookup = (lookupId) => activePinLookupIdRef.current === lookupId

  const prepareForFreshPinLookup = () => {
    if (reverseGeocodeTimeoutRef.current) {
      clearTimeout(reverseGeocodeTimeoutRef.current)
    }

    beginPinLookup()
    lastReverseGeocodeCoordsRef.current = null
    setLoadingAddress(true)
    setCurrentAddress("")
    setAddressFormData((prev) => ({
      ...prev,
      street: "",
      city: "",
      state: "",
      zipCode: "",
      additionalDetails: "",
    }))
  }

  const ensureSearchSessionToken = () => {
    if (!window.google?.maps?.places?.AutocompleteSessionToken) return null
    if (!searchSessionTokenRef.current) {
      searchSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
    }
    return searchSessionTokenRef.current
  }

  const resetSearchSessionToken = () => {
    searchSessionTokenRef.current = null
  }

  const getSearchCenter = () =>
    Array.isArray(mapPosition) &&
    Number.isFinite(mapPosition[0]) &&
    Number.isFinite(mapPosition[1])
      ? { lat: mapPosition[0], lng: mapPosition[1] }
      : location?.latitude && location?.longitude
        ? { lat: location.latitude, lng: location.longitude }
        : { lat: 22.7196, lng: 75.8577 }

  const updateLocationFromResolvedPlace = async ({
    lat,
    lng,
    formattedAddress,
    street,
    city,
    state,
    zipCode,
    additionalDetails,
  }) => {
    prepareForFreshPinLookup()
    setMapPosition([lat, lng])
    setShowAddressForm(true)
    setCurrentAddress(formattedAddress || additionalDetails || "")
    setLoadingAddress(false)
    setAddressFormData((prev) => ({
      ...prev,
      street: street || prev.street,
      city: city || prev.city,
      state: state || prev.state,
      zipCode: zipCode || prev.zipCode,
      additionalDetails: additionalDetails || formattedAddress || prev.additionalDetails,
      recipientName: prev.recipientName || userProfile?.name || "",
      phone: prev.phone || userProfile?.phone || "",
    }))

    if (googleMapRef.current) {
      googleMapRef.current.panTo({ lat, lng })
      googleMapRef.current.setZoom(17)
    }

    if (greenMarkerRef.current?.setPosition) {
      greenMarkerRef.current.setPosition({ lat, lng })
    }
  }

  // Debug: Log API key status (only first few characters for security)
  useEffect(() => {
    if (GOOGLE_MAPS_API_KEY) {
      debugLog("✅ Google Maps API Key loaded:", GOOGLE_MAPS_API_KEY.substring(0, 10) + "...")
    } else {
      debugWarn("⚠️ Google Maps API Key NOT found! Please set it in ENV Setup.")
    }
  }, [GOOGLE_MAPS_API_KEY])

  useEffect(() => {
    if (!showAddressForm) {
      setSearchSuggestions([])
      setShowSearchSuggestions(false)
      setActiveSuggestionIndex(-1)
      resetSearchSessionToken()
      if (searchDebounceTimeoutRef.current) {
        clearTimeout(searchDebounceTimeoutRef.current)
      }
      return
    }

    const query = (searchValue || "").trim()
    if (query.length < 3) {
      setSearchSuggestions([])
      setShowSearchSuggestions(false)
      setActiveSuggestionIndex(-1)
      return
    }

    if (!window.google?.maps?.places || !autocompleteServiceRef.current) {
      return
    }

    const normalizedQuery = query.toLowerCase()
    const cached = autocompleteCacheRef.current.get(normalizedQuery)
    if (cached) {
      setSearchSuggestions(cached)
      setShowSearchSuggestions(cached.length > 0)
      setActiveSuggestionIndex(-1)
      return
    }

    if (searchDebounceTimeoutRef.current) {
      clearTimeout(searchDebounceTimeoutRef.current)
    }

    const requestId = ++activeAutocompleteRequestRef.current
    searchDebounceTimeoutRef.current = setTimeout(() => {
      const searchCenter = getSearchCenter()
      const sessionToken = ensureSearchSessionToken()

      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: "in" },
          sessionToken: sessionToken || undefined,
          locationBias: {
            center: searchCenter,
            radius: 25000,
          },
        },
        (predictions, status) => {
          if (requestId !== activeAutocompleteRequestRef.current) return

          const isOk =
            status === window.google.maps.places.PlacesServiceStatus.OK
          const nextSuggestions = isOk ? (predictions || []).slice(0, 5) : []
          autocompleteCacheRef.current.set(normalizedQuery, nextSuggestions)
          if (autocompleteCacheRef.current.size > 50) {
            const oldestKey = autocompleteCacheRef.current.keys().next().value
            autocompleteCacheRef.current.delete(oldestKey)
          }

          setSearchSuggestions(nextSuggestions)
          setShowSearchSuggestions(nextSuggestions.length > 0)
          setActiveSuggestionIndex(-1)
        }
      )
    }, 220)

    return () => {
      if (searchDebounceTimeoutRef.current) {
        clearTimeout(searchDebounceTimeoutRef.current)
      }
    }
  }, [searchValue, showAddressForm, mapPosition, location?.latitude, location?.longitude])

  // Current location display - Show complete formatted address (SAVED ADDRESSES FORMAT)
  // Format should match saved addresses: "B2/4, Gandhi Park Colony, Anand Nagar, Indore, Madhya Pradesh, 452001"
  // Show ALL parts of formattedAddress (like saved addresses show all parts)
  const currentLocationText = (() => {
    // Priority 0: Use currentAddress from map (most up-to-date when user selects location on map)
    // This is updated when map moves or "Use current location" is clicked
    if (currentAddress &&
      currentAddress !== "Select location" &&
      !currentAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)) {
      return stripIndiaSuffix(currentAddress)
    }

    // Priority 1: Use addressFormData.additionalDetails (updated when map moves)
    // This contains the full formatted address from Google Maps Places API
    if (addressFormData.additionalDetails &&
      addressFormData.additionalDetails !== "Select location" &&
      addressFormData.additionalDetails.trim() !== "") {
      return stripIndiaSuffix(addressFormData.additionalDetails)
    }

    // Priority 2: Use formattedAddress from location hook (complete detailed address) - SAVED ADDRESSES FORMAT
    // Show full address with all parts (street, area, city, state, pincode) - just like saved addresses
    if (location?.formattedAddress &&
      location.formattedAddress !== "Select location" &&
      !location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)) {
      // Remove "India" from the end if present (saved addresses don't show country)
      return stripIndiaSuffix(location.formattedAddress)
    }

    // Priority 3: Build address from components (SAVED ADDRESSES FORMAT)
    // Format: "street/area, city, state, pincode" (matching saved addresses)
    if (location?.address || location?.area || location?.street) {
      const addressParts = []

      // Add street/address/area (like saved addresses' additionalDetails + street)
      if (location.address && location.address !== "Select location") {
        addressParts.push(location.address)
      } else if (location.area) {
        addressParts.push(location.area)
      } else if (location.street) {
        addressParts.push(location.street)
      }

      // Add city
      if (location.city) {
        addressParts.push(location.city)
      }

      // Add state
      if (location.state) {
        addressParts.push(location.state)
      }

      // Add pincode (like saved addresses show zipCode)
      if (location.postalCode) {
        addressParts.push(location.postalCode)
      }

      if (addressParts.length > 0) {
        return addressParts.join(', ')
      }
    }

    // Priority 3: Use area + city + state + pincode
    if (location?.area && location?.city && location?.state) {
      const parts = [location.area, location.city, location.state]
      if (location.postalCode) {
        parts.push(location.postalCode)
      }
      return parts.join(', ')
    }

    // Priority 4: Fallback to city + state + pincode
    if (location?.city && location?.state) {
      const parts = [location.city, location.state]
      if (location.postalCode) {
        parts.push(location.postalCode)
      }
      return parts.join(', ')
    }

    // Final fallback
    return location?.city || location?.area || "Detecting location..."
  })()

  useEffect(() => {
    const bestVisibleAddress = pickBestAddressText(
      currentAddress,
      addressFormData.additionalDetails
    )

    if (!bestVisibleAddress) return

    const existingAddress = stripIndiaSuffix(addressFormData.additionalDetails || "")
    const shouldUpgrade =
      !existingAddress ||
      addressPartCount(bestVisibleAddress) > addressPartCount(existingAddress) ||
      (addressPartCount(bestVisibleAddress) === addressPartCount(existingAddress) &&
        bestVisibleAddress.length > existingAddress.length)

    if (!shouldUpgrade) return

    setAddressFormData((prev) => {
      const prevNormalized = stripIndiaSuffix(prev.additionalDetails || "")
      if (prevNormalized === bestVisibleAddress) return prev
      return {
        ...prev,
        additionalDetails: bestVisibleAddress,
      }
    })
  }, [currentAddress, addressFormData.additionalDetails])

  // Global error suppression for Ola Maps SDK errors (runs on component mount)
  useEffect(() => {
    // Suppress console errors for non-critical Ola Maps SDK errors
    const originalConsoleError = console.error
    const errorSuppressor = (...args) => {
      const errorStr = args.join(' ')
      // Suppress AbortError and sprite file errors from Ola Maps SDK
      if (errorStr.includes('AbortError') ||
        errorStr.includes('user aborted') ||
        errorStr.includes('sprite@2x.json') ||
        errorStr.includes('3d_model') ||
        (errorStr.includes('Source layer') && errorStr.includes('does not exist')) ||
        (errorStr.includes('AJAXError') && errorStr.includes('sprite')) ||
        (errorStr.includes('AJAXError') && errorStr.includes('olamaps.io'))) {
        // Silently ignore these non-critical errors
        return
      }
      // Log other errors normally
      originalConsoleError.apply(console, args)
    }

    // Replace console.error globally
    console.error = errorSuppressor

    // Handle unhandled promise rejections
    const unhandledRejectionHandler = (event) => {
      const error = event.reason || event
      const errorMsg = error?.message || String(error) || ''
      const errorName = error?.name || ''
      const errorStack = error?.stack || ''

      // Suppress non-critical errors from Ola Maps SDK
      if (errorName === 'AbortError' ||
        errorMsg.includes('AbortError') ||
        errorMsg.includes('user aborted') ||
        errorMsg.includes('3d_model') ||
        (errorMsg.includes('Source layer') && errorMsg.includes('does not exist')) ||
        (errorMsg.includes('AJAXError') && (errorMsg.includes('sprite') || errorMsg.includes('olamaps.io'))) ||
        errorStack.includes('olamaps-web-sdk')) {
        event.preventDefault() // Prevent error from showing in console
        return
      }
    }

    window.addEventListener('unhandledrejection', unhandledRejectionHandler)

    // Cleanup
    return () => {
      // Restore original console.error
      console.error = originalConsoleError
      // Remove event listener
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler)
    }
  }, []) // Run once on mount

  // Initialize map position from current location and update blue dot
  useEffect(() => {
    if (location?.latitude && location?.longitude && googleMapRef.current && window.google && window.google.maps) {
      const userPos = {
        lat: location.latitude,
        lng: location.longitude
      }

      const accuracyRadius = Math.max(location.accuracy || 50, 20)

      debugLog("🔵 Updating blue dot from location hook:", {
        position: userPos,
        accuracy: location.accuracy,
        radius: accuracyRadius
      })

      // Update or create blue dot marker
      if (userLocationMarkerRef.current) {
        try {
          if (userLocationMarkerRef.current.setPosition) {
            userLocationMarkerRef.current.setPosition(userPos)
          }
          // Ensure marker is visible and on map
          const currentMap = userLocationMarkerRef.current.getMap()
          if (currentMap !== googleMapRef.current) {
            userLocationMarkerRef.current.setMap(googleMapRef.current)
          }
          userLocationMarkerRef.current.setVisible(true)
          debugLog("✅ Updated existing blue dot marker")
        } catch (e) {
          debugError("Error updating blue dot marker:", e)
          // Recreate if update fails
          userLocationMarkerRef.current = null
        }
      }

      if (!userLocationMarkerRef.current) {
        // Create blue dot marker if it doesn't exist
        try {
          const blueDotMarker = new window.google.maps.Marker({
            position: userPos,
            map: googleMapRef.current,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#4285F4",
              fillOpacity: 1,
              strokeColor: "#FFFFFF",
              strokeWeight: 3,
            },
            zIndex: window.google.maps.Marker.MAX_ZINDEX + 1,
            optimized: false,
            visible: true,
            title: "Your location"
          })
          userLocationMarkerRef.current = blueDotMarker
          debugLog("✅ Created blue dot marker from location hook")
        } catch (e) {
          debugError("Error creating blue dot marker:", e)
        }
      }

      // Update or create accuracy circle
      if (blueDotCircleRef.current) {
        try {
          blueDotCircleRef.current.setCenter(userPos)
          blueDotCircleRef.current.setRadius(accuracyRadius)
          // Ensure circle is visible and on map
          const currentMap = blueDotCircleRef.current.getMap()
          if (currentMap !== googleMapRef.current) {
            blueDotCircleRef.current.setMap(googleMapRef.current)
          }
          blueDotCircleRef.current.setVisible(true)
          debugLog("✅ Updated existing accuracy circle")
        } catch (e) {
          debugError("Error updating accuracy circle:", e)
          // Recreate if update fails
          blueDotCircleRef.current = null
        }
      }

      if (!blueDotCircleRef.current) {
        // Create accuracy circle if it doesn't exist
        try {
          const blueDot = new window.google.maps.Circle({
            strokeColor: "#4285F4",
            strokeOpacity: 0.4,
            strokeWeight: 1,
            fillColor: "#4285F4",
            fillOpacity: 0.15,
            map: googleMapRef.current,
            center: userPos,
            radius: accuracyRadius,
            zIndex: window.google.maps.Marker.MAX_ZINDEX,
            visible: true
          })
          blueDotCircleRef.current = blueDot
          debugLog("✅ Created accuracy circle from location hook")
        } catch (e) {
          debugError("Error creating accuracy circle:", e)
        }
      }

      // Final verification
      setTimeout(() => {
        const markerVisible = userLocationMarkerRef.current?.getVisible()
        const circleVisible = blueDotCircleRef.current?.getVisible()
        const markerOnMap = userLocationMarkerRef.current?.getMap() === googleMapRef.current
        const circleOnMap = blueDotCircleRef.current?.getMap() === googleMapRef.current

        debugLog("🔍 Final Blue Dot Status:", {
          markerExists: !!userLocationMarkerRef.current,
          circleExists: !!blueDotCircleRef.current,
          markerVisible,
          circleVisible,
          markerOnMap,
          circleOnMap
        })
      }, 500)
    }
  }, [
    location?.latitude || null,
    location?.longitude || null,
    location?.accuracy || null,
  ])

  // Initialize Google Maps with Loader (ZOMATO-STYLE)
  useEffect(() => {
    if (!showAddressForm || !mapContainerRef.current || !GOOGLE_MAPS_API_KEY) {
      return
    }

    let isMounted = true
    setMapLoading(true)

    const initializeGoogleMap = async () => {
      try {
        const loader = new Loader({
          apiKey: GOOGLE_MAPS_API_KEY,
          version: "weekly",
          libraries: ["places"],
        })

        const google = await loader.load()

        if (!isMounted || !mapContainerRef.current) return

        // Initial location (Indore center or current location)
        const initialLocation =
          Array.isArray(mapPosition) &&
          Number.isFinite(mapPosition[0]) &&
          Number.isFinite(mapPosition[1])
            ? { lat: mapPosition[0], lng: mapPosition[1] }
            : location?.latitude && location?.longitude
              ? { lat: location.latitude, lng: location.longitude }
              : { lat: 22.7196, lng: 75.8577 }

        // Create map
        const map = new google.maps.Map(mapContainerRef.current, {
          center: initialLocation,
          zoom: 15,
          disableDefaultUI: true, // Zomato-style clean look
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        })

        googleMapRef.current = map
        if (google.maps.places?.AutocompleteService) {
          autocompleteServiceRef.current = new google.maps.places.AutocompleteService()
          placesServiceRef.current = new google.maps.places.PlacesService(map)
        }

        // Create Green Marker (draggable for address selection)
        const greenMarker = new google.maps.Marker({
          position: initialLocation,
          map: map,
          icon: {
            url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 40)
          },
          draggable: true,
          title: "Drag to select location"
        })

        greenMarkerRef.current = greenMarker

        google.maps.event.addListener(greenMarker, 'dragstart', function () {
          prepareForFreshPinLookup()
        })

        // Handle marker drag - update address
        google.maps.event.addListener(greenMarker, 'dragend', function () {
          const newPos = greenMarker.getPosition()
          const newLat = newPos.lat()
          const newLng = newPos.lng()
          prepareForFreshPinLookup()
          setMapPosition([newLat, newLng])
          handleMapMoveEnd(newLat, newLng)
        })

        // Function to create/update blue dot and accuracy circle
        const createBlueDotWithCircle = (position, accuracyValue) => {
          if (!isMounted || !map) return

          const userPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }

          const accuracyRadius = Math.max(accuracyValue || 50, 20) // Minimum 20m

          debugLog("🔵 Creating/updating blue dot:", {
            position: userPos,
            accuracy: accuracyValue,
            radius: accuracyRadius
          })

          // Remove existing blue dot and circle if any
          if (userLocationMarkerRef.current) {
            try {
              userLocationMarkerRef.current.setMap(null)
            } catch (e) {
              debugWarn("Error removing old marker:", e)
            }
          }
          if (blueDotCircleRef.current) {
            try {
              blueDotCircleRef.current.setMap(null)
            } catch (e) {
              debugWarn("Error removing old circle:", e)
            }
          }

          // Create Blue Dot Marker (Google Maps native style)
          const blueDotMarker = new google.maps.Marker({
            position: userPos,
            map: map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10, // Blue dot size
              fillColor: "#4285F4", // Google blue
              fillOpacity: 1,
              strokeColor: "#FFFFFF", // White border
              strokeWeight: 3,
            },
            zIndex: google.maps.Marker.MAX_ZINDEX + 1,
            optimized: false,
            visible: true,
            title: "Your location"
          })

          // Create Accuracy Circle (Light blue zone around blue dot)
          const accuracyCircle = new google.maps.Circle({
            strokeColor: "#4285F4",
            strokeOpacity: 0.4,
            strokeWeight: 1,
            fillColor: "#4285F4",
            fillOpacity: 0.15, // Light transparent blue
            map: map,
            center: userPos,
            radius: accuracyRadius, // Meters
            zIndex: google.maps.Marker.MAX_ZINDEX,
            visible: true
          })

          blueDotCircleRef.current = accuracyCircle
          userLocationMarkerRef.current = blueDotMarker

          debugLog("✅✅✅ Blue dot and accuracy circle created successfully:", {
            marker: blueDotMarker,
            circle: accuracyCircle,
            radius: accuracyRadius,
            markerOnMap: blueDotMarker.getMap() === map,
            circleOnMap: accuracyCircle.getMap() === map
          })

          // Force visibility check (silent fix - no error logging)
          setTimeout(() => {
            if (!isMounted || !map) return

            const markerVisible = userLocationMarkerRef.current?.getVisible()
            const circleVisible = blueDotCircleRef.current?.getVisible()
            const markerOnMap = userLocationMarkerRef.current?.getMap() === map
            const circleOnMap = blueDotCircleRef.current?.getMap() === map

            // Silently fix marker visibility if needed
            if (userLocationMarkerRef.current && (!markerOnMap || !markerVisible)) {
              try {
                userLocationMarkerRef.current.setMap(map)
                userLocationMarkerRef.current.setVisible(true)
                debugLog("✅ Blue dot marker visibility fixed")
              } catch (e) {
                // Silently handle - marker might not be ready yet
              }
            }

            // Silently fix circle visibility if needed
            if (blueDotCircleRef.current && (!circleOnMap || !circleVisible)) {
              try {
                blueDotCircleRef.current.setMap(map)
                blueDotCircleRef.current.setVisible(true)
                debugLog("✅ Accuracy circle visibility fixed")
              } catch (e) {
                // Silently handle - circle might not be ready yet
              }
            }
          }, 1000)
        }

        // Wait for map to be fully ready before getting location
        google.maps.event.addListenerOnce(map, 'idle', () => {
          debugLog("🗺️ Map is ready, requesting user location...")

          // Get user's current location and show Blue Dot
          if (navigator.geolocation) {
            // First, get current position immediately
            navigator.geolocation.getCurrentPosition(
              (position) => {
                if (!isMounted) return
                createBlueDotWithCircle(position, position.coords.accuracy)
                handleMapMoveEnd(initialLocation.lat, initialLocation.lng)
              },
              (error) => {
                debugWarn("Geolocation getCurrentPosition error:", error)
                handleMapMoveEnd(initialLocation.lat, initialLocation.lng)
              },
              {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
              }
            )

            // Then, watch for position updates (live tracking)
            const watchId = navigator.geolocation.watchPosition(
              (position) => {
                if (!isMounted) return
                debugLog("📍 Live location update:", {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                  accuracy: position.coords.accuracy
                })
                createBlueDotWithCircle(position, position.coords.accuracy)
              },
              (error) => {
                // Suppress timeout errors - they're non-critical
                if (error.code !== 3) {
                  debugWarn("Geolocation watchPosition error:", error)
                }
              },
              {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000 // Allow 5 second old cached location
              }
            )

            // Store watch ID for cleanup
            watchPositionIdRef.current = watchId
          } else {
            debugWarn("Geolocation not supported")
            handleMapMoveEnd(initialLocation.lat, initialLocation.lng)
          }
        })

        setMapLoading(false)
      } catch (error) {
        debugError("Error initializing Google Maps:", error)
        setMapLoading(false)
        toast.error("Failed to load map. Please refresh the page.")
      }
    }

    initializeGoogleMap()

    return () => {
      isMounted = false
      // Cleanup geolocation watch
      if (watchPositionIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchPositionIdRef.current)
        watchPositionIdRef.current = null
      }
      // Cleanup markers
      if (greenMarkerRef.current) {
        greenMarkerRef.current.setMap(null)
      }
      if (userLocationMarkerRef.current) {
        try {
          userLocationMarkerRef.current.setMap(null)
        } catch (e) {
          debugWarn("Error cleaning up blue dot marker:", e)
        }
      }
      if (blueDotCircleRef.current) {
        try {
          blueDotCircleRef.current.setMap(null)
        } catch (e) {
          debugWarn("Error cleaning up accuracy circle:", e)
        }
      }
    }
  }, [showAddressForm, GOOGLE_MAPS_API_KEY])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      document.body.style.overflow = "hidden"
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = "unset"
    }
  }, [isOpen, onClose])

  const handleUseCurrentLocation = async () => {
    try {
      setUserLocationPreference("live")

      // Check if geolocation is supported
      if (!navigator.geolocation) {
        toast.error("Location services are not supported in your browser", {
          duration: 3000,
        })
        return
      }

      // Show loading toast
      toast.loading("Fetching your current location...", {
        id: "location-request",
      })

      // Request location - this will automatically prompt for permission if needed
      // Clear any cached location first to ensure fresh coordinates
      debugLog("🔄 Requesting fresh location (clearing cache and forcing fresh GPS)...")

      // Increase timeout to 15 seconds to allow GPS to get accurate fix
      // The getLocation function already has a 15-second timeout, so we match it
      const locationPromise = requestLocation()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Location request is taking longer than expected. Please check your GPS settings.")), 15000)
      )

      let locationData
      try {
        locationData = await Promise.race([locationPromise, timeoutPromise])

        // Check if we got valid location data
        if (!locationData || (!locationData.latitude || !locationData.longitude)) {
          throw new Error("Invalid location data received")
        }
      } catch (raceError) {
        debugWarn("⚠️ Location request failed or timed out:", raceError.message)

        // If timeout or error, try to use cached location as fallback
        const stored = localStorage.getItem(USER_LOCATION_STORAGE_KEY)
        if (stored) {
          try {
            const cachedLocation = JSON.parse(stored)
            if (cachedLocation?.latitude && cachedLocation?.longitude) {
              debugLog("📍 Using cached location as fallback:", cachedLocation)
              locationData = cachedLocation

              // Show info toast that we're using cached location
              toast.info("Using your last known location", {
                id: "location-request",
                duration: 2000,
              })
            } else {
              throw new Error("Invalid cached location")
            }
          } catch (cacheErr) {
            debugError("❌ Failed to parse cached location:", cacheErr)
            // Determine specific error message
            let errorMessage = "Could not get location. Please try again."
            if (raceError.message.includes("permission") || raceError.message.includes("denied")) {
              errorMessage = "Location permission denied. Please enable location access in your browser settings."
            } else if (raceError.message.includes("timeout") || raceError.message.includes("longer")) {
              errorMessage = "Location request timed out. Please check your GPS settings and try again."
            } else if (raceError.message.includes("unavailable")) {
              errorMessage = "Location information is unavailable. Please check your device settings."
            }

            toast.error(errorMessage, {
              id: "location-request",
              duration: 5000,
            })
            return
          }
        } else {
          // No cached location available
          let errorMessage = "Could not get location. Please try again."
          if (raceError.message.includes("permission") || raceError.message.includes("denied")) {
            errorMessage = "Location permission denied. Please enable location access in your browser settings."
          } else if (raceError.message.includes("timeout") || raceError.message.includes("longer")) {
            errorMessage = "Location request timed out. Please check your GPS settings and try again."
          } else if (raceError.message.includes("unavailable")) {
            errorMessage = "Location information is unavailable. Please check your device settings."
          }

          toast.error(errorMessage, {
            id: "location-request",
            duration: 5000,
          })
          return
        }
      }

      // Validate location data
      if (!locationData) {
        toast.error("Could not get location. Please try again.", { id: "location-request" })
        return
      }

      if (!locationData.latitude || !locationData.longitude) {
        toast.error("Invalid location data received. Please try again.", { id: "location-request" })
        return
      }

      debugLog("✅ Fresh location received:", {
        formattedAddress: locationData?.formattedAddress,
        address: locationData?.address,
        city: locationData?.city,
        state: locationData?.state,
        area: locationData?.area,
        coordinates: locationData?.latitude && locationData?.longitude ?
          `${locationData.latitude.toFixed(8)}, ${locationData.longitude.toFixed(8)}` : "N/A",
        hasCompleteAddress: locationData?.formattedAddress &&
          locationData.formattedAddress.split(',').length >= 4
      })

      // Verify we got complete address (but don't fail if incomplete - still use the location)
      if (!locationData?.formattedAddress ||
        locationData.formattedAddress === "Select location" ||
        locationData.formattedAddress.split(',').length < 4) {
        debugWarn("⚠️ Location received but address is incomplete. Will try to get better address from map...")
        // Don't retry immediately - let the map handle address fetching
        // The address will be fetched when map moves to the location
      }

      // CRITICAL: Ensure location state is updated in the hook
      // The requestLocation function already updates the state, but we verify here
      debugLog("✅✅✅ Final location data to be saved:", {
        formattedAddress: locationData?.formattedAddress,
        address: locationData?.address,
        mainTitle: locationData?.mainTitle,
        hasCompleteAddress: locationData?.formattedAddress &&
          locationData.formattedAddress.split(',').length >= 4
      })

      // Save location to backend with ALL fields
      if (locationData?.latitude && locationData?.longitude) {
        try {
          await userAPI.updateLocation({
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            address: locationData.address || locationData.formattedAddress || "",
            city: locationData.city || "",
            state: locationData.state || "",
            area: locationData.area || "",
            formattedAddress: locationData.formattedAddress || locationData.address || "",
            accuracy: locationData.accuracy,
            postalCode: locationData.postalCode,
            street: locationData.street,
            streetNumber: locationData.streetNumber
          })
          debugLog("✅ Location saved to backend successfully")
        } catch (backendError) {
          // Only log non-network errors (network errors are handled by axios interceptor)
          if (backendError.code !== 'ERR_NETWORK' && backendError.message !== 'Network Error') {
            debugError("Error saving location to backend:", backendError)
          }
          // Don't fail the whole operation if backend save fails
        }
      }

      // Update map position - don't automatically show address form
      // User can manually open address form if needed
      if (locationData?.latitude && locationData?.longitude) {
        setMapPosition([locationData.latitude, locationData.longitude])
        // Don't automatically show address form - keep user on same page
        // setShowAddressForm(true)

        // Update address form data with complete address (for when user opens form)
        if (locationData.formattedAddress) {
          const preferredAddress = pickBestAddressText(
            locationData.formattedAddress,
            [
              locationData.address,
              locationData.area,
              locationData.city,
              locationData.state,
              locationData.postalCode,
            ].filter(Boolean).join(", ")
          )
          setCurrentAddress(preferredAddress || locationData.formattedAddress)
          setAddressFormData(prev => ({
            ...prev,
            street: extractStreetLine(
              preferredAddress || locationData.formattedAddress,
              locationData.street || locationData.area || prev.street
            ),
            city: locationData.city || prev.city,
            state: locationData.state || prev.state,
            zipCode: locationData.postalCode || prev.zipCode,
            additionalDetails: preferredAddress || prev.additionalDetails,
          }))
        }

        // Update map if it's initialized
        if (googleMapRef.current && window.google && window.google.maps) {
          try {
            googleMapRef.current.panTo({ lat: locationData.latitude, lng: locationData.longitude })
            googleMapRef.current.setZoom(17)

            if (greenMarkerRef.current) {
              greenMarkerRef.current.setPosition({ lat: locationData.latitude, lng: locationData.longitude })
            }

            // Fetch detailed address using Places API
            setTimeout(async () => {
              await handleMapMoveEnd(locationData.latitude, locationData.longitude)
            }, 500)
          } catch (mapError) {
            debugError("Error updating map:", mapError)
          }
        } else {
          // Map not initialized, fetch address directly
          setTimeout(async () => {
            await handleMapMoveEnd(locationData.latitude, locationData.longitude)
          }, 300)
        }
      }

      // Zomato-style flow: move to address form, let user confirm flat/house and save.
      setShowAddressForm(true)
      setAddressFormData((prev) => ({
        ...prev,
        street: extractStreetLine(
          pickBestAddressText(
            locationData.formattedAddress,
            [
              locationData.address,
              locationData.area,
              locationData.city,
              locationData.state,
              locationData.postalCode,
            ].filter(Boolean).join(", "),
            prev.additionalDetails
          ),
          locationData.street || locationData.area || prev.street
        ),
        city: locationData.city || prev.city,
        state: locationData.state || prev.state,
        zipCode: locationData.postalCode || prev.zipCode,
        additionalDetails: pickBestAddressText(
          locationData.formattedAddress,
          [
            locationData.address,
            locationData.area,
            locationData.city,
            locationData.state,
            locationData.postalCode,
          ].filter(Boolean).join(", "),
          prev.additionalDetails
        ) || prev.additionalDetails,
        recipientName: prev.recipientName || userProfile?.name || "",
        phone: prev.phone || userProfile?.phone || "",
      }))

      const addressPreview = locationData?.formattedAddress || locationData?.address || "Location updated"
      toast.success(`Location ready: ${addressPreview.split(',').slice(0, 2).join(', ')}`, {
        id: "location-request",
        duration: 2400,
      })
    } catch (error) {
      // Handle permission denied or other errors
      if (error.code === 1 || error.message?.includes("denied") || error.message?.includes("permission")) {
        toast.error("Location permission denied. Please enable location access in your browser settings.", {
          id: "location-request",
          duration: 4000,
        })
      } else if (error.code === 2 || error.message?.includes("unavailable")) {
        toast.error("Location unavailable. Please check your GPS settings.", {
          id: "location-request",
          duration: 3000,
        })
      } else if (error.code === 3 || error.message?.includes("timeout")) {
        toast.error("Location request timed out. Please try again.", {
          id: "location-request",
          duration: 3000,
        })
      } else {
        toast.error("Failed to get location. Please try again.", {
          id: "location-request",
          duration: 3000,
        })
      }
      // Don't close the selector if there's an error, so user can try other options
    }
  }

  const handleAddAddress = () => {
    setShowAddressForm(true)
    // Initialize form with current location data
    if (location?.latitude && location?.longitude) {
      setMapPosition([location.latitude, location.longitude])
      setAddressFormData(prev => ({
        ...prev,
        city: location.city || "",
        state: location.state || "",
        street: extractStreetLine(
          pickBestAddressText(
            location.formattedAddress,
            [
              location.address,
              location.area,
              location.city,
              location.state,
              location.postalCode,
            ].filter(Boolean).join(", "),
            prev.additionalDetails
          ),
          location.address || location.area || ""
        ),
        additionalDetails: pickBestAddressText(
          location.formattedAddress,
          [
            location.address,
            location.area,
            location.city,
            location.state,
            location.postalCode,
          ].filter(Boolean).join(", "),
          prev.additionalDetails
        ) || prev.additionalDetails,
        recipientName: userProfile?.name || "",
        phone: userProfile?.phone || "",
      }))
    }
  }

  const handleAddressFormChange = (e) => {
    setAddressFormData({
      ...addressFormData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSearchInputChange = (event) => {
    setSearchValue(event.target.value)
    setShowSearchSuggestions(true)
    setActiveSuggestionIndex(-1)
  }

  const handleSelectSearchSuggestion = async (suggestion) => {
    if (!suggestion?.place_id) return
    if (!placesServiceRef.current || !window.google?.maps?.places) {
      await handleSearchLocation(suggestion.description || searchValue)
      return
    }

    setSearchingLocation(true)
    setSearchValue(suggestion.description || searchValue)
    setShowSearchSuggestions(false)
    setSearchSuggestions([])

    try {
      const sessionToken = ensureSearchSessionToken()

      const placeDetails = await new Promise((resolve, reject) => {
        placesServiceRef.current.getDetails(
          {
            placeId: suggestion.place_id,
            fields: ["geometry", "formatted_address", "address_components", "name"],
            sessionToken: sessionToken || undefined,
          },
          (place, status) => {
            if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
              resolve(place)
              return
            }
            reject(new Error(`Place details failed: ${status}`))
          }
        )
      })

      const placeLocation = placeDetails?.geometry?.location
      if (!placeLocation) {
        throw new Error("Selected place has no coordinates")
      }

      const lat = placeLocation.lat()
      const lng = placeLocation.lng()
      const parsedPlace = buildAddressPayloadFromPlace(placeDetails)

      searchCacheRef.current.set((suggestion.description || searchValue).trim().toLowerCase(), {
        lat,
        lng,
        formattedAddress: parsedPlace.formattedAddress || suggestion.description || searchValue,
      })

      await updateLocationFromResolvedPlace({
        lat,
        lng,
        ...parsedPlace,
      })

      resetSearchSessionToken()
      toast.success(`Location found: ${stripIndiaSuffix(parsedPlace.formattedAddress || suggestion.description || searchValue)}`)
    } catch (error) {
      debugError("Error selecting search suggestion:", error)
      resetSearchSessionToken()
      await handleSearchLocation(suggestion.description || searchValue)
    } finally {
      setSearchingLocation(false)
    }
  }

  const handleSearchLocation = async (incomingQuery) => {
    const query = ((incomingQuery ?? searchValue) || "").trim()
    const normalizedQuery = query.toLowerCase()

    if (query.length < 3) {
      toast.error("Type at least 3 letters to search.")
      return
    }

    if (!window.google?.maps?.Geocoder) {
      toast.error("Map search is not ready yet. Please try again in a moment.")
      return
    }

    const now = Date.now()
    if (
      lastSearchQueryRef.current === normalizedQuery &&
      now - lastSearchAtRef.current < 1500
    ) {
      return
    }

    const cachedResult = searchCacheRef.current.get(normalizedQuery)
    if (cachedResult) {
      const { lat, lng, formattedAddress } = cachedResult
      setShowSearchSuggestions(false)
      setSearchSuggestions([])
      await updateLocationFromResolvedPlace({
        lat,
        lng,
        formattedAddress: stripIndiaSuffix(formattedAddress || query),
        street: extractStreetLine(formattedAddress || query, ""),
        city: addressFormData.city || location?.city || "",
        state: addressFormData.state || location?.state || "",
        zipCode: addressFormData.zipCode || location?.postalCode || "",
        additionalDetails: stripIndiaSuffix(formattedAddress || query),
      })
      toast.success(`Location found: ${stripIndiaSuffix(formattedAddress || query)}`)
      return
    }

    lastSearchQueryRef.current = normalizedQuery
    lastSearchAtRef.current = now
    setSearchingLocation(true)
    setShowSearchSuggestions(false)
    setSearchSuggestions([])

    try {
      const geocoder = new window.google.maps.Geocoder()
      const searchCenter = getSearchCenter()

      const biasBounds = {
        north: searchCenter.lat + 0.18,
        south: searchCenter.lat - 0.18,
        east: searchCenter.lng + 0.18,
        west: searchCenter.lng - 0.18,
      }

      const localCity =
        addressFormData.city ||
        location?.city ||
        "Indore"
      const localState =
        addressFormData.state ||
        location?.state ||
        "Madhya Pradesh"
      const hasExplicitLocationHint =
        /,/.test(query) ||
        /\b(india|madhya pradesh|indore|bhopal)\b/i.test(query)

      const geocodeRequests = [
        {
          address: query,
          componentRestrictions: { country: "IN" },
        },
        {
          address: query,
          componentRestrictions: { country: "IN" },
          bounds: biasBounds,
        },
      ]

      if (!hasExplicitLocationHint) {
        geocodeRequests.push({
          address: `${query}, ${localCity}, ${localState}, India`,
          componentRestrictions: { country: "IN" },
          bounds: biasBounds,
        })
      }

      let bestResult = null

      for (const request of geocodeRequests) {
        const geocodeResult = await geocoder.geocode(request)
        const results = geocodeResult?.results || []
        if (results.length > 0) {
          bestResult = results[0]
          break
        }
      }

      const placeLocation = bestResult?.geometry?.location

      if (!bestResult || !placeLocation) {
        toast.error("No matching location found. Try a fuller area or landmark name.")
        return
      }

      const lat = placeLocation.lat()
      const lng = placeLocation.lng()
      const parsedPlace = buildAddressPayloadFromPlace(bestResult)

      searchCacheRef.current.set(normalizedQuery, {
        lat,
        lng,
        formattedAddress: parsedPlace.formattedAddress || bestResult.formatted_address || query,
      })
      if (searchCacheRef.current.size > 20) {
        const oldestKey = searchCacheRef.current.keys().next().value
        searchCacheRef.current.delete(oldestKey)
      }

      await updateLocationFromResolvedPlace({
        lat,
        lng,
        ...parsedPlace,
      })

      resetSearchSessionToken()
      toast.success(`Location found: ${stripIndiaSuffix(parsedPlace.formattedAddress || bestResult.formatted_address || query)}`)
    } catch (error) {
      debugError("Error searching location:", error)
      toast.error("Location search failed. Please try another area or landmark.")
    } finally {
      setSearchingLocation(false)
    }
  }

  const handleSearchInputKeyDown = async (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (!searchSuggestions.length) return
      setShowSearchSuggestions(true)
      setActiveSuggestionIndex((prev) =>
        prev < searchSuggestions.length - 1 ? prev + 1 : 0
      )
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      if (!searchSuggestions.length) return
      setActiveSuggestionIndex((prev) =>
        prev > 0 ? prev - 1 : searchSuggestions.length - 1
      )
      return
    }

    if (event.key === "Escape") {
      setShowSearchSuggestions(false)
      return
    }

    if (event.key !== "Enter") return

    event.preventDefault()

    if (
      showSearchSuggestions &&
      activeSuggestionIndex >= 0 &&
      searchSuggestions[activeSuggestionIndex]
    ) {
      await handleSelectSearchSuggestion(searchSuggestions[activeSuggestionIndex])
      return
    }

    await handleSearchLocation()
  }

  // Google Maps loading is handled by the Loader in the initialization useEffect above

  // OLD OLA MAPS INITIALIZATION - REMOVED (Replaced with Google Maps Loader above)
  // All old Ola Maps/Leaflet code has been removed and replaced with Google Maps Loader implementation

  // Removed old useEffect that initialized Ola Maps - now using Google Maps Loader above
  // All old Ola Maps initialization code has been removed

  // Resize Google Map when container dimensions change
  useEffect(() => {
    if (googleMapRef.current && showAddressForm) {
      const resizeMap = () => {
        try {
          if (googleMapRef.current && typeof window.google !== 'undefined' && window.google.maps) {
            window.google.maps.event.trigger(googleMapRef.current, 'resize');
            debugLog("✅ Google Map resized (container change)");
          }
        } catch (error) {
          debugWarn("⚠️ Error resizing map:", error);
        }
      };

      const timer = setTimeout(() => {
        resizeMap();
      }, 300);

      window.addEventListener('resize', resizeMap);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', resizeMap);
      }
    }
  }, [showAddressForm])

  // Track user's live location with blue dot indicator
  const trackUserLocation = (mapInstance, sdkInstance) => {
    if (!navigator.geolocation) {
      debugWarn("⚠️ Geolocation is not supported by this browser")
      return
    }

    debugLog("🔵🔵🔵 STARTING USER LOCATION TRACKING...")
    debugLog("🔵 Map instance:", mapInstance)
    debugLog("🔵 SDK instance:", sdkInstance)
    debugLog("🔵 SDK instance type:", typeof sdkInstance)
    debugLog("🔵 SDK instance keys:", sdkInstance ? Object.keys(sdkInstance).slice(0, 20) : 'null')
    debugLog("🔵 Has addMarker:", !!(sdkInstance && sdkInstance.addMarker))
    debugLog("🔵 Has Marker:", !!(sdkInstance && sdkInstance.Marker))

    // Clear any existing watchPosition
    if (watchPositionIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchPositionIdRef.current)
      watchPositionIdRef.current = null
    }

    // Helper function to calculate distance between two coordinates (in meters)
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371e3 // Earth's radius in meters
      const lat1Rad = lat1 * Math.PI / 180
      const lat2Rad = lat2 * Math.PI / 180
      const deltaLat = (lat2 - lat1) * Math.PI / 180
      const deltaLon = (lon2 - lon1) * Math.PI / 180

      const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) *
        Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

      return R * c // Distance in meters
    }

    // Helper function to create/update marker (with throttling)
    const createOrUpdateMarker = (latitude, longitude, heading, accuracy = null) => {
      // Check if location changed significantly (at least 10 meters)
      if (lastUserLocationRef.current) {
        const distance = calculateDistance(
          lastUserLocationRef.current.latitude,
          lastUserLocationRef.current.longitude,
          latitude,
          longitude
        )

        // If distance is less than 10 meters, skip update (unless it's the first time)
        if (distance < 10) {
          // Only log occasionally to avoid console spam
          if (Math.random() < 0.1) { // Log 10% of skipped updates
            debugLog(`⏭️ Skipping location update - only moved ${distance.toFixed(2)}m (threshold: 10m)`)
          }
          return
        }

        debugLog(`📍 Location changed by ${distance.toFixed(2)}m - updating marker`)
      }

      // Update last location
      lastUserLocationRef.current = { latitude, longitude, heading }

      // 1. Custom Blue Dot Element Banana
      let el = null
      if (userLocationMarkerRef.current) {
        // If marker exists, get its element
        el = userLocationMarkerRef.current.getElement?.() ||
          userLocationMarkerRef.current._element ||
          document.querySelector('.user-location-marker')
      }

      if (!el) {
        el = document.createElement('div')
        el.className = 'user-location-marker'
        // Ensure element is visible with inline styles (same pattern as green pin)
        el.style.cssText = `
          width: 20px;
          height: 20px;
          background-color: #4285F4;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(0,0,0,0.3);
          position: relative;
          z-index: 1001;
          display: block;
          visibility: visible;
          opacity: 1;
          cursor: default;
        `
        debugLog("✅ Created blue dot element with styles")
      } else {
        // Ensure existing element styles are correct
        el.style.display = 'block'
        el.style.visibility = 'visible'
        el.style.opacity = '1'
        el.style.zIndex = '1001'
      }

      // 2. Update accuracy circle if it exists
      if (userLocationAccuracyCircleRef.current) {
        try {
          if (userLocationAccuracyCircleRef.current.update) {
            userLocationAccuracyCircleRef.current.update(latitude, longitude, accuracy)
            debugLog("✅ Updated accuracy circle position and radius")
          }
        } catch (circleError) {
          debugWarn("⚠️ Error updating accuracy circle:", circleError.message)
        }
      }

      // 3. Agar marker pehle se hai to update karein, nahi to naya banayein
      if (userLocationMarkerRef.current) {
        try {
          if (userLocationMarkerRef.current.setLngLat) {
            userLocationMarkerRef.current.setLngLat([longitude, latitude])
            debugLog("✅ Updated existing marker position")
          } else if (userLocationMarkerRef.current.setPosition) {
            userLocationMarkerRef.current.setPosition([longitude, latitude])
            debugLog("✅ Updated existing marker position (setPosition)")
          } else {
            debugWarn("⚠️ Marker exists but no update method found")
          }
        } catch (error) {
          debugError("❌ Error updating user location marker:", error)
        }
      } else {
        try {
          // Try different marker creation methods - EXACT SAME PATTERN AS GREEN PIN
          let newMarker = null

          debugLog("🔵 Creating blue dot marker with:", {
            hasSdkInstance: !!sdkInstance,
            hasMapInstance: !!mapInstance,
            sdkAddMarker: !!(sdkInstance && sdkInstance.addMarker),
            sdkMarker: !!(sdkInstance && sdkInstance.Marker),
            element: !!el
          })

          // Method 1: Try SDK's addMarker method (EXACT SAME AS GREEN PIN)
          if (sdkInstance && sdkInstance.addMarker) {
            debugLog("🔵 Method 1: Using sdkInstance.addMarker (same as green pin)")
            try {
              newMarker = sdkInstance.addMarker({
                element: el,
                anchor: 'center',
                draggable: false
              }).setLngLat([longitude, latitude]).addTo(mapInstance)
              debugLog("✅✅✅ Blue dot created using addMarker method:", newMarker)
            } catch (err) {
              debugError("❌ Error in addMarker:", err)
            }
          }
          // Method 2: Try SDK's Marker class (EXACT SAME AS GREEN PIN)
          else if (sdkInstance && sdkInstance.Marker) {
            debugLog("🔵 Method 2: Using sdkInstance.Marker (same as green pin)")
            try {
              newMarker = new sdkInstance.Marker({
                element: el,
                anchor: 'center',
                draggable: false
              }).setLngLat([longitude, latitude]).addTo(mapInstance)
              debugLog("✅✅✅ Blue dot created using Marker class:", newMarker)
            } catch (err) {
              debugError("❌ Error in Marker constructor:", err)
            }
          }
          // Method 3: Try using MapLibre Marker (fallback - same as green pin)
          else if (window.maplibregl && window.maplibregl.Marker) {
            debugLog("🔵 Method 3: Using maplibregl.Marker (fallback)")
            try {
              newMarker = new window.maplibregl.Marker({
                element: el,
                anchor: 'center'
              }).setLngLat([longitude, latitude]).addTo(mapInstance)
              debugLog("✅ Blue dot created using maplibregl.Marker")
            } catch (err) {
              debugError("❌ Error in maplibregl.Marker:", err)
            }
          }
          else {
            debugError("❌❌❌ NO MARKER API FOUND for blue dot. Available:", {
              sdkInstance: !!sdkInstance,
              sdkAddMarker: !!(sdkInstance && sdkInstance.addMarker),
              sdkMarker: !!(sdkInstance && sdkInstance.Marker),
              maplibregl: !!window.maplibregl,
              mapInstance: !!mapInstance,
              elementCreated: !!el
            })
          }

          if (newMarker) {
            userLocationMarkerRef.current = newMarker
            debugLog("✅ User location marker (blue dot) added successfully:", newMarker)

            // Verify blue dot is visible (same pattern as green pin)
            setTimeout(() => {
              const markerEl = newMarker.getElement?.() || newMarker._element
              if (markerEl) {
                debugLog("✅ Blue dot element found on map:", markerEl)
                // Ensure element is visible (same as green pin)
                markerEl.style.display = 'block'
                markerEl.style.visibility = 'visible'
                markerEl.style.opacity = '1'
                markerEl.style.zIndex = '1001'
                debugLog("✅ Blue dot visibility ensured")

                // Also check the inner element (the actual blue dot div)
                const innerEl = markerEl.querySelector('.user-location-marker') || markerEl
                if (innerEl) {
                  innerEl.style.display = 'block'
                  innerEl.style.visibility = 'visible'
                  innerEl.style.opacity = '1'
                  debugLog("✅ Blue dot inner element styles ensured")
                }
              } else {
                debugWarn("⚠️ Blue dot element not found in DOM")
              }
            }, 500)

            // Additional check after 1 second
            setTimeout(() => {
              const markerEl = newMarker.getElement?.() || newMarker._element
              if (markerEl) {
                const computedStyle = window.getComputedStyle(markerEl)
                debugLog("🔍 Blue dot computed styles:", {
                  display: computedStyle.display,
                  visibility: computedStyle.visibility,
                  opacity: computedStyle.opacity,
                  zIndex: computedStyle.zIndex
                })
              }
            }, 1000)

            // Create accuracy circle around blue dot (like Google Maps)
            const accuracyRadius = accuracy || 50 // Default to 50m if accuracy not available
            try {
              // Remove existing circle if any
              if (userLocationAccuracyCircleRef.current) {
                if (userLocationAccuracyCircleRef.current.remove) {
                  userLocationAccuracyCircleRef.current.remove()
                } else if (mapInstance.removeLayer) {
                  mapInstance.removeLayer(userLocationAccuracyCircleRef.current)
                }
              }

              // Try to create circle using MapLibre/Mapbox API
              if (mapInstance.addSource && mapInstance.addLayer) {
                const circleId = 'user-location-accuracy-circle'
                const sourceId = 'user-location-accuracy-circle-source'

                // Remove existing source/layer if present
                if (mapInstance.getLayer(circleId)) {
                  mapInstance.removeLayer(circleId)
                }
                if (mapInstance.getSource(sourceId)) {
                  mapInstance.removeSource(sourceId)
                }

                // Add circle source
                mapInstance.addSource(sourceId, {
                  type: 'geojson',
                  data: {
                    type: 'Feature',
                    geometry: {
                      type: 'Point',
                      coordinates: [longitude, latitude]
                    },
                    properties: {
                      radius: accuracyRadius
                    }
                  }
                })

                // Add circle layer
                // Convert meters to pixels: use zoom-based scaling
                // At zoom 15: ~1.2 meters per pixel, at zoom 18: ~0.15 meters per pixel
                mapInstance.addLayer({
                  id: circleId,
                  type: 'circle',
                  source: sourceId,
                  paint: {
                    'circle-radius': [
                      'interpolate',
                      ['exponential', 2],
                      ['zoom'],
                      10, ['/', accuracyRadius, 2],
                      15, ['/', accuracyRadius, 1.2],
                      18, ['/', accuracyRadius, 0.15],
                      20, ['/', accuracyRadius, 0.04]
                    ],
                    'circle-color': '#4285F4',
                    'circle-opacity': 0.15,
                    'circle-stroke-color': '#4285F4',
                    'circle-stroke-opacity': 0.4,
                    'circle-stroke-width': 1
                  }
                })

                userLocationAccuracyCircleRef.current = {
                  sourceId,
                  layerId: circleId,
                  update: (newLat, newLng, newAccuracy) => {
                    if (mapInstance.getSource(sourceId)) {
                      mapInstance.getSource(sourceId).setData({
                        type: 'Feature',
                        geometry: {
                          type: 'Point',
                          coordinates: [newLng, newLat]
                        },
                        properties: {
                          radius: newAccuracy || accuracyRadius
                        }
                      })
                    }
                  },
                  remove: () => {
                    if (mapInstance.getLayer(circleId)) {
                      mapInstance.removeLayer(circleId)
                    }
                    if (mapInstance.getSource(sourceId)) {
                      mapInstance.removeSource(sourceId)
                    }
                  }
                }

                debugLog("✅ Accuracy circle created around blue dot:", { radius: accuracyRadius })
              }
            } catch (circleError) {
              debugWarn("⚠️ Could not create accuracy circle (non-critical):", circleError.message)
            }

            // Don't auto-fly to user location - let green pin stay at center
            // User can use "Use current location" button if needed
          } else {
            debugError("❌ Failed to create blue dot marker - all methods failed")
            debugError("🔍 Debug info:", {
              sdkInstance: !!sdkInstance,
              mapInstance: !!mapInstance,
              element: !!el,
              sdkAddMarker: !!(sdkInstance && sdkInstance.addMarker),
              sdkMarker: !!(sdkInstance && sdkInstance.Marker)
            })
          }
        } catch (markerError) {
          debugError("❌ Could not create user location marker:", markerError)
          debugError("Error details:", {
            message: markerError.message,
            stack: markerError.stack,
            name: markerError.name
          })
        }
      }

      // 3. Arrow Direction (Heading) agar available ho
      // Heading is in degrees (0-360), where 0 is North
      if (heading !== null && heading !== undefined && !isNaN(heading)) {
        el.style.transform = `rotate(${heading}deg)`
      } else {
        // Reset transform if no heading
        el.style.transform = 'rotate(0deg)'
      }
    }

    // First, try to get current position immediately
    // Use a small delay to ensure map is fully ready
    debugLog("🔵 About to request geolocation...")
    setTimeout(() => {
      debugLog("🔵 Requesting geolocation with getCurrentPosition...")
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, heading } = position.coords
          debugLog("📍📍📍 Initial location received:", { latitude, longitude, heading })
          debugLog("🔵 Calling createOrUpdateMarker with:", { latitude, longitude, heading })
          createOrUpdateMarker(latitude, longitude, heading, position.coords.accuracy)

          // Then start watching for updates (with throttling)
          watchPositionIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              const { latitude, longitude, heading, accuracy } = position.coords

              // Clear any pending update
              if (locationUpdateTimeoutRef.current) {
                clearTimeout(locationUpdateTimeoutRef.current)
              }

              // Throttle updates - only process after 2 seconds of no new updates
              locationUpdateTimeoutRef.current = setTimeout(() => {
                // Only log significant updates to avoid console spam
                if (!lastUserLocationRef.current ||
                  calculateDistance(
                    lastUserLocationRef.current.latitude,
                    lastUserLocationRef.current.longitude,
                    latitude,
                    longitude
                  ) >= 10) {
                  debugLog("📍 Location update (throttled):", { latitude, longitude, heading })
                }
                createOrUpdateMarker(latitude, longitude, heading, accuracy)
              }, 2000) // Wait 2 seconds before processing update
            },
            (error) => {
              // Suppress timeout errors - they're non-critical and will retry
              if (error.code === 3) {
                // Timeout - silently ignore, will retry automatically
                return
              } else if (error.code === 1) {
                debugWarn("⚠️ Location permission denied by user")
              } else if (error.code === 2) {
                debugWarn("⚠️ Location unavailable")
              }
              // Don't log timeout errors repeatedly
            },
            {
              enableHighAccuracy: false, // Less strict for better compatibility
              timeout: 30000, // Longer timeout (30 seconds)
              maximumAge: 60000 // Allow cached location up to 1 minute old
            }
          )
          debugLog("✅ watchPosition started, ID:", watchPositionIdRef.current)
        },
        (error) => {
          // Suppress timeout errors - they're non-critical
          if (error.code === 3) {
            // Timeout - try to use cached location or continue without location
            debugWarn("⚠️ Location request timeout - will retry or use cached location")

            // Try to get cached location from localStorage
            try {
              const cachedLocation = localStorage.getItem(USER_LOCATION_STORAGE_KEY)
              if (cachedLocation) {
                const location = JSON.parse(cachedLocation)
                if (location.latitude && location.longitude) {
                  debugLog("📍 Using cached location due to timeout:", location)
                  createOrUpdateMarker(location.latitude, location.longitude, null, location.accuracy)
                }
              }
            } catch (cacheError) {
              // Ignore cache errors
            }
          } else if (error.code === 1) {
            debugWarn("⚠️ Location permission denied")
          } else if (error.code === 2) {
            debugWarn("⚠️ Location unavailable")
          } else {
            // Only log non-timeout errors
            debugWarn("⚠️ Location error (code:", error.code + "):", error.message)
          }

          // Even if initial location fails, try watchPosition with less strict options
          watchPositionIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              const { latitude, longitude, heading, accuracy } = position.coords

              // Clear any pending update
              if (locationUpdateTimeoutRef.current) {
                clearTimeout(locationUpdateTimeoutRef.current)
              }

              // Throttle updates - only process after 2 seconds of no new updates
              locationUpdateTimeoutRef.current = setTimeout(() => {
                // Only log significant updates to avoid console spam
                if (!lastUserLocationRef.current ||
                  calculateDistance(
                    lastUserLocationRef.current.latitude,
                    lastUserLocationRef.current.longitude,
                    latitude,
                    longitude
                  ) >= 10) {
                  debugLog("📍 Location update (after initial error, throttled):", { latitude, longitude, heading })
                }
                createOrUpdateMarker(latitude, longitude, heading, accuracy)
              }, 2000) // Wait 2 seconds before processing update
            },
            (error) => {
              // Suppress timeout errors in watchPosition too
              if (error.code === 3) {
                // Timeout - silently ignore, will retry
                return
              } else if (error.code === 1) {
                debugWarn("⚠️ Please enable location permission in browser settings")
              }
              // Don't log other errors repeatedly
            },
            {
              enableHighAccuracy: false, // Less strict for better compatibility
              timeout: 30000, // Longer timeout
              maximumAge: 60000 // Allow cached location up to 1 minute old
            }
          )
          debugLog("✅ watchPosition started (fallback), ID:", watchPositionIdRef.current)
        },
        {
          enableHighAccuracy: false, // Less strict for better compatibility
          timeout: 30000, // Longer timeout (30 seconds)
          maximumAge: 60000 // Allow cached location up to 1 minute old
        }
      )
    }, 500) // Small delay to ensure map is ready

    debugLog("✅ watchPosition started, ID:", watchPositionIdRef.current)
  }

  const handleMapMoveEnd = async (lat, lng) => {
    const lookupId = beginPinLookup()

    // Round coordinates to 6 decimal places (about 10cm precision) to avoid duplicate calls
    const roundedLat = parseFloat(lat.toFixed(6))
    const roundedLng = parseFloat(lng.toFixed(6))

    // Check if this is the same location as last call
    if (lastReverseGeocodeCoordsRef.current) {
      const lastLat = parseFloat(lastReverseGeocodeCoordsRef.current.lat.toFixed(6))
      const lastLng = parseFloat(lastReverseGeocodeCoordsRef.current.lng.toFixed(6))
      if (lastLat === roundedLat && lastLng === roundedLng) {
        debugLog("⏭️ Skipping reverse geocode - same coordinates as last call")
        return
      }
    }

    // Clear any pending timeout
    if (reverseGeocodeTimeoutRef.current) {
      clearTimeout(reverseGeocodeTimeoutRef.current)
    }

    setLoadingAddress(true)
    setCurrentAddress("")
    setAddressFormData((prev) => ({
      ...prev,
      street: "",
      city: "",
      state: "",
      zipCode: "",
      additionalDetails: "",
    }))

    // Debounce: Wait 300ms before making the API call
    reverseGeocodeTimeoutRef.current = setTimeout(async () => {
      if (!isLatestPinLookup(lookupId)) {
        return
      }

      // Update last coordinates
      lastReverseGeocodeCoordsRef.current = { lat: roundedLat, lng: roundedLng }
      try {
        debugLog("🔍 Reverse geocoding for coordinates:", { lat: roundedLat, lng: roundedLng })
        debugLog("🔍 Coordinates precision:", {
          lat: roundedLat.toFixed(8),
          lng: roundedLng.toFixed(8)
        })

        // Use Google Maps Geocoding API + Places API for complete address details
        let formattedAddress = ""
        let city = ""
        let state = ""
        let area = ""
        let street = ""
        let streetNumber = ""
        let postalCode = ""
        let pointOfInterest = ""
        let premise = ""

        const tryGoogleMapsJsGeocoder = async () => {
          if (!window.google?.maps?.Geocoder) return false

          const geocoder = new window.google.maps.Geocoder()
          const geocodeResult = await geocoder.geocode({
            location: { lat: roundedLat, lng: roundedLng },
          })

          const jsResults = geocodeResult?.results || []
          if (!jsResults.length) return false

          let bestResult = jsResults[0]
          for (const result of jsResults.slice(0, 6)) {
            const hasStreetNumber = result.address_components?.some((c) => c.types.includes("street_number"))
            const hasRoute = result.address_components?.some((c) => c.types.includes("route"))
            const hasPremise = result.address_components?.some((c) => c.types.includes("premise"))
            const hasPoi = result.address_components?.some((c) => c.types.includes("point_of_interest"))
            const hasSublocality = result.address_components?.some((c) =>
              c.types.includes("sublocality") ||
              c.types.includes("sublocality_level_1") ||
              c.types.includes("neighborhood")
            )

            if ((hasStreetNumber && hasRoute) || hasPremise || hasPoi || hasSublocality) {
              bestResult = result
              break
            }
          }

          formattedAddress = bestResult.formatted_address || ""
          const addressComponents = bestResult.address_components || []

          for (const component of addressComponents) {
            const types = component.types || []
            if (types.includes("point_of_interest") && !pointOfInterest) pointOfInterest = component.long_name
            if (types.includes("premise") && !premise) premise = component.long_name
            if (types.includes("street_number") && !streetNumber) streetNumber = component.long_name
            if (types.includes("route") && !street) street = component.long_name
            if (
              (types.includes("sublocality") ||
                types.includes("sublocality_level_1") ||
                types.includes("neighborhood")) &&
              !area
            ) {
              area = component.long_name
            }
            if (types.includes("locality") && !city) city = component.long_name
            if (types.includes("administrative_area_level_1") && !state) state = component.long_name
            if (types.includes("postal_code") && !postalCode) postalCode = component.long_name
          }

          return Boolean(formattedAddress)
        }

        if (GOOGLE_MAPS_API_KEY) {
          try {
            const usedJsGeocoder = await tryGoogleMapsJsGeocoder()

            if (!usedJsGeocoder) {
            // Step 1: Use Google Geocoding API for address components
            // Get API key dynamically from backend
            const { getGoogleMapsApiKey } = await import('@/lib/utils/googleMapsApiKey.js');
            const apiKey = await getGoogleMapsApiKey() || GOOGLE_MAPS_API_KEY;
            const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${roundedLat},${roundedLng}&key=${apiKey}&language=en&region=in&result_type=street_address|premise|point_of_interest|establishment|route|sublocality|neighborhood`
            const geocodeResponse = await fetch(geocodeUrl).then(res => res.json())

            if (geocodeResponse.status === "OK" && geocodeResponse.results && geocodeResponse.results.length > 0) {
              // Find the most useful result for drag-and-drop pin selection.
              // Arbitrary map points often don't have a POI/premise, so we also
              // accept route/sublocality/neighborhood matches instead of falling back too early.
              let bestResult = geocodeResponse.results[0]
              for (const result of geocodeResponse.results.slice(0, 5)) {
                const hasPOI = result.address_components?.some(c => c.types.includes("point_of_interest"))
                const hasPremise = result.address_components?.some(c => c.types.includes("premise"))
                const hasRoute = result.address_components?.some(c => c.types.includes("route"))
                const hasSublocality = result.address_components?.some(c =>
                  c.types.includes("sublocality") ||
                  c.types.includes("sublocality_level_1") ||
                  c.types.includes("neighborhood")
                )
                if (hasPOI || hasPremise || hasRoute || hasSublocality) {
                  bestResult = result
                  break
                }
              }

              formattedAddress = bestResult.formatted_address || ""
              const addressComponents = bestResult.address_components || []

              // Extract all address components
              for (const component of addressComponents) {
                const types = component.types || []
                if (types.includes("point_of_interest") && !pointOfInterest) {
                  pointOfInterest = component.long_name
                }
                if (types.includes("premise") && !premise) {
                  premise = component.long_name
                }
                if (types.includes("street_number") && !streetNumber) {
                  streetNumber = component.long_name
                }
                if (types.includes("route") && !street) {
                  street = component.long_name
                }
                if (types.includes("sublocality_level_1") && !area) {
                  area = component.long_name
                }
                if (types.includes("locality") && !city) {
                  city = component.long_name
                }
                if (types.includes("administrative_area_level_1") && !state) {
                  state = component.long_name
                }
                if (types.includes("postal_code") && !postalCode) {
                  postalCode = component.long_name
                }
              }

              // Google Places REST nearby/details endpoints are blocked by browser
              // CORS, so keep the picker on the geocoding path here. If we want
              // extra POI enrichment later, use Maps JS PlacesService or a backend proxy.

              debugLog("✅✅✅ Google Maps - Complete Address Details:", {
                formattedAddress,
                pointOfInterest,
                premise,
                street,
                streetNumber,
                area,
                city,
                state,
                postalCode
              })
            }
            }
          } catch (googleError) {
            debugWarn("⚠️ Google Maps API error, trying backend fallback:", googleError.message)
            // Fallback to backend API
            try {
              const response = await locationAPI.reverseGeocode(roundedLat, roundedLng)
              const backendData = response?.data?.data
              const result = backendData?.results?.[0] || backendData?.result?.[0] || null

              if (result) {
                formattedAddress = result.formatted_address || result.formattedAddress || ""
                const addressComponents = result.address_components || {}
                city = addressComponents.city || ""
                state = addressComponents.state || ""
                area = addressComponents.area || ""
                postalCode = addressComponents.postalCode || addressComponents.postal_code || ""
              }
            } catch (backendError) {
              debugError("❌ Backend fallback also failed:", backendError)
            }
          }
        } else {
          // No Google API key, use backend
          const response = await locationAPI.reverseGeocode(roundedLat, roundedLng)
          const backendData = response?.data?.data
          const result = backendData?.results?.[0] || backendData?.result?.[0] || null

          if (result) {
            formattedAddress = result.formatted_address || result.formattedAddress || ""
            const addressComponents = result.address_components || {}
            city = addressComponents.city || ""
            state = addressComponents.state || ""
            area = addressComponents.area || ""
            postalCode = addressComponents.postalCode || addressComponents.postal_code || ""
          }
        }

        if (formattedAddress || city || state) {
          if (!isLatestPinLookup(lookupId)) {
            return
          }

          // Build complete address if we have components
          if (!formattedAddress || formattedAddress.split(',').length < 3) {
            // Build from components
            const addressParts = []
            if (pointOfInterest) addressParts.push(pointOfInterest)
            if (premise && premise !== pointOfInterest) addressParts.push(premise)
            if (streetNumber && street) addressParts.push(`${streetNumber} ${street}`)
            else if (street) addressParts.push(street)
            else if (area) addressParts.push(area)
            if (city) addressParts.push(city)
            if (state) {
              if (postalCode) addressParts.push(`${state} ${postalCode}`)
              else addressParts.push(state)
            }
            formattedAddress = addressParts.join(', ')
          }

          // Set street from formatted address if not set
          if (!street && formattedAddress) {
            const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)
            if (parts.length > 0) {
              street = parts[0]
            }
          }

          if (!street && (streetNumber || area || premise || pointOfInterest)) {
            street = [streetNumber, area || premise || pointOfInterest].filter(Boolean).join(' ').trim()
          }

          // Set area if not set
          if (!area) {
            area = pointOfInterest || premise || street || ""
          }

          // Remove "India" from formatted address if present
          if (formattedAddress && formattedAddress.endsWith(', India')) {
            formattedAddress = formattedAddress.replace(', India', '').trim()
          }

          debugLog("✅ Final extracted address components:", {
            formattedAddress,
            street,
            city,
            state,
            area,
            postalCode,
            pointOfInterest,
            premise
          })

          // Update current address display
          const preferredFullAddress = pickBestAddressText(
            formattedAddress,
            [
              pointOfInterest,
              premise,
              streetNumber && street ? `${streetNumber} ${street}` : street,
              area,
              city,
              state,
              postalCode,
            ].filter(Boolean).join(", ")
          )

          setCurrentAddress(preferredFullAddress || `${roundedLat.toFixed(6)}, ${roundedLng.toFixed(6)}`)

          // Update form data
          // Store FULL formatted address in additionalDetails (Address details field) - this is what user sees
          // This should be the complete address with all parts: POI, Building, Floor, Area, City, State, Pincode
          const fullAddressForField = preferredFullAddress ||
            (pointOfInterest && city && state ? `${pointOfInterest}, ${city}, ${state}` : '') ||
            (premise && city && state ? `${premise}, ${city}, ${state}` : '') ||
            (street && city && state ? `${street}, ${city}, ${state}` : '') ||
            (area && city && state ? `${area}, ${city}, ${state}` : '') ||
            (city && state ? `${city}, ${state}` : '') ||
            ''

          setAddressFormData(prev => ({
            ...prev,
            street: extractStreetLine(
              fullAddressForField,
              street || area || premise || pointOfInterest || prev.street
            ),
            city: city || prev.city,
            state: state || prev.state,
            zipCode: postalCode || prev.zipCode,
            additionalDetails: fullAddressForField || "", // Store only the address for this pin move
          }))
        } else {
          if (!isLatestPinLookup(lookupId)) {
            return
          }

          debugWarn("⚠️ No address data found from Google Maps or backend")
          const coordinateFallback = `${roundedLat.toFixed(6)}, ${roundedLng.toFixed(6)}`
          setCurrentAddress(coordinateFallback)
          setAddressFormData((prev) => ({
            ...prev,
            additionalDetails: coordinateFallback,
            street: coordinateFallback,
          }))
        }
      } catch (error) {
        if (!isLatestPinLookup(lookupId)) {
          return
        }

        debugError("❌ Error reverse geocoding:", error)
        debugError("Error details:", {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        })
        const coordinateFallback = `${roundedLat.toFixed(6)}, ${roundedLng.toFixed(6)}`
        setCurrentAddress(coordinateFallback)
        setAddressFormData((prev) => ({
          ...prev,
          additionalDetails: coordinateFallback,
          street: coordinateFallback,
        }))
        // Don't show error toast, just use coordinates
      } finally {
        if (isLatestPinLookup(lookupId)) {
          setLoadingAddress(false)
        }
      }
    }, 300) // 300ms debounce delay
  }

  const handleUseCurrentLocationForAddress = async () => {
    try {
      setUserLocationPreference("live")

      if (!navigator.geolocation) {
        toast.error("Location services are not supported")
        return
      }

      toast.loading("Getting your fresh location...", { id: "current-location" })
      const locationData = await requestLocation()

      debugLog("📍 Current location data received:", locationData)

      if (!locationData?.latitude || !locationData?.longitude) {
        toast.error("Could not get your location. Please try again.", { id: "current-location" })
        return
      }

      const lat = parseFloat(locationData.latitude)
      const lng = parseFloat(locationData.longitude)

      if (isNaN(lat) || isNaN(lng)) {
        toast.error("Invalid location coordinates", { id: "current-location" })
        return
      }

      debugLog("📍 Setting map position to:", [lat, lng])
      debugLog("📍 Location accuracy:", locationData.accuracy ? `${locationData.accuracy}m` : "unknown")
      debugLog("📍 Location timestamp:", locationData.timestamp || new Date().toISOString())
      prepareForFreshPinLookup()
      setMapPosition([lat, lng])

      // Update Google Maps to new location
      if (googleMapRef.current && window.google && window.google.maps) {
        try {
          debugLog("🗺️ Updating Google Map to:", { lat, lng })

          // Pan to current location
          googleMapRef.current.panTo({ lat, lng })
          googleMapRef.current.setZoom(17)

          // Update green marker position
          if (greenMarkerRef.current) {
            greenMarkerRef.current.setPosition({ lat, lng })
            debugLog("✅ Updated green marker position")
          }

          // Update blue dot marker position
          if (userLocationMarkerRef.current) {
            if (userLocationMarkerRef.current.setPosition) {
              userLocationMarkerRef.current.setPosition({ lat, lng })
              debugLog("✅ Updated blue dot marker position")
            } else if (userLocationMarkerRef.current.setMap) {
              // Marker exists but might not be on map, ensure it's visible
              userLocationMarkerRef.current.setMap(googleMapRef.current)
              if (userLocationMarkerRef.current.setPosition) {
                userLocationMarkerRef.current.setPosition({ lat, lng })
              }
            }
          } else if (googleMapRef.current && window.google) {
            // Create blue dot if it doesn't exist
            const blueDotMarker = new window.google.maps.Marker({
              position: { lat, lng },
              map: googleMapRef.current,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: "#4285F4",
                fillOpacity: 1,
                strokeColor: "#FFFFFF",
                strokeWeight: 4,
              },
              zIndex: window.google.maps.Marker.MAX_ZINDEX + 1,
              optimized: false,
              visible: true
            })
            userLocationMarkerRef.current = blueDotMarker
            debugLog("✅ Created blue dot marker")
          }

          // Update blue dot accuracy circle position
          if (blueDotCircleRef.current) {
            blueDotCircleRef.current.setCenter({ lat, lng })
            // Update radius if accuracy is available
            const accuracyRadius = Math.max(locationData?.accuracy || 50, 20)
            blueDotCircleRef.current.setRadius(accuracyRadius)
            debugLog("✅ Updated blue dot accuracy circle position and radius:", accuracyRadius)
          } else if (googleMapRef.current && window.google) {
            // Create accuracy circle if it doesn't exist
            const accuracyRadius = Math.max(locationData?.accuracy || 50, 20)
            const blueDot = new window.google.maps.Circle({
              strokeColor: "#4285F4",
              strokeOpacity: 0.5,
              strokeWeight: 2,
              fillColor: "#4285F4",
              fillOpacity: 0.2,
              map: googleMapRef.current,
              center: { lat, lng },
              radius: accuracyRadius,
              zIndex: window.google.maps.Marker.MAX_ZINDEX,
              visible: true
            })
            blueDotCircleRef.current = blueDot
            debugLog("✅ Created blue dot accuracy circle")
          }

          // Wait for map to finish moving, then fetch address (reduced delay for faster response)
          setTimeout(async () => {
            await handleMapMoveEnd(lat, lng)
            toast.success("Location updated!", { id: "current-location" })
          }, 200)

        } catch (mapError) {
          debugError("❌ Error updating map location:", mapError)
          toast.error("Failed to update map location", { id: "current-location" })
        }
      } else {
        // Map not initialized yet, just update position and fetch address (reduced delay)
        setTimeout(async () => {
          await handleMapMoveEnd(lat, lng)
          toast.success("Location updated!", { id: "current-location" })
        }, 200)
      }
    } catch (error) {
      debugError("❌ Error getting current location:", error)

      // Check if it's a timeout error
      if (error.message && (error.message.includes("timeout") || error.message.includes("Timeout"))) {
        // Try to use cached location from localStorage
        try {
          const stored = localStorage.getItem(USER_LOCATION_STORAGE_KEY)
          if (stored) {
            const cachedLocation = JSON.parse(stored)
            if (cachedLocation?.latitude && cachedLocation?.longitude) {
              debugLog("📍 Using cached location due to timeout:", cachedLocation)
              setMapPosition([cachedLocation.latitude, cachedLocation.longitude])

              // Update Google Maps with cached location
              if (googleMapRef.current && window.google && window.google.maps) {
                try {
                  googleMapRef.current.panTo({ lat: cachedLocation.latitude, lng: cachedLocation.longitude });
                  googleMapRef.current.setZoom(17);

                  // Update markers
                  if (greenMarkerRef.current) {
                    greenMarkerRef.current.setPosition({ lat: cachedLocation.latitude, lng: cachedLocation.longitude });
                  }
                  if (blueDotCircleRef.current) {
                    blueDotCircleRef.current.setCenter({ lat: cachedLocation.latitude, lng: cachedLocation.longitude });
                  }

                  setTimeout(async () => {
                    await handleMapMoveEnd(cachedLocation.latitude, cachedLocation.longitude);
                    toast.success("Using cached location", { id: "current-location" });
                  }, 500);
                } catch (mapErr) {
                  debugError("Error updating map with cached location:", mapErr);
                  toast.warning("Location request timed out. Please try again.", { id: "current-location" });
                }
              } else {
                setTimeout(async () => {
                  await handleMapMoveEnd(cachedLocation.latitude, cachedLocation.longitude)
                  toast.success("Using cached location", { id: "current-location" })
                }, 300)
              }
              return
            }
          }
        } catch (cacheErr) {
          debugWarn("Failed to use cached location:", cacheErr)
        }

        toast.warning("Location request timed out. Please try again or check your GPS settings.", { id: "current-location" })
      } else {
        toast.error("Failed to get current location: " + (error.message || "Unknown error"), { id: "current-location" })
      }
    }
  }

  const handleAddressFormSubmit = async (e) => {
    e.preventDefault()
    let addressToSave = null

    // Validate required fields (zipCode is optional)
    if (!addressFormData.street || !addressFormData.city || !addressFormData.state) {
      toast.error("Please fill in all required fields (Street, City, State)")
      return
    }

    // Validate that we have coordinates
    if (!mapPosition || mapPosition.length !== 2 || !mapPosition[0] || !mapPosition[1]) {
      toast.error("Please select a location on the map")
      return
    }

    setLoadingAddress(true)
    try {
      // Prepare address data matching backend format
      // Backend expects: label, street, additionalDetails, city, state, zipCode, latitude, longitude
      // Backend label enum: ['Home', 'Office', 'Other'] - not 'Work'
      // mapPosition is [latitude, longitude]

      // Validate and normalize label to match backend enum
      let normalizedLabel = addressFormData.label || "Home"
      if (normalizedLabel === "Work" || normalizedLabel === "Others") {
        normalizedLabel = normalizedLabel === "Work" ? "Office" : "Other"
      }
      if (!["Home", "Office", "Other"].includes(normalizedLabel)) {
        normalizedLabel = "Other" // Fallback to Other if invalid
      }

      // Validate that trimmed fields are not empty
      const trimmedStreet = addressFormData.street.trim()
      const trimmedCity = addressFormData.city.trim()
      const trimmedState = addressFormData.state.trim()

      if (!trimmedStreet || !trimmedCity || !trimmedState) {
        toast.error("Street, City, and State cannot be empty")
        setLoadingAddress(false)
        return
      }

      addressToSave = {
        label: normalizedLabel,
        recipientName: (addressFormData.recipientName || "").trim(),
        phone: (addressFormData.phone || "").trim(),
        street: trimmedStreet,
        additionalDetails: (addressFormData.additionalDetails || "").trim(),
        city: trimmedCity,
        state: trimmedState,
        zipCode: (addressFormData.zipCode || "").trim(),
        latitude: mapPosition[0], // latitude from mapPosition[0]
        longitude: mapPosition[1], // longitude from mapPosition[1]
      }

      // Check if an address with the same label already exists
      const existingAddressWithSameLabel = addresses.find(addr => addr.label === normalizedLabel)
      const existingAddressId = existingAddressWithSameLabel?.id || existingAddressWithSameLabel?._id

      let savedAddress = null
      if (existingAddressWithSameLabel && existingAddressId) {
        // Update existing address instead of creating a new one
        debugLog("🔄 Updating existing address with label:", normalizedLabel)
        savedAddress = await updateAddress(existingAddressId, addressToSave)
        toast.success(`Address updated for ${normalizedLabel}!`)
      } else {
        // Create new address
        debugLog("💾 Saving new address:", addressToSave)
        savedAddress = await addAddress(addressToSave)
        toast.success(`Address saved as ${normalizedLabel}!`)
      }

      const savedAddressId = getAddressId(savedAddress) || existingAddressId
      if (savedAddressId) {
        setDefaultAddress(savedAddressId)
      }

      const manualLocationData = {
        label: normalizedLabel,
        city: trimmedCity,
        state: trimmedState,
        address: trimmedStreet,
        area: (addressFormData.additionalDetails || "").trim(),
        zipCode: (addressFormData.zipCode || "").trim(),
        latitude: mapPosition[0],
        longitude: mapPosition[1],
        formattedAddress: [
          (addressFormData.additionalDetails || "").trim(),
          trimmedStreet,
          trimmedCity,
          trimmedState,
          (addressFormData.zipCode || "").trim(),
        ].filter(Boolean).join(", "),
      }
      setStoredUserLocation(manualLocationData)
      setUserLocationPreference("manual")

      // Reset form
      setAddressFormData({
        recipientName: "",
        street: "",
        city: "",
        state: "",
        zipCode: "",
        additionalDetails: "",
        label: "Home",
        phone: "",
      })
      setShowAddressForm(false)
      setLoadingAddress(false)

      // Close overlay and keep user in current flow
      onClose()
    } catch (error) {
      debugError("❌ Error saving address:", error)
      debugError("❌ Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        addressData: addressToSave
      })

      // Show more detailed error message
      let errorMessage = "Failed to add address. Please try again."
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.response?.status === 400) {
        errorMessage = "Invalid address data. Please check all fields."
      } else if (error.response?.status === 500) {
        errorMessage = "Server error. Please try again later."
      }

      toast.error(errorMessage)
      setLoadingAddress(false)
    }
  }

  const handleCancelAddressForm = () => {
    setShowAddressForm(false)
    setAddressFormData({
      recipientName: "",
      street: "",
      city: "",
      state: "",
      zipCode: "",
      additionalDetails: "",
      label: "Home",
      phone: "",
    })
  }

  const handleSelectSavedAddress = async (address) => {
    try {
      const { latitude, longitude } = getAddressCoordinates(address)

      if (latitude && longitude) {
        // Update location in backend
        await userAPI.updateLocation({
          latitude,
          longitude,
          address: `${address.street}, ${address.city}`,
          city: address.city,
          state: address.state,
          area: address.additionalDetails || "",
          formattedAddress: `${address.street}, ${address.city}, ${address.state}`
        })
      }

      // Update the location in localStorage with this address
      const locationData = {
        label: address.label || "Home",
        city: address.city,
        state: address.state,
        address: `${address.street}, ${address.city}`,
        area: address.additionalDetails || "",
        zipCode: address.zipCode,
        latitude,
        longitude,
        formattedAddress: `${address.street}, ${address.city}, ${address.state}`
      }
      setStoredUserLocation(locationData)
      setUserLocationPreference("manual")

      // Update map position to show selected address
      setMapPosition([latitude, longitude])

      // Update address form data with selected address
      setAddressFormData({
        recipientName: address.recipientName || userProfile?.name || "",
        street: address.street || "",
        city: address.city || "",
        state: address.state || "",
        zipCode: address.zipCode || "",
        additionalDetails: address.additionalDetails || "",
        label: address.label || "Home",
        phone: address.phone || userProfile?.phone || "",
      })

      // Update Google Maps to show selected address
      if (googleMapRef.current && window.google && window.google.maps) {
        try {
          googleMapRef.current.panTo({ lat: latitude, lng: longitude })
          googleMapRef.current.setZoom(17)

          // Update green marker position
          if (greenMarkerRef.current) {
            greenMarkerRef.current.setPosition({ lat: latitude, lng: longitude })
          }

          // Fetch and update address details
          setTimeout(async () => {
            await handleMapMoveEnd(latitude, longitude)
            toast.success("Location updated!", { id: "saved-address" })
          }, 500)
        } catch (mapError) {
          debugError("Error updating map:", mapError)
          toast.success("Location updated!", { id: "saved-address" })
        }
      } else {
        // Map not initialized yet, just fetch address
        setTimeout(async () => {
          await handleMapMoveEnd(latitude, longitude)
          toast.success("Location updated!", { id: "saved-address" })
        }, 300)
      }

      const selectedAddressId = getAddressId(address)
      if (selectedAddressId) {
        setDefaultAddress(selectedAddressId)
      }
      onClose()
    } catch (error) {
      debugError("Error selecting saved address:", error)
      toast.error("Failed to update location. Please try again.")
    }
  }

  // Calculate distance for saved addresses
  const getAddressDistance = (address) => {
    if (!location?.latitude || !location?.longitude) return "0 m"

    const { latitude: addressLat, longitude: addressLng } = getAddressCoordinates(address)

    if (!addressLat || !addressLng) return "0 m"

    const distance = calculateDistance(
      location.latitude,
      location.longitude,
      addressLat,
      addressLng
    )

    return distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(2)} km`
  }

  const handleEditAddress = (addressId) => {
    // Edit address functionality removed - user can delete and add new address instead
    toast.info("To edit address, please delete and add a new one")
  }

  if (!isOpen) return null

  // If showing address form, render full-screen address form
  if (showAddressForm) {
    return (
      <div className="fixed inset-0 z-[10000] bg-white dark:bg-[#0a0a0a] flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-3">
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCancelAddressForm}
              className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ChevronLeft className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            </Button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Select delivery location</h1>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-green-600 z-10" />
            <Input
              ref={inputRef}
              value={searchValue}
              onChange={handleSearchInputChange}
              onKeyDown={handleSearchInputKeyDown}
              onFocus={() => {
                if (searchSuggestions.length > 0) {
                  setShowSearchSuggestions(true)
                }
              }}
              placeholder="Search for area, street name..."
              autoComplete="off"
              className="pl-12 pr-4 h-12 w-full bg-gray-50 dark:bg-[#2a2a2a] border-gray-200 dark:border-gray-700 focus:border-green-600 dark:focus:border-green-600 rounded-xl"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSearchLocation}
              disabled={searchingLocation || mapLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 rounded-lg px-3 text-green-600 hover:bg-green-50 hover:text-green-700"
            >
              {searchingLocation ? "..." : "Search"}
            </Button>

            {showSearchSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#1a1a1a]">
                {searchSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.place_id}
                    type="button"
                    onClick={() => handleSelectSearchSuggestion(suggestion)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                      index === activeSuggestionIndex
                        ? "bg-green-50 dark:bg-green-900/20"
                        : "hover:bg-gray-50 dark:hover:bg-[#222]"
                    }`}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {suggestion.structured_formatting?.main_text || suggestion.description}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {suggestion.structured_formatting?.secondary_text || suggestion.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Map Section - Google Maps */}
        <div className="flex-shrink-0 relative" style={{ height: '35vh', minHeight: '250px' }}>
          {/* Google Maps Container */}
          <div
            ref={mapContainerRef}
            className="w-full h-full bg-gray-200 dark:bg-gray-800"
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 1
            }}
          />

          {/* Loading State */}
          {mapLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900 bg-opacity-75 z-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading map...</p>
              </div>
            </div>
          )}

          {/* API Key Missing Error */}
          {!GOOGLE_MAPS_API_KEY && !mapLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900 z-20">
              <div className="text-center p-4">
                <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Google Maps API key not found</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Please set VITE_GOOGLE_MAPS_API_KEY in .env file</p>
              </div>
            </div>
          )}

          {/* Use Current Location Button */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
            <Button
              onClick={handleUseCurrentLocationForAddress}
              disabled={mapLoading}
              className="bg-white dark:bg-[#1a1a1a] border-2 border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 shadow-lg disabled:opacity-50 flex items-center gap-2 px-4 py-2"
            >
              <Crosshair className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" strokeWidth={2.5} />
              <span className="text-green-600 dark:text-green-400 font-medium">Use current location</span>
            </Button>
          </div>
        </div>

        {/* Form Section - Scrollable */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0a0a0a] min-h-0 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="px-4 py-4 space-y-4 pb-48">
            {/* Delivery Details */}
            <div>
              <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                Delivery details
              </Label>
              <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-center gap-3">
                <MapPin className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {loadingAddress ? "Locating..." : (currentLocationText || "Select location on map")}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
              </div>
            </div>

            {/* Address Details */}
            <div>
              <Label htmlFor="additionalDetails" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                Address details*
              </Label>
              <Input
                id="additionalDetails"
                name="additionalDetails"
                placeholder="E.g. Floor, House no."
                value={addressFormData.additionalDetails}
                onChange={handleAddressFormChange}
                className="bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                Address type
              </Label>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-[#1a1a1a]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">This address will be saved as</span>
                  <span className="rounded-full bg-green-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                    {ADDRESS_TYPE_OPTIONS.find((option) => option.value === addressFormData.label)?.label || "Home"}
                  </span>
                </div>
                <div className="flex gap-2">
                  {ADDRESS_TYPE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      onClick={() => setAddressFormData(prev => ({ ...prev, label: option.value }))}
                      variant={addressFormData.label === option.value ? "default" : "outline"}
                      className={`flex-1 ${addressFormData.label === option.value
                        ? "bg-green-600 hover:bg-green-700 text-white"
                        : "bg-white dark:bg-[#0f0f0f]"
                        }`}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Receiver Details */}
            <div className="mb-6">
              <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                Receiver details for this address
              </Label>
              <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {addressFormData.recipientName || userProfile?.name || "User"}, {addressFormData.phone || userProfile?.phone || "Add phone"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    name="recipientName"
                    placeholder="Receiver name"
                    value={addressFormData.recipientName || ""}
                    onChange={handleAddressFormChange}
                    className="bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
                  />
                  <Input
                    name="phone"
                    placeholder="Phone number"
                    value={addressFormData.phone || ""}
                    onChange={handleAddressFormChange}
                    className="bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
                  />
                </div>
              </div>
            </div>

            {/* Manual address fields (auto-filled from Google Maps, editable by user) */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block">
                Address (Manual or Auto-fill)
              </Label>
              <Input
                name="street"
                placeholder="Street / Area *"
                value={addressFormData.street}
                onChange={handleAddressFormChange}
                className="bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  name="city"
                  placeholder="City *"
                  value={addressFormData.city}
                  onChange={handleAddressFormChange}
                  className="bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
                  required
                />
                <Input
                  name="state"
                  placeholder="State *"
                  value={addressFormData.state}
                  onChange={handleAddressFormChange}
                  className="bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
                  required
                />
              </div>
              <Input
                name="zipCode"
                placeholder="Pincode (optional)"
                value={addressFormData.zipCode || ""}
                onChange={handleAddressFormChange}
                className="bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Tip: Use map/current location for auto-detection, or type details manually.
              </p>
            </div>
          </div>
        </div>

        {/* Save Address Button */}
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <form onSubmit={handleAddressFormSubmit}>
            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold"
              disabled={loadingAddress}
            >
              {loadingAddress ? "Loading..." : "Save address"}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-[#0a0a0a]"
      style={{
        animation: 'fadeIn 0.3s ease-out'
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                onClose()
              }}
              className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 -ml-2"
            >
              <ChevronLeft className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            </Button>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Select a location</h1>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] px-4 sm:px-6 lg:px-8 py-3 max-w-7xl mx-auto w-full">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-primary-orange z-10" />
          <Input
            ref={inputRef}
            value={searchValue}
            onChange={handleSearchInputChange}
            onKeyDown={handleSearchInputKeyDown}
            onFocus={() => {
              if (searchSuggestions.length > 0) {
                setShowSearchSuggestions(true)
              }
            }}
            placeholder="Search for area, street name..."
            autoComplete="off"
            className="pl-12 pr-24 h-12 w-full bg-gray-50 dark:bg-[#2a2a2a] border-gray-200 dark:border-gray-700 focus:border-primary-orange dark:focus:border-primary-orange rounded-xl text-base dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSearchLocation}
            disabled={searchingLocation}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 rounded-lg px-3 text-primary-orange hover:bg-orange-50 hover:text-primary-orange"
          >
            {searchingLocation ? "..." : "Search"}
          </Button>

          {showSearchSuggestions && searchSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#1a1a1a]">
              {searchSuggestions.map((suggestion, index) => (
                <button
                  key={suggestion.place_id}
                  type="button"
                  onClick={() => handleSelectSearchSuggestion(suggestion)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                    index === activeSuggestionIndex
                      ? "bg-orange-50 dark:bg-orange-900/20"
                      : "hover:bg-gray-50 dark:hover:bg-[#222]"
                  }`}
                >
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-orange" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {suggestion.structured_formatting?.main_text || suggestion.description}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {suggestion.structured_formatting?.secondary_text || suggestion.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0">
        <div className="max-w-7xl mx-auto w-full pb-6">
          {/* Use Current Location */}
          <div
            className="px-4 sm:px-6 lg:px-8 py-2 bg-white dark:bg-[#1a1a1a]"
            style={{ animation: 'slideDown 0.3s ease-out 0.1s both' }}
          >
            <button
              onClick={handleUseCurrentLocation}
              disabled={loading}
              className="w-full flex items-center justify-between py-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center group-hover:bg-green-100 dark:group-hover:bg-green-900/30 transition-colors">
                  <Crosshair className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" strokeWidth={2.5} />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-green-700 dark:text-green-400">Use current location</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {loading ? "Getting location..." : currentLocationText}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </button>

            {/* Add Address */}
            <button
              onClick={handleAddAddress}
              className="w-full flex items-center justify-between py-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors group border-t border-gray-100 dark:border-gray-800"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center group-hover:bg-green-100 dark:group-hover:bg-green-900/30 transition-colors">
                  <Plus className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <p className="font-semibold text-green-700 dark:text-green-400">Add Address</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </button>
          </div>

          {/* Saved Addresses Section */}
          {addresses.length > 0 && (
            <div
              className="mt-2"
              style={{ animation: 'slideDown 0.3s ease-out 0.2s both' }}
            >
              <div className="px-4 sm:px-6 lg:px-8 py-3">
                <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 tracking-wider uppercase">
                  Saved Addresses
                </h2>
              </div>
              <div className="bg-white dark:bg-[#1a1a1a]">
                {addresses
                  .filter((address, index, self) => {
                    // Filter out duplicate addresses with same label - keep only first occurrence
                    const firstIndex = self.findIndex(addr => addr.label === address.label)
                    return index === firstIndex
                  })
                  .map((address, index) => {
                    const IconComponent = getAddressIcon(address)
                    return (
                      <div
                        key={address.id}
                        className="px-4 sm:px-6 lg:px-8"
                        style={{ animation: `slideUp 0.3s ease-out ${0.25 + index * 0.05}s both` }}
                      >
                        <div
                          className={`py-4 ${index !== 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}
                        >
                          <button
                            onClick={() => handleSelectSavedAddress(address)}
                            className="w-full flex items-start gap-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors p-2 -m-2"
                          >
                            <div className="flex flex-col items-center">
                              <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                <IconComponent className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {address.label || address.additionalDetails || "Home"}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {[
                                  address.additionalDetails,
                                  address.street,
                                  address.city,
                                  address.state,
                                  address.zipCode
                                ].filter(Boolean).join(", ")}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {address.recipientName || userProfile?.name || "User"} · {address.phone || userProfile?.phone || "Not provided"}
                              </p>
                            </div>
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        /* Blue Dot Indicator for Live Location */
        .user-location-marker {
          width: 20px !important;
          height: 20px !important;
          background-color: #4285F4 !important; /* Google Blue */
          border: 3px solid white !important;
          border-radius: 50% !important;
          box-shadow: 0 0 10px rgba(0,0,0,0.3) !important;
          position: relative !important;
          transition: transform 0.3s ease;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          z-index: 1001 !important;
          pointer-events: none;
        }
        
        /* Ensure marker container is also visible */
        .mapboxgl-marker.user-location-marker,
        .maplibregl-marker.user-location-marker {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          z-index: 1001 !important;
        }
        
        /* Arrow indicator pointing in direction of movement */
        .user-location-marker::before {
          content: "";
          position: absolute;
          top: -8px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-bottom: 8px solid #4285F4;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
        }
        
        /* Pulsing Aura Effect */
        .user-location-marker::after {
          content: "";
          position: absolute;
          width: 40px;
          height: 40px;
          top: -13px;
          left: -13px;
          background-color: rgba(66, 133, 244, 0.2);
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { restaurantAPI, diningAPI } from "@/lib/api"
import { API_BASE_URL } from "@/lib/api/config"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { useLocation } from "../../hooks/useLocation"
import { useZone } from "../../hooks/useZone"
import {
  ArrowLeft,
  Search,
  MoreVertical,
  MapPin,
  Clock,
  Tag,
  ChevronDown,
  Info,
  Star,
  SlidersHorizontal,
  Utensils,
  Flame,
  Bookmark,
  Share2,
  Plus,
  Minus,
  X,
  RotateCcw,
  Zap,
  Check,
  Lock,
  Percent,
  Eye,
  Users,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import AnimatedPage from "../../components/AnimatedPage"
import { useCart } from "../../context/CartContext"
import { useProfile } from "../../context/ProfileContext"
import AddToCartAnimation from "../../components/AddToCartAnimation"
import { getCompanyNameAsync } from "@/lib/utils/businessSettings"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import fssaiLogo from "@/assets/fssai.png"



export default function RestaurantDetails() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const showOnlyUnder250 = searchParams.get('under250') === 'true'
  const { addToCart, updateQuantity, removeFromCart, getCartItem, cart } = useCart()
  const { vegMode, addDishFavorite, removeDishFavorite, isDishFavorite, getDishFavorites, getFavorites, addFavorite, removeFavorite, isFavorite } = useProfile()
  const { location: userLocation } = useLocation() // Get user's current location
  const { zoneId, zone, loading: loadingZone, isOutOfService } = useZone(userLocation) // Get user's zone for zone-based filtering
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [quantities, setQuantities] = useState({})
  const [showManageCollections, setShowManageCollections] = useState(false)
  const [showItemDetail, setShowItemDetail] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [showLocationSheet, setShowLocationSheet] = useState(false)
  const [showScheduleSheet, setShowScheduleSheet] = useState(false)
  const [showOffersSheet, setShowOffersSheet] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null)
  const [expandedCoupons, setExpandedCoupons] = useState(new Set())
  const [showMenuSheet, setShowMenuSheet] = useState(false)
  const [showLargeOrderMenu, setShowLargeOrderMenu] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [showMenuOptionsSheet, setShowMenuOptionsSheet] = useState(false)
  const [expandedAddButtons, setExpandedAddButtons] = useState(new Set())
  const [expandedSections, setExpandedSections] = useState(new Set([0])) // Default: Recommended section is expanded
  const [filters, setFilters] = useState({
    sortBy: null, // "low-to-high" | "high-to-low"
    vegNonVeg: null, // "veg" | "non-veg"
  })

  // Restaurant data state
  const [restaurant, setRestaurant] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(true)
  const [restaurantError, setRestaurantError] = useState(null)
  const fetchedRestaurantRef = useRef(false) // Track if restaurant has been fetched for current slug

  // Fetch restaurant data from API
  useEffect(() => {
    const fetchRestaurant = async () => {
      if (!slug) return

      // Prevent re-fetching if we've already fetched for this slug and zoneId hasn't changed meaningfully
      // Only re-fetch if slug changed or if we're waiting for zoneId and it just became available
      if (fetchedRestaurantRef.current && restaurant && restaurant.slug === slug) {
        // Only re-fetch if zoneId changed from null to a value (zone just detected)
        if (zoneId && !loadingZone) {
          // Zone is available, but we already have restaurant data - don't re-fetch
          return
        }
      }

      try {
        setLoadingRestaurant(true)
        setRestaurantError(null)

        console.log('Fetching restaurant with slug:', slug)
        let response = null
        let apiRestaurant = null

        // Try dining API first
        try {
          response = await diningAPI.getRestaurantBySlug(slug)
          if (response.data && response.data.success && response.data.data) {
            apiRestaurant = response.data.data
            console.log('✅ Found restaurant in dining API:', apiRestaurant)
          }
        } catch (diningError) {
          // If dining API fails with 404, try restaurant API
          if (diningError.response?.status === 404) {
            console.log('⚠️ Restaurant not found in dining API, trying restaurant API...')
            try {
              // First, try to get restaurant directly by slug (getRestaurantById supports both ID and slug)
              // This doesn't require zoneId, so it works even if zone is not detected
              try {
                response = await restaurantAPI.getRestaurantById(slug)
                if (response.data && response.data.success && response.data.data) {
                  apiRestaurant = response.data.data
                  console.log('✅ Found restaurant in restaurant API by slug/ID:', apiRestaurant)
                }
              } catch (directLookupError) {
                // If direct lookup fails, try searching by name (requires zoneId)
                console.log('⚠️ Direct lookup failed, trying search by name...')

                // Only search if zoneId is available (zoneId is required by backend for search)
                if (!zoneId) {
                  console.warn('⚠️ User zone not available, cannot search restaurants. Restaurant may not be found.')
                  // Don't throw error - let it fall through to show "Restaurant not found" message
                } else {
                  // Include zoneId for zone-based filtering
                  const searchParams = { limit: 100, zoneId: zoneId }
                  const searchResponse = await restaurantAPI.getRestaurants(searchParams)
                  const restaurants = searchResponse?.data?.data?.restaurants || searchResponse?.data?.data || []

                  // Try to find by slug match or name match
                  const restaurantName = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                  const matchingRestaurant = restaurants.find(r =>
                    r.slug === slug ||
                    r.name?.toLowerCase().replace(/\s+/g, '-') === slug.toLowerCase() ||
                    r.name?.toLowerCase() === restaurantName.toLowerCase()
                  )

                  if (matchingRestaurant) {
                    // Get full restaurant details by ID
                    const fullResponse = await restaurantAPI.getRestaurantById(matchingRestaurant._id || matchingRestaurant.restaurantId)
                    if (fullResponse.data && fullResponse.data.success && fullResponse.data.data) {
                      apiRestaurant = fullResponse.data.data
                      console.log('✅ Found restaurant in restaurant API by name search:', apiRestaurant)
                    }
                  }
                }
              }
            } catch (restaurantError) {
              console.error('❌ Restaurant not found in restaurant API either:', restaurantError)
              // Only throw if we haven't found the restaurant yet
              if (!apiRestaurant) {
                throw diningError // Throw original error to show "Restaurant not found"
              }
            }
          } else {
            throw diningError // Re-throw if it's not a 404
          }
        }

        if (apiRestaurant) {
          console.log('✅ Fetched restaurant from API:', apiRestaurant)
          console.log('📋 Restaurant data keys:', Object.keys(apiRestaurant))
          console.log('📋 Restaurant name field:', apiRestaurant?.name)
          console.log('📋 Restaurant restaurantId:', apiRestaurant?.restaurantId)
          console.log('📋 Restaurant _id:', apiRestaurant?._id)
          console.log('📋 Restaurant.restaurant:', apiRestaurant?.restaurant)

          // Check if this is a dining restaurant with nested restaurant data
          const actualRestaurant = apiRestaurant?.restaurant || apiRestaurant

          // Helper function to format address with zone and pin code
          const formatRestaurantAddress = (locationObj) => {
            if (!locationObj) return "Location"

            // If location is a string, return it as is
            if (typeof locationObj === 'string') {
              return locationObj
            }

            // PRIORITY 1: Use formattedAddress if it's complete and has pin code
            // formattedAddress usually has the most complete information from Google Maps
            if (locationObj.formattedAddress && locationObj.formattedAddress.trim() !== "" && locationObj.formattedAddress !== "Select location") {
              const isCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(locationObj.formattedAddress.trim())
              if (!isCoordinates) {
                const formattedAddr = locationObj.formattedAddress.trim()
                // Check if it contains a pin code (6 digit number)
                const hasPinCode = /\b\d{6}\b/.test(formattedAddr)
                // If it has pin code, it's complete - use it directly
                if (hasPinCode) {
                  // Clean up the address - remove Google Plus Code if present (e.g., "PV6X+JXX, ")
                  const cleanedAddr = formattedAddr.replace(/^[A-Z0-9]+\+[A-Z0-9]+,\s*/i, '')
                  return cleanedAddr
                }
                // If it has multiple parts (3+), it's likely complete
                if (formattedAddr.split(',').length >= 3) {
                  const cleanedAddr = formattedAddr.replace(/^[A-Z0-9]+\+[A-Z0-9]+,\s*/i, '')
                  return cleanedAddr
                }
              }
            }

            // PRIORITY 2: Build address from location object components (with zone and pin code)
            // This ensures we always show zone and pin code if available
            const addressParts = []

            // Add addressLine1 if available
            if (locationObj.addressLine1 && locationObj.addressLine1.trim() !== "") {
              addressParts.push(locationObj.addressLine1.trim())
            }

            // Add addressLine2 if available
            if (locationObj.addressLine2 && locationObj.addressLine2.trim() !== "") {
              addressParts.push(locationObj.addressLine2.trim())
            }

            // Add area (zone) if available
            if (locationObj.area && locationObj.area.trim() !== "") {
              addressParts.push(locationObj.area.trim())
            }

            // Add city if available
            if (locationObj.city && locationObj.city.trim() !== "") {
              addressParts.push(locationObj.city.trim())
            }

            // Add state if available
            if (locationObj.state && locationObj.state.trim() !== "") {
              addressParts.push(locationObj.state.trim())
            }

            // Add pin code (priority: pincode > zipCode > postalCode)
            const pinCode = locationObj.pincode || locationObj.zipCode || locationObj.postalCode
            if (pinCode && pinCode.toString().trim() !== "") {
              addressParts.push(pinCode.toString().trim())
            }

            // If we have at least 3 parts (complete address), use it
            if (addressParts.length >= 3) {
              return addressParts.join(', ')
            }

            // If we have at least 2 parts, use it
            if (addressParts.length >= 2) {
              return addressParts.join(', ')
            }

            // PRIORITY 3: Fallback to formattedAddress (even if incomplete)
            if (locationObj.formattedAddress && locationObj.formattedAddress.trim() !== "" && locationObj.formattedAddress !== "Select location") {
              const isCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(locationObj.formattedAddress.trim())
              if (!isCoordinates) {
                const cleanedAddr = locationObj.formattedAddress.trim().replace(/^[A-Z0-9]+\+[A-Z0-9]+,\s*/i, '')
                return cleanedAddr
              }
            }

            // PRIORITY 4: Fallback to address field
            if (locationObj.address && locationObj.address.trim() !== "") {
              return locationObj.address.trim()
            }

            // PRIORITY 5: Last fallback - use area or city
            return locationObj.area || locationObj.city || "Location"
          }

          // Get location object for address formatting
          const locationObj = actualRestaurant?.location || apiRestaurant?.location
          console.log('📍 Location Object for formatting:', locationObj)
          console.log('📍 formattedAddress field:', locationObj?.formattedAddress)
          const formattedAddress = formatRestaurantAddress(locationObj)
          console.log('📍 Final Formatted Address:', formattedAddress)

          // Calculate distance from user to restaurant
          const calculateDistance = (lat1, lng1, lat2, lng2) => {
            const R = 6371 // Earth's radius in kilometers
            const dLat = (lat2 - lat1) * Math.PI / 180
            const dLng = (lng2 - lng1) * Math.PI / 180
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2)
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
            return R * c // Distance in kilometers
          }

          // Get restaurant coordinates
          // Priority: latitude/longitude fields > coordinates array (GeoJSON format: [lng, lat])
          const restaurantLat = locationObj?.latitude || (locationObj?.coordinates && Array.isArray(locationObj.coordinates) ? locationObj.coordinates[1] : null)
          const restaurantLng = locationObj?.longitude || (locationObj?.coordinates && Array.isArray(locationObj.coordinates) ? locationObj.coordinates[0] : null)

          console.log('📍 Restaurant coordinates:', { restaurantLat, restaurantLng, locationObj })

          // Get user coordinates
          const userLat = userLocation?.latitude
          const userLng = userLocation?.longitude

          console.log('📍 User location:', { userLat, userLng, userLocation })

          // Calculate distance if both coordinates are available
          let calculatedDistance = null
          if (userLat && userLng && restaurantLat && restaurantLng &&
            !isNaN(userLat) && !isNaN(userLng) && !isNaN(restaurantLat) && !isNaN(restaurantLng)) {
            const distanceInKm = calculateDistance(userLat, userLng, restaurantLat, restaurantLng)
            // Format distance: show 1 decimal place if >= 1km, otherwise show in meters
            if (distanceInKm >= 1) {
              calculatedDistance = `${distanceInKm.toFixed(1)} km`
            } else {
              const distanceInMeters = Math.round(distanceInKm * 1000)
              calculatedDistance = `${distanceInMeters} m`
            }
            console.log('✅ Calculated distance from user to restaurant:', calculatedDistance, 'km:', distanceInKm)
          } else {
            console.warn('⚠️ Cannot calculate distance - missing coordinates:', {
              hasUserLocation: !!(userLat && userLng),
              hasRestaurantLocation: !!(restaurantLat && restaurantLng),
              userLat,
              userLng,
              restaurantLat,
              restaurantLng
            })
          }

          // Transform API data to match expected format with comprehensive fallbacks
          // Handle both dining restaurant and regular restaurant data structures
          const transformedRestaurant = {
            id: actualRestaurant?.restaurantId || actualRestaurant?._id || actualRestaurant?.id || apiRestaurant?.restaurantId || apiRestaurant?._id || null,
            name: actualRestaurant?.name || apiRestaurant?.name || apiRestaurant?.restaurantName || "Unknown Restaurant",
            cuisine: (actualRestaurant?.cuisines && Array.isArray(actualRestaurant.cuisines) && actualRestaurant.cuisines.length > 0)
              ? actualRestaurant.cuisines[0]
              : (apiRestaurant?.cuisines && Array.isArray(apiRestaurant.cuisines) && apiRestaurant.cuisines.length > 0)
                ? apiRestaurant.cuisines[0]
                : (actualRestaurant?.cuisine || apiRestaurant?.cuisine || actualRestaurant?.category || apiRestaurant?.category || "Multi-cuisine"),
            rating: actualRestaurant?.rating ?? apiRestaurant?.rating ?? actualRestaurant?.averageRating ?? apiRestaurant?.averageRating ?? 4.5,
            reviews: actualRestaurant?.totalRatings ?? apiRestaurant?.totalRatings ?? actualRestaurant?.reviewCount ?? apiRestaurant?.reviewCount ?? actualRestaurant?.reviews?.length ?? apiRestaurant?.reviews?.length ?? 0,
            deliveryTime: actualRestaurant?.estimatedDeliveryTime || apiRestaurant?.estimatedDeliveryTime || actualRestaurant?.deliveryTime || apiRestaurant?.deliveryTime || actualRestaurant?.avgDeliveryTime || apiRestaurant?.avgDeliveryTime || "25-30 mins",
            distance: calculatedDistance || actualRestaurant?.distance || apiRestaurant?.distance || actualRestaurant?.distanceFromUser || apiRestaurant?.distanceFromUser || "1.2 km",
            location: formattedAddress,
            locationObject: locationObj, // Store full location object for reference
            image: actualRestaurant?.profileImage?.url
              || apiRestaurant?.profileImage?.url
              || actualRestaurant?.profileImage
              || apiRestaurant?.profileImage
              || (Array.isArray(actualRestaurant?.menuImages) && actualRestaurant.menuImages.length > 0
                ? (actualRestaurant.menuImages[0]?.url || actualRestaurant.menuImages[0])
                : null)
              || (Array.isArray(apiRestaurant?.menuImages) && apiRestaurant.menuImages.length > 0
                ? (apiRestaurant.menuImages[0]?.url || apiRestaurant.menuImages[0])
                : null)
              || actualRestaurant?.image
              || apiRestaurant?.image
              || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop",
            priceRange: apiRestaurant?.priceRange || "$$",
            offers: Array.isArray(apiRestaurant?.offers) ? apiRestaurant.offers : [], // Will be populated from menu/offers API later
            offerText: apiRestaurant?.offer || "FLAT 50% OFF",
            offerCount: apiRestaurant?.offerCount ?? 0,
            restaurantOffers: {
              goldOffer: {
                title: apiRestaurant?.restaurantOffers?.goldOffer?.title || "Gold exclusive offer",
                description: apiRestaurant?.restaurantOffers?.goldOffer?.description || "Free delivery above ₹99",
                unlockText: apiRestaurant?.restaurantOffers?.goldOffer?.unlockText || "join Gold to unlock",
                buttonText: apiRestaurant?.restaurantOffers?.goldOffer?.buttonText || "Add Gold - ₹1",
              },
              coupons: Array.isArray(apiRestaurant?.restaurantOffers?.coupons)
                ? apiRestaurant.restaurantOffers.coupons
                : [],
            },
            outlets: Array.isArray(apiRestaurant?.outlets) ? apiRestaurant.outlets : [],
            categories: Array.isArray(apiRestaurant?.categories) ? apiRestaurant.categories : [],
            menu: Array.isArray(apiRestaurant?.menu) ? apiRestaurant.menu : [],
            slug: apiRestaurant?.slug || apiRestaurant?.name?.toLowerCase().replace(/\s+/g, '-') || slug || "unknown",
            restaurantId: apiRestaurant?.restaurantId || apiRestaurant?._id || apiRestaurant?.id || null,
            // Add other fields with defaults
            featuredDish: apiRestaurant?.featuredDish || "Special Dish",
            featuredPrice: apiRestaurant?.featuredPrice ?? 249,
            // Additional safety fields
            openDays: Array.isArray(apiRestaurant?.openDays) ? apiRestaurant.openDays : [],
            deliveryTimings: apiRestaurant?.deliveryTimings || {
              openingTime: "09:00",
              closingTime: "22:00",
            },
            cuisines: Array.isArray(apiRestaurant?.cuisines) ? apiRestaurant.cuisines : [],
            profileImage: apiRestaurant?.profileImage || null,
            menuImages: Array.isArray(apiRestaurant?.menuImages) ? apiRestaurant.menuImages : [],
            // Menu sections for display (will be populated from menu API)
            menuSections: [],
            // Onboarding data including FSSAI license
            onboarding: actualRestaurant?.onboarding || apiRestaurant?.onboarding || null,
            // Availability fields for grayscale styling
            isActive: actualRestaurant?.isActive !== false, // Default to true if not specified
            isAcceptingOrders: actualRestaurant?.isAcceptingOrders !== false, // Default to true if not specified
          }

          console.log('✅ Transformed restaurant:', transformedRestaurant)
          console.log('✅ Restaurant ID for menu fetch:', transformedRestaurant.id)

          if (!transformedRestaurant.id) {
            console.error('❌ No restaurant ID found! Cannot fetch menu.')
          }

          setRestaurant(transformedRestaurant)
          fetchedRestaurantRef.current = true // Mark as fetched

          // Fetch menu and inventory for this restaurant
          // If no restaurant ID, try to find matching restaurant by name
          let restaurantIdForMenu = transformedRestaurant.id

          if (!restaurantIdForMenu) {
            console.warn('⚠️ No restaurant ID available, searching for restaurant by name...')
            try {
              // CRITICAL: Only search if zoneId is available (zoneId is required by backend)
              if (!zoneId) {
                console.warn('⚠️ User zone not available, cannot search restaurants. Menu may not load.')
                // Continue without menu - restaurant details are still available
                return
              }

              // Include zoneId for zone-based filtering
              const searchParams = { limit: 100, zoneId: zoneId }
              const searchResponse = await restaurantAPI.getRestaurants(searchParams)
              const restaurants = searchResponse?.data?.data?.restaurants || searchResponse?.data?.data || []

              // Try to find by exact name match
              const matchingRestaurant = restaurants.find(r =>
                r.name?.toLowerCase().trim() === transformedRestaurant.name?.toLowerCase().trim()
              )

              if (matchingRestaurant) {
                restaurantIdForMenu = matchingRestaurant._id || matchingRestaurant.restaurantId || matchingRestaurant.id
                console.log('✅ Found matching restaurant by name, ID:', restaurantIdForMenu)

                // Update the restaurant ID in state
                setRestaurant(prev => ({
                  ...prev,
                  id: restaurantIdForMenu,
                  restaurantId: restaurantIdForMenu
                }))
              } else {
                console.warn('⚠️ No matching restaurant found by name')
              }
            } catch (searchError) {
              console.error('❌ Error searching for restaurant:', searchError)
            }
          }

          if (restaurantIdForMenu) {
            try {
              console.log('📋 Fetching menu for restaurant ID:', restaurantIdForMenu)
              const menuResponse = await restaurantAPI.getMenuByRestaurantId(restaurantIdForMenu)
              if (menuResponse.data && menuResponse.data.success && menuResponse.data.data && menuResponse.data.data.menu) {
                const menuSections = menuResponse.data.data.menu.sections || []

                // Collect all recommended items from all sections
                // Only include items that are both recommended (isRecommended === true) AND available (isAvailable !== false)
                const recommendedItems = []
                menuSections.forEach(section => {
                  // Check direct items - only include if isRecommended is explicitly true (strict check) AND item is available
                  if (section.items && Array.isArray(section.items)) {
                    section.items.forEach(item => {
                      // Strict check: isRecommended must be exactly boolean true
                      // This will exclude: false, undefined, null, 0, "", and any other falsy values
                      if (item.isRecommended === true && typeof item.isRecommended === 'boolean' && item.isAvailable !== false) {
                        recommendedItems.push(item)
                      }
                    })
                  }
                  // Check subsection items - only include if isRecommended is explicitly true (strict check) AND item is available
                  if (section.subsections && Array.isArray(section.subsections)) {
                    section.subsections.forEach(subsection => {
                      if (subsection.items && Array.isArray(subsection.items)) {
                        subsection.items.forEach(item => {
                          // Strict check: isRecommended must be exactly boolean true
                          // This will exclude: false, undefined, null, 0, "", and any other falsy values
                          if (item.isRecommended === true && typeof item.isRecommended === 'boolean' && item.isAvailable !== false) {
                            recommendedItems.push(item)
                          }
                        })
                      }
                    })
                  }
                })

                // Debug log to verify recommended items and their isRecommended values
                console.log('Recommended items collected:', recommendedItems.map(item => ({
                  name: item.name,
                  isRecommended: item.isRecommended,
                  isRecommendedType: typeof item.isRecommended,
                  preparationTime: item.preparationTime
                })))

                // Debug log to check preparationTime in menu sections
                console.log('Menu sections with preparationTime:', menuSections.map(section => ({
                  sectionName: section.name,
                  items: section.items?.map(item => ({
                    name: item.name,
                    preparationTime: item.preparationTime
                  })) || []
                })))

                // Always create recommended section (even if empty) - will show "No dish Yet" if empty
                const finalMenuSections = [{ name: "Recommended for you", items: recommendedItems, subsections: [] }, ...menuSections]

                setRestaurant(prev => ({
                  ...prev,
                  menuSections: finalMenuSections,
                }))

                // Set first 3 sections (Recommended, Starters, Main Course) as expanded by default
                const defaultExpandedSections = new Set([0, 1, 2]) // Index 0, 1, 2
                setExpandedSections(defaultExpandedSections)

                console.log('Fetched menu sections with recommended items:', finalMenuSections)
              }
            } catch (menuError) {
              if (menuError.response && menuError.response.status === 404) {
                console.log('⚠️ Menu not found for this restaurant (might be a dining-only listing).')
              } else {
                console.error('❌ Error fetching menu:', menuError)
              }
            }

            try {
              console.log('📋 Fetching inventory for restaurant ID:', restaurantIdForMenu)
              const inventoryResponse = await restaurantAPI.getInventoryByRestaurantId(restaurantIdForMenu)
              if (inventoryResponse.data && inventoryResponse.data.success && inventoryResponse.data.data && inventoryResponse.data.data.inventory) {
                const inventoryCategories = inventoryResponse.data.data.inventory.categories || []

                // Normalize inventory categories to ensure proper structure
                const normalizedInventory = inventoryCategories.map((category, index) => ({
                  id: category.id || `category-${index}`,
                  name: category.name || "Unnamed Category",
                  description: category.description || "",
                  itemCount: category.itemCount ?? (category.items?.length || 0),
                  inStock: category.inStock !== undefined ? category.inStock : true,
                  items: Array.isArray(category.items) ? category.items.map(item => ({
                    id: String(item.id || Date.now() + Math.random()),
                    name: item.name || "Unnamed Item",
                    inStock: item.inStock !== undefined ? item.inStock : true,
                    isVeg: item.isVeg !== undefined ? item.isVeg : true,
                    stockQuantity: item.stockQuantity || "Unlimited",
                    unit: item.unit || "piece",
                    expiryDate: item.expiryDate || null,
                    lastRestocked: item.lastRestocked || null,
                  })) : [],
                  order: category.order !== undefined ? category.order : index,
                }))

                setRestaurant(prev => ({
                  ...prev,
                  inventory: normalizedInventory,
                }))
                console.log('✅ Fetched and normalized inventory categories:', normalizedInventory)
              }
            } catch (inventoryError) {
              if (inventoryError.response && inventoryError.response.status === 404) {
                console.log('⚠️ Inventory not found for this restaurant (might be a dining-only listing).')
              } else {
                console.error('❌ Error fetching inventory:', inventoryError)
              }
            }
          }
        } else {
          console.error('❌ No restaurant data found in API response')
          console.error('❌ Response:', response)
          console.error('❌ apiRestaurant:', apiRestaurant)
          setRestaurantError('Restaurant not found')
          setRestaurant(null)
        }
      } catch (error) {
        // Check if it's a network error (backend not running)
        const isNetworkError = error.code === 'ERR_NETWORK' || error.message === 'Network Error'

        // Check if it's a 404 error (restaurant doesn't exist)
        const is404Error = error.response?.status === 404

        if (isNetworkError) {
          // Network error - backend is not running
          // Don't show "Restaurant not found" for network errors
          // The axios interceptor will show a toast notification
          console.error('Network error fetching restaurant (backend may not be running):', error)
          setRestaurantError('Backend server is not connected. Please make sure the backend is running.')
          setRestaurant(null)
        } else if (is404Error) {
          // 404 error - restaurant doesn't exist in database
          console.log(`Restaurant "${slug}" not found in database`)
          setRestaurantError('Restaurant not found')
          setRestaurant(null)
        } else {
          // Other errors
          console.error('Error fetching restaurant:', error)
          setRestaurantError(error.message || 'Failed to load restaurant')
          setRestaurant(null)
        }
      } finally {
        setLoadingRestaurant(false)
      }
    }

    // Reset fetched flag when slug changes
    if (fetchedRestaurantRef.current && restaurant?.slug !== slug) {
      fetchedRestaurantRef.current = false
    }

    // Wait for zone to load before fetching (if zone-based search might be needed)
    // But don't block if we're fetching by direct ID
    if (loadingZone) {
      console.log('⏳ Waiting for zone detection before fetching restaurant...')
      return
    }

    fetchRestaurant()
  }, [slug, zoneId, loadingZone, restaurant?.slug])

  // Track previous values to prevent unnecessary recalculations
  const prevCoordsRef = useRef({ userLat: null, userLng: null, restaurantLat: null, restaurantLng: null })
  const prevDistanceRef = useRef(null)

  // Extract restaurant coordinates as stable values (not array references)
  const restaurantLat = restaurant?.locationObject?.latitude ||
    (restaurant?.locationObject?.coordinates && Array.isArray(restaurant.locationObject.coordinates)
      ? restaurant.locationObject.coordinates[1]
      : null)
  const restaurantLng = restaurant?.locationObject?.longitude ||
    (restaurant?.locationObject?.coordinates && Array.isArray(restaurant.locationObject.coordinates)
      ? restaurant.locationObject.coordinates[0]
      : null)

  // Recalculate distance when user location updates
  useEffect(() => {
    if (!restaurant || !userLocation?.latitude || !userLocation?.longitude) return
    if (!restaurantLat || !restaurantLng) return

    const userLat = userLocation.latitude
    const userLng = userLocation.longitude

    // Check if coordinates have actually changed (with small threshold to avoid floating point issues)
    const coordsChanged =
      Math.abs(prevCoordsRef.current.userLat - userLat) > 0.0001 ||
      Math.abs(prevCoordsRef.current.userLng - userLng) > 0.0001 ||
      Math.abs(prevCoordsRef.current.restaurantLat - restaurantLat) > 0.0001 ||
      Math.abs(prevCoordsRef.current.restaurantLng - restaurantLng) > 0.0001

    // Skip recalculation if coordinates haven't changed
    if (!coordsChanged && prevDistanceRef.current !== null) {
      return
    }

    // Update refs with current coordinates
    prevCoordsRef.current = { userLat, userLng, restaurantLat, restaurantLng }

    if (userLat && userLng && restaurantLat && restaurantLng &&
      !isNaN(userLat) && !isNaN(userLng) && !isNaN(restaurantLat) && !isNaN(restaurantLng)) {

      // Calculate distance
      const calculateDistance = (lat1, lng1, lat2, lng2) => {
        const R = 6371 // Earth's radius in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180
        const dLng = (lng2 - lng1) * Math.PI / 180
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return R * c // Distance in kilometers
      }

      const distanceInKm = calculateDistance(userLat, userLng, restaurantLat, restaurantLng)
      let calculatedDistance = null

      // Format distance: show 1 decimal place if >= 1km, otherwise show in meters
      if (distanceInKm >= 1) {
        calculatedDistance = `${distanceInKm.toFixed(1)} km`
      } else {
        const distanceInMeters = Math.round(distanceInKm * 1000)
        calculatedDistance = `${distanceInMeters} m`
      }

      // Only update if distance actually changed
      if (calculatedDistance !== prevDistanceRef.current) {
        console.log('🔄 Recalculated distance from user to restaurant:', calculatedDistance, 'km:', distanceInKm)
        prevDistanceRef.current = calculatedDistance

        // Update restaurant distance
        setRestaurant(prev => {
          // Only update if distance actually changed to prevent infinite loop
          if (prev?.distance === calculatedDistance) {
            return prev
          }
          return {
            ...prev,
            distance: calculatedDistance
          }
        })
      }
    }
  }, [userLocation?.latitude, userLocation?.longitude, restaurantLat, restaurantLng])

  // Sync quantities from cart on mount and when restaurant changes
  useEffect(() => {
    if (!restaurant || !restaurant.name) return

    const cartQuantities = {}
    cart.forEach((item) => {
      if (item.restaurant === restaurant.name) {
        cartQuantities[item.id] = item.quantity || 0
      }
    })
    setQuantities(cartQuantities)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.name, cart])

  // Helper function to update item quantity in both local state and cart
  const updateItemQuantity = (item, newQuantity, event = null) => {
    // Check authentication
    if (!isModuleAuthenticated('user')) {
      toast.error("Please login to add items to cart")
      navigate('/user/auth/sign-in', { state: { from: location.pathname } })
      return
    }

    // CRITICAL: Check if user is in service zone or restaurant is available
    if (isOutOfService) {
      toast.error('You are outside the service zone. Please select a location within the service area.');
      return;
    }

    // Note: We don't block cart operations based on restaurant availability
    // Only block if user is out of service zone

    // Update local state
    setQuantities((prev) => ({
      ...prev,
      [item.id]: newQuantity,
    }))

    // CRITICAL: Validate restaurant data before adding to cart
    if (!restaurant || !restaurant.name) {
      console.error('❌ Cannot add item to cart: Restaurant data is missing!');
      toast.error('Restaurant information is missing. Please refresh the page.');
      return;
    }

    // Ensure we have a valid restaurantId
    const validRestaurantId = restaurant?.restaurantId || restaurant?._id || restaurant?.id;
    if (!validRestaurantId) {
      console.error('❌ Cannot add item to cart: Restaurant ID is missing!', {
        restaurant: restaurant,
        restaurantId: restaurant?.restaurantId,
        _id: restaurant?._id,
        id: restaurant?.id
      });
      toast.error('Restaurant ID is missing. Please refresh the page.');
      return;
    }

    // Log for debugging
    console.log('🛒 Adding item to cart:', {
      itemName: item.name,
      restaurantName: restaurant.name,
      restaurantId: validRestaurantId,
      restaurant_id: restaurant._id,
      restaurant_restaurantId: restaurant.restaurantId
    });

    // Prepare cart item with all required properties
    const cartItem = {
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
      restaurant: restaurant.name, // Use restaurant.name directly (already validated)
      restaurantId: validRestaurantId, // Use validated restaurantId
      description: item.description,
      originalPrice: item.originalPrice,
      isVeg: item.isVeg !== false // Add isVeg property
    }

    // Get source position for animation from event target
    // Prefer currentTarget (the button) over target (might be icon inside button)
    let sourcePosition = null
    if (event) {
      // Use currentTarget (the button element) for accurate button position
      // If currentTarget is not available, try to find the button element
      let buttonElement = event.currentTarget
      if (!buttonElement && event.target) {
        // If we clicked on an icon inside, find the closest button
        buttonElement = event.target.closest('button') || event.target
      }

      if (buttonElement) {
        // Store button reference and current viewport position
        // We'll recalculate position right before animation to account for scroll
        const rect = buttonElement.getBoundingClientRect()
        const scrollX = window.pageXOffset || window.scrollX || 0
        const scrollY = window.pageYOffset || window.scrollY || 0

        // Store both viewport position and scroll at capture time
        // This allows us to adjust for scroll changes later
        sourcePosition = {
          // Viewport-relative position at capture time
          viewportX: rect.left + rect.width / 2,
          viewportY: rect.top + rect.height / 2,
          // Scroll position at capture time
          scrollX: scrollX,
          scrollY: scrollY,
          // Store button identifier to potentially find it again
          itemId: item.id,
        }
      }
    }

    // Update cart context
    if (newQuantity <= 0) {
      // Pass sourcePosition and product info for removal animation
      const productInfo = {
        id: item.id,
        name: item.name,
        imageUrl: item.image,
      }
      removeFromCart(item.id, sourcePosition, productInfo)
    } else {
      const existingCartItem = getCartItem(item.id)
      if (existingCartItem) {
        // Prepare product info for animation
        const productInfo = {
          id: item.id,
          name: item.name,
          imageUrl: item.image,
        }

        // If incrementing quantity, trigger add animation with sourcePosition
        if (newQuantity > existingCartItem.quantity && sourcePosition) {
          try {
            addToCart(cartItem, sourcePosition)
            if (newQuantity > existingCartItem.quantity + 1) {
              updateQuantity(item.id, newQuantity)
            }
          } catch (error) {
            // Handle restaurant mismatch error
            console.error('❌ Error adding item to cart:', error);
            toast.error(error.message || 'Cannot add item from different restaurant. Please clear cart first.');
            return; // Don't update quantity if add failed
          }
        }
        // If decreasing quantity, trigger removal animation with sourcePosition
        else if (newQuantity < existingCartItem.quantity && sourcePosition) {
          updateQuantity(item.id, newQuantity, sourcePosition, productInfo)
        }
        // Otherwise just update quantity without animation
        else {
          updateQuantity(item.id, newQuantity)
        }
      } else {
        // Add to cart first (adds with quantity 1), then update to desired quantity
        // Pass sourcePosition when adding a new item
        try {
          addToCart(cartItem, sourcePosition)
          if (newQuantity > 1) {
            updateQuantity(item.id, newQuantity)
          }
        } catch (error) {
          // Handle restaurant mismatch error
          console.error('❌ Error adding item to cart:', error);
          toast.error(error.message || 'Cannot add item from different restaurant. Please clear cart first.');
        }
      }
    }
  }

  // Menu categories - dynamically generated from restaurant menu sections
  const menuCategories = (restaurant?.menuSections && Array.isArray(restaurant.menuSections))
    ? restaurant.menuSections.map((section, index) => {
      // Handle section name - check for valid non-empty string
      let sectionTitle = "Unnamed Section"
      if (index === 0) {
        sectionTitle = "Recommended for you"
      } else if (section?.name && typeof section.name === 'string' && section.name.trim()) {
        sectionTitle = section.name.trim()
      } else if (section?.title && typeof section.title === 'string' && section.title.trim()) {
        sectionTitle = section.title.trim()
      }

      const itemCount = section?.items?.length || 0
      const subsectionCount = section?.subsections?.reduce((sum, sub) => sum + (sub?.items?.length || 0), 0) || 0
      const totalCount = itemCount + subsectionCount

      return {
        name: sectionTitle,
        count: totalCount,
        sectionIndex: index,
      }
    })
    : []

  // Count active filters
  const getActiveFilterCount = () => {
    let count = 0
    if (filters.sortBy) count++
    if (filters.vegNonVeg) count++
    return count
  }

  const activeFilterCount = getActiveFilterCount()

  // Handle bookmark click
  const handleBookmarkClick = (item) => {
    const restaurantId = restaurant?.restaurantId || restaurant?._id || restaurant?.id
    if (!restaurantId) {
      toast.error("Restaurant information is missing")
      return
    }

    const dishId = item.id || item._id
    if (!dishId) {
      toast.error("Dish information is missing")
      return
    }

    const isFavorite = isDishFavorite(dishId, restaurantId)

    if (isFavorite) {
      // If already bookmarked, remove it
      removeDishFavorite(dishId, restaurantId)
      toast.success("Dish removed from favorites")
    } else {
      // Add to favorites
      const dishData = {
        id: dishId,
        name: item.name,
        description: item.description,
        price: item.price,
        originalPrice: item.originalPrice,
        image: item.image,
        restaurantId: restaurantId,
        restaurantName: restaurant?.name || "",
        restaurantSlug: restaurant?.slug || slug || "",
        foodType: item.foodType,
        isSpicy: item.isSpicy,
        customisable: item.customisable,
      }
      addDishFavorite(dishData)
      toast.success("Dish added to favorites")
    }
  }

  // Handle add to collection
  const handleAddToCollection = () => {
    const restaurantSlug = restaurant?.slug || slug || ""

    if (!restaurantSlug) {
      toast.error("Restaurant information is missing")
      return
    }

    if (!restaurant) {
      toast.error("Restaurant data not available")
      return
    }

    const isAlreadyFavorite = isFavorite(restaurantSlug)

    if (isAlreadyFavorite) {
      // Remove from collection
      removeFavorite(restaurantSlug)
      toast.success("Restaurant removed from collection")
    } else {
      // Add to collection
      addFavorite({
        slug: restaurantSlug,
        name: restaurant.name || "",
        cuisine: restaurant.cuisine || "",
        rating: restaurant.rating || 0,
        deliveryTime: restaurant.deliveryTime || restaurant.estimatedDeliveryTime || "",
        distance: restaurant.distance || "",
        priceRange: restaurant.priceRange || "",
        image: restaurant.profileImageUrl?.url || restaurant.image || ""
      })
      toast.success("Restaurant added to collection")
    }

    setShowMenuOptionsSheet(false)
  }

  // Handle share restaurant
  const handleShareRestaurant = async () => {
    const companyName = await getCompanyNameAsync()
    const restaurantSlug = restaurant?.slug || slug || ""
    const restaurantName = restaurant?.name || "this restaurant"

    // Create share URL
    const shareUrl = `${window.location.origin}/user/restaurants/${restaurantSlug}`
    const shareText = `Check out ${restaurantName} on ${companyName}! ${shareUrl}`

    // Try Web Share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: restaurantName,
          text: shareText,
          url: shareUrl,
        })
        toast.success("Restaurant shared successfully")
        setShowMenuOptionsSheet(false)
      } catch (error) {
        // User cancelled or error occurred
        if (error.name !== "AbortError") {
          // Fallback to copy to clipboard
          await copyToClipboard(shareUrl)
        }
      }
    } else {
      // Fallback to copy to clipboard
      await copyToClipboard(shareUrl)
    }
  }



  // Handle share click
  const handleShareClick = async (item) => {
    const restaurantId = restaurant?.restaurantId || restaurant?._id || restaurant?.id
    const dishId = item.id || item._id
    const restaurantSlug = restaurant?.slug || slug || ""

    // Create share URL
    const shareUrl = `${window.location.origin}/user/restaurants/${restaurantSlug}?dish=${dishId}`
    const shareText = `Check out ${item.name} from ${restaurant?.name || "this restaurant"}! ${shareUrl}`

    // Try Web Share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${item.name} - ${restaurant?.name || ""}`,
          text: shareText,
          url: shareUrl,
        })
        toast.success("Dish shared successfully")
      } catch (error) {
        // User cancelled or error occurred
        if (error.name !== "AbortError") {
          // Fallback to copy to clipboard
          await copyToClipboard(shareUrl)
        }
      }
    } else {
      // Fallback to copy to clipboard
      await copyToClipboard(shareUrl)
    }
  }

  // Copy to clipboard helper
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Link copied to clipboard!")
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea")
      textArea.value = text
      textArea.style.position = "fixed"
      textArea.style.opacity = "0"
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand("copy")
        toast.success("Link copied to clipboard!")
      } catch (err) {
        toast.error("Failed to copy link")
      }
      document.body.removeChild(textArea)
    }
  }

  // Handle item card click
  const handleItemClick = (item) => {
    setSelectedItem(item)
    setShowItemDetail(true)
  }

  // Helper function to calculate final price after discount
  const getFinalPrice = (item) => {
    // If discount exists, calculate from originalPrice, otherwise use price directly
    if (item.originalPrice && item.discountAmount && item.discountAmount > 0) {
      // Calculate discounted price from originalPrice
      let discountedPrice = item.originalPrice;
      if (item.discountType === 'Percent') {
        discountedPrice = item.originalPrice - (item.originalPrice * item.discountAmount / 100);
      } else if (item.discountType === 'Fixed') {
        discountedPrice = item.originalPrice - item.discountAmount;
      }
      return Math.max(0, discountedPrice);
    }
    // Otherwise, use price as the final price
    return Math.max(0, item.price || 0);
  };

  // Filter menu items based on active filters
  const filterMenuItems = (items) => {
    if (!items) return items

    return items.filter((item) => {
      // Under 250 filter (when coming from Under 250 page)
      if (showOnlyUnder250) {
        const finalPrice = getFinalPrice(item);
        if (finalPrice > 250) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const itemName = item.name?.toLowerCase() || ""
        if (!itemName.includes(query)) return false
      }

      // VegMode filter - when vegMode is ON, show only Veg items
      // When vegMode is false/null/undefined, show all items (Veg and Non-Veg)
      if (vegMode === true) {
        if (item.foodType !== "Veg") return false
      }

      // Veg/Non-veg filter (local filter override)
      if (filters.vegNonVeg === "veg") {
        // Show only veg items
        if (item.foodType !== "Veg") return false
      }
      if (filters.vegNonVeg === "non-veg") {
        // Show only non-veg items
        if (item.foodType !== "Non-Veg") return false
      }


      return true
    })
  }

  // Sort items based on sortBy filter
  const sortMenuItems = (items) => {
    if (!items) return items
    if (!filters.sortBy) return items

    const sorted = [...items]
    if (filters.sortBy === "low-to-high") {
      return sorted.sort((a, b) => getFinalPrice(a) - getFinalPrice(b))
    } else if (filters.sortBy === "high-to-low") {
      return sorted.sort((a, b) => getFinalPrice(b) - getFinalPrice(a))
    }
    return sorted
  }

  // Helper function to check if a section has any items under ₹250
  const sectionHasItemsUnder250 = (section) => {
    if (!showOnlyUnder250) return true; // If not filtering, show all sections

    // Check direct items
    if (section.items && section.items.length > 0) {
      const hasUnder250Items = section.items.some(item => {
        if (item.isAvailable === false) return false;
        const finalPrice = getFinalPrice(item);
        return finalPrice <= 250;
      });
      if (hasUnder250Items) return true;
    }

    // Check subsection items
    if (section.subsections && section.subsections.length > 0) {
      for (const subsection of section.subsections) {
        if (subsection.items && subsection.items.length > 0) {
          const hasUnder250Items = subsection.items.some(item => {
            if (item.isAvailable === false) return false;
            const finalPrice = getFinalPrice(item);
            return finalPrice <= 250;
          });
          if (hasUnder250Items) return true;
        }
      }
    }

    return false;
  }

  // Filter sections to only show those with items under ₹250
  // Returns array of { section, originalIndex } to preserve original index for expanded sections
  const getFilteredSections = () => {
    if (!restaurant?.menuSections) return [];
    if (!showOnlyUnder250) {
      return restaurant.menuSections.map((section, index) => ({ section, originalIndex: index }));
    }

    return restaurant.menuSections
      .map((section, index) => ({ section, originalIndex: index }))
      .filter(({ section }) => sectionHasItemsUnder250(section));
  }

  // Highlight offers/texts for the blue offer line
  const highlightOffers = [
    "Upto 50% OFF",
    restaurant?.offerText || "",
    ...(Array.isArray(restaurant?.offers) ? restaurant.offers.map((offer) => offer?.title || "") : []),
  ]

  // Auto-rotate images every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => {
        const offersLength = Array.isArray(restaurant?.offers) ? restaurant.offers.length : 1
        return (prev + 1) % offersLength
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [restaurant?.offers?.length || 0])

  // Auto-rotate highlight offer text every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setHighlightIndex((prev) => (prev + 1) % highlightOffers.length)
    }, 2000)

    return () => clearInterval(interval)
  }, [highlightOffers.length])

  // Show loading state
  if (loadingRestaurant) {
    return (
      <AnimatedPage>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 text-[#EB590E] animate-spin" />
            <span className="text-sm text-gray-600">Loading restaurant...</span>
          </div>
        </div>
      </AnimatedPage>
    )
  }

  // Show error state if restaurant not found or network error
  if (restaurantError && !restaurant) {
    const isNetworkError = restaurantError.includes('Backend server is not connected')
    const isNotFoundError = restaurantError === 'Restaurant not found'

    return (
      <AnimatedPage>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className={`h-12 w-12 ${isNetworkError ? 'text-orange-500' : 'text-red-500'}`} />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                {isNetworkError ? 'Connection Error' : isNotFoundError ? 'Restaurant not found' : 'Error'}
              </h2>
              <p className="text-sm text-gray-600 mb-4 max-w-md">{restaurantError}</p>
              {isNetworkError && (
                <p className="text-xs text-gray-500 mb-4">
                  Make sure the backend server is running at {API_BASE_URL.replace('/api', '')}
                </p>
              )}
              <Button onClick={() => navigate(-1)} variant="outline">
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </AnimatedPage>
    )
  }

  // Show error if restaurant is still null
  if (!restaurant) {
    return (
      <AnimatedPage>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <span className="text-sm text-gray-600">Restaurant not found</span>
            <Button onClick={() => navigate(-1)} variant="outline">
              Go Back
            </Button>
          </div>
        </div>
      </AnimatedPage>
    )
  }

  // Only show grayscale when user is out of service (not based on restaurant availability)
  const shouldShowGrayscale = isOutOfService

  return (
    <AnimatedPage
      id="scrollingelement"
      className={`min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col transition-all duration-300 ${shouldShowGrayscale ? 'grayscale opacity-75' : ''
        }`}
    >
      {/* Header - Back, Search, Menu (like reference image) */}
      <div className="px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 pt-3 md:pt-4 lg:pt-5 pb-2 md:pb-3 bg-white dark:bg-[#1a1a1a]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Back Button */}
          <Button
            variant="outline"
            size="icon"
            className="rounded-full h-10 w-10 border-gray-200 dark:border-gray-800 shadow-sm bg-white dark:bg-[#1a1a1a]"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5 text-gray-900 dark:text-white" />
          </Button>

          {/* Right side: Search pill + menu */}
          <div className="flex items-center gap-3">
            {!showSearch ? (
              <Button
                variant="outline"
                className="rounded-full h-10 px-4 border-gray-200 dark:border-gray-800 shadow-sm bg-white dark:bg-[#1a1a1a] flex items-center gap-2 text-gray-900 dark:text-white"
                onClick={() => setShowSearch(true)}
              >
                <Search className="h-4 w-4" />
                <span className="text-sm font-medium">Search</span>
              </Button>
            ) : (
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search for dishes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 rounded-full border border-gray-200 dark:border-gray-800 shadow-sm bg-white dark:bg-[#1a1a1a] text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-[#EB590E] focus:border-transparent"
                    autoFocus
                    onBlur={() => {
                      if (!searchQuery) {
                        setShowSearch(false)
                      }
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery("")
                        setShowSearch(false)
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
            <Button
              variant="outline"
              size="icon"
              className="rounded-full h-10 w-10 border-gray-200 dark:border-gray-800 shadow-sm bg-white dark:bg-[#1a1a1a]"
              onClick={() => setShowMenuOptionsSheet(true)}
            >
              <MoreVertical className="h-5 w-5 text-gray-900 dark:text-white" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white dark:bg-[#1a1a1a] rounded-t-3xl relative z-10 min-h-[40vh]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-4 sm:py-5 md:py-6 lg:py-8 space-y-3 md:space-y-4 lg:space-y-5 pb-0">
          {/* Restaurant Name and Rating */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{restaurant?.name || "Unknown Restaurant"}</h1>
              <Info className="h-5 w-5 text-gray-400" />
            </div>
            <div className="flex flex-col items-end">
              <Badge className="bg-green-600 text-white mb-1 flex items-center gap-1 px-2 py-1">
                <Star className="h-3 w-3 fill-white" />
                {restaurant?.rating ?? 4.5}
              </Badge>
              <span className="text-xs text-gray-500">By {(restaurant.reviews || 0).toLocaleString()}+</span>
            </div>
          </div>

          {/* Location */}
          <div
            className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
            onClick={() => setShowLocationSheet(true)}
          >
            <MapPin className="h-4 w-4" />
            <span>{restaurant?.distance || "1.2 km"} · {restaurant?.location || "Location"}</span>
            <ChevronDown className="h-4 w-4 text-gray-500" />
          </div>

          {/* Delivery Time */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <Clock className="h-4 w-4" />
              <span>{restaurant?.deliveryTime || "25-30 mins"}</span>
            </div>
          </div>

          {/* Offers */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm overflow-hidden">
              <Tag className="h-4 w-4 text-[#EB590E]" />
              <div className="relative h-5 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={highlightIndex}
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -16, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-[#EB590E] font-medium inline-block"
                  >
                    {highlightOffers[highlightIndex]}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Filter/Category Buttons */}
          <div className="border-y border-gray-200 py-3 -mx-4 px-4 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-2 w-max">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5 whitespace-nowrap border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] relative"
                onClick={() => setShowFilterSheet(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-semibold">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={`flex items-center gap-1.5 whitespace-nowrap border-gray-300 bg-white rounded-full ${filters.vegNonVeg === "veg" ? "border-green-600 bg-green-50 text-green-700 font-bold" : ""
                  }`}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    vegNonVeg: prev.vegNonVeg === "veg" ? null : "veg",
                  }))
                }
              >
                <div className="h-3 w-3 rounded-full bg-green-500" />
                Veg
                {filters.vegNonVeg === "veg" && (
                  <X className="h-3 w-3 text-gray-600" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={`flex items-center gap-1.5 whitespace-nowrap border-gray-300 bg-white rounded-full ${filters.vegNonVeg === "non-veg" ? "border-amber-700 bg-amber-50" : ""
                  }`}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    vegNonVeg: prev.vegNonVeg === "non-veg" ? null : "non-veg",
                  }))
                }
              >
                <div className="h-3 w-3 rounded-full bg-amber-700" />
                Non-veg
                {filters.vegNonVeg === "non-veg" && (
                  <X className="h-3 w-3 text-gray-600" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Menu Items Section */}
        {restaurant?.menuSections && Array.isArray(restaurant.menuSections) && restaurant.menuSections.length > 0 && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-6 sm:py-8 md:py-10 lg:py-12 space-y-6 md:space-y-8 lg:space-y-10">
            {getFilteredSections().map(({ section, originalIndex }, sectionIndex) => {
              // Handle section name - check for valid non-empty string
              let sectionTitle = "Unnamed Section"
              if (originalIndex === 0) {
                sectionTitle = "Recommended for you"
              } else if (section?.name && typeof section.name === 'string' && section.name.trim()) {
                sectionTitle = section.name.trim()
              } else if (section?.title && typeof section.title === 'string' && section.title.trim()) {
                sectionTitle = section.title.trim()
              }
              const sectionId = `menu-section-${originalIndex}`

              const isExpanded = expandedSections.has(originalIndex)

              return (
                <div key={sectionIndex} id={sectionId} className="space-y-1 scroll-mt-20">
                  {/* Section Header */}
                  {sectionIndex === 0 && (
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                        Recommended for you
                      </h2>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedSections(prev => {
                            const newSet = new Set(prev)
                            if (newSet.has(originalIndex)) {
                              newSet.delete(originalIndex)
                            } else {
                              newSet.add(originalIndex)
                            }
                            return newSet
                          })
                        }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                      >
                        <ChevronDown
                          className={`h-5 w-5 text-gray-600 dark:text-gray-400 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'
                            }`}
                        />
                      </button>
                    </div>
                  )}
                  {sectionIndex > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                          {(section?.name && typeof section.name === 'string' && section.name.trim())
                            ? section.name.trim()
                            : (section?.title && typeof section.title === 'string' && section.title.trim())
                              ? section.title.trim()
                              : "Unnamed Section"}
                        </h2>
                        {section.subtitle && (
                          <button className="text-sm text-blue-600 dark:text-blue-400 underline">
                            {section.subtitle}
                          </button>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedSections(prev => {
                            const newSet = new Set(prev)
                            if (newSet.has(originalIndex)) {
                              newSet.delete(originalIndex)
                            } else {
                              newSet.add(originalIndex)
                            }
                            return newSet
                          })
                        }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                      >
                        <ChevronDown
                          className={`h-5 w-5 text-gray-600 dark:text-gray-400 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'
                            }`}
                        />
                      </button>
                    </div>
                  )}

                  {/* Direct Items */}
                  {isExpanded && originalIndex === 0 && section.items && section.items.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-gray-500 dark:text-gray-400 text-sm md:text-base">
                        No dish recommended
                      </p>
                    </div>
                  )}
                  {isExpanded && section.items && section.items.length > 0 && (
                    <div className="space-y-0">
                      {sortMenuItems(filterMenuItems(section.items)).map((item) => {
                        const quantity = quantities[item.id] || 0
                        // Determine veg/non-veg based on foodType
                        const isVeg = item.foodType === "Veg"

                        // Debug: Log preparationTime for troubleshooting
                        if (item.preparationTime) {
                          console.log(`[FRONTEND] Item "${item.name}" preparationTime:`, item.preparationTime, 'Type:', typeof item.preparationTime)
                        }

                        return (
                          <div
                            key={item.id}
                            className="flex gap-4 p-4 border-b border-gray-100 last:border-none relative cursor-pointer"
                            onClick={() => handleItemClick(item)}
                          >
                            {/* Left Side - Details */}
                            <div className="flex-1 min-w-0">
                              {/* Veg Icon & Spicy Indicator */}
                              <div className="flex items-center gap-2 mb-1">
                                {isVeg ? (
                                  <div className="w-4 h-4 border-2 border-green-600 flex items-center justify-center rounded-sm flex-shrink-0">
                                    <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                                  </div>
                                ) : (
                                  <div className="w-4 h-4 border-2 border-orange-600 flex items-center justify-center rounded-sm flex-shrink-0">
                                    <div className="w-2 h-2 bg-orange-600 rounded-full"></div>
                                  </div>
                                )}
                                {item.isSpicy && <span className="text-red-500">🌶️</span>}
                              </div>

                              <h3 className="font-bold text-gray-800 dark:text-white text-lg leading-tight">{item.name}</h3>

                              {/* Highly Reordered Progress Bar - Show if customisable */}
                              {item.customisable && (
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="h-1.5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#EB590E] w-3/4"></div>
                                  </div>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Highly reordered</span>
                                </div>
                              )}

                              <div className="flex items-center gap-3 mt-1">
                                <p className="font-semibold text-gray-900 dark:text-white">₹{Math.round(item.price)}</p>
                                {/* Preparation Time - Show if available */}
                                {item.preparationTime && String(item.preparationTime).trim() && (
                                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                                    <Clock size={12} className="text-gray-500" />
                                    <span>{String(item.preparationTime).trim()}</span>
                                  </div>
                                )}
                              </div>

                              {/* Description - Show if available */}
                              {item.description && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{item.description}</p>
                              )}

                              {/* Action Buttons - Bookmark and Share */}
                              <div className="flex gap-4 mt-3">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    handleBookmarkClick(item)
                                  }}
                                  className={`p-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isDishFavorite(item.id, restaurant?.restaurantId || restaurant?._id || restaurant?.id)
                                    ? "border-red-500 text-red-500 bg-red-50 dark:bg-red-900/20"
                                    : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                                    }`}
                                >
                                  <Bookmark
                                    size={18}
                                    className={isDishFavorite(item.id, restaurant?.restaurantId || restaurant?._id || restaurant?.id) ? "fill-red-500" : ""}
                                  />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    handleShareClick(item)
                                  }}
                                  className="p-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                >
                                  <Share2 size={18} />
                                </button>
                              </div>
                            </div>

                            {/* Right Side - Image and Add Button */}
                            <div className="relative w-32 h-32 flex-shrink-0">
                              {item.image ? (
                                <img
                                  src={item.image}
                                  alt={item.name}
                                  className="w-full h-full object-cover rounded-2xl shadow-sm"
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-200 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                                  <span className="text-xs text-gray-400">No image</span>
                                </div>
                              )}
                              {quantity > 0 ? (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className={`absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white border font-bold px-4 py-1.5 rounded-lg shadow-md flex items-center gap-1 ${shouldShowGrayscale
                                    ? 'border-gray-300 text-gray-400 cursor-not-allowed opacity-50'
                                    : 'border-[#EB590E] text-[#EB590E] hover:bg-orange-50'
                                    }`}
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (!shouldShowGrayscale) {
                                        updateItemQuantity(item, Math.max(0, quantity - 1), e)
                                      }
                                    }}
                                    disabled={shouldShowGrayscale}
                                    className={shouldShowGrayscale ? 'text-gray-400 cursor-not-allowed' : 'text-[#EB590E] hover:text-[#D94F0C]'}
                                  >
                                    <Minus size={14} />
                                  </button>
                                  <span className={`mx-2 text-sm ${shouldShowGrayscale ? 'text-gray-400' : ''}`}>{quantity}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (!shouldShowGrayscale) {
                                        updateItemQuantity(item, quantity + 1, e)
                                      }
                                    }}
                                    disabled={shouldShowGrayscale}
                                    className={shouldShowGrayscale ? 'text-gray-400 cursor-not-allowed' : 'text-[#EB590E] hover:text-[#D94F0C]'}
                                  >
                                    <Plus size={14} className="stroke-[3px]" />
                                  </button>
                                </motion.div>
                              ) : (
                                <motion.button
                                  layoutId={`add-button-${item.id}`}
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ duration: 0.3, type: "spring", damping: 20, stiffness: 300 }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!shouldShowGrayscale) {
                                      updateItemQuantity(item, 1, e)
                                    }
                                  }}
                                  disabled={shouldShowGrayscale}
                                  className={`absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white border font-bold px-6 py-1.5 rounded-lg shadow-md flex items-center gap-1 transition-colors ${shouldShowGrayscale
                                    ? 'border-gray-300 text-gray-400 cursor-not-allowed opacity-50'
                                    : 'border-[#EB590E] text-[#EB590E] hover:bg-orange-50'
                                    }`}
                                >
                                  ADD <Plus size={14} className="stroke-[3px]" />
                                </motion.button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Subsections */}
                  {isExpanded && section.subsections && section.subsections.length > 0 && (
                    <div className="space-y-4">
                      {section.subsections.filter(subsection => {
                        // Filter subsections to only show those with items under ₹250
                        if (!showOnlyUnder250) return true;
                        if (!subsection.items || subsection.items.length === 0) return false;
                        return subsection.items.some(item => {
                          if (item.isAvailable === false) return false;
                          const finalPrice = getFinalPrice(item);
                          return finalPrice <= 250;
                        });
                      }).map((subsection, subIndex) => {
                        const subsectionKey = `${originalIndex}-${subIndex}`
                        const isSubsectionExpanded = expandedSections.has(subsectionKey)

                        return (
                          <div key={subIndex} className="space-y-4">
                            {/* Subsection Header */}
                            <div className="flex items-center justify-between">
                              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                                {subsection?.name || subsection?.title || "Subsection"}
                              </h3>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setExpandedSections(prev => {
                                    const newSet = new Set(prev)
                                    if (newSet.has(subsectionKey)) {
                                      newSet.delete(subsectionKey)
                                    } else {
                                      newSet.add(subsectionKey)
                                    }
                                    return newSet
                                  })
                                }}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                              >
                                <ChevronDown
                                  className={`h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isSubsectionExpanded ? '' : '-rotate-90'
                                    }`}
                                />
                              </button>
                            </div>

                            {/* Subsection Items */}
                            {isSubsectionExpanded && subsection.items && subsection.items.length > 0 && (
                              <div className="space-y-0">
                                {sortMenuItems(filterMenuItems(subsection.items)).map((item) => {
                                  const quantity = quantities[item.id] || 0
                                  // Determine veg/non-veg based on foodType
                                  const isVeg = item.foodType === "Veg"

                                  // Debug: Log preparationTime for troubleshooting
                                  if (item.preparationTime) {
                                    console.log(`[FRONTEND] Subsection item "${item.name}" preparationTime:`, item.preparationTime)
                                  }

                                  return (
                                    <div
                                      key={item.id}
                                      className="flex gap-4 p-4 border-b border-gray-100 last:border-none relative cursor-pointer"
                                      onClick={() => handleItemClick(item)}
                                    >
                                      {/* Left Side - Details */}
                                      <div className="flex-1 min-w-0">
                                        {/* Veg Icon & Spicy Indicator */}
                                        <div className="flex items-center gap-2 mb-1">
                                          {isVeg ? (
                                            <div className="w-4 h-4 border-2 border-green-600 flex items-center justify-center rounded-sm flex-shrink-0">
                                              <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                                            </div>
                                          ) : (
                                            <div className="w-4 h-4 border-2 border-orange-600 flex items-center justify-center rounded-sm flex-shrink-0">
                                              <div className="w-2 h-2 bg-orange-600 rounded-full"></div>
                                            </div>
                                          )}
                                          {item.isSpicy && <span className="text-red-500">🌶️</span>}
                                        </div>

                                        <h3 className="font-bold text-gray-800 dark:text-white text-lg leading-tight">{item.name}</h3>

                                        {/* Highly Reordered Progress Bar - Show if customisable */}
                                        {item.customisable && (
                                          <div className="flex items-center gap-2 mt-1">
                                            <div className="h-1.5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                              <div className="h-full bg-[#EB590E] w-3/4"></div>
                                            </div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Highly reordered</span>
                                          </div>
                                        )}

                                        <div className="flex items-center gap-3 mt-1">
                                          <p className="font-semibold text-gray-900 dark:text-white">₹{Math.round(item.price)}</p>
                                          {/* Preparation Time - Show if available */}
                                          {item.preparationTime && String(item.preparationTime).trim() && (
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                                              <Clock size={12} className="text-gray-500" />
                                              <span>{String(item.preparationTime).trim()}</span>
                                            </div>
                                          )}
                                        </div>

                                        {/* Description - Show if available */}
                                        {item.description && (
                                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{item.description}</p>
                                        )}

                                        {/* Action Buttons - Bookmark and Share */}
                                        <div className="flex gap-4 mt-3">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              handleBookmarkClick(item)
                                            }}
                                            className={`p-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isDishFavorite(item.id, restaurant?.restaurantId || restaurant?._id || restaurant?.id)
                                              ? "border-red-500 text-red-500 bg-red-50 dark:bg-red-900/20"
                                              : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                                              }`}
                                          >
                                            <Bookmark
                                              size={18}
                                              className={isDishFavorite(item.id, restaurant?.restaurantId || restaurant?._id || restaurant?.id) ? "fill-red-500" : ""}
                                            />
                                          </button>
                                          <button
                                            onClick={(e) => e.stopPropagation()}
                                            className="p-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                          >
                                            <Share2 size={18} />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Right Side - Image and Add Button */}
                                      <div className="relative w-32 h-32 flex-shrink-0">
                                        {item.image ? (
                                          <img
                                            src={item.image}
                                            alt={item.name}
                                            className="w-full h-full object-cover rounded-2xl shadow-sm"
                                          />
                                        ) : (
                                          <div className="w-full h-full bg-gray-200 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
                                            <span className="text-xs text-gray-400">No image</span>
                                          </div>
                                        )}
                                        {quantity > 0 ? (
                                          <motion.div
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className={`absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white border font-bold px-4 py-1.5 rounded-lg shadow-md flex items-center gap-1 ${shouldShowGrayscale
                                              ? 'border-gray-300 text-gray-400 cursor-not-allowed opacity-50'
                                              : 'border-[#EB590E] text-[#EB590E] hover:bg-orange-50'
                                              }`}
                                          >
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                if (!shouldShowGrayscale) {
                                                  updateItemQuantity(item, Math.max(0, quantity - 1), e)
                                                }
                                              }}
                                              disabled={shouldShowGrayscale}
                                              className={shouldShowGrayscale ? 'text-gray-400 cursor-not-allowed' : 'text-[#EB590E] hover:text-[#D94F0C]'}
                                            >
                                              <Minus size={14} />
                                            </button>
                                            <span className={`mx-2 text-sm ${shouldShowGrayscale ? 'text-gray-400' : ''}`}>{quantity}</span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                if (!shouldShowGrayscale) {
                                                  updateItemQuantity(item, quantity + 1, e)
                                                }
                                              }}
                                              disabled={shouldShowGrayscale}
                                              className={shouldShowGrayscale ? 'text-gray-400 cursor-not-allowed' : 'text-[#EB590E] hover:text-[#D94F0C]'}
                                            >
                                              <Plus size={14} className="stroke-[3px]" />
                                            </button>
                                          </motion.div>
                                        ) : (
                                          <motion.button
                                            layoutId={`add-button-sub-${item.id}`}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ duration: 0.3, type: "spring", damping: 20, stiffness: 300 }}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              if (!shouldShowGrayscale) {
                                                updateItemQuantity(item, 1, e)
                                              }
                                            }}
                                            disabled={shouldShowGrayscale}
                                            className={`absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white border font-bold px-6 py-1.5 rounded-lg shadow-md flex items-center gap-1 transition-colors ${shouldShowGrayscale
                                              ? 'border-gray-300 text-gray-400 cursor-not-allowed opacity-50'
                                              : 'border-[#EB590E] text-[#EB590E] hover:bg-orange-50'
                                              }`}
                                          >
                                            ADD <Plus size={14} className="stroke-[3px]" />
                                          </motion.button>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* FSSAI License Information - Bottom of page */}
      {restaurant?.onboarding?.step3?.fssai?.registrationNumber && (
        <div className="px-4 py-4 mt-2 mb-24 border-t border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/30 dark:bg-white/5 mx-4 rounded-xl">
          <div className="flex items-center gap-4">
            <div className="h-12 w-20 flex items-center justify-center bg-white rounded-lg p-1.5 shadow-sm border border-gray-100">
              <img
                src={fssaiLogo}
                alt="FSSAI"
                className="h-full w-auto object-contain"
              />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-bold mb-1">
                License No.
              </p>
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 font-mono tracking-wide">
                {restaurant.onboarding.step3.fssai.registrationNumber}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Menu Button - Sticky at page bottom right (hidden when filter or menu sheet open) */}
      {!showFilterSheet && !showMenuSheet && !showMenuOptionsSheet && (
        <div className="sticky dark:bg-[#1a1a1a] bottom-4 flex justify-end px-4 z-50 mt-auto">
          <Button
            className="bg-[#1a1a1a] dark:bg-[#EB590E] hover:bg-black dark:hover:bg-[#D94F0C] text-white flex items-center gap-2 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/10 dark:border-[#EB590E]/20 px-6 py-6 rounded-full font-bold transform transition-all duration-300 hover:scale-110 active:scale-95 group"
            size="lg"
            onClick={() => setShowMenuSheet(true)}
          >
            <Utensils className="h-5 w-5 text-[#EB590E] dark:text-white group-hover:rotate-12 transition-transform" />
            <span className="tracking-wide">MENU</span>
          </Button>
        </div>
      )}

      {/* Menu Categories Bottom Sheet - Rendered via Portal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showMenuSheet && (
              <>
                {/* Backdrop */}
                <motion.div
                  className="fixed inset-0 bg-black/40 z-[9999]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setShowMenuSheet(false)}
                />

                {/* Menu Sheet */}
                <motion.div
                  className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 z-[10000] bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[85vh] md:max-h-[90vh] md:max-w-lg w-full md:w-auto flex flex-col"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ duration: 0.2, type: "spring", damping: 30, stiffness: 400 }}
                  style={{ willChange: "transform" }}
                >
                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto px-4 py-6">
                    <div className="space-y-1">
                      {menuCategories.map((category, index) => (
                        <button
                          key={index}
                          className="w-full flex items-center justify-between py-3 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors text-left"
                          onClick={() => {
                            setShowMenuSheet(false)
                            // Scroll to category section
                            setTimeout(() => {
                              const sectionId = `menu-section-${category.sectionIndex}`
                              const sectionElement = document.getElementById(sectionId)
                              if (sectionElement) {
                                sectionElement.scrollIntoView({
                                  behavior: 'smooth',
                                  block: 'start'
                                })
                              }
                            }, 300) // Small delay to allow sheet to close
                          }}
                        >
                          <span className="text-base font-medium text-gray-900 dark:text-white">
                            {category.name}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {category.count}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Large Order Menu Section */}
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                      <button
                        className="w-full flex items-center justify-between py-3 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        onClick={() => setShowLargeOrderMenu(!showLargeOrderMenu)}
                      >
                        <span className="text-base font-semibold text-gray-900 dark:text-white">
                          LARGE ORDER MENU
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform ${showLargeOrderMenu ? "rotate-180" : ""
                            }`}
                        />
                      </button>
                      {showLargeOrderMenu && (
                        <div className="mt-2 space-y-1 pl-4">
                          {/* Add large order menu items here if needed */}
                          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                            Large order options coming soon
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Close Button */}
                  <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-4 bg-white dark:bg-[#1a1a1a]">
                    <Button
                      className="w-full bg-[#1a1a1a] dark:bg-[#EB590E] hover:bg-[#EB590E] dark:hover:bg-[#D94F0C] text-white border-0 flex items-center justify-center gap-2 py-6 rounded-xl font-bold transition-all shadow-lg"
                      onClick={() => setShowMenuSheet(false)}
                    >
                      <X className="h-5 w-5" />
                      Close
                    </Button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Filters and Sorting Bottom Sheet - Rendered via Portal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showFilterSheet && (
              <>
                {/* Backdrop */}
                <motion.div
                  className="fixed inset-0 bg-black/40 z-[9999]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setShowFilterSheet(false)}
                />

                {/* Bottom Sheet */}
                <motion.div
                  className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 z-[10000] bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl shadow-2xl h-[80vh] md:h-auto md:max-h-[90vh] md:max-w-lg w-full md:w-auto flex flex-col"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ duration: 0.2, type: "spring", damping: 30, stiffness: 400 }}
                  style={{ willChange: "transform" }}
                >
                  {/* Header with X button */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Filters and Sorting</h2>
                    <button
                      onClick={() => setShowFilterSheet(false)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                    >
                      <X className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </button>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                    {/* Sort by */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Sort by:</h3>
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() =>
                            setFilters((prev) => ({
                              ...prev,
                              sortBy: prev.sortBy === "low-to-high" ? null : "low-to-high",
                            }))
                          }
                          className={`text-left px-4 py-2.5 rounded-lg border-2 transition-all ${filters.sortBy === "low-to-high"
                            ? "border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                            : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                            }`}
                        >
                          Price - low to high
                        </button>
                        <button
                          onClick={() =>
                            setFilters((prev) => ({
                              ...prev,
                              sortBy: prev.sortBy === "high-to-low" ? null : "high-to-low",
                            }))
                          }
                          className={`text-left px-4 py-2.5 rounded-lg border-2 transition-all ${filters.sortBy === "high-to-low"
                            ? "border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                            : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                            }`}
                        >
                          Price - high to low
                        </button>
                      </div>
                    </div>

                    {/* Veg/Non-veg preference */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Veg/Non-veg preference:</h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            setFilters((prev) => ({
                              ...prev,
                              vegNonVeg: prev.vegNonVeg === "veg" ? null : "veg",
                            }))
                          }
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all flex-1 ${filters.vegNonVeg === "veg"
                            ? "border-green-600 dark:border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                            : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                            }`}
                        >
                          <div className="h-4 w-4 rounded-full bg-green-600 dark:bg-green-500" />
                          <span className="font-medium">Veg</span>
                        </button>
                        <button
                          onClick={() =>
                            setFilters((prev) => ({
                              ...prev,
                              vegNonVeg: prev.vegNonVeg === "non-veg" ? null : "non-veg",
                            }))
                          }
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all flex-1 ${filters.vegNonVeg === "non-veg"
                            ? "border-amber-700 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                            : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                            }`}
                        >
                          <div className="h-4 w-4 rounded-full bg-amber-700 dark:bg-amber-600" />
                          <span className="font-medium">Non-veg</span>
                        </button>
                      </div>
                    </div>

                    {/* Top picks */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Top picks:</h3>
                      <button
                        onClick={() =>
                          setFilters((prev) => ({
                            ...prev,
                            highlyReordered: !prev.highlyReordered,
                          }))
                        }
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all w-full ${filters.highlyReordered
                          ? "border-[#EB590E] dark:border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20 text-[#EB590E] dark:text-[#EB590E]"
                          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                          }`}
                      >
                        <RotateCcw className="h-4 w-4" />
                        <span className="font-medium">Highly reordered</span>
                      </button>
                    </div>

                    {/* Dietary preference */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Dietary preference:</h3>
                      <button
                        onClick={() =>
                          setFilters((prev) => ({
                            ...prev,
                            spicy: !prev.spicy,
                          }))
                        }
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all w-full ${filters.spicy
                          ? "border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                          }`}
                      >
                        <Flame className="h-4 w-4" />
                        <span className="font-medium">Spicy</span>
                      </button>
                    </div>
                  </div>

                  {/* Bottom Action Bar */}
                  <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between bg-white dark:bg-[#1a1a1a]">
                    <button
                      onClick={() => {
                        setFilters({
                          sortBy: null,
                          vegNonVeg: null,
                          highlyReordered: false,
                          spicy: false,
                        })
                      }}
                      className="text-red-600 dark:text-red-400 font-medium text-sm hover:text-red-700 dark:hover:text-red-500"
                    >
                      Clear All
                    </button>
                    <Button
                      className="bg-[#EB590E] hover:bg-[#D94F0C] text-white px-6 py-2.5 rounded-lg font-bold"
                      onClick={() => setShowFilterSheet(false)}
                    >
                      Apply {activeFilterCount > 0 && `(${activeFilterCount})`}
                    </Button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Location Outlets Bottom Sheet - Rendered via Portal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showLocationSheet && (
              <>
                {/* Backdrop */}
                <motion.div
                  className="fixed inset-0 bg-black/40 z-[9999]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setShowLocationSheet(false)}
                />

                {/* Bottom Sheet */}
                <motion.div
                  className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 z-[10000] bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl shadow-2xl h-[75vh] md:h-auto md:max-h-[90vh] md:max-w-xl w-full md:w-auto flex flex-col"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ duration: 0.2, type: "spring", damping: 30, stiffness: 400 }}
                  style={{ willChange: "transform" }}
                >
                  {/* Header */}
                  <div className="px-4 pt-4 pb-3 border-b border-gray-200 dark:border-gray-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">All delivery outlets for</p>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-red-600 dark:bg-red-500 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-base">{(restaurant.name || "R").charAt(0).toUpperCase()}</span>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white">{restaurant?.name || "Unknown Restaurant"}</h2>
                    </div>
                  </div>

                  {/* Outlets List */}
                  <div className="flex-1 overflow-y-auto px-4 py-3">
                    {restaurant?.outlets && Array.isArray(restaurant.outlets) && restaurant.outlets.length > 0 ? (
                      <div className="space-y-2">
                        {restaurant.outlets.map((outlet) => (
                          <div
                            key={outlet?.id || Math.random()}
                            className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2a2a]"
                          >
                            {outlet?.isNearest && (
                              <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-[#FFF2EB] dark:bg-[#EB590E]/20 rounded-md">
                                <Zap className="h-3.5 w-3.5 text-[#EB590E] dark:text-[#EB590E] fill-[#EB590E] dark:fill-[#EB590E]" />
                                <span className="text-xs font-semibold text-[#EB590E] dark:text-[#EB590E]">
                                  Nearest available outlet
                                </span>
                              </div>
                            )}
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                              {outlet?.location || "Location"}
                            </h3>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>{outlet?.deliveryTime || "25-30 mins"}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />
                                  <span>{outlet?.distance || "1.2 km"}</span>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-0.5">
                                <div className="flex items-center gap-1">
                                  <Star className="h-3.5 w-3.5 text-green-600 dark:text-green-500 fill-green-600 dark:fill-green-500" />
                                  <span className="text-xs font-medium text-gray-900 dark:text-white">
                                    {outlet?.rating ?? 4.5}
                                  </span>
                                </div>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  By {(outlet?.reviews || 0) >= 1000 ? `${((outlet.reviews || 0) / 1000).toFixed(1)}K+` : `${outlet?.reviews || 0}+`}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        No outlets available
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {restaurant?.outlets && Array.isArray(restaurant.outlets) && restaurant.outlets.length > 5 && (
                    <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-3 bg-white dark:bg-[#1a1a1a]">
                      <button className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400 font-medium text-sm w-full">
                        <span>See all {restaurant.outlets.length} outlets</span>
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Manage Collections Modal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showManageCollections && (
              <>
                {/* Backdrop */}
                <motion.div
                  className="fixed inset-0 bg-black/40 z-[9999]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setShowManageCollections(false)}
                />

                {/* Manage Collections Bottom Sheet */}
                <motion.div
                  className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 z-[10000] bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl shadow-2xl md:max-w-lg w-full md:w-auto"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ duration: 0.2, type: "spring", damping: 30, stiffness: 400 }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Manage Collections</h2>
                    <button
                      onClick={() => setShowManageCollections(false)}
                      className="h-8 w-8 rounded-full bg-gray-700 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  </div>

                  {/* Collections List */}
                  <div className="px-4 py-4 space-y-2">
                    {/* Bookmarks Collection */}
                    <button
                      className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Don't close modal on click, let checkbox handle it
                      }}
                    >
                      <div className="h-12 w-12 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center flex-shrink-0">
                        <Bookmark className="h-6 w-6 text-red-500 dark:text-red-400 fill-red-500 dark:fill-red-400" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-base font-medium text-gray-900 dark:text-white">Bookmarks</span>
                          {selectedItem && (
                            <Checkbox
                              checked={isDishFavorite(selectedItem.id, restaurant?.restaurantId || restaurant?._id || restaurant?.id)}
                              onCheckedChange={(checked) => {
                                if (!checked && selectedItem) {
                                  const restaurantId = restaurant?.restaurantId || restaurant?._id || restaurant?.id
                                  removeDishFavorite(selectedItem.id, restaurantId)
                                  setShowManageCollections(false)
                                }
                              }}
                              className="h-5 w-5 rounded border-2 border-red-500 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          {!selectedItem && (
                            <div className="h-5 w-5 rounded border-2 border-red-500 bg-red-500 flex items-center justify-center">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {getDishFavorites().length} dishes • {getFavorites().length} restaurant
                        </p>
                      </div>
                    </button>

                    {/* Create new Collection */}
                    <button
                      className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      onClick={() => setShowManageCollections(false)}
                    >
                      <div className="h-12 w-12 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center flex-shrink-0">
                        <Plus className="h-6 w-6 text-red-500 dark:text-red-400" />
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-base font-medium text-gray-900 dark:text-white">
                          Create new Collection
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Done Button */}
                  <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-4">
                    <Button
                      className="w-full bg-[#EB590E] hover:bg-[#D94F0C] text-white py-3 rounded-lg font-bold"
                      onClick={() => {
                        setShowManageCollections(false)
                      }}
                    >
                      Done
                    </Button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Item Detail Modal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showItemDetail && selectedItem && (
              <>
                {/* Backdrop */}
                <motion.div
                  className="fixed inset-0 bg-black/40 z-[9999]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setShowItemDetail(false)}
                />

                {/* Item Detail Bottom Sheet */}
                <motion.div
                  className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 z-[10000] bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[90vh] md:max-w-2xl lg:max-w-3xl w-full md:w-auto flex flex-col"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ duration: 0.15, type: "spring", damping: 30, stiffness: 400 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Close Button - Top Center Above Popup with 4px gap */}
                  <div className="absolute -top-[44px] left-1/2 -translate-x-1/2 z-[10001]">
                    <motion.button
                      onClick={() => setShowItemDetail(false)}
                      className="h-10 w-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-900 transition-colors shadow-lg"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <X className="h-5 w-5 text-white" />
                    </motion.button>
                  </div>

                  {/* Image Section */}
                  <div className="relative w-full h-64 overflow-hidden rounded-t-3xl">
                    {selectedItem.image ? (
                      <img
                        src={selectedItem.image}
                        alt={selectedItem.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-sm text-gray-400">No image available</span>
                      </div>
                    )}
                    {/* Bookmark and Share Icons Overlay */}
                    <div className="absolute bottom-4 right-4 flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleBookmarkClick(selectedItem)
                        }}
                        className={`h-10 w-10 rounded-full border flex items-center justify-center transition-all duration-300 ${isDishFavorite(selectedItem.id, restaurant?.restaurantId || restaurant?._id || restaurant?.id)
                          ? "border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400"
                          : "border-white dark:border-gray-800 bg-white/90 dark:bg-[#1a1a1a]/90 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-[#2a2a2a]"
                          }`}
                      >
                        <Bookmark
                          className={`h-5 w-5 transition-all duration-300 ${isDishFavorite(selectedItem.id, restaurant?.restaurantId || restaurant?._id || restaurant?.id) ? "fill-red-500 dark:fill-red-400" : ""
                            }`}
                        />
                      </button>
                      <button className="h-10 w-10 rounded-full border border-white dark:border-gray-800 bg-white/90 dark:bg-[#1a1a1a]/90 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-[#2a2a2a] flex items-center justify-center transition-colors">
                        <Share2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Content Section */}
                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    {/* Item Name and Indicator */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1">
                        <div className="h-5 w-5 rounded border-2 border-amber-700 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                          <div className="h-2.5 w-2.5 rounded-full bg-amber-700 dark:bg-amber-600" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                          {selectedItem.name}
                        </h2>
                      </div>
                      {/* Bookmark and Share Icons (Desktop) */}
                      <div className="hidden md:flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleBookmarkClick(selectedItem)
                          }}
                          className={`h-8 w-8 rounded-full border flex items-center justify-center transition-all duration-300 ${isDishFavorite(selectedItem.id, restaurant?.restaurantId || restaurant?._id || restaurant?.id)
                            ? "border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400"
                            : "border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                            }`}
                        >
                          <Bookmark
                            className={`h-4 w-4 transition-all duration-300 ${isDishFavorite(selectedItem.id, restaurant?.restaurantId || restaurant?._id || restaurant?.id) ? "fill-red-500 dark:fill-red-400" : ""
                              }`}
                          />
                        </button>
                        <button className="h-8 w-8 rounded-full border border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex items-center justify-center transition-colors">
                          <Share2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
                      {selectedItem.description}
                    </p>

                    {/* Highly Reordered Progress Bar */}
                    {selectedItem.customisable && (
                      <div className="flex items-center gap-2 mb-4">
                        <div className="flex-1 h-0.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 dark:bg-green-400 rounded-full" style={{ width: '50%' }} />
                        </div>
                        <span className="text-xs text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">
                          highly reordered
                        </span>
                      </div>
                    )}

                    {/* Not Eligible for Coupons */}
                    {selectedItem.notEligibleForCoupons && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-4">
                        NOT ELIGIBLE FOR COUPONS
                      </p>
                    )}
                  </div>

                  {/* Bottom Action Bar */}
                  <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-4 bg-white dark:bg-[#1a1a1a]">
                    <div className="flex items-center gap-4">
                      {/* Quantity Selector */}
                      <div className={`flex items-center gap-3 border-2 rounded-lg px-3 h-[44px] bg-white dark:bg-[#2a2a2a] ${shouldShowGrayscale
                        ? 'border-gray-300 dark:border-gray-700 opacity-50'
                        : 'border-gray-300 dark:border-gray-700'
                        }`}>
                        <button
                          onClick={(e) => {
                            if (!shouldShowGrayscale) {
                              updateItemQuantity(selectedItem, Math.max(0, (quantities[selectedItem.id] || 0) - 1), e)
                            }
                          }}
                          disabled={(quantities[selectedItem.id] || 0) === 0 || shouldShowGrayscale}
                          className={`${shouldShowGrayscale
                            ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed'
                            }`}
                        >
                          <Minus className="h-5 w-5" />
                        </button>
                        <span className={`text-lg font-semibold min-w-[2rem] text-center ${shouldShowGrayscale
                          ? 'text-gray-400 dark:text-gray-600'
                          : 'text-gray-900 dark:text-white'
                          }`}>
                          {quantities[selectedItem.id] || 0}
                        </span>
                        <button
                          onClick={(e) => {
                            if (!shouldShowGrayscale) {
                              updateItemQuantity(selectedItem, (quantities[selectedItem.id] || 0) + 1, e)
                            }
                          }}
                          disabled={shouldShowGrayscale}
                          className={shouldShowGrayscale
                            ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                          }
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      </div>

                      {/* Add Item Button */}
                      <Button
                        className={`flex-1 h-[44px] rounded-lg font-semibold flex items-center justify-center gap-2 ${shouldShowGrayscale
                          ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-600 cursor-not-allowed opacity-50'
                          : 'bg-red-500 hover:bg-red-600 text-white'
                          }`}
                        onClick={(e) => {
                          if (!shouldShowGrayscale) {
                            updateItemQuantity(selectedItem, (quantities[selectedItem.id] || 0) + 1, e)
                            setShowItemDetail(false)
                          }
                        }}
                        disabled={shouldShowGrayscale}
                      >
                        <span>Add item</span>
                        <div className="flex items-center gap-1">
                          {selectedItem.originalPrice && selectedItem.originalPrice > selectedItem.price && (
                            <span className="text-sm line-through text-red-200">
                              ₹{Math.round(selectedItem.originalPrice)}
                            </span>
                          )}
                          <span className="text-base font-bold">
                            ₹{Math.round(selectedItem.price)}
                          </span>
                        </div>
                      </Button>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Schedule Delivery Time Modal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showScheduleSheet && (
              <>
                {/* Backdrop */}
                <motion.div
                  className="fixed inset-0 bg-black/40 z-[9999]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setShowScheduleSheet(false)}
                />

                {/* Schedule Bottom Sheet */}
                <motion.div
                  className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 z-[10000] bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[60vh] md:max-h-[90vh] md:max-w-lg w-full md:w-auto flex flex-col"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ duration: 0.15, type: "spring", damping: 30, stiffness: 400 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Close Button - Centered Overlapping */}
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-10">
                    <button
                      onClick={() => setShowScheduleSheet(false)}
                      className="h-10 w-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-900 transition-colors shadow-lg"
                    >
                      <X className="h-5 w-5 text-white" />
                    </button>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto px-4 pt-10 pb-4">
                    {/* Title */}
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 text-center">
                      Select your delivery time
                    </h2>

                    {/* Date Selection */}
                    <div className="flex items-center gap-3 mb-4 overflow-x-auto pb-2 scrollbar-hide">
                      {(() => {
                        const today = new Date()
                        const tomorrow = new Date(today)
                        tomorrow.setDate(tomorrow.getDate() + 1)
                        const dayAfter = new Date(today)
                        dayAfter.setDate(dayAfter.getDate() + 2)

                        const dates = [
                          { date: today, label: "Today" },
                          { date: tomorrow, label: "Tomorrow" },
                          { date: dayAfter, label: dayAfter.toLocaleDateString('en-US', { weekday: 'short' }) }
                        ]

                        return dates.map((item, index) => {
                          const dateStr = item.date.toISOString().split('T')[0]
                          const day = String(item.date.getDate()).padStart(2, '0')
                          const month = item.date.toLocaleDateString('en-US', { month: 'short' })
                          const isSelected = selectedDate === dateStr

                          return (
                            <button
                              key={index}
                              onClick={() => setSelectedDate(dateStr)}
                              className="flex flex-col items-center gap-0.5 flex-shrink-0 pb-1"
                            >
                              <span className={`text-sm font-medium ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                                {day} {month} {item.label}
                              </span>
                              {isSelected && (
                                <div className="h-0.5 w-full bg-red-500 mt-0.5" />
                              )}
                            </button>
                          )
                        })
                      })()}
                    </div>

                    {/* Time Slot Selection */}
                    <div className="space-y-2 mb-4">
                      {["6:30 - 7 PM", "7 - 7:30 PM", "7:30 - 8 PM", "8 - 8:30 PM"].map((slot, index) => {
                        const isSelected = selectedTimeSlot === slot
                        return (
                          <button
                            key={index}
                            onClick={() => setSelectedTimeSlot(slot)}
                            className={`w-full text-left px-4 py-2.5 rounded-lg transition-all ${isSelected
                              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600"
                              : "bg-white dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent"
                              }`}
                          >
                            <span className="text-sm font-medium">{slot}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Confirm Button - Fixed at bottom */}
                  <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                    <Button
                      className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-lg font-semibold"
                      onClick={() => {
                        setShowScheduleSheet(false)
                        // Handle schedule confirmation
                      }}
                    >
                      Confirm
                    </Button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Offers Bottom Sheet - Rendered via Portal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showOffersSheet && (
              <>
                {/* Backdrop */}
                <motion.div
                  className="fixed inset-0 bg-black/40 z-[9999]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setShowOffersSheet(false)}
                />

                {/* Offers Bottom Sheet */}
                <motion.div
                  className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 z-[10000] bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[85vh] md:max-h-[90vh] md:max-w-lg w-full md:w-auto flex flex-col"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ duration: 0.2, type: "spring", damping: 30, stiffness: 400 }}
                  style={{ willChange: "transform" }}
                >
                  {/* Header */}
                  <div className="px-4 pt-6 pb-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                      Offers at {restaurant?.name || "Unknown Restaurant"}
                    </h2>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    {/* Gold Exclusive Offer Section */}
                    {restaurant?.restaurantOffers?.goldOffer && (
                      <div className="mb-6">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                          {restaurant.restaurantOffers.goldOffer?.title || "Gold exclusive offer"}
                        </h3>
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <Lock className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                                {restaurant.restaurantOffers.goldOffer?.description || "Free delivery above ₹99"}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {restaurant.restaurantOffers.goldOffer?.unlockText || "join Gold to unlock"}
                              </p>
                            </div>
                          </div>
                          <Button
                            className="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap"
                            onClick={() => {
                              // Handle add gold
                            }}
                          >
                            {restaurant.restaurantOffers.goldOffer?.buttonText || "Add Gold - ₹1"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Restaurant Coupons Section */}
                    {restaurant?.restaurantOffers?.coupons && Array.isArray(restaurant.restaurantOffers.coupons) && restaurant.restaurantOffers.coupons.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                          Restaurant coupons
                        </h3>
                        <div className="space-y-3">
                          {restaurant.restaurantOffers.coupons.map((coupon) => {
                            const isExpanded = expandedCoupons.has(coupon.id)
                            return (
                              <div
                                key={coupon.id}
                                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                              >
                                <button
                                  className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                  onClick={() => {
                                    setExpandedCoupons((prev) => {
                                      const newSet = new Set(prev)
                                      if (newSet.has(coupon.id)) {
                                        newSet.delete(coupon.id)
                                      } else {
                                        newSet.add(coupon.id)
                                      }
                                      return newSet
                                    })
                                  }}
                                >
                                  <Percent className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                  <div className="flex-1 text-left">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                                      {coupon.title}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      Use code {coupon.code}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium rounded"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        // Copy code to clipboard
                                        navigator.clipboard.writeText(coupon.code)
                                      }}
                                    >
                                      {coupon.code}
                                    </button>
                                    <ChevronDown
                                      className={`h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""
                                        }`}
                                    />
                                  </div>
                                </button>
                                {isExpanded && (
                                  <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800">
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                      Terms and conditions apply
                                    </p>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Close Button */}
                  <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-4 bg-white dark:bg-[#1a1a1a]">
                    <Button
                      className="w-full bg-[#1a1a1a] dark:bg-[#EB590E] hover:bg-[#EB590E] dark:hover:bg-[#D94F0C] text-white border-0 flex items-center justify-center gap-2 py-6 rounded-xl font-bold transition-all shadow-lg"
                      onClick={() => setShowOffersSheet(false)}
                    >
                      <X className="h-5 w-5" />
                      Close
                    </Button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Menu Options Bottom Sheet - Rendered via Portal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showMenuOptionsSheet && (
              <>
                {/* Backdrop */}
                <motion.div
                  className="fixed inset-0 bg-black/40 z-[9999]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setShowMenuOptionsSheet(false)}
                />

                {/* Menu Options Bottom Sheet */}
                <motion.div
                  className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 z-[10000] bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[70vh] md:max-h-[90vh] md:max-w-lg w-full md:w-auto flex flex-col"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ duration: 0.2, type: "spring", damping: 30, stiffness: 400 }}
                  style={{ willChange: "transform" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="px-4 pt-6 pb-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                      {restaurant?.name || "Unknown Restaurant"}
                    </h2>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    {/* Menu Options List */}
                    <div className="space-y-1">
                      {/* Add to Collection */}
                      <button
                        className="w-full flex items-center gap-4 px-2 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors text-left"
                        onClick={handleAddToCollection}
                      >
                        <Bookmark className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                        <span className="text-base text-gray-900 dark:text-white">
                          {isFavorite(restaurant?.slug || slug || "") ? "Remove from Collection" : "Add to Collection"}
                        </span>
                      </button>

                      {/* Share this restaurant */}
                      <button
                        className="w-full flex items-center gap-4 px-2 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors text-left"
                        onClick={handleShareRestaurant}
                      >
                        <Share2 className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                        <span className="text-base text-gray-900 dark:text-white">Share this restaurant</span>
                      </button>

                    </div>

                    {/* Disclaimer Text */}
                    <div className="mt-6 px-2">
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Menu items, prices, photos and descriptions are set directly by the restaurant. In case you see any incorrect information, please report it to us.
                      </p>
                    </div>

                    {/* FSSAI License Information */}
                    {restaurant?.onboarding?.step3?.fssai?.registrationNumber && (
                      <div className="mt-4 px-2 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3 opacity-80 mb-2">
                        <div className="h-8 w-14 flex items-center justify-center bg-white rounded p-1 border border-gray-100">
                          <img
                            src={fssaiLogo}
                            alt="FSSAI"
                            className="h-full w-auto object-contain"
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">
                            Lic. No.
                          </p>
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {restaurant.onboarding.step3.fssai.registrationNumber}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bottom Handle */}
                  <div className="px-4 pb-2 pt-2 flex justify-center">
                    <div className="h-1 w-12 bg-gray-300 rounded-full" />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Add to Cart Animation Component - Rendered via Portal to prevent transform interference */}
      {typeof window !== "undefined" &&
        createPortal(
          <AddToCartAnimation
            bottomOffset={80}
            linkTo="/cart"
            hideOnPages={true}
          />,
          document.body
        )}
    </AnimatedPage>
  )
}


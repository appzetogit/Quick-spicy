import { Link, useNavigate } from "react-router-dom"
import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { Star, Clock, MapPin, ArrowDownUp, Timer, ArrowRight, ChevronDown, Bookmark, Share2, Plus, Minus, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import AnimatedPage from "../components/AnimatedPage"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useLocationSelector } from "../components/UserLayout"
import { useLocation } from "../hooks/useLocation"
import { useZone } from "../hooks/useZone"
import { useCart } from "../context/CartContext"
import PageNavbar from "../components/PageNavbar"
import { foodImages } from "@/constants/images"
import quickSpicyLogo from "@/assets/quicky-spicy-logo.png"
import offerImage from "@/assets/offerimage.png"
import AddToCartAnimation from "../components/AddToCartAnimation"
import OptimizedImage from "@/components/OptimizedImage"
import api from "@/lib/api"
import { restaurantAPI } from "@/lib/api"
import { isModuleAuthenticated } from "@/lib/utils/auth"

export default function Under250() {
  const { location } = useLocation()
  const { zoneId, zoneStatus, isInService, isOutOfService } = useZone(location)
  const navigate = useNavigate()
  const { addToCart, updateQuantity, removeFromCart, getCartItem, cart } = useCart()
  const [activeCategory, setActiveCategory] = useState(null)
  const [showSortPopup, setShowSortPopup] = useState(false)
  const [selectedSort, setSelectedSort] = useState(null)
  const [under30MinsFilter, setUnder30MinsFilter] = useState(false)
  const [showItemDetail, setShowItemDetail] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [quantities, setQuantities] = useState({})
  const [bookmarkedItems, setBookmarkedItems] = useState(new Set())
  const [viewCartButtonBottom, setViewCartButtonBottom] = useState("bottom-20")
  const lastScrollY = useRef(0)
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [bannerImage, setBannerImage] = useState(null)
  const [loadingBanner, setLoadingBanner] = useState(true)
  const [under250Restaurants, setUnder250Restaurants] = useState([])
  const [loadingRestaurants, setLoadingRestaurants] = useState(true)

  const sortOptions = [
    { id: null, label: 'Relevance' },
    { id: 'rating-high', label: 'Rating: High to Low' },
    { id: 'delivery-time-low', label: 'Estimated Time: Low to High' },
    { id: 'distance-low', label: 'Distance: Low to High' },
  ]

  const handleClearAll = () => {
    setSelectedSort(null)
  }

  const handleApply = () => {
    setShowSortPopup(false)
  }

  // Helper function to parse delivery time (e.g., "12-15 mins" -> 12 or average)
  const parseDeliveryTime = (deliveryTime) => {
    if (!deliveryTime) return 999 // Default high value for sorting
    const match = deliveryTime.match(/(\d+)/)
    if (match) {
      return parseInt(match[1])
    }
    // Try to find range (e.g., "12-15 mins")
    const rangeMatch = deliveryTime.match(/(\d+)\s*-\s*(\d+)/)
    if (rangeMatch) {
      return (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2 // Average
    }
    return 999
  }

  // Helper function to parse distance (e.g., "0.4 km" -> 0.4)
  const parseDistance = (distance) => {
    if (!distance) return 999 // Default high value for sorting
    const match = distance.match(/(\d+\.?\d*)/)
    if (match) {
      return parseFloat(match[1])
    }
    return 999
  }

  // Sort and filter restaurants based on selected sort and filters
  const sortedAndFilteredRestaurants = useMemo(() => {
    let filtered = [...under250Restaurants]

    // Apply "Under 30 mins" filter
    if (under30MinsFilter) {
      filtered = filtered.filter(restaurant => {
        const deliveryTime = parseDeliveryTime(restaurant.deliveryTime)
        return deliveryTime <= 30
      })
    }

    // Apply sorting
    if (selectedSort === 'rating-high') {
      filtered.sort((a, b) => {
        const ratingA = a.rating || 0
        const ratingB = b.rating || 0
        if (ratingB !== ratingA) {
          return ratingB - ratingA
        }
        // Secondary sort by number of dishes
        return (b.menuItems?.length || 0) - (a.menuItems?.length || 0)
      })
    } else if (selectedSort === 'delivery-time-low') {
      filtered.sort((a, b) => {
        const timeA = parseDeliveryTime(a.deliveryTime)
        const timeB = parseDeliveryTime(b.deliveryTime)
        if (timeA !== timeB) {
          return timeA - timeB
        }
        // Secondary sort by rating
        return (b.rating || 0) - (a.rating || 0)
      })
    } else if (selectedSort === 'distance-low') {
      filtered.sort((a, b) => {
        const distA = parseDistance(a.distance)
        const distB = parseDistance(b.distance)
        if (distA !== distB) {
          return distA - distB
        }
        // Secondary sort by rating
        return (b.rating || 0) - (a.rating || 0)
      })
    } else {
      // Default: Relevance (keep original order from backend - already sorted by rating)
      // No additional sorting needed
    }

    return filtered
  }, [under250Restaurants, selectedSort, under30MinsFilter])

  // Fetch under 250 banners from API
  useEffect(() => {
    const fetchBanners = async () => {
      try {
        setLoadingBanner(true)
        const response = await api.get('/hero-banners/under-250/public')
        if (response.data.success && response.data.data.banners && response.data.data.banners.length > 0) {
          // Use the first banner
          setBannerImage(response.data.data.banners[0])
        } else {
          setBannerImage(null)
        }
      } catch (error) {
        console.error('Error fetching under 250 banners:', error)
        setBannerImage(null)
      } finally {
        setLoadingBanner(false)
      }
    }

    fetchBanners()
  }, [])

  // Fetch restaurants with dishes under ₹250 from backend
  useEffect(() => {
    const fetchRestaurantsUnder250 = async () => {
      try {
        setLoadingRestaurants(true)
        // Optional: Add zoneId if available (for sorting/filtering, but show all restaurants)
        const response = await restaurantAPI.getRestaurantsUnder250(zoneId)
        if (response.data.success && response.data.data.restaurants) {
          setUnder250Restaurants(response.data.data.restaurants)
        } else {
          setUnder250Restaurants([])
        }
      } catch (error) {
        console.error('Error fetching restaurants under 250:', error)
        setUnder250Restaurants([])
      } finally {
        setLoadingRestaurants(false)
      }
    }

    fetchRestaurantsUnder250()
  }, [zoneId, isOutOfService])

  // Fetch categories from admin API
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoadingCategories(true)
        const response = await api.get('/categories/public')
        if (response.data.success && response.data.data.categories) {
          const adminCategories = response.data.data.categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            image: cat.image || foodImages[0], // Fallback to default image if not provided
            slug: cat.slug || cat.name.toLowerCase().replace(/\s+/g, '-')
          }))
          setCategories(adminCategories)
        } else {
          // Fallback to default categories if API fails
          const defaultCategories = [
            { id: 1, name: "Biryani", image: foodImages[0] },
            { id: 2, name: "Cake", image: foodImages[1] },
            { id: 3, name: "Chhole Bhature", image: foodImages[2] },
            { id: 4, name: "Chicken Tanduri", image: foodImages[3] },
          ]
          setCategories(defaultCategories)
        }
      } catch (error) {
        console.error('Error fetching categories:', error)
        // Fallback to default categories on error
        const defaultCategories = [
          { id: 1, name: "Biryani", image: foodImages[0] },
          { id: 2, name: "Cake", image: foodImages[1] },
          { id: 3, name: "Chhole Bhature", image: foodImages[2] },
        ]
        setCategories(defaultCategories)
      } finally {
        setLoadingCategories(false)
      }
    }

    fetchCategories()
  }, [])

  // Sync quantities from cart on mount
  useEffect(() => {
    const cartQuantities = {}
    cart.forEach((item) => {
      cartQuantities[item.id] = item.quantity || 0
    })
    setQuantities(cartQuantities)
  }, [cart])

  // Scroll detection for view cart button positioning
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const scrollDifference = Math.abs(currentScrollY - lastScrollY.current)

      // Only update if scroll difference is significant (avoid flickering)
      if (scrollDifference < 5) {
        return
      }

      // Scroll down -> bottom-0, Scroll up -> bottom-20
      if (currentScrollY > lastScrollY.current) {
        // Scrolling down
        setViewCartButtonBottom("bottom-0")
      } else if (currentScrollY < lastScrollY.current) {
        // Scrolling up
        setViewCartButtonBottom("bottom-20")
      }

      lastScrollY.current = currentScrollY
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Helper function to update item quantity in bothlocal state and cart
  const updateItemQuantity = (item, newQuantity, event = null, restaurantName = null) => {
    // Check authentication
    if (!isModuleAuthenticated('user')) {
      toast.error("Please login to add items to cart")
      navigate('/user/auth/sign-in', { state: { from: location.pathname } })
      return
    }

    // CRITICAL: Check if user is in service zone
    if (isOutOfService) {
      toast.error('You are outside the service zone. Please select a location within the service area.')
      return
    }

    // Update local state
    setQuantities((prev) => ({
      ...prev,
      [item.id]: newQuantity,
    }))

    // Find restaurant name from the item or use provided parameter
    const restaurant = restaurantName || item.restaurant || "Under 250"

    // Prepare cart item with all required properties
    const cartItem = {
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
      restaurant: restaurant,
      description: item.description || "",
      originalPrice: item.originalPrice || item.price,
    }

    // Get source position for animation from event target
    let sourcePosition = null
    if (event) {
      let buttonElement = event.currentTarget
      if (!buttonElement && event.target) {
        buttonElement = event.target.closest('button') || event.target
      }

      if (buttonElement) {
        const rect = buttonElement.getBoundingClientRect()
        const scrollX = window.pageXOffset || window.scrollX || 0
        const scrollY = window.pageYOffset || window.scrollY || 0

        sourcePosition = {
          viewportX: rect.left + rect.width / 2,
          viewportY: rect.top + rect.height / 2,
          scrollX: scrollX,
          scrollY: scrollY,
          itemId: item.id,
        }
      }
    }

    // Update cart context
    if (newQuantity <= 0) {
      const productInfo = {
        id: item.id,
        name: item.name,
        imageUrl: item.image,
      }
      removeFromCart(item.id, sourcePosition, productInfo)
    } else {
      const existingCartItem = getCartItem(item.id)
      if (existingCartItem) {
        const productInfo = {
          id: item.id,
          name: item.name,
          imageUrl: item.image,
        }

        if (newQuantity > existingCartItem.quantity && sourcePosition) {
          addToCart(cartItem, sourcePosition)
          if (newQuantity > existingCartItem.quantity + 1) {
            updateQuantity(item.id, newQuantity)
          }
        } else if (newQuantity < existingCartItem.quantity && sourcePosition) {
          updateQuantity(item.id, newQuantity, sourcePosition, productInfo)
        } else {
          updateQuantity(item.id, newQuantity)
        }
      } else {
        addToCart(cartItem, sourcePosition)
        if (newQuantity > 1) {
          updateQuantity(item.id, newQuantity)
        }
      }
    }
  }

  const handleItemClick = (item, restaurant) => {
    // Add restaurant info to item for display
    const itemWithRestaurant = {
      ...item,
      restaurant: restaurant.name,
      description: item.description || `${item.name} from ${restaurant.name}`,
      customisable: item.customisable || false,
      notEligibleForCoupons: item.notEligibleForCoupons || false,
    }
    setSelectedItem(itemWithRestaurant)
    setShowItemDetail(true)
  }

  const handleBookmarkClick = (itemId) => {
    setBookmarkedItems((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId)
      } else {
        newSet.add(itemId)
      }
      return newSet
    })
  }

  // Check if should show grayscale (only when user is out of service)
  const shouldShowGrayscale = isOutOfService

  return (

    <div className={`relative min-h-screen bg-white dark:bg-[#0a0a0a] ${shouldShowGrayscale ? 'grayscale opacity-75' : ''}`}>
      {/* Mobile Navbar - Sticky & Hidden on Desktop */}
      <div className="sticky top-0 z-40 w-full bg-white dark:bg-[#0a0a0a] shadow-sm md:hidden">
        <div className="relative z-50 pt-2 sm:pt-3 pb-2">
          <PageNavbar textColor="black" zIndex={20} showProfile={true} />
        </div>
      </div>

      {/* Banner Section */}
      <div className="relative w-full overflow-hidden min-h-[30vh] sm:min-h-[39vh] lg:min-h-[50vh] mt-2 md:mt-4">
        {/* Banner Image */}
        {bannerImage && (
          <div className="absolute top-0 left-0 right-0 bottom-0 z-0 mx-3 sm:mx-4 lg:mx-8 rounded-xl sm:rounded-2xl overflow-hidden">
            <OptimizedImage
              src={bannerImage}
              alt="Under 250 Banner"
              className="w-full h-full"
              objectFit="cover"
              priority={true}
              sizes="100vw"
            />
          </div>
        )}
        {!bannerImage && !loadingBanner && (
          <div className="absolute top-0 left-0 right-0 bottom-0 z-0 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950 dark:to-amber-950 mx-3 sm:mx-4 lg:mx-8 rounded-xl sm:rounded-2xl overflow-hidden" />
        )}
      </div>

      {/* Content Section */}
      <div className="relative max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 space-y-0 pt-2 sm:pt-3 md:pt-4 lg:pt-6 pb-6 md:pb-8 lg:pb-10">

        <section className="space-y-1 sm:space-y-1.5">
          <div
            className="flex gap-3 sm:gap-4 md:gap-5 lg:gap-6 overflow-x-auto md:overflow-x-visible overflow-y-visible scrollbar-hide scroll-smooth px-2 sm:px-3 py-2 sm:py-3 md:py-4"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              touchAction: "pan-x pan-y pinch-zoom",
              overflowY: "hidden",
            }}
          >
            {/* All Button */}
            <div className="flex-shrink-0">
              <motion.div
                className="flex flex-col items-center gap-2 w-[62px] sm:w-24 md:w-28"
                whileHover={{ scale: 1.1, y: -4 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full overflow-hidden shadow-md transition-all">
                  <OptimizedImage
                    src={offerImage}
                    alt="All"
                    className="w-full h-full bg-white rounded-full"
                    objectFit="cover"
                    sizes="(max-width: 640px) 62px, (max-width: 768px) 96px, 112px"
                    placeholder="blur"
                  />
                </div>
                <span className="text-xs sm:text-sm md:text-base font-semibold text-gray-800 dark:text-gray-200 text-center pb-1">
                  All
                </span>
              </motion.div>
            </div>
            {categories.map((category, index) => {
              const isActive = activeCategory === category.id
              const categorySlug = category.slug || category.name.toLowerCase().replace(/\s+/g, '-')
              return (
                <div key={category.id} className="flex-shrink-0">
                  <Link to={`/user/category/${categorySlug}`}>
                    <motion.div
                      className="flex flex-col items-center gap-2 w-[62px] sm:w-24 md:w-28"
                      onClick={() => setActiveCategory(category.id)}
                      whileHover={{ scale: 1.1, y: -4 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      <div className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full overflow-hidden shadow-md transition-all">
                        <OptimizedImage
                          src={category.image}
                          alt={category.name}
                          className="w-full h-full bg-white rounded-full"
                          objectFit="cover"
                          sizes="(max-width: 640px) 62px, (max-width: 768px) 96px, 112px"
                          placeholder="blur"
                        />
                      </div>
                      <span className={`text-xs sm:text-sm md:text-base font-semibold text-gray-800 dark:text-gray-200 text-center pb-1 ${isActive ? 'border-b-2 border-[#EB590E]' : ''}`}>
                        {category.name.length > 7 ? `${category.name.slice(0, 7)}...` : category.name}
                      </span>
                    </motion.div>
                  </Link>
                </div>
              )
            })}
          </div>
        </section>

        <section className="py-2 sm:py-3 md:py-4">
          <div className="flex items-center gap-2 md:gap-3">
            <Button
              variant="outline"
              onClick={() => setShowSortPopup(true)}
              className="h-8 sm:h-9 md:h-10 px-3 sm:px-4 md:px-5 rounded-md flex items-center gap-2 whitespace-nowrap flex-shrink-0 font-medium transition-all bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm md:text-base"
            >
              <ArrowDownUp className="h-4 w-4 md:h-5 md:w-5 rotate-90" />
              <span className="text-sm md:text-base font-medium">
                {selectedSort ? sortOptions.find(opt => opt.id === selectedSort)?.label : 'Sort'}
              </span>
              <ChevronDown className="h-3 w-3 md:h-4 md:w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setUnder30MinsFilter(!under30MinsFilter)}
              className={`h-8 sm:h-9 md:h-10 px-3 sm:px-4 md:px-5 rounded-md flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 font-medium transition-all text-sm md:text-base ${under30MinsFilter
                ? 'bg-[#EB590E] text-white border border-[#EB590E] hover:bg-[#D94F0C]'
                : 'bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}
            >
              <Timer className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" />
              <span className="text-xs sm:text-sm md:text-base font-medium">Under 30 mins</span>
            </Button>
          </div>
        </section>


        {/* Restaurant Menu Sections */}
        {loadingRestaurants ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-500 dark:text-gray-400">Loading restaurants...</div>
          </div>
        ) : sortedAndFilteredRestaurants.length === 0 ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-500 dark:text-gray-400">
              {under250Restaurants.length === 0
                ? "No restaurants with dishes under ₹250 found."
                : "No restaurants match the selected filters."}
            </div>
          </div>
        ) : (
          sortedAndFilteredRestaurants.map((restaurant) => {
            const restaurantSlug = restaurant.slug || restaurant.name.toLowerCase().replace(/\s+/g, "-")
            return (
              <section key={restaurant.id} className="pt-4 sm:pt-6 md:pt-8 lg:pt-10">
                {/* Restaurant Header */}
                <div className="flex items-start justify-between mb-3 md:mb-4 lg:mb-6">
                  <div className="flex-1">
                    <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900 dark:text-white mb-1 md:mb-2">
                      {restaurant.name}
                    </h3>
                    <div className="flex items-center gap-2 text-sm md:text-base lg:text-lg text-gray-500 dark:text-gray-400">
                      <Clock className="h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6" strokeWidth={1.5} />
                      <span className="font-medium">{restaurant.deliveryTime}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 bg-green-800 text-white px-1 py-1 md:px-2 md:py-1.5 lg:px-3 lg:py-2 rounded-full">
                      <div className="bg-white text-green-700 px-1 py-1 md:px-1.5 md:py-1.5 lg:px-2 lg:py-2 rounded-full">
                        <Star className="h-3.5 w-3.5 md:h-4 md:w-4 lg:h-5 lg:w-5 fill-green-800 text-green-800" />
                      </div>
                      <span className="text-xs md:text-sm lg:text-base font-bold">{restaurant.rating}</span>
                    </div>
                    <span className="text-xs md:text-sm lg:text-base text-gray-400 dark:text-gray-500 mt-0.5">
                      {restaurant.totalRatings > 0 ? `By ${restaurant.totalRatings >= 1000 ? `${(restaurant.totalRatings / 1000).toFixed(1)}K+` : `${restaurant.totalRatings}+`}` : ''}
                    </span>
                  </div>
                </div>

                {/* Menu Items Horizontal Scroll */}
                {restaurant.menuItems && restaurant.menuItems.length > 0 && (
                  <div className="space-y-2 md:space-y-3 lg:space-y-4">
                    <div
                      className="flex md:grid gap-3 sm:gap-4 md:gap-5 lg:gap-6 overflow-x-auto md:overflow-x-visible overflow-y-visible scrollbar-hide scroll-smooth pb-2 md:pb-0 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                      style={{
                        scrollbarWidth: "none",
                        msOverflowStyle: "none",
                        touchAction: "pan-x pan-y pinch-zoom",
                        overflowY: "hidden",
                      }}
                    >
                      {restaurant.menuItems.map((item, itemIndex) => {
                        const quantity = quantities[item.id] || 0
                        return (
                          <motion.div
                            key={item.id}
                            className="flex-shrink-0 w-[200px] sm:w-[220px] md:w-full bg-white dark:bg-[#1a1a1a] rounded-lg md:rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden cursor-pointer"
                            onClick={() => handleItemClick(item, restaurant)}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ duration: 0.4, delay: itemIndex * 0.05 }}
                            whileHover={{ y: -8, scale: 1.02 }}
                            style={{ boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" }}
                          >
                            {/* Item Image */}
                            <div className="relative w-full h-32 sm:h-36 md:h-40 lg:h-48 xl:h-52 overflow-hidden">
                              <motion.div
                                className="absolute inset-0"
                                whileHover={{ scale: 1.1 }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                              >
                                <OptimizedImage
                                  src={item.image}
                                  alt={item.name}
                                  className="w-full h-full"
                                  objectFit="cover"
                                  sizes="(max-width: 640px) 200px, (max-width: 768px) 220px, 100vw"
                                  placeholder="blur"
                                  priority={itemIndex < 4}
                                />
                              </motion.div>
                              {/* Gradient Overlay on Hover */}
                              <motion.div
                                className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"
                                initial={{ opacity: 0 }}
                                whileHover={{ opacity: 1 }}
                                transition={{ duration: 0.3 }}
                              />
                              {/* Veg Indicator */}
                              {item.isVeg && (
                                <motion.div
                                  className="absolute top-2 left-2 md:top-3 md:left-3 h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6 rounded border-2 border-green-600 bg-white flex items-center justify-center z-10"
                                  whileHover={{ scale: 1.2, rotate: 5 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <div className="h-2 w-2 md:h-2.5 md:w-2.5 lg:h-3 lg:w-3 rounded-full bg-green-600" />
                                </motion.div>
                              )}
                            </div>

                            {/* Item Details */}
                            <div className="p-3 md:p-4 lg:p-5">
                              <div className="flex items-center gap-1 md:gap-2 mb-1 md:mb-2 lg:mb-3">
                                {item.isVeg && (
                                  <div className="h-3 w-3 md:h-4 md:w-4 lg:h-5 lg:w-5 rounded border border-green-600 bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                                    <div className="h-1.5 w-1.5 md:h-2 md:w-2 lg:h-2.5 lg:w-2.5 rounded-full bg-green-600" />
                                  </div>
                                )}
                                <span className="text-sm md:text-base lg:text-lg font-semibold text-gray-900 dark:text-white">
                                  1 x {item.name}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-base md:text-lg lg:text-xl xl:text-2xl font-bold text-gray-900 dark:text-white">
                                    ₹{Math.round(item.price)}
                                  </p>
                                  {item.bestPrice && (
                                    <p className="text-xs md:text-sm lg:text-base text-gray-500 dark:text-gray-400">Best price</p>
                                  )}
                                </div>
                                {quantity > 0 ? (
                                  <Link to="/user/cart" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      variant={"outline"}
                                      size="sm"
                                      className="bg-[#FFF2EB] text-[#EB590E] border-[#EB590E] hover:bg-[#EB590E] hover:text-white h-7 md:h-8 lg:h-9 px-3 md:px-4 lg:px-5 text-xs md:text-sm lg:text-base"
                                    >
                                      View cart
                                    </Button>
                                  </Link>
                                ) : (
                                  <Button
                                    variant={"outline"}
                                    size="sm"
                                    disabled={shouldShowGrayscale}
                                    className={`h-7 md:h-8 lg:h-9 px-3 md:px-4 lg:px-5 text-xs md:text-sm lg:text-base ${shouldShowGrayscale
                                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-300 dark:border-gray-700 cursor-not-allowed opacity-50'
                                      : 'bg-[#FFF2EB] text-[#EB590E] border-[#EB590E] hover:bg-[#EB590E] hover:text-white'
                                      }`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (!shouldShowGrayscale) {
                                        handleItemClick(item, restaurant)
                                      }
                                    }}
                                  >
                                    Add
                                  </Button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>

                    {/* View Full Menu Button */}
                    <Link className="flex justify-center mt-2 md:mt-3 lg:mt-4" to={`/user/restaurants/${restaurantSlug}?under250=true`}>
                      <Button
                        variant="outline"
                        className="w-min align-center text-center rounded-lg md:rounded-xl mx-auto bg-gray-50 dark:bg-[#1a1a1a] hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-white text-gray-700 border-gray-200 dark:border-gray-800 h-9 md:h-10 lg:h-11 px-4 md:px-6 lg:px-8 text-sm md:text-base lg:text-lg"
                      >
                        View full menu <ArrowRight className="h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6 ml-2 text-gray-700 dark:text-gray-300" />
                      </Button>
                    </Link>
                  </div>
                )}
              </section>
            )
          }))}
      </div>

      {/* Sort Popup - Bottom Sheet */}
      <AnimatePresence>
        {showSortPopup && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowSortPopup(false)}
              className="fixed inset-0 bg-black/50 z-100"
            />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30
              }}
              className="fixed bottom-0 left-0 right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-lg lg:max-w-2xl bg-white dark:bg-[#1a1a1a] rounded-t-3xl shadow-2xl z-[110] max-h-[60vh] md:max-h-[80vh] overflow-hidden flex flex-col"
            >
              {/* Drag Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-12 h-1 bg-gray-300 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 md:px-6 py-4 md:py-5 border-b dark:border-gray-800">
                <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">Sort By</h2>
                <button
                  onClick={handleClearAll}
                  className="text-[#EB590E] dark:text-[#F97316] font-medium text-sm md:text-base"
                >
                  Clear all
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-6">
                <div className="flex flex-col gap-3 md:gap-4">
                  {sortOptions.map((option) => (
                    <button
                      key={option.id || 'relevance'}
                      onClick={() => setSelectedSort(option.id)}
                      className={`px-4 md:px-5 lg:px-6 py-3 md:py-4 rounded-xl border text-left transition-colors ${selectedSort === option.id
                        ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-orange-900/20'
                        : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                        }`}
                    >
                      <span className={`text-sm md:text-base lg:text-lg font-medium ${selectedSort === option.id ? 'text-[#EB590E] dark:text-[#F97316]' : 'text-gray-700 dark:text-gray-300'}`}>
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 md:gap-6 px-4 md:px-6 py-4 md:py-5 border-t dark:border-gray-800 bg-white dark:bg-[#1a1a1a]">
                <button
                  onClick={() => setShowSortPopup(false)}
                  className="flex-1 py-3 md:py-4 text-center font-semibold text-gray-700 dark:text-gray-300 text-sm md:text-base"
                >
                  Close
                </button>
                <button
                  onClick={handleApply}
                  className={`flex-1 py-3 md:py-4 font-semibold rounded-xl transition-colors text-sm md:text-base ${selectedSort
                    ? 'bg-[#EB590E] text-white hover:bg-[#D94F0C]'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                >
                  Apply
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Item Detail Popup */}
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
              className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-2xl lg:max-w-4xl xl:max-w-5xl z-[10000] bg-white dark:bg-[#1a1a1a] rounded-t-3xl shadow-2xl max-h-[90vh] md:max-h-[85vh] flex flex-col"
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
                  className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-gray-800 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-900 dark:hover:bg-gray-600 transition-colors shadow-lg"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <X className="h-5 w-5 md:h-6 md:w-6 text-white" />
                </motion.button>
              </div>

              {/* Image Section */}
              <div className="relative w-full h-64 md:h-80 lg:h-96 xl:h-[500px] overflow-hidden rounded-t-3xl">
                <OptimizedImage
                  src={selectedItem.image}
                  alt={selectedItem.name}
                  className="w-full h-full"
                  objectFit="cover"
                  sizes="100vw"
                  priority={true}
                  placeholder="blur"
                />
                {/* Bookmark and Share Icons Overlay */}
                <div className="absolute bottom-4 right-4 flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleBookmarkClick(selectedItem.id)
                    }}
                    className={`h-10 w-10 rounded-full border flex items-center justify-center transition-all duration-300 ${bookmarkedItems.has(selectedItem.id)
                      ? "border-red-500 bg-red-50 text-red-500"
                      : "border-white bg-white/90 text-gray-600 hover:bg-white"
                      }`}
                  >
                    <Bookmark
                      className={`h-5 w-5 transition-all duration-300 ${bookmarkedItems.has(selectedItem.id) ? "fill-red-500" : ""
                        }`}
                    />
                  </button>
                  <button className="h-10 w-10 rounded-full border border-white bg-white/90 text-gray-600 hover:bg-white flex items-center justify-center transition-colors">
                    <Share2 className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Content Section */}
              <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 xl:px-10 py-4 md:py-6 lg:py-8">
                {/* Item Name and Indicator */}
                <div className="flex items-start justify-between mb-3 md:mb-4 lg:mb-6">
                  <div className="flex items-center gap-2 md:gap-3 flex-1">
                    {selectedItem.isVeg && (
                      <div className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7 rounded border-2 border-green-600 dark:border-green-500 bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                        <div className="h-2.5 w-2.5 md:h-3 md:w-3 lg:h-3.5 lg:w-3.5 rounded-full bg-green-600 dark:bg-green-500" />
                      </div>
                    )}
                    <h2 className="text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900 dark:text-white">
                      {selectedItem.name}
                    </h2>
                  </div>
                  {/* Bookmark and Share Icons (Desktop) */}
                  <div className="hidden md:flex items-center gap-2 lg:gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleBookmarkClick(selectedItem.id)
                      }}
                      className={`h-8 w-8 lg:h-10 lg:w-10 rounded-full border flex items-center justify-center transition-all duration-300 ${bookmarkedItems.has(selectedItem.id)
                        ? "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400"
                        : "border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                        }`}
                    >
                      <Bookmark
                        className={`h-4 w-4 lg:h-5 lg:w-5 transition-all duration-300 ${bookmarkedItems.has(selectedItem.id) ? "fill-red-500 dark:fill-red-400" : ""
                          }`}
                      />
                    </button>
                    <button className="h-8 w-8 lg:h-10 lg:w-10 rounded-full border border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex items-center justify-center transition-colors">
                      <Share2 className="h-4 w-4 lg:h-5 lg:w-5" />
                    </button>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm md:text-base lg:text-lg text-gray-600 dark:text-gray-400 mb-4 md:mb-6 lg:mb-8 leading-relaxed">
                  {selectedItem.description || `${selectedItem.name} from ${selectedItem.restaurant || 'Under 250'}`}
                </p>

                {/* Highly Reordered Progress Bar */}
                {selectedItem.customisable && (
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex-1 h-0.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#EB590E] rounded-full" style={{ width: '50%' }} />
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
              <div className="border-t dark:border-gray-800 border-gray-200 px-4 md:px-6 lg:px-8 xl:px-10 py-4 md:py-5 lg:py-6 bg-white dark:bg-[#1a1a1a]">
                <div className="flex items-center gap-4 md:gap-5 lg:gap-6">
                  {/* Quantity Selector */}
                  <div className={`flex items-center gap-3 md:gap-4 lg:gap-5 border-2 rounded-lg md:rounded-xl px-3 md:px-4 lg:px-5 h-[44px] md:h-[50px] lg:h-[56px] ${shouldShowGrayscale
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
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed'
                        }`}
                    >
                      <Minus className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7" />
                    </button>
                    <span className={`text-lg md:text-xl lg:text-2xl font-semibold min-w-[2rem] md:min-w-[2.5rem] lg:min-w-[3rem] text-center ${shouldShowGrayscale
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
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }
                    >
                      <Plus className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7" />
                    </button>
                  </div>

                  {/* Add Item Button */}
                  <Button
                    className={`flex-1 h-[44px] md:h-[50px] lg:h-[56px] rounded-lg md:rounded-xl font-semibold flex items-center justify-center gap-2 text-sm md:text-base lg:text-lg ${shouldShowGrayscale
                      ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-600 cursor-not-allowed opacity-50'
                      : 'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white'
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
                    <div className="flex items-center gap-1 md:gap-2">
                      {selectedItem.originalPrice && selectedItem.originalPrice > selectedItem.price && (
                        <span className="text-sm md:text-base lg:text-lg line-through text-red-200">
                          ₹{Math.round(selectedItem.originalPrice)}
                        </span>
                      )}
                      <span className="text-base md:text-lg lg:text-xl font-bold">
                        ₹{Math.round(selectedItem.price)}
                      </span>
                    </div>
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add to Cart Animation */}
      <AddToCartAnimation dynamicBottom={viewCartButtonBottom} />
    </div>
  )
}

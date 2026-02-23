import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { MapPin, Search, Mic, SlidersHorizontal, Star, X, ArrowDownUp, Timer, IndianRupee, UtensilsCrossed, BadgePercent, ShieldCheck, Clock, Bookmark, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import AnimatedPage from "../components/AnimatedPage"
import { useSearchOverlay, useLocationSelector } from "../components/UserLayout"
import { useLocation as useLocationHook } from "../hooks/useLocation"
import { useProfile } from "../context/ProfileContext"
import { diningAPI } from "@/lib/api"
import api from "@/lib/api"
import PageNavbar from "../components/PageNavbar"
import OptimizedImage from "@/components/OptimizedImage"
import quickSpicyLogo from "@/assets/quicky-spicy-logo.png"
// Using placeholders for dining card images
const diningCard1 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard2 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard3 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard4 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard5 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard6 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"

// Using placeholder for dining banner
const diningBanner = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=400&fit=crop"
// Using placeholders for dining page images
const upto50off = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=200&fit=crop"
const nearAndTopRated = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=200&fit=crop"
// Using placeholder for coffee banner
const coffeeBanner = "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&h=400&fit=crop"
// Using placeholders for bank logos
const axisLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const barodaLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const hdfcLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const iciciLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const pnbLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const sbiLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"

// Mock data removed in favor of dynamic fetching
const diningCategories = []

const limelightRestaurants = []

const bankOffers = []

const MOCK_BANK_OFFERS = bankOffers

const popularRestaurants = []
// Static data removed in favor of dynamic fetching
const MOCK_CATEGORIES = diningCategories
const MOCK_LIMELIGHT = limelightRestaurants
const MOCK_MUST_TRIES = []
const MOCK_RESTAURANTS = popularRestaurants

export default function Dining() {
  const navigate = useNavigate()
  const [heroSearch, setHeroSearch] = useState("")
  const [currentRestaurantIndex, setCurrentRestaurantIndex] = useState(0)
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [activeFilterTab, setActiveFilterTab] = useState('sort')
  const [sortBy, setSortBy] = useState(null)
  const [selectedCuisine, setSelectedCuisine] = useState(null)
  const [selectedBankOffer, setSelectedBankOffer] = useState(null)
  const filterSectionRefs = useRef({})
  const rightContentRef = useRef(null)
  const { openSearch, closeSearch, setSearchValue } = useSearchOverlay()
  const { openLocationSelector } = useLocationSelector()
  const { location } = useLocationHook()
  const { addFavorite, removeFavorite, isFavorite } = useProfile()

  const [categories, setCategories] = useState([])
  const [limelightItems, setLimelightItems] = useState([])
  const [mustTryItems, setMustTryItems] = useState([])
  const [restaurantList, setRestaurantList] = useState([])
  const [bankOfferItems, setBankOfferItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [diningHeroBanner, setDiningHeroBanner] = useState(null)

  useEffect(() => {
    const fetchDiningHeroBanner = async () => {
      try {
        const response = await api.get('/hero-banners/dining/public')
        if (response.data.success && response.data.data.banners && response.data.data.banners.length > 0) {
          setDiningHeroBanner(response.data.data.banners[0])
        } else {
          setDiningHeroBanner(diningBanner)
        }
      } catch (error) {
        console.error("Failed to fetch dining hero banner", error)
        setDiningHeroBanner(diningBanner)
      }
    }
    fetchDiningHeroBanner()
  }, [])

  useEffect(() => {
    const fetchDiningData = async () => {
      try {
        const [cats, limes, tries, rests, offers] = await Promise.all([
          diningAPI.getCategories(),
          diningAPI.getOfferBanners(),
          diningAPI.getStories(),
          diningAPI.getRestaurants(location?.city ? { city: location.city } : {}),
          diningAPI.getBankOffers()
        ])

        if (cats.data.success && cats.data.data.length > 0) setCategories(cats.data.data)
        if (limes.data.success && limes.data.data.length > 0) {
          setLimelightItems(limes.data.data)
        }
        if (tries.data.success && tries.data.data.length > 0) setMustTryItems(tries.data.data)
        if (rests.data.success && rests.data.data.length > 0) setRestaurantList(rests.data.data)
        if (offers.data.success && offers.data.data.length > 0) setBankOfferItems(offers.data.data)
      } catch (error) {
        console.error("Failed to fetch dining data", error)
      } finally {
        setLoading(false)
      }
    }
    fetchDiningData()
  }, [location?.city])

  const toggleFilter = (filterId) => {
    setActiveFilters(prev => {
      const newSet = new Set(prev)
      if (newSet.has(filterId)) {
        newSet.delete(filterId)
      } else {
        newSet.add(filterId)
      }
      return newSet
    })
  }

  const filteredRestaurants = useMemo(() => {
    let filtered = [...restaurantList]

    if (activeFilters.has('delivery-under-30')) {
      filtered = filtered.filter(r => {
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 30
      })
    }
    if (activeFilters.has('delivery-under-45')) {
      filtered = filtered.filter(r => {
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 45
      })
    }
    if (activeFilters.has('distance-under-1km')) {
      filtered = filtered.filter(r => {
        const distMatch = r.distance.match(/(\d+\.?\d*)/)
        return distMatch && parseFloat(distMatch[1]) <= 1.0
      })
    }
    if (activeFilters.has('distance-under-2km')) {
      filtered = filtered.filter(r => {
        const distMatch = r.distance.match(/(\d+\.?\d*)/)
        return distMatch && parseFloat(distMatch[1]) <= 2.0
      })
    }
    if (activeFilters.has('rating-35-plus')) {
      filtered = filtered.filter(r => r.rating >= 3.5)
    }
    if (activeFilters.has('rating-4-plus')) {
      filtered = filtered.filter(r => r.rating >= 4.0)
    }
    if (activeFilters.has('rating-45-plus')) {
      filtered = filtered.filter(r => r.rating >= 4.5)
    }

    // Apply cuisine filter
    if (selectedCuisine) {
      filtered = filtered.filter(r => r.cuisine.toLowerCase().includes(selectedCuisine.toLowerCase()))
    }

    // Apply sorting
    if (sortBy === 'rating-high') {
      filtered.sort((a, b) => b.rating - a.rating)
    } else if (sortBy === 'rating-low') {
      filtered.sort((a, b) => a.rating - b.rating)
    }

    return filtered
  }, [activeFilters, selectedCuisine, sortBy])


  const handleSearchFocus = useCallback(() => {
    if (heroSearch) {
      setSearchValue(heroSearch)
    }
    openSearch()
  }, [heroSearch, openSearch, setSearchValue])

  // Auto-play carousel
  useEffect(() => {
    if (limelightItems.length === 0) return

    const interval = setInterval(() => {
      setCurrentRestaurantIndex((prev) => (prev + 1) % limelightItems.length)
    }, 2000) // Change every 2 seconds

    return () => clearInterval(interval)
  }, [limelightItems.length])


  return (
    <AnimatedPage className="bg-white dark:bg-[#0a0a0a]" style={{ minHeight: '100vh', paddingBottom: '80px', overflow: 'visible' }}>
      {/* Sticky Header Wrapper */}
      <div className="sticky top-0 z-40 w-full bg-white dark:bg-[#0a0a0a] shadow-sm md:hidden">
        {/* Navbar Section */}
        <div className="relative z-20 pt-2 sm:pt-3 lg:pt-4">
          <PageNavbar
            textColor="dark"
            zIndex={20}
            onNavClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Search Bar Section */}
        <section
          className="relative z-20 w-full py-3 sm:py-4 md:py-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative z-20 w-full px-3 sm:px-6 lg:px-8">
            {/* Search Bar Container */}
            <div className="z-20">
              {/* Enhanced Search Bar */}
              <div className="w-full relative">
                <div className="relative bg-white dark:bg-[#1a1a1a] rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-1 sm:p-1.5 transition-all duration-300 hover:shadow-xl">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Search className="h-4 w-4 sm:h-4 sm:w-4 text-[#EB590E] flex-shrink-0 ml-2 sm:ml-3" strokeWidth={2.5} />
                    <div className="flex-1 relative">
                      <Input
                        value={heroSearch}
                        onChange={(e) => setHeroSearch(e.target.value)}
                        onFocus={handleSearchFocus}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && heroSearch.trim()) {
                            navigate(`/user/search?q=${encodeURIComponent(heroSearch.trim())}`)
                            closeSearch()
                            setHeroSearch("")
                          }
                        }}
                        className="pl-0 pr-2 h-8 sm:h-9 w-full bg-transparent border-0 text-sm sm:text-base font-semibold text-gray-700 dark:text-white focus-visible:ring-0 focus-visible:ring-offset-0 rounded-full placeholder:font-semibold placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        placeholder='Search "burger"'
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSearchFocus}
                      className="flex-shrink-0 mr-2 sm:mr-3 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                    >
                      <Mic className="h-4 w-4 sm:h-4 sm:w-4 text-gray-500 dark:text-gray-400" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Banner Section */}
      <div
        className="relative w-full px-3 sm:px-4 md:px-6 lg:px-8 pb-4 sm:pb-6 cursor-pointer"
        onClick={() => navigate('/user/dining/restaurants')}
      >
        <div className="relative w-full h-[30vh] sm:h-[35vh] lg:h-[40vh] rounded-2xl overflow-hidden shadow-lg">
          {diningHeroBanner && (
            <OptimizedImage
              src={diningHeroBanner}
              alt="Dining Banner"
              className="w-full h-full"
              objectFit="cover"
              priority={true}
              sizes="100vw"
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 pt-6 sm:pt-8 md:pt-10 lg:pt-12 pb-6 md:pb-8 lg:pb-10">
        {/* Categories Section */}
        <div className="mb-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                What are you looking for?
              </h3>
            </div>
          </div>

          {/* Light blue-grey background container */}
          {/* Modern Grid Layout */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {categories.map((category, index) => (
              <Link
                key={category._id || category.id}
                to={`/user/dining/${category.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <motion.div
                  className="relative rounded-2xl overflow-hidden shadow-sm cursor-pointer group h-[120px] sm:h-[140px] md:h-[160px]"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  whileHover={{ y: -5, boxShadow: "0 10px 20px -5px rgba(0, 0, 0, 0.15)" }}
                >
                  <div className="absolute inset-0">
                    <OptimizedImage
                      src={category.imageUrl}
                      alt={category.name}
                      className="w-full h-full transition-transform duration-700 group-hover:scale-110"
                      objectFit="cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                      placeholder="blur"
                      priority={index < 4}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 flex flex-col justify-end h-full">
                    <p className="text-sm sm:text-base font-bold text-white leading-tight drop-shadow-md group-hover:text-[#EB590E] transition-colors">
                      {category.name}
                    </p>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>

        {/* In the Limelight Section */}
        <div className="mb-6 mt-8 sm:mt-12">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                In the Limelight
              </h3>
            </div>
          </div>

          {/* Landscape Carousel */}
          <div className="relative w-full h-[200px] sm:h-[280px] md:h-[350px] lg:h-[400px] rounded-2xl overflow-hidden shadow-lg">
            {/* Carousel Container */}
            <div
              className="flex h-full transition-transform duration-700 ease-in-out"
              style={{ transform: `translateX(-${currentRestaurantIndex * 100}%)` }}
            >
              {limelightItems.map((restaurant, index) => (
                <div
                  key={restaurant._id || restaurant.id}
                  className="min-w-full h-full relative flex-shrink-0 w-full"
                >
                  {/* Restaurant Image */}
                  <OptimizedImage
                    src={restaurant.imageUrl}
                    alt={restaurant.tagline}
                    className="w-full h-full"
                    objectFit="cover"
                    sizes="100vw"
                    placeholder="blur"
                    priority={index === 0}
                  />

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-90" />

                  {/* Content Container */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 z-10 flex flex-col items-start gap-2">
                    {/* Discount Badge */}
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-[#EB590E] text-white px-3 py-1 rounded-full shadow-lg mb-1"
                    >
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                        {restaurant.percentageOff}
                      </span>
                    </motion.div>

                    {/* Restaurant Name */}
                    <motion.h4
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight drop-shadow-lg"
                    >
                      {restaurant.restaurant?.name}
                    </motion.h4>

                    {/* Tagline */}
                    <motion.p
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="text-sm sm:text-base font-medium text-gray-200 line-clamp-1 max-w-[90%]"
                    >
                      {restaurant.tagline}
                    </motion.p>
                  </div>
                </div>
              ))}
            </div>

            {/* Carousel Indicators */}
            <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-10 flex gap-2">
              {limelightItems.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentRestaurantIndex(index)}
                  className={`h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full transition-all ${index === currentRestaurantIndex
                    ? "bg-white w-6 sm:w-8"
                    : "bg-white/50"
                    }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>



        {/* Must Tries in Indore Section */}
        <div className="mb-6 mt-8 sm:mt-12">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                Must Tries
              </h3>
            </div>
          </div>

          {/* Horizontal Scroll Container */}
          <div
            className="overflow-x-auto -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            <style>{`
              .must-tries-scroll::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            <div className="flex gap-4 pb-4 must-tries-scroll" style={{ width: 'max-content' }}>
              {mustTryItems.map((item, index) => (
                <motion.div
                  key={item._id || item.id}
                  className="relative flex-shrink-0 rounded-xl overflow-hidden shadow-sm cursor-pointer"
                  style={{
                    width: 'calc((100vw - 3rem) / 2.5)',
                    minWidth: '140px',
                    maxWidth: '200px'
                  }}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  whileHover={{ y: -8, scale: 1.05 }}
                >
                  <div className="relative h-48 sm:h-56 md:h-64 overflow-hidden">
                    <motion.div
                      className="absolute inset-0"
                      whileHover={{ scale: 1.15 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    >
                      <OptimizedImage
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full"
                        objectFit="cover"
                        sizes="(max-width: 640px) 40vw, 200px"
                        placeholder="blur"
                      />
                    </motion.div>
                    {/* White Subheading Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/50 to-transparent p-3 sm:p-2 z-10">
                      <h4 className="text-white text-md sm:text-md font-bold text-start">
                        {item.name}
                      </h4>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Explore More Button */}
          {/* <div className="flex justify-center mt-6">
            <Button
              variant="ghost"
              className="px-6 py-2 text-sm font-semibold"
            >
              Explore More
            </Button>
          </div> */}
        </div>

        {/* Popular Restaurants Around You Section */}
        <div className="mb-6 mt-8 sm:mt-12">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                Popular Restaurants Around You
              </h3>
            </div>
          </div>

          {/* Filters */}
          <section className="py-1 mb-4">
            <div
              className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide pb-1"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {/* Filter Button - Opens Modal */}
              <Button
                variant="outline"
                onClick={() => setIsFilterOpen(true)}
                className="h-7 sm:h-8 px-2 sm:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 font-medium transition-all bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                <SlidersHorizontal className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-xs sm:text-sm font-bold text-black dark:text-white">Filters</span>
              </Button>

              {/* Filter Buttons */}
              {[
                { id: 'delivery-under-30', label: 'Under 30 mins' },
                { id: 'delivery-under-45', label: 'Under 45 mins' },
                { id: 'distance-under-1km', label: 'Under 1km', icon: MapPin },
                { id: 'distance-under-2km', label: 'Under 2km', icon: MapPin },
                { id: 'rating-35-plus', label: '3.5+ Rating' },
                { id: 'rating-4-plus', label: '4.0+ Rating' },
                { id: 'rating-45-plus', label: '4.5+ Rating' },
              ].map((filter) => {
                const Icon = filter.icon
                const isActive = activeFilters.has(filter.id)
                return (
                  <Button
                    key={filter.id}
                    variant="outline"
                    onClick={() => toggleFilter(filter.id)}
                    className={`h-7 sm:h-8 px-2 sm:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 transition-all font-medium ${isActive
                      ? 'bg-[#EB590E] text-white border border-[#EB590E] hover:bg-[#D94F0C]'
                      : 'bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                      }`}
                  >
                    {Icon && <Icon className={`h-3 w-3 sm:h-4 sm:w-4 ${isActive ? 'fill-white' : ''}`} />}
                    <span className="text-xs sm:text-sm font-bold text-black dark:text-white">{filter.label}</span>
                  </Button>
                )
              })}
            </div>
          </section>

          {/* Restaurant Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6 lg:gap-8">
            {/* First 2 Restaurants */}
            {filteredRestaurants.slice(0, 2).map((restaurant, index) => {
              const restaurantSlug = restaurant.slug || restaurant.name.toLowerCase().replace(/\s+/g, "-")
              const favorite = isFavorite(restaurantSlug)

              const handleToggleFavorite = (e) => {
                e.preventDefault()
                e.stopPropagation()
                if (favorite) {
                  removeFavorite(restaurantSlug)
                } else {
                  addFavorite({
                    slug: restaurantSlug,
                    name: restaurant.name,
                    cuisine: restaurant.cuisine,
                    rating: restaurant.rating,
                    deliveryTime: restaurant.deliveryTime,
                    distance: restaurant.distance,
                    image: restaurant.image
                  })
                }
              }

              return (
                <motion.div
                  key={restaurant._id || restaurant.id}
                  className="h-full"
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{
                    duration: 0.5,
                    delay: index * 0.1,
                    type: "spring",
                    stiffness: 100
                  }}
                  style={{ perspective: 1000 }}
                >
                  <motion.div
                    className="h-full"
                    whileHover="hover"
                    initial="rest"
                    variants={{
                      rest: {
                        y: 0,
                        scale: 1,
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                      },
                      hover: {
                        y: -12,
                        scale: 1.02,
                        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(34, 197, 94, 0.1)",
                        transition: {
                          type: "spring",
                          stiffness: 300,
                          damping: 20,
                          mass: 0.5
                        }
                      }
                    }}
                  >
                    <Link to={`/user/restaurants/${restaurantSlug}`} className="h-full flex">
                      <Card className="overflow-hidden gap-0 cursor-pointer border-0 dark:border-gray-800 group bg-white dark:bg-[#1a1a1a] shadow-md transition-all duration-500 py-0 rounded-2xl h-full flex flex-col w-full relative">
                        {/* Image Section */}
                        <div className="relative h-48 sm:h-56 md:h-60 lg:h-64 xl:h-72 w-full overflow-hidden rounded-t-2xl flex-shrink-0">
                          <motion.div
                            className="absolute inset-0"
                            variants={{
                              rest: { scale: 1 },
                              hover: { scale: 1.15 }
                            }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          >
                            <OptimizedImage
                              src={restaurant.image}
                              alt={restaurant.name}
                              className="w-full h-full"
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                              objectFit="cover"
                              placeholder="blur"
                              priority={index < 3}
                            />
                          </motion.div>

                          {/* Gradient Overlay on Hover */}
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0"
                            variants={{
                              rest: { opacity: 0 },
                              hover: { opacity: 1 }
                            }}
                            transition={{ duration: 0.4 }}
                          />

                          {/* Shine Effect */}
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full"
                            variants={{
                              rest: { x: "-100%" },
                              hover: {
                                x: "200%",
                                transition: {
                                  duration: 0.8,
                                  ease: "easeInOut",
                                  delay: 0.2
                                }
                              }
                            }}
                          />

                          {/* Featured Dish Badge - Top Left */}
                          <motion.div
                            className="absolute top-3 left-3 flex items-center z-10"
                            variants={{
                              rest: { scale: 1, y: 0 },
                              hover: { scale: 1.05, y: -2 }
                            }}
                            transition={{ duration: 0.3 }}
                          >
                            <div className="bg-gray-800/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium shadow-lg">
                              {restaurant.featuredDish} · ₹{restaurant.featuredPrice}
                            </div>
                          </motion.div>

                          {/* Bookmark Icon - Top Right */}
                          <motion.div
                            variants={{
                              rest: { scale: 1, rotate: 0 },
                              hover: { scale: 1.1, rotate: 5 }
                            }}
                            transition={{ duration: 0.3 }}
                            className="absolute top-3 right-3 z-10"
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur-sm rounded-lg hover:bg-white dark:hover:bg-[#2a2a2a] transition-colors"
                              onClick={handleToggleFavorite}
                            >
                              <Bookmark className={`h-5 w-5 ${favorite ? "fill-gray-800 dark:fill-gray-200 text-gray-800 dark:text-gray-200" : "text-gray-600 dark:text-gray-400"}`} strokeWidth={2} />
                            </Button>
                          </motion.div>

                          {/* Blue Section - Bottom 40% */}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-r from-[#EB590E] to-transparent" style={{ height: '40%' }}>
                            <div className="h-full flex flex-col justify-end">
                              <div className="pl-4 sm:pl-5 pb-4 sm:pb-5">
                                <p className="text-white text-xs sm:text-sm font-medium uppercase tracking-wide mb-1">
                                  PRE-BOOK TABLE
                                </p>
                                <div className="h-px bg-white/30 mb-2 w-24"></div>
                                <p className="text-white text-base sm:text-lg font-bold">
                                  {restaurant.offer}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Content Section */}
                        <motion.div
                          variants={{
                            rest: { y: 0 },
                            hover: { y: -4 }
                          }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                        >
                          <CardContent className="p-3 sm:p-4 pt-3 sm:pt-4">
                            {/* Restaurant Name & Rating */}
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <motion.h3
                                  className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white line-clamp-1"
                                  variants={{
                                    rest: {},
                                    hover: { color: "#EB590E" }
                                  }}
                                  transition={{ duration: 0.3 }}
                                >
                                  {restaurant.name}
                                </motion.h3>
                              </div>
                              <motion.div
                                className="flex-shrink-0 bg-green-600 text-white px-2 py-1 rounded-lg flex items-center gap-1"
                                variants={{
                                  rest: { scale: 1, rotate: 0 },
                                  hover: { scale: 1.1, rotate: 5 }
                                }}
                                transition={{ duration: 0.3, type: "spring", stiffness: 400 }}
                              >
                                <span className="text-sm font-bold">{restaurant.rating}</span>
                                <Star className="h-3 w-3 fill-white text-white" />
                              </motion.div>
                            </div>

                            {/* Delivery Time & Distance */}
                            <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-2">
                              <Clock className="h-4 w-4" strokeWidth={1.5} />
                              <span className="font-medium">{restaurant.deliveryTime}</span>
                              <span className="mx-1">|</span>
                              <span className="font-medium">{restaurant.distance}</span>
                            </div>

                            {/* Offer Badge */}
                            {restaurant.offer && (
                              <div className="flex items-center gap-2 text-sm">
                                <BadgePercent className="h-4 w-4 text-[#EB590E]" strokeWidth={2} />
                                <span className="text-gray-700 dark:text-gray-300 font-medium">{restaurant.offer}</span>
                              </div>
                            )}
                          </CardContent>
                        </motion.div>
                      </Card>
                    </Link>
                  </motion.div>
                </motion.div>
              )
            })}

            {/* Remaining Restaurants */}
            {filteredRestaurants.slice(2).map((restaurant, index) => {
              const restaurantSlug = restaurant.slug || restaurant.name.toLowerCase().replace(/\s+/g, "-")
              const favorite = isFavorite(restaurantSlug)

              const handleToggleFavorite = (e) => {
                e.preventDefault()
                e.stopPropagation()
                if (favorite) {
                  removeFavorite(restaurantSlug)
                } else {
                  addFavorite({
                    slug: restaurantSlug,
                    name: restaurant.name,
                    cuisine: restaurant.cuisine,
                    rating: restaurant.rating,
                    deliveryTime: restaurant.deliveryTime,
                    distance: restaurant.distance,
                    image: restaurant.image
                  })
                }
              }

              return (
                <motion.div
                  key={restaurant._id || restaurant.id}
                  className="h-full"
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{
                    duration: 0.5,
                    delay: (index + 2) * 0.1,
                    type: "spring",
                    stiffness: 100
                  }}
                  style={{ perspective: 1000 }}
                >
                  <motion.div
                    className="h-full"
                    whileHover="hover"
                    initial="rest"
                    variants={{
                      rest: {
                        y: 0,
                        scale: 1,
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                      },
                      hover: {
                        y: -12,
                        scale: 1.02,
                        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(34, 197, 94, 0.1)",
                        transition: {
                          type: "spring",
                          stiffness: 300,
                          damping: 20,
                          mass: 0.5
                        }
                      }
                    }}
                  >
                    <Link to={`/user/restaurants/${restaurantSlug}`} className="h-full flex">
                      <Card className="overflow-hidden cursor-pointer border-0 dark:border-gray-800 group bg-white dark:bg-[#1a1a1a] shadow-md transition-all duration-500 py-0 rounded-2xl h-full flex flex-col w-full relative">
                        {/* Image Section */}
                        <div className="relative h-48 sm:h-56 md:h-60 lg:h-64 xl:h-72 w-full overflow-hidden rounded-t-2xl flex-shrink-0">
                          <motion.div
                            className="absolute inset-0"
                            variants={{
                              rest: { scale: 1 },
                              hover: { scale: 1.15 }
                            }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          >
                            <OptimizedImage
                              src={restaurant.image}
                              alt={restaurant.name}
                              className="w-full h-full"
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                              objectFit="cover"
                              placeholder="blur"
                            />
                          </motion.div>

                          {/* Gradient Overlay on Hover */}
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0"
                            variants={{
                              rest: { opacity: 0 },
                              hover: { opacity: 1 }
                            }}
                            transition={{ duration: 0.4 }}
                          />

                          {/* Shine Effect */}
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full"
                            variants={{
                              rest: { x: "-100%" },
                              hover: {
                                x: "200%",
                                transition: {
                                  duration: 0.8,
                                  ease: "easeInOut",
                                  delay: 0.2
                                }
                              }
                            }}
                          />

                          {/* Featured Dish Badge - Top Left */}
                          <div className="absolute top-3 left-3">
                            <div className="bg-gray-800/80 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium">
                              {restaurant.featuredDish} · ₹{restaurant.featuredPrice}
                            </div>
                          </div>

                          {/* Bookmark Icon - Top Right */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-3 right-3 h-9 w-9 bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur-sm rounded-lg hover:bg-white dark:hover:bg-[#2a2a2a] transition-colors"
                            onClick={handleToggleFavorite}
                          >
                            <Bookmark className={`h-5 w-5 ${favorite ? "fill-gray-800 dark:fill-gray-200 text-gray-800 dark:text-gray-200" : "text-gray-600 dark:text-gray-400"}`} strokeWidth={2} />
                          </Button>

                          {/* Blue Section - Bottom 40% */}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-r from-[#EB590E] to-transparent" style={{ height: '40%' }}>
                            <div className="h-full flex flex-col justify-end">
                              <div className="pl-4 sm:pl-5 pb-4 sm:pb-5">
                                <p className="text-white text-xs sm:text-sm font-medium uppercase tracking-wide mb-1">
                                  PRE-BOOK TABLE
                                </p>
                                <div className="h-px bg-white/30 mb-2 w-24"></div>
                                <p className="text-white text-base sm:text-lg font-bold">
                                  {restaurant.offer}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Content Section */}
                        <CardContent className="p-3 sm:p-4 pt-3 sm:pt-4">
                          {/* Restaurant Name & Rating */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white line-clamp-1">
                                {restaurant.name}
                              </h3>
                            </div>
                            <div className="flex-shrink-0 bg-green-600 text-white px-2 py-1 rounded-lg flex items-center gap-1">
                              <span className="text-sm font-bold">{restaurant.rating}</span>
                              <Star className="h-3 w-3 fill-white text-white" />
                            </div>
                          </div>

                          {/* Delivery Time & Distance */}
                          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-2">
                            <Clock className="h-4 w-4" strokeWidth={1.5} />
                            <span className="font-medium">{restaurant.deliveryTime}</span>
                            <span className="mx-1">|</span>
                            <span className="font-medium">{restaurant.distance}</span>
                          </div>

                          {/* Offer Badge */}
                          {restaurant.offer && (
                            <div className="flex items-center gap-2 text-sm">
                              <BadgePercent className="h-4 w-4 text-[#EB590E]" strokeWidth={2} />
                              <span className="text-gray-700 dark:text-gray-300 font-medium">{restaurant.offer}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  </motion.div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Filter Modal */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-[100]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsFilterOpen(false)}
          />

          {/* Modal Content */}
          <div className="absolute bottom-0 left-0 right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-4xl bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl max-h-[85vh] md:max-h-[90vh] flex flex-col animate-[slideUp_0.3s_ease-out]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 md:px-6 py-4 md:py-5 border-b dark:border-gray-800">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">Filters and sorting</h2>
              <button
                onClick={() => {
                  setActiveFilters(new Set())
                  setSortBy(null)
                  setSelectedCuisine(null)
                }}
                className="text-[#EB590E] font-medium text-sm md:text-base"
              >
                Clear all
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left Sidebar - Tabs */}
              <div className="w-24 sm:w-28 md:w-32 bg-gray-50 dark:bg-[#0a0a0a] border-r dark:border-gray-800 flex flex-col">
                {[
                  { id: 'sort', label: 'Sort By', icon: ArrowDownUp },
                  { id: 'time', label: 'Time', icon: Timer },
                  { id: 'rating', label: 'Rating', icon: Star },
                  { id: 'distance', label: 'Distance', icon: MapPin },
                  { id: 'price', label: 'Dish Price', icon: IndianRupee },
                  { id: 'cuisine', label: 'Cuisine', icon: UtensilsCrossed },
                ].map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeFilterTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveFilterTab(tab.id)}
                      className={`flex flex-col items-center gap-1 py-4 px-2 text-center relative transition-colors ${isActive ? 'bg-white dark:bg-[#1a1a1a] text-[#EB590E]' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#EB590E] rounded-r" />
                      )}
                      <Icon className="h-5 w-5 md:h-6 md:w-6" strokeWidth={1.5} />
                      <span className="text-xs md:text-sm font-medium leading-tight">{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Right Content Area - Scrollable */}
              <div ref={rightContentRef} className="flex-1 overflow-y-auto p-4 md:p-6">
                {/* Sort By Tab */}
                {activeFilterTab === 'sort' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">Sort by</h3>
                    <div className="flex flex-col gap-3 md:gap-4">
                      {[
                        { id: null, label: 'Relevance' },
                        { id: 'rating-high', label: 'Rating: High to Low' },
                        { id: 'rating-low', label: 'Rating: Low to High' },
                      ].map((option) => (
                        <button
                          key={option.id || 'relevance'}
                          onClick={() => setSortBy(option.id)}
                          className={`px-4 md:px-5 py-3 md:py-4 rounded-xl border text-left transition-colors ${sortBy === option.id
                            ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                            }`}
                        >
                          <span className={`text-sm md:text-base font-medium ${sortBy === option.id ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>
                            {option.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Time Tab */}
                {activeFilterTab === 'time' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Estimated Time</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('delivery-under-30')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('delivery-under-30')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-30') ? 'text-[#EB590E]' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('delivery-under-30') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under 30 mins</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('delivery-under-45')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('delivery-under-45')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-45') ? 'text-[#EB590E]' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('delivery-under-45') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under 45 mins</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Rating Tab */}
                {activeFilterTab === 'rating' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Restaurant Rating</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('rating-35-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-35-plus')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-35-plus') ? 'text-[#EB590E] fill-[#EB590E]' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-35-plus') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Rated 3.5+</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('rating-4-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-4-plus')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-4-plus') ? 'text-[#EB590E] fill-[#EB590E]' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-4-plus') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Rated 4.0+</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('rating-45-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-45-plus')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-45-plus') ? 'text-[#EB590E] fill-[#EB590E]' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-45-plus') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Rated 4.5+</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Distance Tab */}
                {activeFilterTab === 'distance' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Distance</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('distance-under-1km')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('distance-under-1km')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-1km') ? 'text-[#EB590E]' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('distance-under-1km') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under 1 km</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('distance-under-2km')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('distance-under-2km')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-2km') ? 'text-[#EB590E]' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('distance-under-2km') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under 2 km</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Price Tab */}
                {activeFilterTab === 'price' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Dish Price</h3>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => toggleFilter('price-under-200')}
                        className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('price-under-200')
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                          }`}
                      >
                        <span className={`text-sm font-medium ${activeFilters.has('price-under-200') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under ₹200</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('price-under-500')}
                        className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('price-under-500')
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                          }`}
                      >
                        <span className={`text-sm font-medium ${activeFilters.has('price-under-500') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under ₹500</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Cuisine Tab */}
                {activeFilterTab === 'cuisine' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cuisine</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {['Continental', 'Italian', 'Asian', 'Indian', 'Chinese', 'American', 'Seafood', 'Cafe'].map((cuisine) => (
                        <button
                          key={cuisine}
                          onClick={() => setSelectedCuisine(selectedCuisine === cuisine ? null : cuisine)}
                          className={`px-4 py-3 rounded-xl border text-center transition-colors ${selectedCuisine === cuisine
                            ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                            }`}
                        >
                          <span className={`text-sm font-medium ${selectedCuisine === cuisine ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>
                            {cuisine}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 md:gap-6 px-4 md:px-6 py-4 md:py-5 border-t dark:border-gray-800 bg-white dark:bg-[#1a1a1a]">
              <button
                onClick={() => setIsFilterOpen(false)}
                className="flex-1 py-3 md:py-4 text-center font-semibold text-gray-700 dark:text-gray-300 text-sm md:text-base"
              >
                Close
              </button>
              <button
                onClick={() => setIsFilterOpen(false)}
                className={`flex-1 py-3 md:py-4 font-semibold rounded-xl transition-colors text-sm md:text-base ${activeFilters.size > 0 || sortBy || selectedCuisine
                  ? 'bg-[#EB590E] text-white hover:bg-[#D94F0C]'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
              >
                {activeFilters.size > 0 || sortBy || selectedCuisine
                  ? `Show ${filteredRestaurants.length} results`
                  : 'Show results'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatedPage>
  )
}


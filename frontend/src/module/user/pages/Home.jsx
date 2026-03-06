import { useSearchParams, Link, useNavigate } from "react-router-dom"
import React, { useRef, useEffect, useState, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import Lenis from "lenis"
import { Star, Clock, MapPin, Heart, Search, Tag, Flame, ShoppingBag, ShoppingCart, Mic, SlidersHorizontal, CheckCircle2, Bookmark, BadgePercent, X, ArrowDownUp, Timer, CalendarClock, ShieldCheck, IndianRupee, UtensilsCrossed, Leaf, AlertCircle, Loader2, Plus, Check, Share2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import Footer from "../components/Footer"
import AddToCartButton from "../components/AddToCartButton"
import StickyCartCard from "../components/StickyCartCard"
import OrderTrackingCard from "../components/OrderTrackingCard"
import { useProfile } from "../context/ProfileContext"
import { useCart } from "../context/CartContext"
import { HorizontalCarousel } from "@/components/ui/horizontal-carousel"
import { DotPattern } from "@/components/ui/dot-pattern"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { useSearchOverlay, useLocationSelector } from "../components/UserLayout"
import PageNavbar from "../components/PageNavbar"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

// Import shared food images - prevents duplication
import { foodImages } from "@/constants/images"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLocation } from "../hooks/useLocation"
import { useZone } from "../hooks/useZone"
import quickSpicyLogo from "@/assets/quicky-spicy-logo.png"
import offerImage from "@/assets/offerimage.png"
import api, { restaurantAPI } from "@/lib/api"
import { API_BASE_URL } from "@/lib/api/config"
import OptimizedImage from "@/components/OptimizedImage"
import { getRestaurantAvailabilityStatus } from "@/lib/utils/restaurantAvailability"
// Explore More Icons
import exploreOffers from "@/assets/explore more icons/offers.png"
import exploreGourmet from "@/assets/explore more icons/gourmet.png"
import exploreTop10 from "@/assets/explore more icons/top 10.png"
import exploreCollection from "@/assets/explore more icons/collection.png"

// Banner images for hero carousel - will be fetched from API

// Animated placeholder for search - moved outside component to prevent recreation
const placeholders = [
  "Search \"burger\"",
  "Search \"biryani\"",
  "Search \"pizza\"",
  "Search \"desserts\"",
  "Search \"chinese\"",
  "Search \"thali\"",
  "Search \"momos\"",
  "Search \"dosa\""
]

const WEBVIEW_SESSION_CACHE_BUSTER = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Restaurant Image Carousel Component
const RestaurantImageCarousel = React.memo(({ restaurant, priority = false, backendOrigin = "" }) => {
  const webviewSessionKeyRef = useRef(WEBVIEW_SESSION_CACHE_BUSTER)
  const imageElementRef = useRef(null)

  const withCacheBuster = useCallback((url) => {
    if (typeof url !== "string" || !url) return ""
    if (/^data:/i.test(url) || /^blob:/i.test(url)) return url

    // Resolve relative URLs (e.g. /uploads/...) so they load on mobile when backend is different from frontend.
    const isRelative = !/^(https?:|\/\/|data:|blob:)/i.test(url.trim())
    const resolvedUrl = (backendOrigin && isRelative)
      ? `${backendOrigin.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`
      : url

    // Do not mutate signed URLs (legacy S3/Cloudfront/Firebase links can break if query changes).
    const hasSignedParams =
      /[?&](X-Amz-|Signature=|Expires=|AWSAccessKeyId=|GoogleAccessId=|token=|sig=|se=|sp=|sv=)/i.test(resolvedUrl)
    if (hasSignedParams) return resolvedUrl

    try {
      const parsed = new URL(resolvedUrl, window.location.origin)

      // Apply cache-buster only to app/backend-hosted URLs to avoid third-party CDN signature issues.
      const currentHost = typeof window !== "undefined" ? window.location.hostname : ""
      const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)
      const isSameHost = currentHost && parsed.hostname === currentHost

      if (isLocalHost || isSameHost) {
        parsed.searchParams.set("_wv", webviewSessionKeyRef.current)
      }
      return parsed.toString()
    } catch {
      return resolvedUrl
    }
  }, [backendOrigin])

  const images = useMemo(() => {
    const sourceImages = Array.isArray(restaurant.images) && restaurant.images.length > 0
      ? restaurant.images
      : [restaurant.image]

    const validImages = sourceImages
      .filter((img) => typeof img === "string")
      .map((img) => img.trim())
      .filter(Boolean)

    return validImages.map((img) => withCacheBuster(img))
  }, [restaurant.images, restaurant.image, withCacheBuster])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loadedBySrc, setLoadedBySrc] = useState({})
  const [, setAttemptedSrcs] = useState({})
  const [isImageUnavailable, setIsImageUnavailable] = useState(false)
  const [showShimmer, setShowShimmer] = useState(true)
  const [lastGoodSrc, setLastGoodSrc] = useState("")
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const isSwiping = useRef(false)

  const safeIndex = images.length > 0 ? (currentIndex % images.length + images.length) % images.length : 0
  const primarySrc = images[safeIndex] || ""
  const displaySrc = primarySrc
  const renderSrc = displaySrc || lastGoodSrc
  const isImageLoaded = Boolean(loadedBySrc[renderSrc] || lastGoodSrc)

  // Reset transient image state when restaurant or source list changes.
  useEffect(() => {
    setCurrentIndex(0)
    setLoadedBySrc({})
    setAttemptedSrcs({})
    setIsImageUnavailable(images.length === 0)
    setShowShimmer(images.length > 0)
  }, [restaurant?.id, restaurant?.slug, restaurant?.updatedAt, images])

  // Clear sticky successful source only when card identity changes.
  useEffect(() => {
    setLastGoodSrc("")
  }, [restaurant?.id, restaurant?.slug])

  // WebView can serve from cache without firing onLoad; handle already-complete images.
  useEffect(() => {
    if (!renderSrc) return
    const imgEl = imageElementRef.current
    if (!imgEl) return

    setShowShimmer(true)
    const shimmerTimeout = setTimeout(() => {
      setShowShimmer(false)
    }, 2500)

    if (imgEl.complete) {
      if (imgEl.naturalWidth > 0) {
        setLoadedBySrc((prev) => (prev[renderSrc] ? prev : { ...prev, [renderSrc]: true }))
        setLastGoodSrc(renderSrc)
        setShowShimmer(false)
      } else {
        setAttemptedSrcs((prev) => ({ ...prev, [renderSrc]: true }))
      }
    }
    return () => clearTimeout(shimmerTimeout)
  }, [renderSrc])

  // Handle touch events for swipe
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    isSwiping.current = false
  }

  const handleTouchMove = (e) => {
    const currentX = e.touches[0].clientX
    const diff = touchStartX.current - currentX

    // If swipe distance is significant, mark as swiping
    if (Math.abs(diff) > 10) {
      isSwiping.current = true
    }
  }

  const handleTouchEnd = (e) => {
    if (!isSwiping.current) return

    touchEndX.current = e.changedTouches[0].clientX
    const diff = touchStartX.current - touchEndX.current
    const minSwipeDistance = 50 // Minimum distance for swipe

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0) {
        // Swipe left - next image
        setCurrentIndex((prev) => (prev + 1) % images.length)
      } else {
        // Swipe right - previous image
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
      }
    }

    // Reset
    isSwiping.current = false
    touchStartX.current = 0
    touchEndX.current = 0
  }

  return (
    <div
      className="relative h-48 sm:h-56 md:h-60 lg:h-64 xl:h-72 w-full overflow-hidden rounded-t-md flex-shrink-0 group"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {showShimmer && !isImageUnavailable && Boolean(renderSrc) && (
        <div className="absolute inset-0 z-[1] overflow-hidden bg-gray-200">
          <div className="h-full w-full animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200" />
        </div>
      )}

      <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-110">
        {renderSrc && (
          <img
            ref={imageElementRef}
            src={renderSrc}
            alt={`${restaurant.name} - Image ${safeIndex + 1}`}
            className="w-full h-full object-cover"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            onLoad={() => {
              setLoadedBySrc((prev) => ({ ...prev, [renderSrc]: true }))
              setLastGoodSrc(renderSrc)
              setShowShimmer(false)
            }}
            onError={() => {
              setAttemptedSrcs((prev) => {
                const next = { ...prev, [primarySrc]: true }
                const attemptedCount = Object.keys(next).length

                if (attemptedCount >= images.length) {
                  setIsImageUnavailable(true)
                } else if (images.length > 1) {
                  setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length)
                }

                return next
              })
              if (images.length === 1) {
                setIsImageUnavailable(true)
              }
            }}
          />
        )}
      </div>

      {isImageUnavailable && (
        <div className="absolute inset-0 z-[2] flex items-center justify-center bg-gray-100">
          <span className="text-xs text-gray-500">Image unavailable</span>
        </div>
      )}

      {/* Image Indicators - only show if more than 1 image */}
      {images.length > 1 && (
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex items-center z-10 -space-x-2">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setCurrentIndex(index)
              }}
              className="w-10 h-10 flex items-center justify-center focus:outline-none group/btn rounded-full"
              aria-label={`Go to image ${index + 1}`}
            >
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${index === currentIndex
                  ? "w-6 bg-white"
                  : "w-1.5 bg-white/50 group-hover/btn:bg-white/75"
                  }`}
              />
            </button>
          ))}
        </div>
      )}

      {/* Gradient Overlay on Hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      {/* Shine Effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full transition-transform duration-1000 group-hover:animate-shine" />
    </div>
  )
})

export default function Home() {
  const HERO_BANNER_AUTO_SLIDE_MS = 3500
  const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const query = searchParams.get("q") || ""
  const [heroSearch, setHeroSearch] = useState("")
  const { openSearch, closeSearch, searchValue, setSearchValue } = useSearchOverlay()
  const { openLocationSelector } = useLocationSelector()
  const { vegMode, setVegMode: setVegModeContext } = useProfile()
  const [prevVegMode, setPrevVegMode] = useState(vegMode)
  const [showVegModePopup, setShowVegModePopup] = useState(false)
  const [showSwitchOffPopup, setShowSwitchOffPopup] = useState(false)
  const [vegModeOption, setVegModeOption] = useState("all") // "all" or "pure-veg"
  const [isApplyingVegMode, setIsApplyingVegMode] = useState(false)
  const [isSwitchingOffVegMode, setIsSwitchingOffVegMode] = useState(false)
  const [popupPosition, setPopupPosition] = useState({ top: 0, right: 0 })
  const vegModeToggleRef = useRef(null)
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0)
  const [heroBannerImages, setHeroBannerImages] = useState([])
  const [heroBannersData, setHeroBannersData] = useState([]) // Store full banner data with linked restaurants
  const [loadingBanners, setLoadingBanners] = useState(true)
  const [hasScrolledPastBanner, setHasScrolledPastBanner] = useState(false)
  const [landingCategories, setLandingCategories] = useState([])
  const [landingExploreMore, setLandingExploreMore] = useState([])
  const [exploreMoreHeading, setExploreMoreHeading] = useState("Explore More")
  const [recommendedRestaurantIds, setRecommendedRestaurantIds] = useState([])
  const [recommendedRestaurantsFromSettings, setRecommendedRestaurantsFromSettings] = useState([])
  const [loadingLandingConfig, setLoadingLandingConfig] = useState(true)
  const [restaurantsData, setRestaurantsData] = useState([])
  const [loadingRestaurants, setLoadingRestaurants] = useState(true)
  const [realCategories, setRealCategories] = useState([])
  const [loadingRealCategories, setLoadingRealCategories] = useState(true)
  const [menuCategories, setMenuCategories] = useState([])
  const [loadingMenuCategories, setLoadingMenuCategories] = useState(false)
  const [restaurantDietMeta, setRestaurantDietMeta] = useState({})
  const [showAllCategoriesModal, setShowAllCategoriesModal] = useState(false)
  const [availabilityTick, setAvailabilityTick] = useState(Date.now())
  const isHandlingSwitchOff = useRef(false)
  const heroShellRef = useRef(null)
  const stickyHeaderRef = useRef(null)
  const slugifyCategory = useCallback((value) => String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, ""), [])

  const normalizeImageUrl = useCallback((imageUrl) => {
    if (typeof imageUrl !== "string") return ""
    const trimmed = imageUrl.trim()
    if (!trimmed) return ""
    if (/^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) {
      return trimmed
    }
    const appProtocol = typeof window !== "undefined" ? window.location?.protocol : ""
    const appHost = typeof window !== "undefined" ? window.location?.hostname : ""
    let normalizedInput = trimmed
      .replace(/\\/g, "/")
      .replace(/^(https?):\/(?!\/)/i, "$1://")
      .replace(/^(https?:\/\/)(https?:\/\/)/i, "$1")

    if (/^\/\//.test(normalizedInput)) {
      normalizedInput = `${appProtocol || "https:"}${normalizedInput}`
    }

    // WebView can fail on unescaped spaces/special chars; keep URLs safely encoded.
    if (/^(https?:)?\/\//i.test(normalizedInput)) {
      try {
        const parsed = new URL(normalizedInput, window.location.origin)

        // In mobile production, localhost/127.0.0.1 inside image URLs is unreachable.
        // Use BACKEND_ORIGIN (API server) for image host, not frontend host—uploads are served by the backend.
        if (
          appHost &&
          appHost !== "localhost" &&
          appHost !== "127.0.0.1" &&
          /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)
        ) {
          try {
            const backendUrl = new URL(BACKEND_ORIGIN)
            parsed.protocol = backendUrl.protocol
            parsed.hostname = backendUrl.hostname
            parsed.port = backendUrl.port
          } catch {
            parsed.protocol = window.location.protocol
            parsed.hostname = window.location.hostname
            if (window.location.port) parsed.port = window.location.port
          }
        }

        // Prevent mixed-content image blocking in HTTPS WebView.
        if (appProtocol === "https:" && parsed.protocol === "http:") {
          parsed.protocol = "https:"
        }

        const finalUrl = parsed.toString()
        // Do not encode signed URLs (S3/Cloudfront/Cloudinary); encoding query params can break signatures.
        const hasSignedParams = /[?&](X-Amz-|Signature=|Expires=|AWSAccessKeyId=|GoogleAccessId=|token=|sig=|se=|sp=|sv=)/i.test(finalUrl)
        return hasSignedParams ? finalUrl : encodeURI(finalUrl)
      } catch {
        return normalizedInput
      }
    }

    const absolutePath = normalizedInput.startsWith("/")
      ? `${BACKEND_ORIGIN}${normalizedInput}`
      : `${BACKEND_ORIGIN}/${normalizedInput.replace(/^\.?\/*/, "")}`

    try {
      const parsed = new URL(absolutePath, window.location.origin)
      if (appProtocol === "https:" && parsed.protocol === "http:") {
        parsed.protocol = "https:"
      }
      const finalUrl = parsed.toString()
      const hasSignedParams = /[?&](X-Amz-|Signature=|Expires=|AWSAccessKeyId=|GoogleAccessId=|token=|sig=|se=|sp=|sv=)/i.test(finalUrl)
      return hasSignedParams ? finalUrl : encodeURI(finalUrl)
    } catch {
      return absolutePath
    }
  }, [BACKEND_ORIGIN])

  const extractImageFromValue = useCallback((value) => {
    if (!value) return ""

    if (typeof value === "string") {
      return normalizeImageUrl(value)
    }

    if (typeof value === "object") {
      const candidate =
        value.url ||
        value.secure_url ||
        value.imageUrl ||
        value.imageURL ||
        value.image ||
        value.src ||
        value.path ||
        value.location ||
        value.link ||
        value.href ||
        ""
      return typeof candidate === "string"
        ? normalizeImageUrl(candidate)
        : ""
    }

    return ""
  }, [normalizeImageUrl])

  const buildRestaurantImageCandidates = useCallback((value) => {
    const normalized = extractImageFromValue(value)
    if (!normalized) return []

    // Mobile WebView safety: try deterministic JPEG first, then auto, then original.
    if (/res\.cloudinary\.com/i.test(normalized) && /\/image\/upload\//i.test(normalized)) {
      const hasTransform = /\/image\/upload\/(?:f_|q_|w_|h_|c_|dpr_|g_)/i.test(normalized)
      if (!hasTransform) {
        return Array.from(new Set([
          normalized.replace("/image/upload/", "/image/upload/f_jpg,q_auto,w_1080/"),
          normalized.replace("/image/upload/", "/image/upload/f_auto,q_auto,w_1080/"),
          normalized,
        ]))
      }
    }

    return [normalized]
  }, [extractImageFromValue])

  const extractImages = useCallback((source) => {
    if (!source) return []

    if (Array.isArray(source)) {
      return source
        .flatMap((entry) => buildRestaurantImageCandidates(entry))
        .filter(Boolean)
    }

    return buildRestaurantImageCandidates(source)
  }, [buildRestaurantImageCandidates])

  useEffect(() => {
    const intervalId = setInterval(() => {
      setAvailabilityTick(Date.now())
    }, 60000)

    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      const heroShell = heroShellRef.current
      const stickyHeader = stickyHeaderRef.current

      if (!heroShell) {
        setHasScrolledPastBanner(false)
        return
      }

      const heroRect = heroShell.getBoundingClientRect()
      const stickyHeight = stickyHeader?.getBoundingClientRect().height || 0
      setHasScrolledPastBanner(heroRect.bottom <= stickyHeight)
    }

    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    window.addEventListener("resize", handleScroll)

    return () => {
      window.removeEventListener("scroll", handleScroll)
      window.removeEventListener("resize", handleScroll)
    }
  }, [])

  // Merge API explore items with fallback to ensure all 4 cards are shown
  const finalExploreItems = useMemo(() => {
    const fallback = [
      { id: 'offers', label: 'Offers', image: exploreOffers, href: '/user/offers' },
      { id: 'gourmet', label: 'Gourmet', image: exploreGourmet, href: '/user/gourmet' },
      { id: 'top10', label: 'Top 10', image: exploreTop10, href: '/user/top-10' },
      { id: 'collection', label: 'Collections', image: exploreCollection, href: '/user/profile/favorites' },
    ];

    if (!landingExploreMore || landingExploreMore.length === 0) return fallback;

    return fallback.map(item => {
      const apiItem = landingExploreMore.find(ai =>
        ai.label?.toLowerCase() === item.label?.toLowerCase()
      );
      if (apiItem) {
        // API uses imageUrl, fallback uses image. Prefer API.
        return {
          ...item,
          image: normalizeImageUrl(apiItem.imageUrl || apiItem.image || "") || item.image
        };
      }
      return item;
    });
  }, [landingExploreMore, normalizeImageUrl]);

  const normalizedLandingCategories = useMemo(() => {
    return (landingCategories || []).map((category, index) => ({
      id: category.id || category._id || `landing-category-${index}`,
      name: category.label || category.name || "Category",
      image: normalizeImageUrl(category.imageUrl || category.image) || foodImages[index % foodImages.length] || foodImages[0],
      slug: category.slug || slugifyCategory(category.label || category.name || ""),
      label: category.label || category.name || "Category",
    }))
  }, [landingCategories, normalizeImageUrl, slugifyCategory])

  const displayCategories = useMemo(() => {
    if (menuCategories.length > 0) return menuCategories
    if (realCategories.length > 0) return realCategories
    return normalizedLandingCategories
  }, [menuCategories, realCategories, normalizedLandingCategories])

  // Swipe functionality for hero banner carousel
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const touchEndX = useRef(0)
  const touchEndY = useRef(0)
  const isSwiping = useRef(false)
  const autoSlideIntervalRef = useRef(null)

  // Sync prevVegMode when vegMode changes from context
  useEffect(() => {
    if (vegMode !== prevVegMode && !isHandlingSwitchOff.current) {
      setPrevVegMode(vegMode)
    }
  }, [vegMode])

  // Keep persisted Veg Mode preference; only reset popup UI state on mount.
  useEffect(() => {
    setPrevVegMode(vegMode)
    setShowVegModePopup(false)
    setShowSwitchOffPopup(false)
    setVegModeOption("all")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle vegMode toggle - show popup when turned ON or OFF
  const handleVegModeChange = (newValue) => {
    // Skip if we're handling switch off confirmation
    if (isHandlingSwitchOff.current) {
      return
    }

    if (newValue && !prevVegMode) {
      // Veg mode was just turned ON
      // Calculate popup position relative to toggle
      if (vegModeToggleRef.current) {
        const rect = vegModeToggleRef.current.getBoundingClientRect()
        setPopupPosition({
          top: rect.bottom + 10,
          right: window.innerWidth - rect.right
        })
      }
      setShowVegModePopup(true)
      // Don't update context yet - wait for user to apply or cancel
    } else if (!newValue && prevVegMode) {
      // Veg mode was just turned OFF - show switch off confirmation popup
      isHandlingSwitchOff.current = true
      setShowSwitchOffPopup(true)
      // Don't update context yet - wait for user to confirm
    } else {
      // Normal state change - update context directly
      setVegModeContext(newValue)
      setPrevVegMode(newValue)
    }
  }

  // Update popup position on scroll/resize
  useEffect(() => {
    if (!showVegModePopup) return

    const updatePosition = () => {
      if (vegModeToggleRef.current) {
        const rect = vegModeToggleRef.current.getBoundingClientRect()
        setPopupPosition({
          top: rect.bottom + 10,
          right: window.innerWidth - rect.right
        })
      }
    }

    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [showVegModePopup])

  // Fetch hero banners from API
  useEffect(() => {
    const fetchHeroBanners = async () => {
      try {
        setLoadingBanners(true)
        const response = await api.get('/hero-banners/public')
        if (response.data.success && response.data.data.banners) {
          const banners = response.data.data.banners

          // Normalize and filter invalid banner records to prevent blank slides.
          const normalizedBanners = banners
            .map((banner) => {
              if (typeof banner === 'string') {
                return { imageUrl: normalizeImageUrl(banner), linkedRestaurants: [] }
              }
              return {
                ...banner,
                imageUrl: normalizeImageUrl(banner?.imageUrl),
                linkedRestaurants: Array.isArray(banner?.linkedRestaurants) ? banner.linkedRestaurants : []
              }
            })
            .filter((banner) => typeof banner?.imageUrl === 'string' && banner.imageUrl.trim().length > 0)

          setHeroBannersData(normalizedBanners)
          setHeroBannerImages(normalizedBanners.map((banner) => banner.imageUrl))
          setCurrentBannerIndex(0)
        } else {
          setHeroBannersData([])
          setHeroBannerImages([])
          setCurrentBannerIndex(0)
        }
      } catch (error) {
        debugError('Error fetching hero banners:', error)
        // Fallback to empty array if API fails
        setHeroBannerImages([])
        setHeroBannersData([])
        setCurrentBannerIndex(0)
      } finally {
        setLoadingBanners(false)
      }
    }

    fetchHeroBanners()
  }, [normalizeImageUrl])

  // Fetch real categories from backend API
  useEffect(() => {
    const fetchRealCategories = async () => {
      try {
        setLoadingRealCategories(true)
        const response = await api.get('/categories/public')
        if (response.data.success && response.data.data.categories) {
          const adminCategories = response.data.data.categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            image: normalizeImageUrl(cat.image) || foodImages[0], // Fallback to default image if not provided
            slug: cat.slug || cat.name.toLowerCase().replace(/\s+/g, '-'),
            label: cat.name // For compatibility with existing code
          }))
          setRealCategories(adminCategories)
        } else {
          setRealCategories([])
        }
      } catch (error) {
        debugError('Error fetching real categories:', error)
        setRealCategories([])
      } finally {
        setLoadingRealCategories(false)
      }
    }

    fetchRealCategories()
  }, [normalizeImageUrl])

  // Fetch landing page config (categories, explore more, settings)
  useEffect(() => {
    const fetchLandingConfig = async () => {
      try {
        setLoadingLandingConfig(true)
        const response = await api.get('/hero-banners/landing/public')
        if (response.data.success && response.data.data) {
          const apiCategories = response.data.data.categories || []
          const apiExploreMore = response.data.data.exploreMore || []

          // Extra safety: only keep active items and ensure order ascending
          setLandingCategories(
            apiCategories
              .filter((c) => c.isActive !== false)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          )
          setLandingExploreMore(
            apiExploreMore
              .filter((e) => e.isActive !== false)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          )
          setExploreMoreHeading(response.data.data.settings?.exploreMoreHeading || "Explore More")
          setRecommendedRestaurantIds(Array.isArray(response.data.data.settings?.recommendedRestaurantIds)
            ? response.data.data.settings.recommendedRestaurantIds
            : [])
          setRecommendedRestaurantsFromSettings(Array.isArray(response.data.data.settings?.recommendedRestaurants)
            ? response.data.data.settings.recommendedRestaurants
            : [])
        }
      } catch (error) {
        debugError('Error fetching landing config:', error)
        // Fallback to empty arrays and default heading
        setLandingCategories([])
        setLandingExploreMore([])
        setExploreMoreHeading("Explore More")
        setRecommendedRestaurantIds([])
        setRecommendedRestaurantsFromSettings([])
      } finally {
        setLoadingLandingConfig(false)
      }
    }

    fetchLandingConfig()
  }, [])

  // Keep index within current banner bounds after admin updates/reloads.
  useEffect(() => {
    setCurrentBannerIndex((prev) => {
      if (heroBannerImages.length === 0) return 0
      return Math.min(prev, heroBannerImages.length - 1)
    })
  }, [heroBannerImages.length])

  // Preload hero images to avoid white blink during slide transition.
  useEffect(() => {
    heroBannerImages.forEach((src) => {
      if (!src) return
      const img = new window.Image()
      img.src = src
    })
  }, [heroBannerImages])

  const startHeroBannerAutoSlide = useCallback(() => {
    if (autoSlideIntervalRef.current) {
      clearInterval(autoSlideIntervalRef.current)
    }

    if (heroBannerImages.length <= 1) return

    autoSlideIntervalRef.current = setInterval(() => {
      if (!isSwiping.current) {
        setCurrentBannerIndex((prev) => (prev + 1) % heroBannerImages.length)
      }
    }, HERO_BANNER_AUTO_SLIDE_MS)
  }, [heroBannerImages.length, HERO_BANNER_AUTO_SLIDE_MS])

  // Auto-cycle hero banner images
  useEffect(() => {
    startHeroBannerAutoSlide()

    return () => {
      if (autoSlideIntervalRef.current) {
        clearInterval(autoSlideIntervalRef.current)
      }
    }
  }, [startHeroBannerAutoSlide])

  // Lenis smooth scrolling initialization
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      smoothTouch: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  // Helper function to reset auto-slide timer
  const resetAutoSlide = useCallback(() => {
    startHeroBannerAutoSlide()
  }, [startHeroBannerAutoSlide])

  // Swipe handlers for hero banner carousel
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    isSwiping.current = true
  }

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX
    touchEndY.current = e.touches[0].clientY
  }

  const handleTouchEnd = () => {
    if (!isSwiping.current || heroBannerImages.length === 0) return

    const deltaX = touchEndX.current - touchStartX.current
    const deltaY = Math.abs(touchEndY.current - touchStartY.current)
    const minSwipeDistance = 50 // Minimum distance for a swipe

    // Check if it's a horizontal swipe (not vertical scroll)
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        // Swipe right - go to previous image
        setCurrentBannerIndex((prev) => (prev - 1 + heroBannerImages.length) % heroBannerImages.length)
      } else {
        // Swipe left - go to next image
        setCurrentBannerIndex((prev) => (prev + 1) % heroBannerImages.length)
      }
      // Reset auto-slide timer after manual swipe
      resetAutoSlide()
    }

    // Reset swipe state after a short delay
    setTimeout(() => {
      isSwiping.current = false
    }, 300)

    // Reset touch positions
    touchStartX.current = 0
    touchStartY.current = 0
    touchEndX.current = 0
    touchEndY.current = 0
  }

  // Mouse handlers for desktop drag support
  const handleMouseDown = (e) => {
    touchStartX.current = e.clientX
    touchStartY.current = e.clientY
    isSwiping.current = true
  }

  const handleMouseMove = (e) => {
    if (!isSwiping.current) return
    touchEndX.current = e.clientX
    touchEndY.current = e.clientY
  }

  const handleMouseUp = () => {
    if (!isSwiping.current || heroBannerImages.length === 0) return

    const deltaX = touchEndX.current - touchStartX.current
    const deltaY = Math.abs(touchEndY.current - touchStartY.current)
    const minSwipeDistance = 50

    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        setCurrentBannerIndex((prev) => (prev - 1 + heroBannerImages.length) % heroBannerImages.length)
      } else {
        setCurrentBannerIndex((prev) => (prev + 1) % heroBannerImages.length)
      }
      // Reset auto-slide timer after manual swipe
      resetAutoSlide()
    }

    setTimeout(() => {
      isSwiping.current = false
    }, 300)

    touchStartX.current = 0
    touchStartY.current = 0
    touchEndX.current = 0
    touchEndY.current = 0
  }
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [sortBy, setSortBy] = useState(null) // null, 'price-low', 'price-high', 'rating-high', 'rating-low'
  const [selectedCuisine, setSelectedCuisine] = useState(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [appliedFilters, setAppliedFilters] = useState({
    activeFilters: new Set(),
    sortBy: null,
    selectedCuisine: null
  })
  const [isLoadingFilterResults, setIsLoadingFilterResults] = useState(false)
  const [activeFilterTab, setActiveFilterTab] = useState('sort')
  const categoryScrollRef = useRef(null)
  const gsapAnimationsRef = useRef([])
  // Safely get profile context - handle case when ProfileProvider is not available
  let profileContext = null
  try {
    profileContext = useProfile()
  } catch (error) {
    debugWarn("ProfileProvider not available, using fallback:", error.message)
    // Fallback values when ProfileProvider is not available
    profileContext = {
      addFavorite: () => debugWarn("ProfileProvider not available"),
      removeFavorite: () => debugWarn("ProfileProvider not available"),
      isFavorite: () => false,
      getFavorites: () => [],
      getDefaultAddress: () => null
    }
  }

  const { addFavorite, removeFavorite, isFavorite, getFavorites, getDefaultAddress } = profileContext
  const { addToCart, cart } = useCart()
  const { location, loading, requestLocation } = useLocation()
  const { zoneId, zoneStatus, isInService, isOutOfService, loading: zoneLoading, error: zoneError } = useZone(location)
  const [showToast, setShowToast] = useState(false)
  const [showManageCollections, setShowManageCollections] = useState(false)
  const [selectedRestaurantSlug, setSelectedRestaurantSlug] = useState(null)

  // Memoize cartCount to prevent recalculation on every render - use cart directly
  const cartCount = useMemo(() =>
    cart.reduce((total, item) => total + (item.quantity || 0), 0),
    [cart]
  )

  const cityName = location?.city || "Select"
  const stateName = location?.state || "Location"
  const hasLiveLocation = useMemo(() => {
    if (!location) return false

    const isPlaceholder = (value) => {
      if (!value) return true
      const normalized = String(value).trim().toLowerCase()
      return !normalized || normalized === "select location" || normalized === "current location"
    }

    const hasAddressText = !isPlaceholder(location.formattedAddress) || !isPlaceholder(location.address)
    const hasCityState = !isPlaceholder(location.city) || !isPlaceholder(location.state)

    return hasAddressText || hasCityState
  }, [location])

  const formatSavedAddress = useCallback((address) => {
    if (!address) return ""

    if (address.formattedAddress && address.formattedAddress !== "Select location") {
      return address.formattedAddress
    }

    const parts = []
    if (address.additionalDetails) parts.push(address.additionalDetails)
    if (address.street) parts.push(address.street)
    if (address.city) parts.push(address.city)
    if (address.state) parts.push(address.state)
    if (address.zipCode) parts.push(address.zipCode)

    if (parts.length > 0) return parts.join(", ")
    if (address.address && address.address !== "Select location") return address.address

    return ""
  }, [])

  const savedAddressText = useMemo(() => {
    const defaultAddress = getDefaultAddress?.()
    return formatSavedAddress(defaultAddress)
  }, [getDefaultAddress, formatSavedAddress])

  const defaultSavedAddress = useMemo(() => getDefaultAddress?.() || null, [getDefaultAddress])

  const defaultSavedAddressLocation = useMemo(() => {
    const coords = defaultSavedAddress?.location?.coordinates
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = parseFloat(coords[0])
      const lat = parseFloat(coords[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { latitude: lat, longitude: lng }
      }
    }

    const lat = parseFloat(defaultSavedAddress?.latitude ?? defaultSavedAddress?.lat)
    const lng = parseFloat(defaultSavedAddress?.longitude ?? defaultSavedAddress?.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng }
    }

    return null
  }, [defaultSavedAddress])

  const { isOutOfService: isSavedAddressOutOfService, loading: savedAddressZoneLoading, error: savedAddressZoneError } =
    useZone(defaultSavedAddressLocation)

  const hasSavedAddress = Boolean(defaultSavedAddress && savedAddressText)
  const shouldShowOutOfZoneHome =
    hasSavedAddress &&
    Boolean(defaultSavedAddressLocation) &&
    !savedAddressZoneLoading &&
    !savedAddressZoneError &&
    isSavedAddressOutOfService

  // Mock points value - replace with actual points from context/store
  const userPoints = 99

  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  // Simple filter toggle function
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

  // Refs for scroll tracking
  const filterSectionRefs = useRef({})
  const [activeScrollSection, setActiveScrollSection] = useState('sort')
  const rightContentRef = useRef(null)

  // Scroll tracking effect
  useEffect(() => {
    if (!isFilterOpen || !rightContentRef.current) return

    const observerOptions = {
      root: rightContentRef.current,
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.getAttribute('data-section-id')
          if (sectionId) {
            setActiveScrollSection(sectionId)
            setActiveFilterTab(sectionId)
          }
        }
      })
    }, observerOptions)

    // Observe all filter sections
    Object.values(filterSectionRefs.current).forEach(ref => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [isFilterOpen])

  // Fetch restaurants from API with filters
  const fetchRestaurants = useCallback(async (filters = {}) => {
    try {
      setLoadingRestaurants(true)

      // First, test backend connection
      try {
        // Use API_BASE_URL from config (supports both dev and production)
        const backendUrl = API_BASE_URL.replace('/api', '')
        const healthCheck = await fetch(`${backendUrl}/health`)
        if (!healthCheck.ok) {
          throw new Error(`Backend health check failed: ${healthCheck.status}`)
        }
        debugLog('✅ Backend connection successful')
      } catch (healthError) {
        // Backend connection error - handled silently, toast notifications shown via axios interceptor
        setRestaurantsData([])
        setLoadingRestaurants(false)
        return
      }

      // Build query parameters from filters
      const params = {}

      // Sort by
      if (filters.sortBy) {
        params.sortBy = filters.sortBy
      }

      // Cuisine
      if (filters.selectedCuisine) {
        params.cuisine = filters.selectedCuisine
      }

      // Rating filters
      if (filters.activeFilters?.has('rating-45-plus')) {
        params.minRating = 4.5
      } else if (filters.activeFilters?.has('rating-4-plus')) {
        params.minRating = 4.0
      } else if (filters.activeFilters?.has('rating-35-plus')) {
        params.minRating = 3.5
      }

      // Delivery time filters
      if (filters.activeFilters?.has('delivery-under-30')) {
        params.maxDeliveryTime = 30
      } else if (filters.activeFilters?.has('delivery-under-45')) {
        params.maxDeliveryTime = 45
      }

      // Distance filters
      if (filters.activeFilters?.has('distance-under-1km')) {
        params.maxDistance = 1.0
      } else if (filters.activeFilters?.has('distance-under-2km')) {
        params.maxDistance = 2.0
      }

      // Price filters
      if (filters.activeFilters?.has('price-under-200')) {
        params.maxPrice = 200
      } else if (filters.activeFilters?.has('price-under-500')) {
        params.maxPrice = 500
      }

      // Offers filter
      if (filters.activeFilters?.has('has-offers')) {
        params.hasOffers = 'true'
      }

      // Trust filters
      if (filters.activeFilters?.has('top-rated')) {
        params.topRated = 'true'
      } else if (filters.activeFilters?.has('trusted')) {
        params.trusted = 'true'
      }

      // Optional: Add zoneId if available (for sorting/filtering, but show all restaurants)
      if (zoneId) {
        params.zoneId = zoneId
      }
      // Avoid stale API cache in WebView after admin image updates.
      params._ts = Date.now()
      // Note: We show all restaurants regardless of zone, but apply grayscale styling if user is out of service

      debugLog('Fetching restaurants with params:', params)
      const response = await restaurantAPI.getRestaurants(params)
      debugLog('Restaurants API response:', response.data)

      if (response.data && response.data.success && response.data.data && response.data.data.restaurants) {
        const restaurantsArray = response.data.data.restaurants
        debugLog(`Fetched ${restaurantsArray.length} restaurants from API`)

        if (restaurantsArray.length === 0) {
          debugWarn('No restaurants found in API response')
          setRestaurantsData([])
          setLoadingRestaurants(false)
          return
        }

        // Calculate distance helper function
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

        // Get user coordinates
        const userLat = location?.latitude
        const userLng = location?.longitude

        // Transform API data to match expected format
        const transformedRestaurants = restaurantsArray.map((restaurant, index) => {
          // Use restaurant data if available, otherwise use defaults
          const deliveryTime = restaurant.estimatedDeliveryTime || "25-30 mins"

          // Calculate distance from user to restaurant
          let distance = restaurant.distance || "1.2 km"

          // Get restaurant coordinates
          const restaurantLocation = restaurant.location
          const restaurantLat = restaurantLocation?.latitude || (restaurantLocation?.coordinates && Array.isArray(restaurantLocation.coordinates) ? restaurantLocation.coordinates[1] : null)
          const restaurantLng = restaurantLocation?.longitude || (restaurantLocation?.coordinates && Array.isArray(restaurantLocation.coordinates) ? restaurantLocation.coordinates[0] : null)

          // Calculate distance if both user and restaurant coordinates are available
          let distanceInKm = null
          if (userLat && userLng && restaurantLat && restaurantLng &&
            !isNaN(userLat) && !isNaN(userLng) && !isNaN(restaurantLat) && !isNaN(restaurantLng)) {
            distanceInKm = calculateDistance(userLat, userLng, restaurantLat, restaurantLng)
            // Format distance: show 1 decimal place if >= 1km, otherwise show in meters
            if (distanceInKm >= 1) {
              distance = `${distanceInKm.toFixed(1)} km`
            } else {
              const distanceInMeters = Math.round(distanceInKm * 1000)
              distance = `${distanceInMeters} m`
            }
          }

          // Get first cuisine or default
          const cuisine = restaurant.cuisines && restaurant.cuisines.length > 0
            ? restaurant.cuisines[0]
            : "Multi-cuisine"

          // Legacy-safe image extraction (supports old schema variants).
          const coverImages = [
            ...extractImages(restaurant.coverImages),
            ...extractImages(restaurant.coverImage),
          ]

          // Fallback to menu images when cover images are absent.
          const fallbackImages = extractImages(restaurant.menuImages)

          // Some early records only have onboarding step2 media.
          const onboardingMenuImages = extractImages(restaurant.onboarding?.step2?.menuImageUrls)

          const profileImageCandidates = [
            ...buildRestaurantImageCandidates(restaurant.profileImage),
            ...buildRestaurantImageCandidates(restaurant.onboarding?.step2?.profileImageUrl),
            ...buildRestaurantImageCandidates(restaurant.image),
            ...buildRestaurantImageCandidates(restaurant.imageUrl),
          ]
          const profileImageUrl = profileImageCandidates[0] || ""

          // Prefer directly updated admin/profile image first, then legacy arrays.
          // This keeps banner stable across location/offline state changes.
          const allImages = Array.from(
            new Set([
              ...profileImageCandidates,
              ...coverImages,
              ...fallbackImages,
              ...onboardingMenuImages,
            ].filter(Boolean))
          )

          // Keep single image for backward compatibility
          const image = allImages[0] || profileImageUrl || ""
          const offerText = restaurant.offer || null

          return {
            id: restaurant.restaurantId || restaurant._id,
            mongoId: restaurant._id || null,
            name: restaurant.name,
            cuisine: cuisine,
            cuisines: Array.isArray(restaurant.cuisines) ? restaurant.cuisines : [],
            rating: restaurant.rating || 4.5,
            deliveryTime: deliveryTime,
            distance: distance,
            distanceInKm: distanceInKm, // Store numeric distance for sorting
            image: image,
            images: allImages, // Array of cover images for carousel (separate from menu images)
            priceRange: restaurant.priceRange || "$$", // Use from API or default
            featuredDish: restaurant.featuredDish || (restaurant.cuisines && restaurant.cuisines.length > 0
              ? `${restaurant.cuisines[0]} Special`
              : "Special Dish"),
            featuredPrice: restaurant.featuredPrice || 249, // Use from API or default
            offer: offerText,
            slug: restaurant.slug,
            restaurantId: restaurant.restaurantId,
            location: restaurant.location, // Store location for distance recalculation
            isActive: restaurant.isActive !== false, // Default to true if not specified
            isAcceptingOrders: restaurant.isAcceptingOrders !== false, // Default to true if not specified
            openDays: Array.isArray(restaurant.openDays) ? restaurant.openDays : [],
            deliveryTimings: restaurant.deliveryTimings || null,
            outletTimings: restaurant.outletTimings || null,
          }
        })

        // Load outlet timings for each restaurant (source of truth for open/close window)
        const restaurantsWithOutletTimings = await Promise.all(
          transformedRestaurants.map(async (restaurant) => {
            try {
              if (!restaurant.mongoId) return restaurant
              const outletResponse = await restaurantAPI.getOutletTimingsByRestaurantId(restaurant.mongoId)
              const outletTimings =
                outletResponse?.data?.data?.outletTimings ||
                outletResponse?.data?.outletTimings ||
                null
              return {
                ...restaurant,
                outletTimings: outletTimings || restaurant.outletTimings || null,
              }
            } catch (_) {
              return restaurant
            }
          })
        )

        // Sort restaurants by distance (nearby first) - only if user location is available
        if (userLat && userLng) {
          restaurantsWithOutletTimings.sort((a, b) => {
            // Available restaurants first, then unavailable
            const aAvailable = getRestaurantAvailabilityStatus(a).isOpen
            const bAvailable = getRestaurantAvailabilityStatus(b).isOpen

            if (aAvailable !== bAvailable) {
              return aAvailable ? -1 : 1 // Available restaurants come first
            }

            // If both have same availability, sort by distance
            const aDistance = a.distanceInKm !== null ? a.distanceInKm : Infinity
            const bDistance = b.distanceInKm !== null ? b.distanceInKm : Infinity
            return aDistance - bDistance
          })
        }

        debugLog('Transformed and sorted restaurants:', restaurantsWithOutletTimings)
        setRestaurantsData(restaurantsWithOutletTimings)
      } else {
        debugWarn('Invalid API response structure:', response.data)
        setRestaurantsData([])
      }
    } catch (error) {
      debugError('Error fetching restaurants:', error)
      debugError('Error details:', error.response?.data || error.message)
      // Don't set hardcoded data here - let the useMemo fallback handle it
      // This way, if API succeeds later, it will show the real data
      setRestaurantsData([])
    } finally {
      setLoadingRestaurants(false)
      debugLog('Restaurant loading completed. restaurantsData length:', restaurantsData.length)
    }
  }, [normalizeImageUrl, zoneId, extractImages, buildRestaurantImageCandidates])

  const applyFiltersAndRefetch = useCallback(async (
    nextActiveFilters = activeFilters,
    nextSortBy = sortBy,
    nextSelectedCuisine = selectedCuisine
  ) => {
    const nextFilterState = {
      activeFilters: new Set(nextActiveFilters),
      sortBy: nextSortBy,
      selectedCuisine: nextSelectedCuisine
    }

    setAppliedFilters(nextFilterState)
    setIsLoadingFilterResults(true)

    try {
      await fetchRestaurants(nextFilterState)
    } catch (error) {
      debugError('Error applying filters:', error)
    } finally {
      setIsLoadingFilterResults(false)
    }
  }, [activeFilters, sortBy, selectedCuisine, fetchRestaurants])

  // Fetch restaurants when appliedFilters change
  useEffect(() => {
    fetchRestaurants(appliedFilters)
  }, [appliedFilters, fetchRestaurants])

  // Recalculate distances when user location updates
  useEffect(() => {
    if (!restaurantsData || restaurantsData.length === 0 || !location?.latitude || !location?.longitude) return

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

    const userLat = location.latitude
    const userLng = location.longitude

    // Recalculate distances for all restaurants
    const updatedRestaurants = restaurantsData.map(restaurant => {
      if (!restaurant.location) return restaurant

      const restaurantLat = restaurant.location?.latitude || (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) ? restaurant.location.coordinates[1] : null)
      const restaurantLng = restaurant.location?.longitude || (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) ? restaurant.location.coordinates[0] : null)

      if (!restaurantLat || !restaurantLng ||
        isNaN(restaurantLat) || isNaN(restaurantLng)) {
        return restaurant
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

      return {
        ...restaurant,
        distance: calculatedDistance,
        distanceInKm: distanceInKm // Preserve numeric distance for sorting
      }
    })

    setRestaurantsData(updatedRestaurants)
    debugLog('🔄 Recalculated distances for all restaurants based on user location')
  }, [location?.latitude, location?.longitude])

  // Build a union of menu categories across all restaurants.
  useEffect(() => {
    const fetchMenuCategories = async () => {
      if (!Array.isArray(restaurantsData) || restaurantsData.length === 0) {
        setMenuCategories([])
        setRestaurantDietMeta({})
        return
      }

      setLoadingMenuCategories(true)
      try {
        const categoryMap = new Map()
        const menuResponses = await Promise.all(
          restaurantsData.map(async (restaurant) => {
            const id = restaurant?.restaurantId || restaurant?.id
            if (!id) return { id: null, menu: null }
            try {
              const response = await restaurantAPI.getMenuByRestaurantId(id)
              return {
                id: String(id),
                menu: response?.data?.data?.menu || null
              }
            } catch {
              return {
                id: String(id),
                menu: null
              }
            }
          })
        )

        const nextDietMeta = {}

        menuResponses.forEach(({ id, menu }) => {
          let hasVeg = false
          let hasNonVeg = false
          const sections = Array.isArray(menu?.sections) ? menu.sections : []
          sections.forEach((section) => {
            const sectionItems = Array.isArray(section?.items) ? section.items : []
            sectionItems.forEach((item) => {
              const foodType = String(item?.foodType || "").trim().toLowerCase()
              if (foodType === "veg") hasVeg = true
              if (foodType === "non-veg" || foodType === "non veg" || foodType === "nonveg") hasNonVeg = true
            })

            const subsections = Array.isArray(section?.subsections) ? section.subsections : []
            subsections.forEach((subsection) => {
              const subsectionItems = Array.isArray(subsection?.items) ? subsection.items : []
              subsectionItems.forEach((item) => {
                const foodType = String(item?.foodType || "").trim().toLowerCase()
                if (foodType === "veg") hasVeg = true
                if (foodType === "non-veg" || foodType === "non veg" || foodType === "nonveg") hasNonVeg = true
              })
            })

            const categoryName = String(section?.name || "").trim()
            if (!categoryName) return

            const slug = slugifyCategory(categoryName)
            if (!slug) return

            let image = ""
            if (Array.isArray(section?.items) && section.items.length > 0) {
              image = normalizeImageUrl(section.items[0]?.image)
            }
            if (!image && Array.isArray(section?.subsections)) {
              for (const subsection of section.subsections) {
                if (Array.isArray(subsection?.items) && subsection.items.length > 0) {
                  image = normalizeImageUrl(subsection.items[0]?.image)
                  if (image) break
                }
              }
            }

            if (!categoryMap.has(slug)) {
              categoryMap.set(slug, {
                id: slug,
                name: categoryName,
                slug,
                label: categoryName,
                image: image || "",
              })
            } else if (image && !categoryMap.get(slug).image) {
              categoryMap.get(slug).image = image
            }
          })

          if (id) {
            nextDietMeta[id] = {
              hasVeg,
              hasNonVeg,
              isPureVeg: hasVeg && !hasNonVeg,
            }
          }
        })

        const categories = Array.from(categoryMap.values())
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((category, index) => ({
            ...category,
            image: category.image || foodImages[index % foodImages.length] || foodImages[0],
          }))

        setMenuCategories(categories)
        setRestaurantDietMeta(nextDietMeta)
      } finally {
        setLoadingMenuCategories(false)
      }
    }

    fetchMenuCategories()
  }, [restaurantsData, normalizeImageUrl, slugifyCategory])

  const matchesVegMode = useCallback((restaurant) => {
    if (!vegMode) return true

    const key = String(restaurant?.restaurantId || restaurant?.id || "")
    const dietMeta = restaurantDietMeta[key]
    if (!dietMeta) return true

    if (vegModeOption === "pure-veg") {
      return dietMeta.isPureVeg
    }
    return dietMeta.hasVeg
  }, [vegMode, vegModeOption, restaurantDietMeta])

  // Filter restaurants and foods based on active filters
  const filteredRestaurants = useMemo(() => {
    // Use only API data - no mock data fallback
    let filtered = [...restaurantsData]

    filtered = filtered.filter(matchesVegMode)

    // Apply filters
    if (activeFilters.has('price-under-200')) {
      filtered = filtered.filter(r => r.priceRange === "$" || r.priceRange === "$$")
    }
    if (activeFilters.has('price-under-500')) {
      filtered = filtered.filter(r => r.priceRange !== "$$$")
    }
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
    if (activeFilters.has('rating-35-plus')) {
      filtered = filtered.filter(r => r.rating >= 3.5)
    }
    if (activeFilters.has('rating-4-plus')) {
      filtered = filtered.filter(r => r.rating >= 4.0)
    }
    if (activeFilters.has('rating-45-plus')) {
      filtered = filtered.filter(r => r.rating >= 4.5)
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
    if (activeFilters.has('delivery-under-45')) {
      filtered = filtered.filter(r => {
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 45
      })
    }
    if (activeFilters.has('top-rated')) {
      filtered = filtered.filter(r => r.rating >= 4.5)
    }
    if (activeFilters.has('trusted')) {
      filtered = filtered.filter(r => r.rating >= 4.0)
    }
    if (activeFilters.has('has-offers')) {
      filtered = filtered.filter(r => r.offer && r.offer.length > 0)
    }
    if (selectedCuisine) {
      filtered = filtered.filter(r => r.cuisine === selectedCuisine)
    }

    // Apply sorting
    if (sortBy === 'price-low') {
      filtered.sort((a, b) => {
        const aPrice = a.priceRange === "$" ? 1 : a.priceRange === "$$" ? 2 : 3
        const bPrice = b.priceRange === "$" ? 1 : b.priceRange === "$$" ? 2 : 3
        return aPrice - bPrice
      })
    } else if (sortBy === 'price-high') {
      filtered.sort((a, b) => {
        const aPrice = a.priceRange === "$" ? 1 : a.priceRange === "$$" ? 2 : 3
        const bPrice = b.priceRange === "$" ? 1 : b.priceRange === "$$" ? 2 : 3
        return bPrice - aPrice
      })
    } else if (sortBy === 'rating-high') {
      filtered.sort((a, b) => b.rating - a.rating)
    } else if (sortBy === 'rating-low') {
      filtered.sort((a, b) => a.rating - b.rating)
    } else {
      // Default sorting: Available restaurants first, then by distance (nearby first)
      // This ensures all restaurants in zone are shown, but nearby ones appear first
      filtered.sort((a, b) => {
        // Available restaurants first, then unavailable
        const aAvailable = getRestaurantAvailabilityStatus(a, new Date(availabilityTick)).isOpen
        const bAvailable = getRestaurantAvailabilityStatus(b, new Date(availabilityTick)).isOpen

        if (aAvailable !== bAvailable) {
          return aAvailable ? -1 : 1 // Available restaurants come first
        }

        // If both have same availability, sort by distance
        const aDistance = a.distanceInKm !== null && a.distanceInKm !== undefined ? a.distanceInKm : Infinity
        const bDistance = b.distanceInKm !== null && b.distanceInKm !== undefined ? b.distanceInKm : Infinity
        return aDistance - bDistance
      })
    }

    return filtered
  }, [restaurantsData, matchesVegMode, activeFilters, selectedCuisine, sortBy, availabilityTick])

  const recommendedForYouRestaurants = useMemo(() => {
    const idsInOrder = (recommendedRestaurantIds || []).map((id) => String(id))
    const hasIds = idsInOrder.length > 0
    const fromSettings = Array.isArray(recommendedRestaurantsFromSettings)
      ? recommendedRestaurantsFromSettings
      : []

    // Primary source: restaurants returned by landing settings API (already admin-selected).
    const fromSettingsMapped = fromSettings.map((restaurant) => {
      const restaurantId = restaurant?._id ? String(restaurant._id) : ''
      const cuisine = Array.isArray(restaurant?.cuisines) && restaurant.cuisines.length > 0
        ? restaurant.cuisines[0]
        : 'Multi-cuisine'
      const imageCandidates = [
        ...extractImages(restaurant?.coverImages),
        ...extractImages(restaurant?.profileImage),
        ...extractImages(restaurant?.menuImages),
      ]
      const image = imageCandidates[0] || foodImages[0]

      return {
        id: restaurant?.restaurantId || restaurantId,
        mongoId: restaurantId,
        name: restaurant?.name || 'Restaurant',
        cuisine,
        rating: Number(restaurant?.rating) || 4.0,
        distance: '',
        deliveryTime: '',
        image: normalizeImageUrl(image) || foodImages[0],
        images: imageCandidates.length > 0 ? imageCandidates : [foodImages[0]],
        slug: restaurant?.slug || restaurant?.restaurantId || restaurantId,
        offer: null,
        isActive: true,
        isAcceptingOrders: true,
      }
    })

    // Keep admin-selected order when IDs exist.
    const orderedFromSettings = hasIds
      ? idsInOrder
        .map((id) => fromSettingsMapped.find((restaurant) => String(restaurant.mongoId) === id))
        .filter(Boolean)
      : fromSettingsMapped

    // Fallback: if settings payload misses some entries, recover them from fetched restaurant list by ID.
    const existingIds = new Set(orderedFromSettings.map((restaurant) => String(restaurant.mongoId || restaurant.id)))
    const fromFetchedMissing = (restaurantsData || [])
      .filter((restaurant) => {
        const mongoId = String(restaurant.mongoId || '')
        return hasIds && idsInOrder.includes(mongoId) && !existingIds.has(mongoId)
      })

    return [...orderedFromSettings, ...fromFetchedMissing]
      .filter(matchesVegMode)
      .slice(0, 12)
  }, [
    recommendedRestaurantIds,
    recommendedRestaurantsFromSettings,
    restaurantsData,
    extractImages,
    normalizeImageUrl,
    matchesVegMode
  ])

  // Featured foods removed - will be handled by restaurants data from API
  const filteredFeaturedFoods = useMemo(() => {
    // Return empty array - featured foods will come from API if needed
    return []
  }, [activeFilters, sortBy])

  // Memoize callbacks to prevent unnecessary re-renders
  const handleLocationClick = useCallback(() => {
    openLocationSelector()
  }, [openLocationSelector])

  const handleSearchFocus = useCallback(() => {
    // Sync heroSearch with global searchValue when opening overlay
    if (heroSearch) {
      setSearchValue(heroSearch)
    }
    openSearch()
  }, [heroSearch, openSearch, setSearchValue])

  const handleSearchClose = useCallback(() => {
    closeSearch()
    setHeroSearch("")
  }, [closeSearch])

  // Removed GSAP animations - using CSS and ScrollReveal components instead for better performance
  // Auto-scroll removed - manual scroll only

  // Animated placeholder cycling - same as RestaurantDetails highlight offer animation
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length)
    }, 2000) // Change placeholder every 2 seconds (same as RestaurantDetails)

    return () => clearInterval(interval)
  }, []) // placeholders is a constant, no need for dependency

  // Lightweight ScrollReveal replacement - CSS only, no IntersectionObserver
  const ScrollRevealSimple = ({ children, delay = 0, className = "" }) => (
    <div className={className}>
      {children}
    </div>
  )

  // Lightweight TextReveal replacement - CSS only
  const TextRevealSimple = ({ children, className = "" }) => (
    <div className={className}>
      {children}
    </div>
  )

  // Lightweight ShimmerCard replacement - no animations
  const ShimmerCardSimple = ({ children, className = "" }) => (
    <div className={className}>
      {children}
    </div>
  )

  return (
    <div className="relative min-h-screen bg-white dark:bg-[#0a0a0a] pb-16 md:pb-6">
      {shouldShowOutOfZoneHome && (
        <div className="fixed inset-0 z-[90] pointer-events-none">
          <div className="absolute inset-0 bg-slate-300/35 backdrop-blur-[1px]" />
          <div className="absolute top-20 left-1/2 -translate-x-1/2 px-4">
            <div className="rounded-xl border border-red-200 bg-red-50/95 text-red-700 px-4 py-2 shadow-sm text-sm sm:text-base font-semibold whitespace-nowrap">
              You are out of zone
            </div>
          </div>
        </div>
      )}

      <div className={shouldShowOutOfZoneHome ? "grayscale opacity-70 transition-all duration-300" : "transition-all duration-300"}>
      {/* Unified Background for Entire Page - Vibrant Food Theme */}
      <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none overflow-hidden z-0">
        {/* Main Background */}
        <div className="absolute inset-0 bg-white dark:bg-[#0a0a0a]">
        </div>
        {/* Background Elements - Reduced to 2 blobs with CSS animations for better performance */}
        <div className="absolute inset-0 overflow-hidden opacity-20">
          {/* Top right blob - CSS animation */}
          <div
            style={{
              animation: 'blob 8s ease-in-out infinite',
              willChange: 'transform'
            }}
          />
          {/* Bottom left blob - CSS animation */}
          <div
            style={{
              animation: 'blob-reverse 10s ease-in-out infinite',
              willChange: 'transform'
            }}
          />
        </div>
        {/* CSS keyframes for animations */}
        <style>{`
          @keyframes blob {
            0%, 100% {
              transform: translate(0, 0) scale(1);
            }
            50% {
              transform: translate(50px, -30px) scale(1.2);
            }
          }
          @keyframes blob-reverse {
            0%, 100% {
              transform: translate(0, 0) scale(1);
            }
            50% {
              transform: translate(-40px, 40px) scale(1.3);
            }
          }
          @keyframes fade-in {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes gradient {
            0%, 100% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
          }
          @keyframes fade-in-up {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes wiggle {
            0%, 100% {
              transform: rotate(0deg);
            }
            25% {
              transform: rotate(10deg);
            }
            75% {
              transform: rotate(-10deg);
            }
          }
          @keyframes placeholderFade {
            0% {
              opacity: 0;
              transform: translateY(20px);
            }
            100% {
              opacity: 0.6;
              transform: translateY(0);
            }
          }
          @keyframes gradientShift {
            0%, 100% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
          }
          @keyframes slideUp {
            0% {
              opacity: 0;
              transform: translateY(15px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>

      {hasScrolledPastBanner && (
        <div
          ref={stickyHeaderRef}
          className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm shadow-sm border-b border-gray-200 transition-all duration-300"
        >
        <motion.div
          className="relative z-50 pt-2 sm:pt-3 lg:pt-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <PageNavbar textColor="black" zIndex={50} />
        </motion.div>

        {!hasLiveLocation && (
          <div className="px-3 sm:px-6 lg:px-8 pb-2">
            <button
              type="button"
              onClick={handleLocationClick}
              className="w-full max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto text-left rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#151515] px-3 py-2.5 flex items-start gap-2.5"
            >
              <MapPin className="h-4 w-4 text-[#EB590E] mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-gray-400 uppercase">
                  Saved Address
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {savedAddressText || "No saved address. Tap to add one."}
                </p>
              </div>
            </button>
          </div>
        )}

        <motion.div
          className="w-full py-3 sm:py-4 bg-white/95 transition-colors duration-300"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
        >
          <div className="max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center gap-3 sm:gap-4 lg:gap-6">
            <motion.div
              className="flex-1 relative"
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <div className="relative bg-gray-50 dark:bg-[#1a1a1a] rounded-xl lg:rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-1 sm:p-1.5 lg:p-2 transition-all duration-300 hover:shadow-lg focus-within:ring-2 focus-within:ring-[#EB590E] focus-within:border-transparent">
                <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                  <Search className="h-4 w-4 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-[#EB590E] flex-shrink-0 ml-2 sm:ml-3 lg:ml-4" strokeWidth={2.5} />
                  <div className="flex-1 relative">
                    <div className="relative w-full">
                      <Input
                        value={heroSearch}
                        onChange={(e) => setHeroSearch(e.target.value)}
                        onFocus={handleSearchFocus}
                        onClick={handleSearchFocus}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && heroSearch.trim()) {
                            navigate(`/user/search?q=${encodeURIComponent(heroSearch.trim())}`)
                            closeSearch()
                            setHeroSearch("")
                          }
                        }}
                        aria-label="Search restaurants and food"
                        className="pl-0 pr-2 h-8 sm:h-9 lg:h-11 w-full bg-transparent border-0 text-sm sm:text-base lg:text-lg font-semibold text-gray-700 dark:text-white focus-visible:ring-0 focus-visible:ring-offset-0 rounded-full placeholder:text-gray-500 dark:placeholder:text-gray-400"
                      />
                      {!heroSearch && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none h-5 lg:h-6 overflow-hidden">
                          <AnimatePresence mode="wait">
                            <motion.span
                              key={placeholderIndex}
                              initial={{ y: 16, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              exit={{ y: -16, opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="text-sm sm:text-base lg:text-lg font-semibold text-gray-500 dark:text-gray-400 inline-block"
                            >
                              {placeholders[placeholderIndex]}
                            </motion.span>
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              ref={vegModeToggleRef}
              className="flex flex-col items-center gap-0.5 sm:gap-1 lg:gap-1.5 flex-shrink-0 relative"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="flex flex-col items-center">
                <span className="text-green-700 dark:text-green-500 text-[10px] sm:text-[11px] lg:text-sm font-black leading-none">VEG</span>
                <span className="text-green-700 dark:text-green-500 text-[8px] sm:text-[10px] lg:text-xs font-black leading-none">MODE</span>
              </div>
              <Switch
                checked={vegMode}
                onCheckedChange={handleVegModeChange}
                aria-label="Toggle Veg Mode"
                className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-300 dark:data-[state=unchecked]:bg-gray-600 w-9 h-4 sm:w-10 sm:h-5 lg:w-12 lg:h-6 shadow-md [&_[data-slot=switch-thumb]]:bg-white [&_[data-slot=switch-thumb]]:h-3 [&_[data-slot=switch-thumb]]:w-3 sm:[&_[data-slot=switch-thumb]]:h-4 sm:[&_[data-slot=switch-thumb]]:w-4 lg:[&_[data-slot=switch-thumb]]:h-5 lg:[&_[data-slot=switch-thumb]]:w-5 [&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-5 sm:[&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-5 lg:[&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-6 [&_[data-slot=switch-thumb]]:data-[state=unchecked]:translate-x-0"
              />
            </motion.div>
          </div>
        </motion.div>
        </div>
      )}

      {/* Top Hero Shell: banner */}
      <div
        ref={heroShellRef}
        data-home-hero-shell="true"
        className="relative w-full overflow-hidden aspect-[16/9] sm:aspect-[16/7] lg:aspect-[16/6] min-h-[290px] sm:min-h-[340px] lg:min-h-[400px] max-h-[620px] mb-3 md:-mt-40"
        onTouchStart={heroBannerImages.length > 0 ? handleTouchStart : undefined}
        onTouchMove={heroBannerImages.length > 0 ? handleTouchMove : undefined}
        onTouchEnd={heroBannerImages.length > 0 ? handleTouchEnd : undefined}
        onMouseDown={heroBannerImages.length > 0 ? handleMouseDown : undefined}
        onMouseMove={heroBannerImages.length > 0 ? handleMouseMove : undefined}
        onMouseUp={heroBannerImages.length > 0 ? handleMouseUp : undefined}
        onMouseLeave={heroBannerImages.length > 0 ? handleMouseUp : undefined}
      >
        {loadingBanners ? (
          <div className="absolute inset-0 z-0 bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
            <div className="text-gray-500 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading banners...</p>
            </div>
          </div>
        ) : heroBannerImages.length > 0 ? (
          <div className="absolute inset-0 z-0 bg-gray-100">
            {heroBannerImages.map((image, index) => (
              <div
                key={`${index}-${image}`}
                className="absolute inset-0 transition-opacity duration-700 ease-in-out"
                style={{
                  opacity: currentBannerIndex === index ? 1 : 0,
                  zIndex: currentBannerIndex === index ? 2 : 1,
                  pointerEvents: 'none'
                }}
              >
                <img
                  src={image}
                  alt={`Hero Banner ${index + 1}`}
                  className="h-full w-full object-fill object-center"
                  loading="eager"
                  fetchPriority={index === 0 ? "high" : "auto"}
                  draggable={false}
                  onError={(e) => {
                    e.currentTarget.style.background = '#e5e7eb'
                    e.currentTarget.style.objectFit = 'contain'
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 z-0 bg-gray-100" />
        )}

        <div className="relative z-30 w-full md:hidden">
          <motion.div
            className="relative z-50 pt-2 sm:pt-3 lg:pt-4"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <PageNavbar textColor="black" zIndex={50} />
          </motion.div>

          {!hasLiveLocation && (
            <div className="px-3 sm:px-6 lg:px-8 pb-2">
              <button
                type="button"
                onClick={handleLocationClick}
                className="w-full max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto text-left rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#151515] px-3 py-2.5 flex items-start gap-2.5"
              >
                <MapPin className="h-4 w-4 text-[#EB590E] mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-gray-400 uppercase">
                    Saved Address
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {savedAddressText || "No saved address. Tap to add one."}
                  </p>
                </div>
              </button>
            </div>
          )}

          <motion.div
            className="w-full py-3 sm:py-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          >
            <div className="max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center gap-3 sm:gap-4 lg:gap-6">
              <motion.div
                className="flex-1 relative"
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <div className="relative bg-gray-50 dark:bg-[#1a1a1a] rounded-xl lg:rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-1 sm:p-1.5 lg:p-2 transition-all duration-300 hover:shadow-lg focus-within:ring-2 focus-within:ring-[#EB590E] focus-within:border-transparent">
                  <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                    <Search className="h-4 w-4 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-[#EB590E] flex-shrink-0 ml-2 sm:ml-3 lg:ml-4" strokeWidth={2.5} />
                    <div className="flex-1 relative">
                      <div className="relative w-full">
                        <Input
                          value={heroSearch}
                          onChange={(e) => setHeroSearch(e.target.value)}
                          onFocus={handleSearchFocus}
                          onClick={handleSearchFocus}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && heroSearch.trim()) {
                              navigate(`/user/search?q=${encodeURIComponent(heroSearch.trim())}`)
                              closeSearch()
                              setHeroSearch("")
                            }
                          }}
                          aria-label="Search restaurants and food"
                          className="pl-0 pr-2 h-8 sm:h-9 lg:h-11 w-full bg-transparent border-0 text-sm sm:text-base lg:text-lg font-semibold text-gray-700 dark:text-white focus-visible:ring-0 focus-visible:ring-offset-0 rounded-full placeholder:text-gray-500 dark:placeholder:text-gray-400"
                        />
                        {!heroSearch && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none h-5 lg:h-6 overflow-hidden">
                            <AnimatePresence mode="wait">
                              <motion.span
                                key={placeholderIndex}
                                initial={{ y: 16, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: -16, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="text-sm sm:text-base lg:text-lg font-semibold text-gray-500 dark:text-gray-400 inline-block"
                              >
                                {placeholders[placeholderIndex]}
                              </motion.span>
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                ref={vegModeToggleRef}
                className="flex flex-col items-center gap-0.5 sm:gap-1 lg:gap-1.5 flex-shrink-0 relative"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="flex flex-col items-center">
                  <span className="text-green-700 dark:text-green-500 text-[10px] sm:text-[11px] lg:text-sm font-black leading-none">VEG</span>
                  <span className="text-green-700 dark:text-green-500 text-[8px] sm:text-[10px] lg:text-xs font-black leading-none">MODE</span>
                </div>
                <Switch
                  checked={vegMode}
                  onCheckedChange={handleVegModeChange}
                  aria-label="Toggle Veg Mode"
                  className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-300 dark:data-[state=unchecked]:bg-gray-600 w-9 h-4 sm:w-10 sm:h-5 lg:w-12 lg:h-6 shadow-md [&_[data-slot=switch-thumb]]:bg-white [&_[data-slot=switch-thumb]]:h-3 [&_[data-slot=switch-thumb]]:w-3 sm:[&_[data-slot=switch-thumb]]:h-4 sm:[&_[data-slot=switch-thumb]]:w-4 lg:[&_[data-slot=switch-thumb]]:h-5 lg:[&_[data-slot=switch-thumb]]:w-5 [&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-5 sm:[&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-5 lg:[&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-6 [&_[data-slot=switch-thumb]]:data-[state=unchecked]:translate-x-0"
                />
              </motion.div>
            </div>
          </motion.div>
        </div>

        {heroBannerImages.length > 0 && (
          <>
            <button
              type="button"
              className="absolute inset-0 z-20 h-full w-full border-0 p-0 bg-transparent text-left"
              onClick={() => {
                const bannerData = heroBannersData[currentBannerIndex]
                const linkedRestaurants = bannerData?.linkedRestaurants || []
                if (linkedRestaurants.length > 0) {
                  const firstRestaurant = linkedRestaurants[0]
                  const restaurantSlug = firstRestaurant.slug || firstRestaurant.restaurantId || firstRestaurant._id
                  navigate(`/restaurants/${restaurantSlug}`)
                }
              }}
              style={{
                cursor: (heroBannersData[currentBannerIndex]?.linkedRestaurants || []).length > 0 ? 'pointer' : 'default'
              }}
              aria-label={`Open hero banner ${currentBannerIndex + 1}`}
            />

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-30">
              {heroBannerImages.map((_, index) => (
                <button
                  key={index}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCurrentBannerIndex(index)
                  }}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${currentBannerIndex === index
                    ? 'bg-white w-6'
                    : 'bg-white/60 hover:bg-white/90'
                    }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Rest of Content - Container Width with Unified Background */}
      <motion.div
        className="relative max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 space-y-0 pt-2 sm:pt-3 lg:pt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        {/* Food Categories - Horizontal Scroll */}
        <motion.section
          className="space-y-1 sm:space-y-1.5 lg:space-y-2"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <div
            ref={categoryScrollRef}
            className="flex gap-3 sm:gap-4 lg:gap-5 xl:gap-6 overflow-x-auto overflow-y-visible scrollbar-hide scroll-smooth px-2 sm:px-3 lg:px-4 py-2 sm:py-3 lg:py-4"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              touchAction: "pan-x pan-y pinch-zoom",
              overflowY: "hidden",
            }}
          >
            {/* Offer Image - Static, Centered */}
            {/* Special Offer Badge - Meals Under 200 */}
            <motion.div
              className="flex-shrink-0 flex flex-col items-center gap-2 cursor-pointer group"
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              onClick={() => navigate("/user/under-250")}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center relative">
                {/* Blue Badge Shape */}
                <div className="absolute inset-0 bg-[#EB590E] rounded-b-full rounded-t-sm shadow-md border-t-4 border-orange-200 flex flex-col items-center justify-center p-1">
                  <span className="text-[10px] sm:text-xs font-bold text-white text-center leading-tight">
                    MEALS UNDER
                  </span>
                  <span className="text-sm sm:text-base font-extrabold text-white">
                    ₹200
                  </span>
                  <div className="w-10 h-4 bg-white rounded-full mt-1 flex items-center justify-center">
                    <span className="text-[8px] font-bold text-[#EB590E]">
                      Explore
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
            {loadingRealCategories || loadingMenuCategories ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : displayCategories.length > 0 ? (
              <>
                {/* Show only first 10 categories */}
                {displayCategories.slice(0, 10).map((category, index) => (
                  <motion.div
                    key={category.id || index}
                    className="flex-shrink-0"
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      duration: 0.4,
                      delay: index * 0.05,
                      type: "spring",
                      stiffness: 100
                    }}
                    whileHover={{ scale: 1.05, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Link to={`/user/category/${category.slug || category.name.toLowerCase().replace(/\s+/g, '-')}`} className="flex flex-col items-center gap-2 group">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 group-hover:border-[#EB590E] transition-colors duration-300 relative">
                        <OptimizedImage
                          src={category.image}
                          alt={category.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          sizes="(max-width: 640px) 64px, (max-width: 768px) 80px, 96px"
                          objectFit="cover"
                          placeholder="blur"
                          onError={() => { }}
                        />
                      </div>
                      <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 text-center whitespace-nowrap max-w-[80px] truncate">
                        {category.name}
                      </span>
                    </Link>
                  </motion.div>
                ))}
                {/* See All button - show if there are more than 10 categories */}
                {displayCategories.length > 10 && (
                  <motion.div
                    className="flex-shrink-0 cursor-pointer"
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    whileHover={{ scale: 1.05, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowAllCategoriesModal(true)}
                  >
                    <div className="flex flex-col items-center gap-2 group">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 group-hover:border-[#EB590E] transition-colors duration-300 flex items-center justify-center bg-[#FFF2EB] dark:bg-[#EB590E]/20">
                        <UtensilsCrossed className="w-5 h-5 sm:w-6 sm:h-6 text-[#EB590E] dark:text-[#EB590E]" />
                      </div>
                      <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 text-center whitespace-nowrap max-w-[80px] truncate">
                        See all
                      </span>
                    </div>
                  </motion.div>
                )}
              </>
            ) : (
              // No categories available from API
              <div className="flex items-center justify-center py-4 text-gray-500 text-sm">
                No categories available
              </div>
            )}
          </div>
        </motion.section>

        {/* Filters */}
        <motion.section
          className="py-1 lg:py-2"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div
            className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 overflow-x-auto scrollbar-hide pb-1 lg:pb-2"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {/* Filter Button - Opens Modal */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                variant="outline"
                onClick={() => setIsFilterOpen(true)}
                className="h-7 sm:h-8 px-2 sm:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 font-medium transition-all bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-white"
              >
                <SlidersHorizontal className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-xs sm:text-sm font-bold text-black dark:text-white">Filters</span>
              </Button>
            </motion.div>

            {/* Filter Buttons */}
            {[
              { id: 'delivery-under-30', label: 'Under 30 mins' },
              { id: 'delivery-under-45', label: 'Under 45 mins' },
              { id: 'distance-under-1km', label: 'Under 1km', icon: MapPin },
              { id: 'distance-under-2km', label: 'Under 2km', icon: MapPin },
            ].map((filter, index) => {
              const Icon = filter.icon
              const isActive = activeFilters.has(filter.id)
              return (
                <motion.div
                  key={filter.id}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    variant="outline"
                    onClick={() => {
                      const nextFilters = new Set(activeFilters)
                      if (nextFilters.has(filter.id)) {
                        nextFilters.delete(filter.id)
                      } else {
                        nextFilters.add(filter.id)
                      }
                      setActiveFilters(nextFilters)
                      void applyFiltersAndRefetch(nextFilters, sortBy, selectedCuisine)
                    }
                    }
                    className={`h-7 sm:h-8 px-2 sm:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 transition-all font-medium ${isActive
                      ? 'bg-green-600 text-white border border-green-600 hover:bg-green-600/90'
                      : 'bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                      }`}
                  >
                    {Icon && <Icon className={`h-3 w-3 sm:h-4 sm:w-4 ${isActive ? 'fill-white' : ''}`} />}
                    <span className="text-xs sm:text-sm font-bold text-black dark:text-white">{filter.label}</span>
                  </Button>
                </motion.div>
              )
            })}
          </div>
        </motion.section>

        {recommendedForYouRestaurants.length > 0 && (
          <motion.section
            className="pt-1 sm:pt-2"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
          >
            <motion.h2
              className="text-xs sm:text-sm lg:text-base font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase mb-2 sm:mb-3 px-1"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              Recommended For You
            </motion.h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
              {recommendedForYouRestaurants.map((restaurant, index) => {
                const restaurantSlug = restaurant.slug || restaurant.name.toLowerCase().replace(/\s+/g, "-")
                return (
                  <motion.div
                    key={`recommended-${restaurant.mongoId || restaurant.id || restaurantSlug}`}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: index * 0.05 }}
                  >
                    <Link to={`/user/restaurants/${restaurantSlug}`} className="block rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1a1a1a]">
                      <div className="relative h-24 sm:h-28 md:h-32 bg-gray-100">
                        <img src={restaurant.image} alt={restaurant.name} className="w-full h-full object-cover" loading="lazy" />
                        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-white/95 text-[10px] font-semibold text-green-700">
                          {Number(restaurant.rating || 0).toFixed(1)}
                        </div>
                      </div>
                      <div className="p-2">
                        <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate">{restaurant.name}</p>
                        <p className="text-[11px] sm:text-xs text-green-600 font-medium mt-1 flex items-center gap-1">
                          <Flame className="w-3 h-3" />
                          Near & Fast
                        </p>
                      </div>
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          </motion.section>
        )}

        {/* Explore More Section */}
        <motion.section
          className="pt-2 sm:pt-3 lg:pt-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
        >
          <motion.h2
            className="text-xs sm:text-sm lg:text-base font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase mb-2 sm:mb-3 lg:mb-4 px-1"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            {exploreMoreHeading}
          </motion.h2>
          <div
            className="flex gap-2 sm:gap-3 lg:gap-4 overflow-x-auto scrollbar-hide pb-2 lg:pb-3"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {loadingLandingConfig ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              finalExploreItems.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.4,
                    delay: index * 0.1,
                    type: "spring",
                    stiffness: 100
                  }}
                  whileHover={{ scale: 1.1, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link to={item.href} className="flex-shrink-0 bg-white  dark:bg-[#1a1a1a]/80 dark:text-white">
                    <div className="flex flex-col items-center gap-2.5 w-24 sm:w-28 md:w-32 group">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl bg-white dark:bg-[#1a1a1a]/80 dark:text-white flex items-center justify-center shadow-sm group-hover:shadow-lg transition-all duration-300 overflow-hidden p-2.5 group-hover:border-[#EB590E] border border-transparent">
                        <OptimizedImage
                          src={item.image}
                          alt={item.label}
                          className="w-full h-full dark:rounded-md"
                          width={112}
                          height={112}
                          sizes="(max-width: 640px) 80px, (max-width: 768px) 96px, 112px"
                          objectFit="contain"
                          placeholder="blur"
                        />
                      </div>
                      <span className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-300 text-center leading-tight">
                        {item.label}
                      </span>
                    </div>
                  </Link>
                </motion.div>
              ))
            )}
          </div>
        </motion.section>

        {/* Featured Foods - Horizontal Scroll */}

        {/* Restaurants - Enhanced with Animations */}
        <motion.section
          className="space-y-0 pt-3 sm:pt-4 lg:pt-6 pb-8 md:pb-10"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            className="px-1 mb-3 lg:mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex flex-col gap-0.5 lg:gap-1">
              <h2 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-400 tracking-widest uppercase">
                {filteredRestaurants.length} Restaurants Delivering to You
              </h2>
              <span className="text-base sm:text-lg lg:text-2xl text-gray-500 font-normal">Featured</span>
            </div>
          </motion.div>
          <div className="relative">
            {/* Loading Overlay */}
            <AnimatePresence>
              {(isLoadingFilterResults || loadingRestaurants) && (
                <motion.div
                  className="absolute inset-0 bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg min-h-[400px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 text-green-600 animate-spin" strokeWidth={2.5} />
                    <span className="text-sm font-medium text-gray-700 dark:text-white">Loading restaurants...</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3  gap-3 sm:gap-4 lg:gap-5 xl:gap-6 pt-1 sm:pt-1.5 lg:pt-2 items-stretch ${isLoadingFilterResults || loadingRestaurants ? 'opacity-50' : 'opacity-100'} transition-opacity duration-300`}>
              {filteredRestaurants.map((restaurant, index) => {
                const restaurantSlug = restaurant.slug || restaurant.name.toLowerCase().replace(/\s+/g, "-")
                const availability = getRestaurantAvailabilityStatus(restaurant, new Date(availabilityTick))
                // Direct favorite check - isFavorite is already memoized in context
                const favorite = isFavorite(restaurantSlug)

                const handleToggleFavorite = (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (favorite) {
                    // If already bookmarked, show Manage Collections modal
                    setSelectedRestaurantSlug(restaurantSlug)
                    setShowManageCollections(true)
                  } else {
                    // Add to favorites and show toast
                    addFavorite({
                      slug: restaurantSlug,
                      name: restaurant.name,
                      cuisine: restaurant.cuisine,
                      rating: restaurant.rating,
                      deliveryTime: restaurant.deliveryTime,
                      distance: restaurant.distance,
                      priceRange: restaurant.priceRange,
                      image: restaurant.image
                    })
                    setShowToast(true)
                    setTimeout(() => {
                      setShowToast(false)
                    }, 3000)
                  }
                }

                return (
                  <div
                    key={restaurant.id}
                    className="h-full transform transition-all duration-300 hover:-translate-y-3 hover:scale-[1.02]"
                    style={{
                      perspective: 1000,
                      animation: index < 10 ? `fade-in-up 0.5s ease-out ${index * 0.05}s backwards` : 'none'
                    }}
                  >
                    <div className="h-full group">
                      <Link to={`/user/restaurants/${restaurantSlug}`} className="h-full flex">
                        <Card className={`overflow-hidden gap-0 cursor-pointer border-0 dark:border-gray-800 group bg-white dark:bg-[#1a1a1a] border-background transition-all duration-500 py-0 rounded-md flex flex-col h-full w-full relative ${isOutOfService || !availability.isOpen ? 'grayscale opacity-75' : ''
                          }`}>
                          {/* Image Section with Carousel */}
                          <div className="relative">
                            <RestaurantImageCarousel
                              restaurant={restaurant}
                              priority={index < 3}
                              backendOrigin={BACKEND_ORIGIN}
                            />

                            {/* Featured Dish Badge - Top Left */}
                            <div className="absolute top-3 left-3 md:top-4 md:left-4 flex items-center z-10 transform transition-transform duration-300 group-hover:scale-105 group-hover:-translate-y-0.5">
                              <div className="bg-gray-800/90 backdrop-blur-sm text-white px-2 py-1 md:px-4 md:py-1.5 rounded-md text-xs font-medium flex items-center shadow-lg">
                                {restaurant.featuredDish} · ₹{restaurant.featuredPrice}
                              </div>
                            </div>

                            {/* Bookmark Icon - Top Right */}
                            <div className="absolute top-3 right-3 md:top-4 md:right-4 z-10 transform transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleToggleFavorite}
                                aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                                className={`h-9 w-9 md:h-11 md:w-11 rounded-full border flex items-center justify-center transition-all duration-300 ${favorite
                                  ? "border-red-500 bg-red-50 text-red-500"
                                  : "border-white bg-white/90 text-gray-600 hover:bg-white"
                                  }`}
                              >
                                <Bookmark
                                  className={`h-5 w-5 lg:h-6 lg:w-6 transition-all duration-300 ${favorite ? "fill-red-500" : ""
                                    }`} />
                              </Button>
                            </div>

                          </div>

                          {/* Content Section */}
                          <div className="transform transition-transform duration-300 group-hover:-translate-y-1">
                            <CardContent className="p-3 sm:p-4 lg:p-5 pt-3 sm:pt-4 lg:pt-5 flex flex-col flex-grow">
                              {/* Restaurant Name & Rating */}
                              <div className="flex items-start justify-between gap-2 mb-2 lg:mb-3">
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-md sm:text-md lg:text-xl font-bold text-gray-900 dark:text-white line-clamp-1 lg:line-clamp-2 transition-colors duration-300 group-hover:text-[#EB590E]">
                                    {restaurant.name}
                                  </h3>
                                  <span className={`inline-flex mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${availability.isOpen ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                                    {availability.isOpen ? "Open now" : "Offline"}
                                  </span>
                                  {availability.isOpen && availability.closingCountdownLabel && (
                                    <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 line-clamp-1">
                                      <Timer className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.8} />
                                      <span className="truncate">{availability.closingCountdownLabel}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex-shrink-0 bg-green-600 text-white px-2 py-1 lg:px-3 lg:py-1.5 rounded-lg flex items-center gap-1 transform transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                                  <span className="text-sm lg:text-base font-bold">{restaurant.rating}</span>
                                  <Star className="h-3 w-3 lg:h-4 lg:w-4 fill-white text-white" />
                                </div>
                              </div>

                              {/* Delivery Time & Distance */}
                              <div className="flex items-center gap-1 text-sm lg:text-base text-gray-500 mb-2 lg:mb-3 transition-opacity duration-300 opacity-70 group-hover:opacity-100">
                                <Clock className="h-4 w-4 lg:h-5 lg:w-5 text-gray-500 dark:text-gray-400" strokeWidth={1.5} />
                                <span className="font-medium dark:text-gray-300 text-gray-700">{restaurant.deliveryTime}</span>
                                <span className="mx-1">|</span>
                                <span className="font-medium dark:text-gray-300 text-gray-700">{restaurant.distance}</span>
                              </div>

                              {/* Offer Badge */}
                              {restaurant.offer && (
                                <div className="flex items-center gap-2 text-sm lg:text-base mt-auto transform transition-transform duration-300 group-hover:translate-x-1">
                                  <BadgePercent className="h-4 w-4 lg:h-5 lg:w-5 text-black" strokeWidth={2} />
                                  <span className="text-gray-700 dark:text-gray-300 font-medium">{restaurant.offer}</span>
                                </div>
                              )}
                            </CardContent>
                          </div>

                          {/* Border Glow Effect */}
                          <div className="absolute inset-0 rounded-md pointer-events-none z-0 transition-all duration-300 border border-transparent group-hover:border-[#EB590E]/30 group-hover:shadow-[inset_0_0_0_1px_rgba(235,89,14,0.2)]" />
                        </Card>
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex justify-center pt-2 sm:pt-3">
            {/* <Link to="/user/restaurants">
              <Button variant="outline" className="bg-transparent outline-none text-green-600 hover:opacity-80 border-none underline shadow-none  text-xs sm:text-sm md:text-base sm:hidden">
                See All Restaurants
              </Button>
            </Link> */}
          </div>
        </motion.section>
      </motion.div>

      {/* Filter Modal - Bottom Sheet */}
      <AnimatePresence>
        {isFilterOpen && (
          <div className="fixed inset-0 z-[100]">
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/50"
              onClick={() => setIsFilterOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />

            {/* Modal Content */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] rounded-t-3xl max-h-[85vh] flex flex-col"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 400,
                duration: 0.3
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b dark:border-gray-800">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Filters and sorting</h2>
                <button
                  onClick={() => {
                    setActiveFilters(new Set())
                    setSortBy(null)
                    setSelectedCuisine(null)
                  }}
                  className="text-[#EB590E] font-medium text-sm"
                >
                  Clear all
                </button>
              </div>

              {/* Body */}
              <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar - Tabs */}
                <div className="w-24 sm:w-28 bg-gray-50 dark:bg-[#0a0a0a] border-r dark:border-gray-800 flex flex-col">
                  {[
                    { id: 'sort', label: 'Sort By', icon: ArrowDownUp },
                    { id: 'time', label: 'Time', icon: Timer },
                    { id: 'rating', label: 'Rating', icon: Star },
                    { id: 'distance', label: 'Distance', icon: MapPin },
                    { id: 'price', label: 'Dish Price', icon: IndianRupee },
                    { id: 'cuisine', label: 'Cuisine', icon: UtensilsCrossed },
                    { id: 'offers', label: 'Offers', icon: BadgePercent },
                    { id: 'trust', label: 'Trust', icon: ShieldCheck },
                  ].map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeScrollSection === tab.id || activeFilterTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveFilterTab(tab.id)
                          const section = filterSectionRefs.current[tab.id]
                          if (section) {
                            section.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }
                        }}
                        className={`flex flex-col items-center gap-1 py-4 px-2 text-center relative transition-colors ${isActive ? 'bg-white dark:bg-[#1a1a1a] text-[#EB590E]' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#EB590E] rounded-r" />
                        )}
                        <Icon className="h-5 w-5" strokeWidth={1.5} />
                        <span className="text-xs font-medium leading-tight">{tab.label}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Right Content Area - Scrollable */}
                <div ref={rightContentRef} className="flex-1 overflow-y-auto p-4">
                  {/* Sort By Tab */}
                  <div
                    ref={el => filterSectionRefs.current['sort'] = el}
                    data-section-id="sort"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Sort by</h3>
                    <div className="flex flex-col gap-3">
                      {[
                        { id: null, label: 'Relevance' },
                        { id: 'price-low', label: 'Price: Low to High' },
                        { id: 'price-high', label: 'Price: High to Low' },
                        { id: 'rating-high', label: 'Rating: High to Low' },
                        { id: 'rating-low', label: 'Rating: Low to High' },
                      ].map((option) => (
                        <button
                          key={option.id || 'relevance'}
                          onClick={() => setSortBy(option.id)}
                          className={`px-4 py-3 rounded-xl border text-left transition-colors ${sortBy === option.id
                            ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                            }`}
                        >
                          <span className={`text-sm font-medium ${sortBy === option.id ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>
                            {option.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Tab */}
                  <div
                    ref={el => filterSectionRefs.current['time'] = el}
                    data-section-id="time"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Estimated Time</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('delivery-under-30')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('delivery-under-30')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                          }`}
                      >
                        <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-30') ? 'text-[#EB590E]' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('delivery-under-30') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under 30 mins</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('delivery-under-45')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('delivery-under-45')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                          }`}
                      >
                        <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-45') ? 'text-[#EB590E]' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('delivery-under-45') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under 45 mins</span>
                      </button>
                    </div>
                  </div>

                  {/* Rating Tab */}
                  <div
                    ref={el => filterSectionRefs.current['rating'] = el}
                    data-section-id="rating"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900  dark:text-white mb-4">Restaurant Rating</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('rating-35-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-35-plus')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-35-plus') ? 'text-[#EB590E] fill-[#EB590E]' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-35-plus') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Rated 3.5+</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('rating-4-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-4-plus')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-4-plus') ? 'text-[#EB590E] fill-[#EB590E]' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-4-plus') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Rated 4.0+</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('rating-45-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-45-plus')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-45-plus') ? 'text-[#EB590E] fill-[#EB590E]' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-45-plus') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Rated 4.5+</span>
                      </button>
                    </div>
                  </div>

                  {/* Distance Tab */}
                  <div
                    ref={el => filterSectionRefs.current['distance'] = el}
                    data-section-id="distance"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Distance</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('distance-under-1km')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('distance-under-1km')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                          }`}
                      >
                        <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-1km') ? 'text-[#EB590E]' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('distance-under-1km') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under 1 km</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('distance-under-2km')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('distance-under-2km')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                          }`}
                      >
                        <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-2km') ? 'text-[#EB590E]' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('distance-under-2km') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under 2 km</span>
                      </button>
                    </div>
                  </div>

                  {/* Price Tab */}
                  <div
                    ref={el => filterSectionRefs.current['price'] = el}
                    data-section-id="price"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Dish Price</h3>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => toggleFilter('price-under-200')}
                        className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('price-under-200')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                          }`}
                      >
                        <span className={`text-sm font-medium ${activeFilters.has('price-under-200') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under ₹200</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('price-under-500')}
                        className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('price-under-500')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                          }`}
                      >
                        <span className={`text-sm font-medium ${activeFilters.has('price-under-500') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under ₹500</span>
                      </button>
                    </div>
                  </div>

                  {/* Cuisine Tab */}
                  <div
                    ref={el => filterSectionRefs.current['cuisine'] = el}
                    data-section-id="cuisine"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cuisine</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {['Chinese', 'American', 'Japanese', 'Italian', 'Mexican', 'Indian', 'Asian', 'Seafood', 'Desserts', 'Cafe', 'Healthy'].map((cuisine) => (
                        <button
                          key={cuisine}
                          onClick={() => setSelectedCuisine(selectedCuisine === cuisine ? null : cuisine)}
                          className={`px-4 py-3 rounded-xl border text-center transition-colors ${selectedCuisine === cuisine
                            ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                            }`}
                        >
                          <span className={`text-sm font-medium ${selectedCuisine === cuisine ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>
                            {cuisine}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Trust Markers Tab */}
                  {activeFilterTab === 'trust' && (
                    <div
                      ref={el => filterSectionRefs.current['trust'] = el}
                      data-section-id="trust"
                      className="space-y-4 mb-8"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Trust Markers</h3>
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={() => toggleFilter('top-rated')}
                          className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('top-rated')
                            ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                            }`}
                        >
                          <span className={`text-sm font-medium ${activeFilters.has('top-rated') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Top Rated</span>
                        </button>
                        <button
                          onClick={() => toggleFilter('trusted')}
                          className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('trusted')
                            ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                            }`}
                        >
                          <span className={`text-sm font-medium ${activeFilters.has('trusted') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Trusted by 1000+ users</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Offers Tab */}
                  {activeFilterTab === 'offers' && (
                    <div
                      ref={el => filterSectionRefs.current['offers'] = el}
                      data-section-id="offers"
                      className="space-y-4 mb-8"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Offers</h3>
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={() => toggleFilter('has-offers')}
                          className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('has-offers')
                            ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-800 hover:border-[#EB590E]'
                            }`}
                        >
                          <span className={`text-sm font-medium ${activeFilters.has('has-offers') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Restaurants with offers</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 px-4 py-4 border-t dark:border-gray-800 bg-white dark:bg-[#1a1a1a]">
                <button
                  onClick={() => setIsFilterOpen(false)}
                  className="flex-1 py-3 text-center font-semibold text-gray-700 dark:text-gray-300"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    setIsFilterOpen(false)
                    await applyFiltersAndRefetch(activeFilters, sortBy, selectedCuisine)
                  }}
                  className={`flex-1 py-3 font-semibold rounded-xl transition-colors ${activeFilters.size > 0 || sortBy || selectedCuisine
                    ? 'bg-[#EB590E] text-white hover:bg-[#D94F0C]'
                    : 'bg-gray-200 text-gray-500'
                    }`}
                  disabled={isLoadingFilterResults}
                >
                  {isLoadingFilterResults ? (
                    'Loading...'
                  ) : activeFilters.size > 0 || sortBy || selectedCuisine ? (
                    `Show results`
                  ) : (
                    'Show results'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Veg Mode Popup */}
      <AnimatePresence>
        {showVegModePopup && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                setShowVegModePopup(false)
                // Revert veg mode to OFF if popup is closed without applying
                setVegModeContext(false)
                setPrevVegMode(false)
              }}
              className="fixed inset-0 bg-black/30 z-[9998] backdrop-blur-sm"
            />

            {/* Popup */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{
                type: "spring",
                damping: 25,
                stiffness: 300,
                mass: 0.8
              }}
              className="fixed z-[9999] bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl p-4 w-[calc(100%-2rem)] max-w-xs"
              style={{
                top: `${popupPosition.top}px`,
                right: `${popupPosition.right}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Pointer Triangle */}
              <div
                className="absolute -top-2 right-5 w-3 h-3 bg-white dark:bg-[#1a1a1a] transform rotate-45"
                style={{
                  boxShadow: '-2px -2px 4px rgba(0,0,0,0.1)'
                }}
              />

              {/* Title */}
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3">
                See veg dishes from
              </h3>

              {/* Radio Options */}
              <div className="space-y-2 mb-4">
                {/* All restaurants */}
                <label
                  className="flex items-center gap-2.5 cursor-pointer p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => setVegModeOption("all")}
                >
                  <div className="relative flex items-center justify-center">
                    <input
                      type="radio"
                      name="vegModeOption"
                      value="all"
                      checked={vegModeOption === "all"}
                      onChange={() => setVegModeOption("all")}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${vegModeOption === "all"
                      ? "border-green-600 dark:border-green-500 bg-green-600 dark:bg-green-500"
                      : "border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a2a2a]"
                      }`}>
                      {vegModeOption === "all" && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-white" />
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    All restaurants
                  </span>
                </label>

                {/* Pure Veg restaurants only */}
                <label
                  className="flex items-center gap-2.5 cursor-pointer p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => setVegModeOption("pure-veg")}
                >
                  <div className="relative flex items-center justify-center">
                    <input
                      type="radio"
                      name="vegModeOption"
                      value="pure-veg"
                      checked={vegModeOption === "pure-veg"}
                      onChange={() => setVegModeOption("pure-veg")}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${vegModeOption === "pure-veg"
                      ? "border-green-600 dark:border-green-500 bg-green-600 dark:bg-green-500"
                      : "border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a2a2a]"
                      }`}>
                      {vegModeOption === "pure-veg" && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-white" />
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Pure Veg restaurants only
                  </span>
                </label>
              </div>

              {/* Apply Button */}
              <button
                onClick={() => {
                  setShowVegModePopup(false)
                  setIsApplyingVegMode(true)
                  // Confirm veg mode is ON by updating context and prevVegMode
                  setVegModeContext(true)
                  setPrevVegMode(true)
                  // Simulate applying veg mode settings
                  setTimeout(() => {
                    setIsApplyingVegMode(false)
                  }, 2000)
                }}
                className="w-full bg-[#EB590E] text-white font-semibold py-2.5 rounded-xl hover:bg-[#D94F0C] transition-colors mb-2 text-sm"
              >
                Apply
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Switch Off Veg Mode Popup */}
      <AnimatePresence>
        {showSwitchOffPopup && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                setShowSwitchOffPopup(false)
                isHandlingSwitchOff.current = false
                setVegModeContext(true)
                // prevVegMode stays true (from before), which is correct
              }}
              className="fixed inset-0 bg-black/50 z-[9998] backdrop-blur-sm"
            />

            {/* Popup */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{
                type: "spring",
                damping: 25,
                stiffness: 300,
                mass: 0.8
              }}
              className="fixed inset-0 z-[9999] flex dark:bg-[#lalala] dark:text-white items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white dark:bg-[#lalala] dark:text-white rounded-2xl shadow-2xl w-[85%] max-w-sm p-6">
                {/* Warning Icon */}
                <div className="flex justify-center mb-4">
                  <div className="w-20 h-20 rounded-full bg-pink-100 flex items-center justify-center">
                    <AlertCircle className="w-20 h-20 text-white bg-red-500/90 rounded-full p-2" strokeWidth={2.5} />
                  </div>
                </div>

                {/* Title */}
                <h2 className="text-2xl font-bold text-gray-900  text-center mb-2">
                  Switch off Veg Mode?
                </h2>

                {/* Description */}
                <p className="text-gray-600 text-center mb-6 text-sm">
                  You'll see all restaurants, including those serving non-veg dishes
                </p>

                {/* Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setShowSwitchOffPopup(false)
                      setIsSwitchingOffVegMode(true)
                      // Simulate switching off veg mode
                      setTimeout(() => {
                        setIsSwitchingOffVegMode(false)
                        isHandlingSwitchOff.current = false
                        setVegModeContext(false)
                        setPrevVegMode(false) // Set to false to match current state (veg mode is OFF)
                      }, 2000)
                    }}
                    className="w-full bg-transparent text-red-600 font-normal py-1 text-normal rounded-xl hover:bg-red-50 transition-colors text-base"
                  >
                    Switch off
                  </button>

                  <button
                    onClick={() => {
                      setShowSwitchOffPopup(false)
                      isHandlingSwitchOff.current = false
                      setVegModeContext(true)
                      // prevVegMode stays true (from before), which is correct
                    }}
                    className="w-full text-gray-900 font-normal py-1 text-center rounded-xl hover:bg-gray-200 transition-colors text-base"
                  >
                    Keep using this mode
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* All Categories Modal */}
      <AnimatePresence>
        {showAllCategoriesModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowAllCategoriesModal(false)}
              className="fixed inset-0 bg-black/40 z-[9998] backdrop-blur-sm"
            />

            {/* Modal - Full screen with rounded corners */}
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 300
              }}
              className="fixed inset-x-0 bottom-0 top-12 sm:top-16 md:top-20 z-[9999] bg-white dark:bg-[#1a1a1a] rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 sm:px-6 sm:py-5 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                  All Categories
                </h2>
                <button
                  onClick={() => setShowAllCategoriesModal(false)}
                  className="p-1.5 sm:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600 dark:text-gray-400" />
                </button>
              </div>

              {/* Categories Grid - Scrollable */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 sm:py-5">
                <div className="grid grid-cols-3 gap-4 sm:gap-5 md:gap-6">
                  {displayCategories.map((category, index) => {
                    const categoryData = { name: category.name || category.label, image: category.image || category.imageUrl, slug: category.slug }
                    return (
                      <motion.div
                        key={category.id || index}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          duration: 0.3,
                          delay: index * 0.02,
                          type: "spring",
                          stiffness: 100
                        }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Link
                          to={`/user/category/${categoryData.slug || categoryData.name.toLowerCase().replace(/\s+/g, '-')}`}
                          onClick={() => setShowAllCategoriesModal(false)}
                          className="block"
                        >
                          <div className="flex flex-col items-center gap-2 sm:gap-2.5 cursor-pointer w-full">
                            <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full overflow-hidden shadow-md transition-all hover:shadow-lg flex-shrink-0">
                              <OptimizedImage
                                src={categoryData.image}
                                alt={categoryData.name}
                                className="w-full h-full bg-white rounded-full"
                                sizes="(max-width: 640px) 80px, (max-width: 768px) 96px, 112px"
                                objectFit="cover"
                                placeholder="blur"
                                onError={() => { }}
                              />
                            </div>
                            <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200 text-center leading-tight px-1 break-words w-full min-w-0">
                              {categoryData.name}
                            </span>
                          </div>
                        </Link>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Loading Screen - Applying Veg Mode */}
      {/* <AnimatePresence>
        {isApplyingVegMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[10000] bg-white/95 backdrop-blur-md flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-6">
              <div className="relative w-32 h-32 flex items-center justify-center">
                {[...Array(8)].map((_, i) => {
                  const baseSize = 112 // Starting size (w-28 = 112px)
                  const maxSize = 600 // Maximum size to expand to
                  return (
                    <motion.div
                      key={i}
                      initial={{ 
                        scale: 1,
                        opacity: 0
                      }}
                      animate={{ 
                        scale: maxSize / baseSize,
                        opacity: [0, 0.4, 0.2, 0]
                      }}
                      transition={{
                        duration: 2.5,
                        repeat: Infinity,
                        ease: "easeOut",
                        delay: i * 0.3 // Stagger each circle by 0.3s so they appear one at a time
                      }}
                      className="absolute rounded-full border border-green-300"
                      style={{
                        width: baseSize,
                        height: baseSize,
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        transformOrigin: 'center center'
                      }}
                    />
                  )
                })}
                
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 15,
                    delay: 0.1
                  }}
                  className="relative z-10 w-28 h-28 rounded-full border-2 border-green-300 bg-white flex flex-col items-center justify-center shadow-sm"
                >
                  <motion.div
                    className="flex flex-col items-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <span className="text-green-700 font-bold text-xs leading-none">100%</span>
                    <span className="text-green-700 font-bold text-xl leading-none mt-0.5">VEG</span>
                  </motion.div>
                </motion.div>
              </div>
              
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-gray-800 font-normal text-base text-center relative z-10"
              >
                Explore veg dishes from all restaurants
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence> */}

      <AnimatePresence>
        {isApplyingVegMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[10000] bg-white dark:bg-[#0a0a0a] flex items-center justify-center"
          >
            <div className="relative w-32 h-32 flex items-center justify-center w-full">
              {/* Animated circles - positioned absolutely at the center */}
              {[...Array(8)].map((_, i) => {
                const baseSize = 112
                const maxSize = 600
                return (
                  <motion.div
                    key={i}
                    initial={{
                      scale: 1,
                      opacity: 0,
                    }}
                    animate={{
                      scale: maxSize / baseSize,
                      opacity: [0, 0.4, 0.2, 0],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeOut",
                      delay: i * 0.15,
                    }}
                    className="absolute rounded-full border border-green-300 dark:border-green-600"
                    style={{
                      width: baseSize,
                      height: baseSize,
                      // left: "50%",
                      // top: "50%",
                      // transform: "translate(-50%, -50%)",
                      // transformOrigin: "center center",
                    }}
                  />
                )
              })}

              {/* 100% VEG badge - absolute positioning at exact center */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  delay: 0.1,
                }}
                className="absolute z-10 w-28 h-28 rounded-full border-2 border-green-600 dark:border-green-500 bg-white dark:bg-[#1a1a1a] flex flex-col items-center justify-center shadow-sm"
                style={{
                  // left: "50%",
                  // top: "50%",
                  // transform: "translate(-50%, -50%)",
                }}
              >
                <motion.div
                  className="flex flex-col items-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <span className="text-green-600 dark:text-green-400 font-extrabold text-3xl leading-none">100%</span>
                  <span className="text-green-600 dark:text-green-400 font-extrabold text-3xl leading-none mt-0.5">VEG</span>
                </motion.div>
              </motion.div>

              {/* Text below badge */}
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-xl font-normal text-gray-800 dark:text-gray-200 text-center relative z-10 mt-56 w-full"
              >
                Explore veg dishes from all restaurants
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      </div>

      {/* Loading Screen - Switching Off Veg Mode */}
      <AnimatePresence>
        {isSwitchingOffVegMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[10000] bg-white dark:bg-[#0a0a0a] flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-6">
              {/* Two Circles Spinning in Opposite Directions */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  delay: 0.1
                }}
                className="relative w-16 h-16 flex items-center justify-center"
              >
                {/* Outer Circle - Spins Clockwise */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    rotate: {
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "linear"
                    }
                  }}
                  className="absolute w-16 h-16 border-[4px] border-transparent border-t-pink-500 dark:border-t-pink-400 border-r-pink-500 dark:border-r-pink-400 rounded-full"
                />

                {/* Inner Circle - Spins Counter-clockwise */}
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{
                    rotate: {
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear"
                    }
                  }}
                  className="absolute w-12 h-12 border-[4px] border-transparent border-r-pink-500 dark:border-r-pink-400 rounded-full"
                />
              </motion.div>

              {/* Loading Text */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-center"
              >
                <motion.h2
                  className="text-xl font-normal text-gray-800 dark:text-gray-200 mb-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  Switching off
                </motion.h2>
                <motion.p
                  className="text-xl font-normal text-gray-800 dark:text-gray-200"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  Veg Mode for you
                </motion.p>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification - Fixed to viewport bottom */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showToast && (
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ duration: 0.3, type: "spring", damping: 25 }}
                className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[10001] bg-black text-white px-6 py-3 rounded-lg shadow-2xl"
              >
                <p className="text-sm font-medium">Added to bookmark</p>
              </motion.div>
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
                  className="fixed left-0 right-0 bottom-0 z-[10000] bg-white rounded-t-3xl shadow-2xl"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ duration: 0.2, type: "spring", damping: 30, stiffness: 400 }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">Manage Collections</h2>
                    <button
                      onClick={() => setShowManageCollections(false)}
                      className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-800 transition-colors"
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  </div>

                  {/* Collections List */}
                  <div className="px-4 py-4 space-y-2 max-h-[60vh] overflow-y-auto">
                    {/* Bookmarks Collection */}
                    <div
                      className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Don't close modal on click, let checkbox handle it
                      }}
                    >
                      <div className="h-12 w-12 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
                        <Bookmark className="h-6 w-6 text-red-500 fill-red-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-base font-medium text-gray-900">Bookmarks</span>
                          {selectedRestaurantSlug && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isFavorite(selectedRestaurantSlug)}
                                onCheckedChange={(checked) => {
                                  if (!checked) {
                                    removeFavorite(selectedRestaurantSlug)
                                    setSelectedRestaurantSlug(null)
                                    setShowManageCollections(false)
                                  }
                                }}
                                className="h-5 w-5 rounded border-2 border-red-500 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                              />
                            </div>
                          )}
                          {!selectedRestaurantSlug && (
                            <div className="h-5 w-5 rounded border-2 border-red-500 bg-red-500 flex items-center justify-center">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {getFavorites().length} restaurant{getFavorites().length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    {/* Create new Collection */}
                    <button
                      className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                      onClick={() => setShowManageCollections(false)}
                    >
                      <div className="h-12 w-12 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
                        <Plus className="h-6 w-6 text-red-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-base font-medium text-gray-900">
                          Create new Collection
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Done Button */}
                  <div className="border-t border-gray-200 px-4 py-4">
                    <Button
                      className="w-full bg-gray-300 hover:bg-gray-400 text-gray-700 py-3 rounded-lg font-medium"
                      onClick={() => {
                        setSelectedRestaurantSlug(null)
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

      <StickyCartCard />
      <OrderTrackingCard />
    </div>
  )
}


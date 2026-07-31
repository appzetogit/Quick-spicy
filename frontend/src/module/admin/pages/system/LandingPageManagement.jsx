import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Upload, Trash2, Image as ImageIcon, Loader2, AlertCircle, CheckCircle2, ArrowUp, ArrowDown, Layout, Tag, UtensilsCrossed, Trophy, ChefHat, Megaphone, Search } from "lucide-react"
import api from "@/lib/api"
import { adminAPI } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function LandingPageManagement() {
  const [activeTab, setActiveTab] = useState('banners')
  const [exploreMoreSubTab, setExploreMoreSubTab] = useState('top-10')

  // Hero Banners
  const [banners, setBanners] = useState([])
  const [bannersLoading, setBannersLoading] = useState(true)
  const [bannersUploading, setBannersUploading] = useState(false)
  const [bannersUploadProgress, setBannersUploadProgress] = useState({ current: 0, total: 0 })
  const [bannersDeleting, setBannersDeleting] = useState(null)
  const bannersFileInputRef = useRef(null)

  // Categories
  const [categories, setCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesUploading, setCategoriesUploading] = useState(false)
  const [categoriesDeleting, setCategoriesDeleting] = useState(null)
  const [pendingCategories, setPendingCategories] = useState([]) // {id, file, label, previewUrl}
  const categoriesFileInputRef = useRef(null)

  // Explore More
  const [exploreMore, setExploreMore] = useState([])
  const [exploreMoreLoading, setExploreMoreLoading] = useState(true)
  const [exploreMoreUploading, setExploreMoreUploading] = useState(false)
  const [exploreMoreDeleting, setExploreMoreDeleting] = useState(null)
  const [exploreMoreLabel, setExploreMoreLabel] = useState("")
  const [exploreMoreLink, setExploreMoreLink] = useState("")
  const [exploreIconsUploading, setExploreIconsUploading] = useState({})
  const exploreMoreFileInputRef = useRef(null)

  // Under 250 Banners
  const [under250Banners, setUnder250Banners] = useState([])
  const [under250BannersLoading, setUnder250BannersLoading] = useState(true)
  const [under250BannersUploading, setUnder250BannersUploading] = useState(false)
  const [under250BannersUploadProgress, setUnder250BannersUploadProgress] = useState({ current: 0, total: 0 })
  const [under250BannersDeleting, setUnder250BannersDeleting] = useState(null)
  const under250BannersFileInputRef = useRef(null)

  // Dining Banners
  const [diningBanners, setDiningBanners] = useState([])
  const [diningBannersLoading, setDiningBannersLoading] = useState(true)
  const [diningBannersUploading, setDiningBannersUploading] = useState(false)
  const [diningBannersUploadProgress, setDiningBannersUploadProgress] = useState({ current: 0, total: 0 })
  const [diningBannersDeleting, setDiningBannersDeleting] = useState(null)
  const diningBannersFileInputRef = useRef(null)

  // Settings
  const [settings, setSettings] = useState({ exploreMoreHeading: "Explore More", recommendedRestaurantIds: [] })
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [offerBanners, setOfferBanners] = useState([])
  const [offerBannersLoading, setOfferBannersLoading] = useState(false)
  const [offerBannerFile, setOfferBannerFile] = useState(null)
  const [offerBannerPreview, setOfferBannerPreview] = useState("")
  const [offerBannerTitle, setOfferBannerTitle] = useState("")
  const [offerBannerLink, setOfferBannerLink] = useState("")
  const [offerBannerZoneId, setOfferBannerZoneId] = useState("")
  const [offerBannerUploading, setOfferBannerUploading] = useState(false)
  const [recommendedSearchQuery, setRecommendedSearchQuery] = useState("")
  // "" edits the global fallback; a zone id edits that branch's own list.
  const [recommendedZoneId, setRecommendedZoneId] = useState("")
  const [recommendedByZone, setRecommendedByZone] = useState({})
  const [zonesForRecommended, setZonesForRecommended] = useState([])

  // Top 10 Restaurants
  const [top10Restaurants, setTop10Restaurants] = useState([])
  const [top10Loading, setTop10Loading] = useState(true)
  const [top10Deleting, setTop10Deleting] = useState(null)
  const [selectedRestaurantTop10, setSelectedRestaurantTop10] = useState("")
  const [selectedRank, setSelectedRank] = useState(1)
  const [allRestaurants, setAllRestaurants] = useState([])
  const [restaurantsLoading, setRestaurantsLoading] = useState(false)

  // Gourmet Restaurants
  const [gourmetRestaurants, setGourmetRestaurants] = useState([])
  const [gourmetLoading, setGourmetLoading] = useState(true)
  const [gourmetDeleting, setGourmetDeleting] = useState(null)
  const [selectedRestaurantGourmet, setSelectedRestaurantGourmet] = useState("")

  // Common
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Restaurant Selection Modal for Banner Advertising
  const [showRestaurantModal, setShowRestaurantModal] = useState(false)
  const [selectedBannerId, setSelectedBannerId] = useState(null)
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState([])
  const [restaurantSearchQuery, setRestaurantSearchQuery] = useState("")
  const [linkingRestaurants, setLinkingRestaurants] = useState(false)

  // Helper function to filter out token-related errors
  const setErrorSafely = (errorMessage) => {
    if (!errorMessage) {
      setError(null)
      return
    }
    const lowerMessage = errorMessage.toLowerCase()
    // Don't show token/unauthorized/auth errors
    if (lowerMessage.includes('token') ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('no token') ||
      lowerMessage.includes('authentication') ||
      lowerMessage.includes('session expired')) {
      setError(null)
    } else {
      setError(errorMessage)
    }
  }

  // Helper function to get admin token and add to request config
  const getAuthConfig = (additionalConfig = {}) => {
    return {
      ...additionalConfig,
    }
  }

  // Fetch data on mount (authentication is handled by ProtectedRoute)
  useEffect(() => {
    fetchBanners()
    fetchUnder250Banners()
    fetchAllRestaurants()
    fetchSettings()
  }, [])

  // Fetch Top 10 and Gourmet when Explore More tab is active
  useEffect(() => {
    if (activeTab === 'explore-more') {
      if (exploreMoreSubTab === 'top-10') {
        fetchTop10Restaurants()
      } else if (exploreMoreSubTab === 'gourmet') {
        fetchGourmetRestaurants()
      } else if (exploreMoreSubTab === 'icons') {
        fetchExploreMore()
      }
    }
  }, [activeTab, exploreMoreSubTab])

  // ==================== HERO BANNERS ====================
  const fetchBanners = async () => {
    try {
      setBannersLoading(true)
      setError(null)
      const response = await api.get('/hero-banners', getAuthConfig())
      if (response.data.success) {
        setBanners(response.data.data.banners || [])
      }
    } catch (err) {
      // Handle 401/404 errors gracefully - don't show error messages
      if (err.response?.status === 401) {
        // Token expired or invalid - will be handled by axios interceptor
        // Don't show error message or set banners
        setBanners([])
        setError(null)
      } else if (err.response?.status === 404) {
        // Endpoint doesn't exist, set empty array
        setBanners([])
        setError(null)
      } else {
        // Filter out token-related errors
        const errorMessage = err.response?.data?.message || 'Failed to load hero banners'
        setErrorSafely(errorMessage)
      }
    } finally {
      setBannersLoading(false)
    }
  }

  const handleBannerFileSelect = (e) => {
    const files = Array.from(e.target?.files || e.files || [])
    if (files.length === 0) return
    if (files.length > 5) {
      setError('You can upload a maximum of 5 images at once')
      return
    }
    uploadBanners(files)
  }

  const uploadBanners = async (files) => {
    try {
      setBannersUploading(true)
      setError(null)
      setSuccess(null)
      setBannersUploadProgress({ current: 0, total: files.length })

      // Use batch upload endpoint for multiple files
      const formData = new FormData()
      files.forEach((file) => {
        formData.append('images', file) // Field name must be 'images' for multiple upload
      })

      // Use getAuthConfig to ensure proper Authorization header
      // Don't set Content-Type - axios will set it automatically with boundary for FormData
      const config = getAuthConfig()

      // Debug: Log the config to verify Authorization header is set
      if (import.meta.env.DEV) {
        debugLog('[uploadBanners] Request config:', {
          hasAuthHeader: !!config.headers?.Authorization,
          authHeaderPrefix: config.headers?.Authorization?.substring(0, 20),
          hasFormData: formData instanceof FormData
        })
      }

      const response = await api.post('/hero-banners/multiple', formData, config)

      if (response.data.success) {
        const uploadedBanners = response.data.data?.banners || []
        const errors = response.data.data?.errors || []
        const successCount = uploadedBanners.length
        const failCount = errors.length

        await fetchBanners()
        if (bannersFileInputRef.current) bannersFileInputRef.current.value = ''

        if (failCount === 0) {
          setSuccess(`${successCount} hero banner${successCount > 1 ? 's' : ''} uploaded successfully!`)
          setTimeout(() => setSuccess(null), 5000)
        } else if (successCount > 0) {
          setSuccess(`${successCount} banner${successCount > 1 ? 's' : ''} uploaded, ${failCount} failed.`)
          setErrorSafely(errors.join(', '))
          setTimeout(() => { setSuccess(null); setError(null) }, 5000)
        } else {
          setErrorSafely(`Failed to upload banners. ${errors.join(', ')}`)
        }
      } else {
        setErrorSafely(response.data.message || 'Failed to upload banners')
      }

      setBannersUploadProgress({ current: 0, total: 0 })
    } catch (err) {
      debugError('Error uploading banners:', err)

      // Handle 401 unauthorized errors - don't show token-related errors
      if (err.response?.status === 401 || err.message === 'Authentication token not found') {
        // Don't show error - let axios interceptor handle logout
        setError(null)
      } else {
        // Filter out token-related errors
        const errorMessage = err.response?.data?.message || 'Failed to upload banners'
        setErrorSafely(errorMessage)
      }

      setBannersUploadProgress({ current: 0, total: 0 })
    } finally {
      setBannersUploading(false)
    }
  }

  const handleDeleteBanner = async (id) => {
    if (!window.confirm('Are you sure you want to delete this hero banner?')) return
    try {
      setBannersDeleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Hero banner deleted successfully!')
        await fetchBanners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to delete banner.')
    } finally {
      setBannersDeleting(null)
    }
  }

  const handleToggleBannerStatus = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Banner ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchBanners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update banner status.')
    }
  }

  const handleBannerOrderChange = async (id, direction) => {
    const banner = banners.find(b => b._id === id)
    if (!banner) return
    const newOrder = direction === 'up' ? banner.order - 1 : banner.order + 1
    const otherBanner = banners.find(b => b.order === newOrder && b._id !== id)
    if (!otherBanner && newOrder < 0) return
    try {
      setError(null)
      await api.patch(`/hero-banners/${id}/order`, { order: newOrder }, getAuthConfig())
      if (otherBanner) {
        await api.patch(`/hero-banners/${otherBanner._id}/order`, { order: banner.order }, getAuthConfig())
      }
      await fetchBanners()
    } catch (err) {
      setErrorSafely('Failed to update banner order.')
    }
  }

  // Handle restaurant selection for banner advertising
  const handleLinkRestaurants = async () => {
    if (!selectedBannerId) return

    try {
      setLinkingRestaurants(true)
      setError(null)
      setSuccess(null)

      const response = await api.patch(
        `/hero-banners/${selectedBannerId}/link-restaurants`,
        { restaurantIds: selectedRestaurantIds },
        getAuthConfig()
      )

      if (response.data.success) {
        setSuccess('Restaurants linked to banner successfully!')
        setShowRestaurantModal(false)
        setSelectedBannerId(null)
        setSelectedRestaurantIds([])
        setRestaurantSearchQuery("")
        await fetchBanners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to link restaurants to banner.')
    } finally {
      setLinkingRestaurants(false)
    }
  }

  const toggleRestaurantSelection = (restaurantId) => {
    setSelectedRestaurantIds(prev => {
      if (prev.includes(restaurantId)) {
        return prev.filter(id => id !== restaurantId)
      } else {
        return [...prev, restaurantId]
      }
    })
  }

  const filteredRestaurantsForModal = allRestaurants.filter(restaurant => {
    if (!restaurantSearchQuery.trim()) return true
    const query = restaurantSearchQuery.toLowerCase()
    return restaurant.name?.toLowerCase().includes(query) ||
      restaurant.restaurantId?.toLowerCase().includes(query)
  })

  const filteredRestaurantsForRecommended = useMemo(() => {
    const query = recommendedSearchQuery.trim().toLowerCase()
    return allRestaurants
      .filter((restaurant) => {
        if (!query) return true
        return restaurant.name?.toLowerCase().includes(query) ||
          restaurant.restaurantId?.toLowerCase().includes(query)
      })
      .slice(0, 80)
  }, [allRestaurants, recommendedSearchQuery])

  useEffect(() => {
    let cancelled = false
    api
      .get('/admin/zones', { ...getAuthConfig(), params: { page: 1, limit: 500, isActive: true } })
      .then((res) => {
        if (cancelled) return
        const list = res?.data?.data?.zones || res?.data?.zones || []
        setZonesForRecommended(Array.isArray(list) ? list : [])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Ids currently being edited, for whichever scope is selected.
  const activeRecommendedIds = recommendedZoneId
    ? (recommendedByZone[recommendedZoneId] || [])
    : (settings.recommendedRestaurantIds || [])

  useEffect(() => {
    if (!offerBannerFile) {
      setOfferBannerPreview("")
      return undefined
    }
    const url = URL.createObjectURL(offerBannerFile)
    setOfferBannerPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [offerBannerFile])

  const fetchOfferBanners = useCallback(async () => {
    try {
      setOfferBannersLoading(true)
      const res = await adminAPI.getOfferBanners()
      setOfferBanners(res?.data?.data?.banners || [])
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load offer banners")
    } finally {
      setOfferBannersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === "offer-banners") fetchOfferBanners()
  }, [activeTab, fetchOfferBanners])

  const uploadOfferBanner = async () => {
    if (!offerBannerFile) {
      setError("Please choose a banner image")
      return
    }
    try {
      setOfferBannerUploading(true)
      setError(null)
      const form = new FormData()
      form.append("image", offerBannerFile)
      form.append("title", offerBannerTitle)
      form.append("linkUrl", offerBannerLink)
      if (offerBannerZoneId) form.append("zoneId", offerBannerZoneId)
      await adminAPI.createOfferBanner(form)
      setSuccess("Offer banner added")
      setOfferBannerFile(null)
      setOfferBannerTitle("")
      setOfferBannerLink("")
      setOfferBannerZoneId("")
      await fetchOfferBanners()
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to upload offer banner")
    } finally {
      setOfferBannerUploading(false)
    }
  }

  const patchOfferBanner = async (id, payload) => {
    try {
      await adminAPI.updateOfferBanner(id, payload)
      await fetchOfferBanners()
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update offer banner")
    }
  }

  const removeOfferBanner = async (id) => {
    if (!window.confirm("Delete this offer banner? It will disappear from the app immediately.")) return
    try {
      await adminAPI.deleteOfferBanner(id)
      setSuccess("Offer banner deleted")
      await fetchOfferBanners()
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete offer banner")
    }
  }

  const recommendedRestaurantsSelected = useMemo(() => {
    const selectedIds = new Set(activeRecommendedIds)
    // Preserve the admin's chosen order: the home page renders them in this sequence.
    return activeRecommendedIds
      .map((id) => allRestaurants.find((r) => r._id === id))
      .filter(Boolean)
      .concat(allRestaurants.filter((r) => selectedIds.has(r._id) && !activeRecommendedIds.includes(r._id)))
  }, [allRestaurants, activeRecommendedIds])

  const toggleRecommendedRestaurant = (restaurantId) => {
    if (recommendedZoneId) {
      setRecommendedByZone((prev) => {
        const current = prev[recommendedZoneId] || []
        return {
          ...prev,
          [recommendedZoneId]: current.includes(restaurantId)
            ? current.filter((id) => id !== restaurantId)
            : [...current, restaurantId],
        }
      })
      return
    }
    setSettings((prev) => {
      const previousIds = Array.isArray(prev.recommendedRestaurantIds) ? prev.recommendedRestaurantIds : []
      const alreadySelected = previousIds.includes(restaurantId)
      return {
        ...prev,
        recommendedRestaurantIds: alreadySelected
          ? previousIds.filter((id) => id !== restaurantId)
          : [...previousIds, restaurantId],
      }
    })
  }

  // ==================== CATEGORIES ====================
  const fetchCategories = async () => {
    try {
      setCategoriesLoading(true)
      setError(null)
      const response = await api.get('/hero-banners/landing/categories', getAuthConfig())
      if (response.data.success) {
        setCategories(response.data.data.categories || [])
      }
    } catch (err) {
      // Silently handle 401/404 errors - endpoints may not exist yet
      if (err.response?.status === 401 || err.response?.status === 404) {
        setCategories([]) // Set empty array if endpoint doesn't exist
        setError(null) // Clear any previous error
      } else {
        // Filter out token-related errors
        const errorMessage = err.response?.data?.message || 'Failed to load categories'
        setErrorSafely(errorMessage)
      }
    } finally {
      setCategoriesLoading(false)
    }
  }

  const handleCategoryFileSelect = (e) => {
    const files = Array.from(e.target?.files || e.files || [])
    if (!files.length) return

    const newItems = files
      .filter((file) => {
        if (!file.type.startsWith('image/')) {
          setError('Only image files are allowed for categories')
          return false
        }
        if (file.size > 5 * 1024 * 1024) {
          setError('Each image must be smaller than 5MB')
          return false
        }
        return true
      })
      .map((file, index) => {
        const baseName = file.name.replace(/\.[^/.]+$/, '')
        const prettyName = baseName.replace(/[-_]+/g, ' ').trim()
        return {
          id: `${Date.now()}-${index}`,
          file,
          label: prettyName || '',
          previewUrl: URL.createObjectURL(file),
        }
      })

    if (!newItems.length) return

    setPendingCategories((prev) => [...prev, ...newItems])
    // Reset input so same files can be selected again if needed
    if (categoriesFileInputRef.current) {
      categoriesFileInputRef.current.value = ''
    }
  }

  const handlePendingCategoryLabelChange = (id, newLabel) => {
    setPendingCategories((prev) =>
      prev.map((item) => (item.id === id ? { ...item, label: newLabel } : item))
    )
  }

  const handleRemovePendingCategory = (id) => {
    setPendingCategories((prev) => {
      const toRemove = prev.find((item) => item.id === id)
      if (toRemove?.previewUrl) {
        URL.revokeObjectURL(toRemove.previewUrl)
      }
      return prev.filter((item) => item.id !== id)
    })
  }

  const handleUploadPendingCategories = async () => {
    if (!pendingCategories.length) {
      setError('Add at least one category image before uploading')
      return
    }

    try {
      setCategoriesUploading(true)
      setError(null)
      setSuccess(null)

      let successCount = 0
      let failCount = 0
      const errors = []

      for (let i = 0; i < pendingCategories.length; i++) {
        const item = pendingCategories[i]
        if (!item.label.trim()) {
          failCount++
          errors.push(`Item ${i + 1}: label is required`)
          continue
        }

        const formData = new FormData()
        formData.append('image', item.file)
        formData.append('label', item.label.trim())

        try {
          const response = await api.post('/hero-banners/landing/categories', formData, getAuthConfig({
            headers: { 'Content-Type': 'multipart/form-data' },
          }))
          if (response.data.success) {
            successCount++
          } else {
            failCount++
            errors.push(`Item ${i + 1}: upload failed`)
          }
        } catch (err) {
          failCount++
          errors.push(
            `Item ${i + 1}: ${err?.response?.data?.message || 'Failed to create category'}`
          )
        }
      }

      // Clean up previews
      pendingCategories.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl)
        }
      })
      setPendingCategories([])
      if (categoriesFileInputRef.current) categoriesFileInputRef.current.value = ''

      await fetchCategories()

      if (successCount > 0 && failCount === 0) {
        setSuccess(
          `${successCount} categor${successCount > 1 ? 'ies' : 'y'} created successfully!`
        )
        setTimeout(() => setSuccess(null), 4000)
      } else if (successCount > 0 && failCount > 0) {
        setSuccess(
          `${successCount} categor${successCount > 1 ? 'ies' : 'y'} created, ${failCount} failed.`
        )
        setError(errors.join(', '))
        setTimeout(() => {
          setSuccess(null)
          setError(null)
        }, 5000)
      } else {
        setErrorSafely(`Failed to create categories. ${errors.join(', ')}`)
      }
    } finally {
      setCategoriesUploading(false)
    }
  }

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return
    try {
      setCategoriesDeleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/landing/categories/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Category deleted successfully!')
        await fetchCategories()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to delete category.')
    } finally {
      setCategoriesDeleting(null)
    }
  }

  const handleToggleCategoryStatus = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/landing/categories/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Category ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchCategories()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update category status.')
    }
  }

  const handleCategoryOrderChange = async (id, direction) => {
    const category = categories.find(c => c._id === id)
    if (!category) return
    const newOrder = direction === 'up' ? category.order - 1 : category.order + 1
    const otherCategory = categories.find(c => c.order === newOrder && c._id !== id)
    if (!otherCategory && newOrder < 0) return
    try {
      setError(null)
      await api.patch(`/hero-banners/landing/categories/${id}/order`, { order: newOrder }, getAuthConfig())
      if (otherCategory) {
        await api.patch(`/hero-banners/landing/categories/${otherCategory._id}/order`, { order: category.order }, getAuthConfig())
      }
      await fetchCategories()
    } catch (err) {
      setErrorSafely('Failed to update category order.')
    }
  }

  // ==================== EXPLORE MORE ====================
  const fetchExploreMore = async () => {
    try {
      setExploreMoreLoading(true)
      setError(null)
      const response = await api.get('/hero-banners/landing/explore-more', getAuthConfig())
      if (response.data.success) {
        setExploreMore(response.data.data.items || [])
      }
    } catch (err) {
      // Silently handle 401/404 errors - endpoints may not exist yet
      if (err.response?.status === 401 || err.response?.status === 404) {
        setExploreMore([]) // Set empty array if endpoint doesn't exist
        setError(null) // Clear any previous error
      } else {
        // Filter out token-related errors
        const errorMessage = err.response?.data?.message || 'Failed to load explore more items'
        setErrorSafely(errorMessage)
      }
    } finally {
      setExploreMoreLoading(false)
    }
  }

  const handleExploreMoreFileSelect = async (e) => {
    const file = e.target?.files?.[0]
    if (!file) return
    if (!exploreMoreLabel.trim() || !exploreMoreLink.trim()) {
      setError('Please enter both label and link')
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size exceeds 5MB')
      return
    }

    try {
      setExploreMoreUploading(true)
      setError(null)
      setSuccess(null)
      const formData = new FormData()
      formData.append('image', file)
      formData.append('label', exploreMoreLabel.trim())
      formData.append('link', exploreMoreLink.trim())
      const response = await api.post('/hero-banners/landing/explore-more', formData, getAuthConfig({
        headers: { 'Content-Type': 'multipart/form-data' },
      }))
      if (response.data.success) {
        setSuccess('Explore more item created successfully!')
        setExploreMoreLabel("")
        setExploreMoreLink("")
        if (exploreMoreFileInputRef.current) exploreMoreFileInputRef.current.value = ''
        await fetchExploreMore()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to create explore more item.')
    } finally {
      setExploreMoreUploading(false)
    }
  }

  const handleDeleteExploreMore = async (id) => {
    if (!window.confirm('Are you sure you want to delete this explore more item?')) return
    try {
      setExploreMoreDeleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/landing/explore-more/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Explore more item deleted successfully!')
        await fetchExploreMore()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to delete explore more item.')
    } finally {
      setExploreMoreDeleting(null)
    }
  }

  const handleToggleExploreMoreStatus = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/landing/explore-more/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Explore more item ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchExploreMore()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update explore more status.')
    }
  }



  const handleIconUpdate = async (file, label, link, itemId) => {
    if (!file) return

    // Find existing item by label
    const existingItem = exploreMore.find(item => item.label?.toLowerCase() === label.toLowerCase())

    // Create FormData
    const formData = new FormData()
    formData.append('image', file)

    try {
      setExploreIconsUploading(prev => ({ ...prev, [itemId]: true }))
      let res;

      if (existingItem) {
        // Update existing
        res = await api.patch(`/hero-banners/landing/explore-more/${existingItem._id}`, formData, getAuthConfig({
          headers: { 'Content-Type': 'multipart/form-data' }
        }))
      } else {
        // Create new
        formData.append('label', label)
        formData.append('link', link)
        res = await api.post('/hero-banners/landing/explore-more', formData, getAuthConfig({
          headers: { 'Content-Type': 'multipart/form-data' }
        }))
      }

      if (res.data?.success) {
        setSuccess(`${label} icon updated successfully!`)
        setTimeout(() => setSuccess(null), 3000)
        await fetchExploreMore()
      }
    } catch (err) {
      debugError('Upload failed', err)
      setErrorSafely(err.response?.data?.message || 'Failed to update icon')
    } finally {
      setExploreIconsUploading(prev => ({ ...prev, [itemId]: false }))
    }
  }

  const handleExploreMoreOrderChange = async (id, direction) => {
    const item = exploreMore.find(e => e._id === id)
    if (!item) return
    const newOrder = direction === 'up' ? item.order - 1 : item.order + 1
    const otherItem = exploreMore.find(e => e.order === newOrder && e._id !== id)
    if (!otherItem && newOrder < 0) return
    try {
      setError(null)
      await api.patch(`/hero-banners/landing/explore-more/${id}/order`, { order: newOrder }, getAuthConfig())
      if (otherItem) {
        await api.patch(`/hero-banners/landing/explore-more/${otherItem._id}/order`, { order: item.order }, getAuthConfig())
      }
      await fetchExploreMore()
    } catch (err) {
      setErrorSafely('Failed to update explore more order.')
    }
  }

  // ==================== UNDER 250 BANNERS ====================
  const fetchUnder250Banners = async () => {
    try {
      setUnder250BannersLoading(true)
      setError(null)
      const response = await api.get('/hero-banners/under-250', getAuthConfig())
      if (response.data.success) {
        setUnder250Banners(response.data.data.banners || [])
      }
    } catch (err) {
      // Handle 401/404 errors gracefully - don't show error messages
      if (err.response?.status === 401) {
        setUnder250Banners([])
        setError(null)
      } else if (err.response?.status === 404) {
        setUnder250Banners([])
        setError(null)
      } else {
        const errorMessage = err.response?.data?.message || 'Failed to load under 250 banners'
        setErrorSafely(errorMessage)
      }
    } finally {
      setUnder250BannersLoading(false)
    }
  }

  const handleUnder250BannerFileSelect = (e) => {
    const files = Array.from(e.target?.files || e.files || [])
    if (files.length === 0) return
    if (files.length > 5) {
      setError('You can upload a maximum of 5 images at once')
      return
    }
    uploadUnder250Banners(files)
  }

  const uploadUnder250Banners = async (files) => {
    try {
      setUnder250BannersUploading(true)
      setError(null)
      setSuccess(null)
      setUnder250BannersUploadProgress({ current: 0, total: files.length })

      const formData = new FormData()
      files.forEach((file) => {
        formData.append('images', file)
      })

      const response = await api.post('/hero-banners/under-250/multiple', formData, getAuthConfig({
        headers: { 'Content-Type': 'multipart/form-data' },
      }))

      if (response.data.success) {
        setSuccess(`${response.data.data.banners?.length || files.length} under 250 banner(s) uploaded successfully!`)
        await fetchUnder250Banners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to upload under 250 banners'
      setErrorSafely(errorMessage)

      setUnder250BannersUploadProgress({ current: 0, total: 0 })
    } finally {
      setUnder250BannersUploading(false)
    }
  }

  const handleDeleteUnder250Banner = async (id) => {
    if (!window.confirm('Are you sure you want to delete this under 250 banner?')) return
    try {
      setUnder250BannersDeleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/under-250/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Under 250 banner deleted successfully!')
        await fetchUnder250Banners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to delete banner.')
    } finally {
      setUnder250BannersDeleting(null)
    }
  }

  const handleToggleUnder250BannerStatus = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/under-250/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Banner ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchUnder250Banners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update banner status.')
    }
  }

  const handleUnder250BannerOrderChange = async (id, direction) => {
    const banner = under250Banners.find(b => b._id === id)
    if (!banner) return
    const newOrder = direction === 'up' ? banner.order - 1 : banner.order + 1
    const otherBanner = under250Banners.find(b => b.order === newOrder && b._id !== id)
    if (!otherBanner && newOrder < 0) return
    try {
      setError(null)
      await api.patch(`/hero-banners/under-250/${id}/order`, { order: newOrder }, getAuthConfig())
      if (otherBanner) {
        await api.patch(`/hero-banners/under-250/${otherBanner._id}/order`, { order: banner.order }, getAuthConfig())
      }
      await fetchUnder250Banners()
    } catch (err) {
      setErrorSafely('Failed to update banner order.')
    }
  }

  // ==================== DINING BANNERS ====================
  const fetchDiningBanners = async () => {
    try {
      setDiningBannersLoading(true)
      setError(null)
      const response = await api.get('/hero-banners/dining', getAuthConfig())
      if (response.data.success) {
        setDiningBanners(response.data.data.banners || [])
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setDiningBanners([])
        setError(null)
      } else if (err.response?.status === 404) {
        setDiningBanners([])
        setError(null)
      } else {
        const errorMessage = err.response?.data?.message || 'Failed to load dining banners'
        setErrorSafely(errorMessage)
      }
    } finally {
      setDiningBannersLoading(false)
    }
  }

  const handleDiningBannerFileSelect = (e) => {
    const files = Array.from(e.target?.files || e.files || [])
    if (files.length === 0) return
    if (files.length > 5) {
      setError('You can upload a maximum of 5 images at once')
      return
    }
    uploadDiningBanners(files)
  }

  const uploadDiningBanners = async (files) => {
    try {
      setDiningBannersUploading(true)
      setError(null)
      setSuccess(null)
      setDiningBannersUploadProgress({ current: 0, total: files.length })

      const formData = new FormData()
      files.forEach((file) => {
        formData.append('images', file)
      })

      const response = await api.post('/hero-banners/dining/multiple', formData, getAuthConfig({
        headers: { 'Content-Type': 'multipart/form-data' },
      }))

      if (response.data.success) {
        setSuccess(`${response.data.data.banners?.length || files.length} dining banner(s) uploaded successfully!`)
        await fetchDiningBanners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to upload dining banners'
      setErrorSafely(errorMessage)
      setDiningBannersUploadProgress({ current: 0, total: 0 })
    } finally {
      setDiningBannersUploading(false)
    }
  }

  const handleDeleteDiningBanner = async (id) => {
    if (!window.confirm('Are you sure you want to delete this dining banner?')) return
    try {
      setDiningBannersDeleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/dining/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Dining banner deleted successfully!')
        await fetchDiningBanners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to delete banner.')
    } finally {
      setDiningBannersDeleting(null)
    }
  }

  const handleToggleDiningBannerStatus = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/dining/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Banner ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchDiningBanners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update banner status.')
    }
  }

  const handleDiningBannerOrderChange = async (id, direction) => {
    const banner = diningBanners.find(b => b._id === id)
    if (!banner) return
    const newOrder = direction === 'up' ? banner.order - 1 : banner.order + 1
    const otherBanner = diningBanners.find(b => b.order === newOrder && b._id !== id)
    if (!otherBanner && newOrder < 0) return
    try {
      setError(null)
      await api.patch(`/hero-banners/dining/${id}/order`, { order: newOrder }, getAuthConfig())
      if (otherBanner) {
        await api.patch(`/hero-banners/dining/${otherBanner._id}/order`, { order: banner.order }, getAuthConfig())
      }
      await fetchDiningBanners()
    } catch (err) {
      setErrorSafely('Failed to update banner order.')
    }
  }

  // ==================== SETTINGS ====================
  const fetchSettings = async () => {
    try {
      setSettingsLoading(true)
      setError(null)
      const response = await api.get('/hero-banners/landing/settings', getAuthConfig())
      if (response.data.success) {
        const nextSettings = response.data.data.settings || {}
        // Rebuild the per-zone map the editor works against.
        const byZone = {}
        for (const row of nextSettings.recommendedRestaurantsByZone || []) {
          if (row?.zoneId) byZone[String(row.zoneId)] = (row.restaurantIds || []).map(String)
        }
        setRecommendedByZone(byZone)
        setSettings({
          exploreMoreHeading: nextSettings.exploreMoreHeading || "Explore More",
          recommendedRestaurantIds: Array.isArray(nextSettings.recommendedRestaurantIds) ? nextSettings.recommendedRestaurantIds : []
        })
      }
    } catch (err) {
      // Silently handle 401/404 errors - endpoints may not exist yet, use default settings
      if (err.response?.status === 401 || err.response?.status === 404) {
        setSettings({ exploreMoreHeading: "Explore More", recommendedRestaurantIds: [] }) // Use default settings
        setError(null) // Clear any previous error
      } else {
        // Filter out token-related errors
        const errorMessage = err.response?.data?.message || 'Failed to load settings'
        setErrorSafely(errorMessage)
      }
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    try {
      setSettingsSaving(true)
      setError(null)
      setSuccess(null)
      const response = await api.patch('/hero-banners/landing/settings', {
        exploreMoreHeading: settings.exploreMoreHeading,
        recommendedRestaurantIds: Array.isArray(settings.recommendedRestaurantIds) ? settings.recommendedRestaurantIds : [],
        // Zones with an empty selection are omitted, which is how the server clears them.
        recommendedRestaurantsByZone: Object.entries(recommendedByZone)
          .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
          .map(([zoneId, restaurantIds]) => ({ zoneId, restaurantIds })),
      }, getAuthConfig())
      if (response.data.success) {
        const savedSettings = response.data.data?.settings || {}
        setSettings((prev) => ({
          ...prev,
          exploreMoreHeading: savedSettings.exploreMoreHeading || prev.exploreMoreHeading,
          recommendedRestaurantIds: Array.isArray(savedSettings.recommendedRestaurantIds)
            ? savedSettings.recommendedRestaurantIds
            : prev.recommendedRestaurantIds
        }))
        setSuccess('Settings saved successfully!')
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to save settings.')
    } finally {
      setSettingsSaving(false)
    }
  }

  // ==================== ALL RESTAURANTS ====================
  const fetchAllRestaurants = async () => {
    try {
      setRestaurantsLoading(true)
      setError(null)
      const response = await adminAPI.getRestaurants({ limit: 1000 })
      if (response.data && response.data.success && response.data.data) {
        const restaurants = response.data.data.restaurants || response.data.data || []
        setAllRestaurants(restaurants)
      }
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 404) {
        setAllRestaurants([])
        setError(null)
      } else {
        const errorMessage = err.response?.data?.message || 'Failed to load restaurants'
        setErrorSafely(errorMessage)
      }
    } finally {
      setRestaurantsLoading(false)
    }
  }

  // ==================== TOP 10 RESTAURANTS ====================
  const fetchTop10Restaurants = async () => {
    try {
      setTop10Loading(true)
      setError(null)
      const response = await api.get('/hero-banners/top-10', getAuthConfig())
      if (response.data.success) {
        setTop10Restaurants(response.data.data.restaurants || [])
      }
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 404) {
        setTop10Restaurants([])
        setError(null)
      } else {
        const errorMessage = err.response?.data?.message || 'Failed to load Top 10 restaurants'
        setErrorSafely(errorMessage)
      }
    } finally {
      setTop10Loading(false)
    }
  }

  const handleAddTop10Restaurant = async () => {
    if (!selectedRestaurantTop10 || !selectedRank) {
      setError('Please select a restaurant and rank')
      return
    }

    try {
      setError(null)
      setSuccess(null)
      const response = await api.post('/hero-banners/top-10', {
        restaurantId: selectedRestaurantTop10,
        rank: parseInt(selectedRank)
      }, getAuthConfig())
      if (response.data.success) {
        setSuccess('Restaurant added to Top 10 successfully!')
        setSelectedRestaurantTop10("")
        setSelectedRank(1)
        await fetchTop10Restaurants()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to add restaurant to Top 10.')
    }
  }

  const handleDeleteTop10Restaurant = async (id) => {
    if (!window.confirm('Are you sure you want to remove this restaurant from Top 10?')) return
    try {
      setTop10Deleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/top-10/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Restaurant removed from Top 10 successfully!')
        await fetchTop10Restaurants()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to remove restaurant.')
    } finally {
      setTop10Deleting(null)
    }
  }

  const handleTop10OrderChange = async (id, direction) => {
    const restaurant = top10Restaurants.find(r => r._id === id)
    if (!restaurant) return
    const newOrder = direction === 'up' ? restaurant.order - 1 : restaurant.order + 1
    const otherRestaurant = top10Restaurants.find(r => r.order === newOrder && r._id !== id)
    if (!otherRestaurant && newOrder < 0) return
    try {
      setError(null)
      await api.patch(`/hero-banners/top-10/${id}/order`, { order: newOrder }, getAuthConfig())
      if (otherRestaurant) {
        await api.patch(`/hero-banners/top-10/${otherRestaurant._id}/order`, { order: restaurant.order }, getAuthConfig())
      }
      await fetchTop10Restaurants()
    } catch (err) {
      setErrorSafely('Failed to update Top 10 restaurant order.')
    }
  }

  const handleTop10RankChange = async (id, newRank) => {
    try {
      setError(null)
      await api.patch(`/hero-banners/top-10/${id}/rank`, { rank: parseInt(newRank) }, getAuthConfig())
      await fetchTop10Restaurants()
    } catch (err) {
      setErrorSafely('Failed to update Top 10 restaurant rank.')
    }
  }

  const handleToggleTop10Status = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/top-10/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Restaurant ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchTop10Restaurants()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update restaurant status.')
    }
  }

  // ==================== GOURMET RESTAURANTS ====================
  const fetchGourmetRestaurants = async () => {
    try {
      setGourmetLoading(true)
      setError(null)
      const response = await api.get('/hero-banners/gourmet', getAuthConfig())
      if (response.data.success) {
        setGourmetRestaurants(response.data.data.restaurants || [])
      }
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 404) {
        setGourmetRestaurants([])
        setError(null)
      } else {
        const errorMessage = err.response?.data?.message || 'Failed to load Gourmet restaurants'
        setErrorSafely(errorMessage)
      }
    } finally {
      setGourmetLoading(false)
    }
  }

  const handleAddGourmetRestaurant = async () => {
    if (!selectedRestaurantGourmet) {
      setError('Please select a restaurant')
      return
    }

    try {
      setError(null)
      setSuccess(null)
      const response = await api.post('/hero-banners/gourmet', {
        restaurantId: selectedRestaurantGourmet
      }, getAuthConfig())
      if (response.data.success) {
        setSuccess('Restaurant added to Gourmet successfully!')
        setSelectedRestaurantGourmet("")
        await fetchGourmetRestaurants()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to add restaurant to Gourmet.')
    }
  }

  const handleDeleteGourmetRestaurant = async (id) => {
    if (!window.confirm('Are you sure you want to remove this restaurant from Gourmet?')) return
    try {
      setGourmetDeleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/gourmet/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Restaurant removed from Gourmet successfully!')
        await fetchGourmetRestaurants()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to remove restaurant.')
    } finally {
      setGourmetDeleting(null)
    }
  }

  const handleGourmetOrderChange = async (id, direction) => {
    const restaurant = gourmetRestaurants.find(r => r._id === id)
    if (!restaurant) return
    const newOrder = direction === 'up' ? restaurant.order - 1 : restaurant.order + 1
    const otherRestaurant = gourmetRestaurants.find(r => r.order === newOrder && r._id !== id)
    if (!otherRestaurant && newOrder < 0) return
    try {
      setError(null)
      await api.patch(`/hero-banners/gourmet/${id}/order`, { order: newOrder }, getAuthConfig())
      if (otherRestaurant) {
        await api.patch(`/hero-banners/gourmet/${otherRestaurant._id}/order`, { order: restaurant.order }, getAuthConfig())
      }
      await fetchGourmetRestaurants()
    } catch (err) {
      setErrorSafely('Failed to update Gourmet restaurant order.')
    }
  }

  const handleToggleGourmetStatus = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/gourmet/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Restaurant ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchGourmetRestaurants()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update restaurant status.')
    }
  }

  // ==================== RENDER ====================
  const tabs = [
    { id: 'banners', label: 'Hero Banners', icon: ImageIcon },
    { id: 'under-250', label: '250 Banner', icon: Tag },
    { id: 'offer-banners', label: 'Offer Banners', icon: Tag },
    { id: 'explore-more', label: 'Explore More', icon: Layout },
  ]

  const exploreMoreTabs = [
    { id: 'icons', label: 'Icons', icon: ImageIcon },
    { id: 'top-10', label: 'Top 10', icon: Trophy },
    { id: 'gourmet', label: 'Gourmet', icon: ChefHat },
  ]

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Page Title */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
              <Layout className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Landing Page Management</h1>
              <p className="text-sm text-slate-600 mt-1">Manage hero banners</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2 mb-6">
          <div className="flex gap-2 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${activeTab === tab.id
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {/* Hero Banners Tab */}
        {activeTab === 'banners' && (
          <>
            {/* Upload Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Upload New Banner(s)</h2>
              <div
                className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center bg-blue-50/30 cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50/50"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const files = Array.from(e.dataTransfer.files)
                  if (files.length > 0) handleBannerFileSelect({ files })
                }}
                onClick={() => bannersFileInputRef.current?.click()}
              >
                <input
                  ref={bannersFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleBannerFileSelect}
                  className="hidden"
                  disabled={bannersUploading}
                />
                {bannersUploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    <p className="text-blue-600 font-medium">
                      Uploading image {bannersUploadProgress.current} of {bannersUploadProgress.total}...
                    </p>
                    {bannersUploadProgress.total > 0 && (
                      <div className="w-full max-w-xs">
                        <div className="w-full bg-blue-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(bannersUploadProgress.current / bannersUploadProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-8 h-8 text-blue-600" />
                    <div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); bannersFileInputRef.current?.click(); }}
                        className="text-blue-600 font-medium hover:text-blue-700 underline"
                      >
                        Click to upload
                      </button>
                      <span className="text-slate-600"> or drag and drop</span>
                    </div>
                    <p className="text-xs text-slate-500">PNG, JPG, WEBP up to 5MB each (Max 5 images at once)</p>
                  </div>
                )}
              </div>
            </div>

            {/* Banners List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Banner List ({banners.length})</h2>
              {bannersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
              ) : banners.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <ImageIcon className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                  <p>No banners uploaded yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {banners.map((banner, index) => (
                    <div key={banner._id} className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                      <div className="relative aspect-video bg-slate-100">
                        <img src={banner.imageUrl} alt={`Hero Banner ${index + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute top-2 right-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${banner.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            {banner.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="absolute top-2 left-2">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">Order: {banner.order}</span>
                        </div>
                      </div>
                      <div className="p-4 bg-white">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleBannerOrderChange(banner._id, 'up')} disabled={index === 0} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                              <ArrowUp className="w-4 h-4 text-slate-600" />
                            </button>
                            <button onClick={() => handleBannerOrderChange(banner._id, 'down')} disabled={index === banners.length - 1} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                              <ArrowDown className="w-4 h-4 text-slate-600" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => {
                                setSelectedBannerId(banner._id)
                                setSelectedRestaurantIds(banner.linkedRestaurants?.map(r => r._id || r) || [])
                                setShowRestaurantModal(true)
                              }}
                              className="px-3 py-1.5 rounded text-sm font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 flex items-center gap-1"
                            >
                              <Megaphone className="w-4 h-4" />
                              Advertise
                            </button>
                            <button onClick={() => handleToggleBannerStatus(banner._id, banner.isActive)} className={`px-3 py-1.5 rounded text-sm font-medium ${banner.isActive ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                              {banner.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onClick={() => handleDeleteBanner(banner._id)} disabled={bannersDeleting === banner._id} className="p-1.5 rounded hover:bg-red-100 text-red-600 disabled:opacity-50">
                              {bannersDeleting === banner._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        {banner.linkedRestaurants && banner.linkedRestaurants.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <p className="text-xs text-slate-600 mb-1">Linked Restaurants ({banner.linkedRestaurants.length}):</p>
                            <div className="flex flex-wrap gap-1">
                              {banner.linkedRestaurants.slice(0, 3).map((restaurant) => (
                                <span key={restaurant._id || restaurant} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                                  {restaurant.name || 'Restaurant'}
                                </span>
                              ))}
                              {banner.linkedRestaurants.length > 3 && (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                                  +{banner.linkedRestaurants.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Under 250 Banner Tab */}
        {activeTab === 'under-250' && (
          <>
            {/* Upload Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Upload New Banner(s)</h2>
              <div
                className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center bg-blue-50/30 cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50/50"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const files = Array.from(e.dataTransfer.files)
                  if (files.length > 0) handleUnder250BannerFileSelect({ files })
                }}
                onClick={() => under250BannersFileInputRef.current?.click()}
              >
                <input
                  ref={under250BannersFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUnder250BannerFileSelect}
                  className="hidden"
                  disabled={under250BannersUploading}
                />
                {under250BannersUploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    <p className="text-blue-600 font-medium">
                      Uploading image {under250BannersUploadProgress.current} of {under250BannersUploadProgress.total}...
                    </p>
                    {under250BannersUploadProgress.total > 0 && (
                      <div className="w-full max-w-xs">
                        <div className="w-full bg-blue-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(under250BannersUploadProgress.current / under250BannersUploadProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-8 h-8 text-blue-600" />
                    <div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); under250BannersFileInputRef.current?.click(); }}
                        className="text-blue-600 font-medium hover:text-blue-700 underline"
                      >
                        Click to upload
                      </button>
                      <span className="text-slate-600"> or drag and drop</span>
                    </div>
                    <p className="text-xs text-slate-500">PNG, JPG, WEBP up to 5MB each (Max 5 images at once)</p>
                  </div>
                )}
              </div>
            </div>

            {/* Banners List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Banner List ({under250Banners.length})</h2>
              {under250BannersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
              ) : under250Banners.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Tag className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                  <p>No under 250 banners uploaded yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {under250Banners.map((banner, index) => (
                    <div key={banner._id} className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                      <div className="relative aspect-video bg-slate-100">
                        <img src={banner.imageUrl} alt={`Under 250 Banner ${index + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute top-2 right-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${banner.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            {banner.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="absolute top-2 left-2">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">Order: {banner.order}</span>
                        </div>
                      </div>
                      <div className="p-4 bg-white">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleUnder250BannerOrderChange(banner._id, 'up')} disabled={index === 0} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                              <ArrowUp className="w-4 h-4 text-slate-600" />
                            </button>
                            <button onClick={() => handleUnder250BannerOrderChange(banner._id, 'down')} disabled={index === under250Banners.length - 1} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                              <ArrowDown className="w-4 h-4 text-slate-600" />
                            </button>
                          </div>
                          <button onClick={() => handleToggleUnder250BannerStatus(banner._id, banner.isActive)} className={`px-3 py-1.5 rounded text-sm font-medium ${banner.isActive ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                            {banner.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button onClick={() => handleDeleteUnder250Banner(banner._id)} disabled={under250BannersDeleting === banner._id} className="p-1.5 rounded hover:bg-red-100 text-red-600 disabled:opacity-50">
                            {under250BannersDeleting === banner._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Explore More Tab */}
        {activeTab === 'offer-banners' && (
          <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)] items-start">

            {/* ---------- Create ---------- */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900">Add a banner</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Appears in the sliding row below Categories on the customer home page.
                </p>
              </div>

              <div className="p-5 space-y-4">
                {/* Preview-first picker, so it is obvious an image was chosen */}
                <div>
                  <label
                    htmlFor="offer-banner-file"
                    className="block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/40 transition-colors overflow-hidden"
                  >
                    {offerBannerPreview ? (
                      <div className="relative">
                        <img src={offerBannerPreview} alt="Selected banner preview" className="w-full h-32 object-cover" />
                        <span className="absolute bottom-2 right-2 text-[11px] bg-black/70 text-white px-2 py-0.5 rounded">
                          Click to change
                        </span>
                      </div>
                    ) : (
                      <div className="py-8 text-center">
                        <Upload className="w-6 h-6 mx-auto text-slate-400" />
                        <p className="mt-2 text-sm font-medium text-slate-700">Choose banner image</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Wide image, roughly 3:1</p>
                      </div>
                    )}
                  </label>
                  <input
                    id="offer-banner-file"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setOfferBannerFile(e.target.files?.[0] || null)}
                  />
                  {offerBannerFile && (
                    <button
                      type="button"
                      onClick={() => setOfferBannerFile(null)}
                      className="mt-2 text-xs text-slate-500 hover:text-red-600"
                    >
                      Remove image
                    </button>
                  )}
                </div>

                <div>
                  <Label htmlFor="offer-banner-title" className="text-xs font-semibold text-slate-700">
                    Name <span className="font-normal text-slate-400">(helps you find it later)</span>
                  </Label>
                  <Input
                    id="offer-banner-title"
                    value={offerBannerTitle}
                    onChange={(e) => setOfferBannerTitle(e.target.value)}
                    placeholder="Weekend 20% off"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="offer-banner-link" className="text-xs font-semibold text-slate-700">
                    On tap, open <span className="font-normal text-slate-400">(optional)</span>
                  </Label>
                  <Input
                    id="offer-banner-link"
                    value={offerBannerLink}
                    onChange={(e) => setOfferBannerLink(e.target.value)}
                    placeholder="/user/offers"
                    className="mt-1"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Leave blank and the banner is just an image.</p>
                </div>

                <div>
                  <Label htmlFor="offer-banner-zone" className="text-xs font-semibold text-slate-700">Show in</Label>
                  <select
                    id="offer-banner-zone"
                    value={offerBannerZoneId}
                    onChange={(e) => setOfferBannerZoneId(e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Every branch</option>
                    {zonesForRecommended.map((zone) => (
                      <option key={String(zone._id)} value={String(zone._id)}>
                        Only {zone.name || zone.zoneName || "Zone"}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  onClick={uploadOfferBanner}
                  disabled={offerBannerUploading || !offerBannerFile}
                  className="w-full h-11 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                >
                  {offerBannerUploading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" /> Save banner</>
                  )}
                </Button>
                {!offerBannerFile && (
                  <p className="text-[11px] text-center text-slate-400">Choose an image to enable saving</p>
                )}
              </div>
            </div>

            {/* ---------- List ---------- */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Live banners</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Customers see them in this order.</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {offerBanners.length}
                </span>
              </div>

              {offerBannersLoading ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  <Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" /> Loading...
                </div>
              ) : offerBanners.length === 0 ? (
                <div className="p-12 text-center">
                  <ImageIcon className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-700">No banners yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    The carousel stays hidden on the app until you add one.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {offerBanners.map((banner, i) => (
                    <div key={banner._id} className="flex items-center gap-4 p-4">
                      <span className="text-xs font-mono text-slate-400 w-5 shrink-0">{i + 1}</span>

                      <img
                        src={banner.imageUrl}
                        alt={banner.title || "Offer banner"}
                        className="h-14 w-24 shrink-0 object-cover rounded-md bg-slate-100 border border-slate-200"
                      />

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {banner.title || <span className="text-slate-400 font-normal">Untitled</span>}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                          <span className="text-xs text-slate-500 truncate max-w-[220px]">
                            {banner.linkUrl ? `Opens ${banner.linkUrl}` : "Not clickable"}
                          </span>
                          <span className="text-xs text-slate-500">
                            {banner.zoneName ? `Only ${banner.zoneName}` : "Every branch"}
                          </span>
                          <span
                            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                              banner.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {banner.isActive ? "Visible" : "Hidden"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => patchOfferBanner(banner._id, { order: Math.max(0, (banner.order ?? i) - 1) })}
                          disabled={i === 0}
                          title="Move up"
                          className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <ArrowUp className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          type="button"
                          onClick={() => patchOfferBanner(banner._id, { order: (banner.order ?? i) + 1 })}
                          disabled={i === offerBanners.length - 1}
                          title="Move down"
                          className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <ArrowDown className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          type="button"
                          onClick={() => patchOfferBanner(banner._id, { isActive: !banner.isActive })}
                          className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                        >
                          {banner.isActive ? "Hide" : "Show"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeOfferBanner(banner._id)}
                          title="Delete banner"
                          className="p-1.5 rounded hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'explore-more' && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-slate-900">Landing Settings</h2>
                <Button
                  onClick={handleSaveSettings}
                  disabled={settingsSaving || settingsLoading}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  {settingsSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save Settings
                </Button>
              </div>

              {settingsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <Label htmlFor="explore-more-heading">Explore More Heading</Label>
                    <Input
                      id="explore-more-heading"
                      value={settings.exploreMoreHeading || ""}
                      onChange={(e) => setSettings((prev) => ({ ...prev, exploreMoreHeading: e.target.value }))}
                      className="mt-2"
                      placeholder="Explore More"
                    />
                  </div>

                  <div>
                    <Label htmlFor="recommended-search">Recommended For You Restaurants</Label>
                    <p className="text-xs text-slate-500 mt-1 mb-2">
                      Choose restaurants to show below the filters on the user home page.
                      Pick a branch to curate that area on its own; customers only ever see
                      the list for the branch they are browsing.
                    </p>

                    <div className="mb-3">
                      <Label htmlFor="recommended-zone" className="text-xs">Applies to</Label>
                      <select
                        id="recommended-zone"
                        value={recommendedZoneId}
                        onChange={(e) => setRecommendedZoneId(e.target.value)}
                        className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">All zones (fallback)</option>
                        {zonesForRecommended.map((zone) => {
                          const count = (recommendedByZone[String(zone._id)] || []).length
                          return (
                            <option key={String(zone._id)} value={String(zone._id)}>
                              {(zone.name || zone.zoneName || "Zone")}{count ? ` - ${count} selected` : " - not set"}
                            </option>
                          )
                        })}
                      </select>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {recommendedZoneId
                          ? "Branches left unset fall back to the All zones list."
                          : "Used only for branches that have no list of their own."}
                      </p>
                    </div>

                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        id="recommended-search"
                        value={recommendedSearchQuery}
                        onChange={(e) => setRecommendedSearchQuery(e.target.value)}
                        placeholder="Search restaurants..."
                        className="pl-9"
                      />
                    </div>

                    {recommendedRestaurantsSelected.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {recommendedRestaurantsSelected.map((restaurant) => (
                          <button
                            key={restaurant._id}
                            type="button"
                            onClick={() => toggleRecommendedRestaurant(restaurant._id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs hover:bg-blue-100"
                          >
                            <span>{restaurant.name}</span>
                            <span className="text-blue-500">x</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {filteredRestaurantsForRecommended.length === 0 ? (
                        <div className="p-4 text-sm text-slate-500 text-center">No restaurants found</div>
                      ) : (
                        filteredRestaurantsForRecommended.map((restaurant) => {
                          const isChecked = (settings.recommendedRestaurantIds || []).includes(restaurant._id)
                          return (
                            <label
                              key={restaurant._id}
                              className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">{restaurant.name}</p>
                                <p className="text-xs text-slate-500 truncate">{restaurant.restaurantId || "No ID"}</p>
                              </div>
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => toggleRecommendedRestaurant(restaurant._id)}
                              />
                            </label>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sub-tabs for Explore More */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2 mb-6">
              <div className="flex gap-2 overflow-x-auto">
                {exploreMoreTabs.map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeTab === 'explore-more' && (tab.id === 'top-10' ? top10Restaurants.length > 0 : tab.id === 'gourmet' ? gourmetRestaurants.length > 0 : false)
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setExploreMoreSubTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${exploreMoreSubTab === tab.id
                        ? 'bg-blue-500 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>



            {/* Icons Tab Content */}
            {exploreMoreSubTab === 'icons' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-6">Manage Explore More Icons</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { id: 'offers', label: 'Offers', link: '/user/offers' },
                    { id: 'gourmet', label: 'Gourmet', link: '/user/gourmet' },
                    { id: 'top10', label: 'Top 10', link: '/user/top-10' },
                    { id: 'collection', label: 'Collections', link: '/user/profile/favorites' }
                  ].map((item) => {
                    // Find matching item from DB
                    const dbItem = exploreMore.find(i => i.label?.toLowerCase() === item.label.toLowerCase())

                    return (
                      <div key={item.id} className="border border-slate-200 rounded-lg p-4 flex flex-col items-center relative">
                        <span className="text-sm font-semibold text-slate-700 mb-3">{item.label}</span>

                        <div className="w-24 h-24 mb-4 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden relative group">
                          {dbItem?.imageUrl ? (
                            <img
                              src={dbItem.imageUrl}
                              alt={item.label}
                              className="w-full h-full object-contain p-2"
                            />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-slate-300" />
                          )}

                          {exploreIconsUploading[item.id] && (
                            <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
                              <Loader2 className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </div>

                        <div className="w-full mt-auto">
                          <input
                            type="file"
                            id={`file-${item.id}`}
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                handleIconUpdate(e.target.files[0], item.label, item.link, item.id)
                              }
                            }}
                            disabled={exploreIconsUploading[item.id]}
                          />
                          <label
                            htmlFor={`file-${item.id}`}
                            className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer ${exploreIconsUploading[item.id] ? 'opacity-50 pointer-events-none' : ''}`}
                          >
                            <Upload className="w-3 h-3" />
                            {dbItem ? 'Change Icon' : 'Upload Icon'}
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {exploreMoreSubTab === 'top-10' && (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Add Restaurant to Top 10</h2>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="restaurant-top10">Select Restaurant</Label>
                      <select
                        id="restaurant-top10"
                        value={selectedRestaurantTop10}
                        onChange={(e) => setSelectedRestaurantTop10(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={restaurantsLoading}
                      >
                        <option value="">Select a restaurant...</option>
                        {allRestaurants
                          .filter(r => !top10Restaurants.some(tr => tr.restaurant?._id === r._id))
                          .map((restaurant) => (
                            <option key={restaurant._id} value={restaurant._id}>
                              {restaurant.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="rank">Rank (1-10)</Label>
                      <Input
                        id="rank"
                        type="number"
                        min="1"
                        max="10"
                        value={selectedRank}
                        onChange={(e) => setSelectedRank(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <Button
                      onClick={handleAddTop10Restaurant}
                      disabled={!selectedRestaurantTop10 || !selectedRank}
                      className="bg-blue-500 hover:bg-blue-600 text-white"
                    >
                      Add to Top 10
                    </Button>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Top 10 Restaurants ({top10Restaurants.length})</h2>
                  {top10Loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                  ) : top10Restaurants.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      <Trophy className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                      <p>No restaurants added to Top 10 yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {top10Restaurants
                        .sort((a, b) => a.rank - b.rank)
                        .map((item, index) => (
                          <div key={item._id} className="border border-slate-200 rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                              <div className="w-12 h-12 rounded-lg bg-orange-500 text-white flex items-center justify-center font-bold text-lg">
                                {item.rank}
                              </div>
                              <div className="flex-1">
                                <h3 className="font-semibold text-slate-900">{item.restaurant?.name || 'N/A'}</h3>
                                <p className="text-xs text-slate-500">Rating: {item.restaurant?.rating || 0}★</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Label className="text-xs">Rank:</Label>
                                <select
                                  value={item.rank}
                                  onChange={(e) => handleTop10RankChange(item._id, e.target.value)}
                                  className="px-2 py-1 border border-slate-300 rounded text-sm"
                                >
                                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleTop10OrderChange(item._id, 'up')} disabled={index === 0} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                                  <ArrowUp className="w-4 h-4 text-slate-600" />
                                </button>
                                <button onClick={() => handleTop10OrderChange(item._id, 'down')} disabled={index === top10Restaurants.length - 1} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                                  <ArrowDown className="w-4 h-4 text-slate-600" />
                                </button>
                              </div>
                              <button onClick={() => handleToggleTop10Status(item._id, item.isActive)} className={`px-3 py-1.5 rounded text-sm font-medium ${item.isActive ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                {item.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                              <button onClick={() => handleDeleteTop10Restaurant(item._id)} disabled={top10Deleting === item._id} className="p-1.5 rounded hover:bg-red-100 text-red-600 disabled:opacity-50">
                                {top10Deleting === item._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Gourmet Tab Content */}
            {exploreMoreSubTab === 'gourmet' && (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Add Restaurant to Gourmet</h2>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="restaurant-gourmet">Select Restaurant</Label>
                      <select
                        id="restaurant-gourmet"
                        value={selectedRestaurantGourmet}
                        onChange={(e) => setSelectedRestaurantGourmet(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={restaurantsLoading}
                      >
                        <option value="">Select a restaurant...</option>
                        {allRestaurants
                          .filter(r => !gourmetRestaurants.some(gr => gr.restaurant?._id === r._id))
                          .map((restaurant) => (
                            <option key={restaurant._id} value={restaurant._id}>
                              {restaurant.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <Button
                      onClick={handleAddGourmetRestaurant}
                      disabled={!selectedRestaurantGourmet}
                      className="bg-blue-500 hover:bg-blue-600 text-white"
                    >
                      Add to Gourmet
                    </Button>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Gourmet Restaurants ({gourmetRestaurants.length})</h2>
                  {gourmetLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                  ) : gourmetRestaurants.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      <ChefHat className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                      <p>No restaurants added to Gourmet yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {gourmetRestaurants
                        .sort((a, b) => a.order - b.order)
                        .map((item, index) => {
                          // Get restaurant cover image with priority: coverImages > menuImages > profileImage
                          const coverImages = item.restaurant?.coverImages && item.restaurant.coverImages.length > 0
                            ? item.restaurant.coverImages.map(img => img.url || img).filter(Boolean)
                            : []

                          const menuImages = item.restaurant?.menuImages && item.restaurant.menuImages.length > 0
                            ? item.restaurant.menuImages.map(img => img.url || img).filter(Boolean)
                            : []

                          const restaurantImage = coverImages.length > 0
                            ? coverImages[0]
                            : (menuImages.length > 0
                              ? menuImages[0]
                              : (item.restaurant?.profileImage?.url || "https://via.placeholder.com/400"))

                          return (
                            <div key={item._id} className="border border-slate-200 rounded-lg overflow-hidden">
                              <div className="relative h-32 bg-slate-100">
                                <img src={restaurantImage} alt={item.restaurant?.name} className="w-full h-full object-cover" />
                                <div className="absolute top-1 right-1">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${item.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                    {item.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </div>
                              </div>
                              <div className="p-2">
                                <h3 className="font-semibold text-slate-900 mb-0.5 text-sm line-clamp-1">{item.restaurant?.name || 'N/A'}</h3>
                                <p className="text-[10px] text-slate-500 mb-2">Rating: {item.restaurant?.rating || 0}★</p>
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-0.5">
                                    <button onClick={() => handleGourmetOrderChange(item._id, 'up')} disabled={index === 0} className="p-1 rounded hover:bg-slate-100 disabled:opacity-50">
                                      <ArrowUp className="w-3 h-3 text-slate-600" />
                                    </button>
                                    <button onClick={() => handleGourmetOrderChange(item._id, 'down')} disabled={index === gourmetRestaurants.length - 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-50">
                                      <ArrowDown className="w-3 h-3 text-slate-600" />
                                    </button>
                                  </div>
                                  <button onClick={() => handleToggleGourmetStatus(item._id, item.isActive)} className={`px-2 py-1 rounded text-[10px] font-medium ${item.isActive ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                    {item.isActive ? 'Deactivate' : 'Activate'}
                                  </button>
                                  <button onClick={() => handleDeleteGourmetRestaurant(item._id)} disabled={gourmetDeleting === item._id} className="p-1 rounded hover:bg-red-100 text-red-600 disabled:opacity-50">
                                    {gourmetDeleting === item._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Restaurant Selection Modal */}
        <Dialog open={showRestaurantModal} onOpenChange={setShowRestaurantModal}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200">
              <DialogTitle className="text-2xl font-bold text-slate-900">Select Restaurants to Link with Banner</DialogTitle>
              <DialogDescription className="text-slate-600 mt-2">
                Select restaurants that will be linked to this banner. When users click on this banner, they will be redirected to the selected restaurants.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Search Bar and Selected Count */}
              <div className="px-6 pt-4 pb-3 space-y-3 bg-slate-50 border-b border-slate-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search restaurants by name or ID..."
                    value={restaurantSearchQuery}
                    onChange={(e) => setRestaurantSearchQuery(e.target.value)}
                    className="pl-10 h-11 bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                {selectedRestaurantIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
                      {selectedRestaurantIds.length} restaurant{selectedRestaurantIds.length > 1 ? 's' : ''} selected
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedRestaurantIds([])}
                      className="text-xs text-slate-600 hover:text-slate-900"
                    >
                      Clear selection
                    </Button>
                  </div>
                )}
              </div>

              {/* Restaurant List */}
              <div className="flex-1 overflow-y-auto bg-white">
                {restaurantsLoading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-3" />
                    <p className="text-slate-500">Loading restaurants...</p>
                  </div>
                ) : filteredRestaurantsForModal.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <ImageIcon className="w-16 h-16 text-slate-300 mb-4" />
                    <p className="text-slate-600 font-medium mb-1">No restaurants found</p>
                    <p className="text-sm text-slate-500">
                      {restaurantSearchQuery ? 'Try a different search term' : 'No restaurants available'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredRestaurantsForModal.map((restaurant) => {
                      const isSelected = selectedRestaurantIds.includes(restaurant._id)
                      const profileImageUrl = restaurant.profileImage?.url || restaurant.profileImage || null

                      return (
                        <div
                          key={restaurant._id}
                          className={`px-6 py-4 transition-all cursor-pointer ${isSelected
                            ? 'bg-blue-50 border-l-4 border-l-blue-500'
                            : 'hover:bg-slate-50'
                            }`}
                          onClick={() => toggleRestaurantSelection(restaurant._id)}
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex-shrink-0">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleRestaurantSelection(restaurant._id)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-5 h-5"
                              />
                            </div>

                            {/* Restaurant Image */}
                            <div className="flex-shrink-0">
                              {profileImageUrl ? (
                                <img
                                  src={profileImageUrl}
                                  alt={restaurant.name}
                                  className="w-16 h-16 rounded-xl object-cover border-2 border-slate-200"
                                  onError={(e) => {
                                    e.target.style.display = 'none'
                                    e.target.nextSibling.style.display = 'flex'
                                  }}
                                />
                              ) : null}
                              <div
                                className={`w-16 h-16 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg ${profileImageUrl ? 'hidden' : 'flex'
                                  }`}
                              >
                                {restaurant.name?.charAt(0)?.toUpperCase() || 'R'}
                              </div>
                            </div>

                            {/* Restaurant Info */}
                            <div className="flex-1 min-w-0">
                              <h3 className={`font-semibold text-base mb-1 ${isSelected ? 'text-blue-900' : 'text-slate-900'
                                }`}>
                                {restaurant.name || 'Unnamed Restaurant'}
                              </h3>
                              <p className="text-sm text-slate-500 truncate">
                                ID: {restaurant.restaurantId || restaurant._id}
                              </p>
                              {restaurant.rating && (
                                <div className="flex items-center gap-1 mt-1">
                                  <span className="text-xs text-slate-400">★</span>
                                  <span className="text-xs text-slate-600">{restaurant.rating}</span>
                                </div>
                              )}
                            </div>

                            {/* Selected Indicator */}
                            {isSelected && (
                              <div className="flex-shrink-0">
                                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                                  <CheckCircle2 className="w-5 h-5 text-white" />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
                <div className="text-sm text-slate-600">
                  {filteredRestaurantsForModal.length} restaurant{filteredRestaurantsForModal.length !== 1 ? 's' : ''} available
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRestaurantModal(false)
                      setSelectedBannerId(null)
                      setSelectedRestaurantIds([])
                      setRestaurantSearchQuery("")
                    }}
                    className="px-6"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleLinkRestaurants}
                    disabled={linkingRestaurants || selectedRestaurantIds.length === 0}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 min-w-[140px]"
                  >
                    {linkingRestaurants ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Linking...
                      </>
                    ) : (
                      <>
                        <Megaphone className="w-4 h-4 mr-2" />
                        Link {selectedRestaurantIds.length > 0 ? `(${selectedRestaurantIds.length})` : ''} Restaurant{selectedRestaurantIds.length !== 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div >
    </div >
  )
}



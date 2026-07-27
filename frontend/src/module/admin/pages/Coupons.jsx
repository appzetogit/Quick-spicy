import { useState, useEffect, useMemo, useCallback } from "react"
import { Search } from "lucide-react"
import { adminAPI } from "@/lib/api"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function Coupons() {
  const today = new Date().toISOString().split("T")[0]
  const [searchQuery, setSearchQuery] = useState("")
  const [restaurantSearch, setRestaurantSearch] = useState("")
  const [showRestaurantSuggestions, setShowRestaurantSuggestions] = useState(false)
  const [offers, setOffers] = useState([])
  const [offersEnabled, setOffersEnabled] = useState(true)
  const [switchBusy, setSwitchBusy] = useState(false)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 })
  const OFFERS_PER_PAGE = 50
  const [restaurants, setRestaurants] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [submitSuccess, setSubmitSuccess] = useState("")
  const [updatingCartVisibility, setUpdatingCartVisibility] = useState({})
  const [formData, setFormData] = useState({
    couponCode: "",
    discountType: "percentage",
    discountValue: "",
    minOrderValue: "",
    maxDiscount: "",
    customerScope: "all",
    restaurantScope: "all",
    restaurantIds: [],
    zoneId: "",
    endDate: "",
    productScope: "all",
    selectedProducts: [],
  })

  const [availableProducts, setAvailableProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [productSearch, setProductSearch] = useState("")
  const [showProductSuggestions, setShowProductSuggestions] = useState(false)

  const fetchOffers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      // Search goes to the server alongside the page: filtering only the rows already
      // fetched would search a single page instead of the whole coupon list.
      const response = await adminAPI.getAllOffers({
        page,
        limit: OFFERS_PER_PAGE,
        ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
      })

      if (response?.data?.success) {
        setOffers(response.data.data.offers || [])
        setPagination(
          response.data.data.pagination || { page, limit: OFFERS_PER_PAGE, total: 0, pages: 1 },
        )
      } else {
        setError("Failed to fetch offers")
      }
    } catch (err) {
      debugError("Error fetching offers:", err)
      setError(err?.response?.data?.message || "Failed to fetch offers")
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery])

  // Debounced so typing a coupon code does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(fetchOffers, searchQuery.trim() ? 350 : 0)
    return () => clearTimeout(timer)
  }, [fetchOffers, searchQuery])

  // A new search restarts at page 1; staying on page 7 of the old result set would show
  // an empty table for a search that actually matched.
  useEffect(() => {
    setPage(1)
  }, [searchQuery])

  useEffect(() => {
    adminAPI
      .getOffersSwitch()
      .then((res) => setOffersEnabled(res?.data?.data?.offersEnabled !== false))
      .catch(() => {})
  }, [])

  const toggleAllOffers = async () => {
    const next = !offersEnabled
    if (
      !next &&
      !window.confirm(
        "Turn OFF all offers?\n\nEvery coupon stops working for customers immediately, across the whole platform. Individual offer settings are preserved, so turning this back ON restores exactly what was live before.",
      )
    ) {
      return
    }

    setSwitchBusy(true)
    // Optimistic: the switch is the whole point of the control, so it should feel instant.
    setOffersEnabled(next)
    try {
      const res = await adminAPI.updateOffersSwitch(next)
      setOffersEnabled(res?.data?.data?.offersEnabled !== false)
    } catch (err) {
      setOffersEnabled(!next) // roll back so the UI never claims a state the server rejected
      setError(err?.response?.data?.message || "Failed to update the offers switch")
    } finally {
      setSwitchBusy(false)
    }
  }

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const response = await adminAPI.getZones({ page: 1, limit: 500, isActive: true, summary: "dropdown" })
        if (response?.data?.success) {
          setZones(response.data.data.zones || [])
        }
      } catch (err) {
        debugError("Error fetching zones:", err)
      }
    }

    fetchZones()
  }, [])

  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        const response = await adminAPI.getRestaurants({ page: 1, limit: 200 })
        if (response?.data?.success) {
          setRestaurants(response.data.data.restaurants || [])
        }
      } catch (err) {
        debugError("Error fetching restaurants:", err)
      }
    }

    fetchRestaurants()
  }, [])

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (submitError) {
      setSubmitError("")
    }
    if (submitSuccess) {
      setSubmitSuccess("")
    }
  }

  const getRestaurantLabel = useCallback((restaurant) => {
    return (
      restaurant?.name ||
      restaurant?.restaurantName ||
      restaurant?.restaurantDetails?.restaurantName ||
      restaurant?.businessName ||
      "Unnamed Restaurant"
    )
  }, [])

  const resetForm = () => {
    setFormData({
      couponCode: "",
      discountType: "percentage",
      discountValue: "",
      minOrderValue: "",
      maxDiscount: "",
      customerScope: "all",
      restaurantScope: "all",
      restaurantIds: [],
      zoneId: "",
      endDate: "",
      productScope: "all",
      selectedProducts: [],
    })
    setRestaurantSearch("")
    setShowRestaurantSuggestions(false)
    setProductSearch("")
    setShowProductSuggestions(false)
  }

  useEffect(() => {
    if (formData.restaurantScope === "selected" && formData.restaurantIds.length === 1) {
      const fetchProducts = async () => {
        try {
          setLoadingProducts(true)
          const restaurantId = formData.restaurantIds[0]
          const response = await adminAPI.getRestaurantMenuById(restaurantId)
          if (response?.data?.success && response.data.data?.menu) {
            const menu = response.data.data.menu
            const items = []
            menu.sections?.forEach(section => {
              section.items?.forEach(item => {
                items.push({ id: item.id, name: item.name, price: item.price })
              })
              section.subsections?.forEach(sub => {
                sub.items?.forEach(item => {
                  items.push({ id: item.id, name: item.name, price: item.price })
                })
              })
            })
            setAvailableProducts(items)
          } else {
            setAvailableProducts([])
          }
        } catch (err) {
          debugError("Error fetching restaurant menu for coupon:", err)
          setAvailableProducts([])
        } finally {
          setLoadingProducts(false)
        }
      }
      fetchProducts()
    } else {
      setAvailableProducts([])
      setFormData(prev => ({
        ...prev,
        productScope: "all",
        selectedProducts: []
      }))
    }
  }, [formData.restaurantIds, formData.restaurantScope])

  const filteredRestaurants = useMemo(() => {
    if (!formData.zoneId) return restaurants
    return restaurants.filter((restaurant) => {
      const restaurantZoneId = restaurant?.zoneId?._id
        || restaurant?.zoneId
        || restaurant?.restaurantZoneId
        || ""
      return String(restaurantZoneId) === String(formData.zoneId)
    })
  }, [formData.zoneId, restaurants])

  const restaurantSuggestions = useMemo(() => {
    const query = restaurantSearch.trim().toLowerCase()

    if (!query) {
      return filteredRestaurants.slice(0, 20)
    }

    return filteredRestaurants.filter((restaurant) => {
      const restaurantName = getRestaurantLabel(restaurant).toLowerCase()
      const phone = String(restaurant?.phone || restaurant?.mobile || "")
      const email = String(restaurant?.email || "")

      return (
        restaurantName.includes(query) ||
        phone.includes(query) ||
        email.toLowerCase().includes(query)
      )
    }).slice(0, 20)
  }, [filteredRestaurants, getRestaurantLabel, restaurantSearch])

  useEffect(() => {
    if (formData.restaurantScope !== "selected") {
      setRestaurantSearch("")
      setShowRestaurantSuggestions(false)
    }
  }, [formData.restaurantScope])

  const handleCreateCoupon = async (e) => {
    e.preventDefault()
    setSubmitError("")
    setSubmitSuccess("")

    if (!formData.couponCode.trim()) {
      setSubmitError("Coupon code is required")
      return
    }

    const parsedDiscountValue = Number(formData.discountValue)
    if (!Number.isFinite(parsedDiscountValue) || parsedDiscountValue <= 0) {
      setSubmitError("Discount value must be greater than 0")
      return
    }

    const hasMinOrderValue = String(formData.minOrderValue).trim() !== ""
    const parsedMinOrderValue = hasMinOrderValue ? Number(formData.minOrderValue) : 0
    if (!Number.isFinite(parsedMinOrderValue) || parsedMinOrderValue < 0) {
      setSubmitError("Minimum order value cannot be negative")
      return
    }

    const hasMaxDiscountValue = String(formData.maxDiscount).trim() !== ""
    const parsedMaxDiscount = hasMaxDiscountValue ? Number(formData.maxDiscount) : null
    if (hasMaxDiscountValue && (!Number.isFinite(parsedMaxDiscount) || parsedMaxDiscount <= 0)) {
      setSubmitError("Max discount must be greater than 0")
      return
    }

    if (formData.restaurantScope === "selected" && formData.restaurantIds.length === 0) {
      setSubmitError("Please select at least one restaurant")
      return
    }

    if (
      formData.restaurantScope === "selected" &&
      formData.zoneId &&
      formData.restaurantIds.some(
        (restaurantId) =>
          !filteredRestaurants.some((restaurant) => String(restaurant._id) === String(restaurantId)),
      )
    ) {
      setSubmitError("One or more selected restaurants are not available in the chosen zone")
      return
    }

    if (
      formData.restaurantScope === "selected" &&
      formData.restaurantIds.length === 1 &&
      formData.productScope === "selected" &&
      formData.selectedProducts.length === 0
    ) {
      setSubmitError("Please select at least one product")
      return
    }

    if (formData.endDate && formData.endDate < today) {
      setSubmitError("Expiry date cannot be in the past")
      return
    }

    try {
      setIsSubmitting(true)
      await adminAPI.createAdminOffer({
        couponCode: formData.couponCode.trim(),
        discountType: formData.discountType,
        discountValue: parsedDiscountValue,
        minOrderValue: parsedMinOrderValue,
        maxDiscount: formData.discountType === "percentage" ? parsedMaxDiscount : undefined,
        customerScope: formData.customerScope,
        restaurantScope: formData.restaurantScope,
        restaurantIds: formData.restaurantScope === "selected" ? formData.restaurantIds : undefined,
        zoneId: formData.zoneId || undefined,
        endDate: formData.endDate || undefined,
        productScope: formData.restaurantScope === "selected" && formData.restaurantIds.length === 1 ? formData.productScope : "all",
        selectedProducts: formData.restaurantScope === "selected" && formData.restaurantIds.length === 1 && formData.productScope === "selected" ? formData.selectedProducts : undefined,
      })

      setSubmitSuccess("Coupon created successfully")
      resetForm()
      await fetchOffers()
    } catch (err) {
      debugError("Error creating coupon:", err)
      setSubmitError(err?.response?.data?.message || "Failed to create coupon")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleShowInCart = async (offerId, itemId, currentValue) => {
    const key = `${offerId}-${itemId}`
    try {
      setUpdatingCartVisibility((prev) => ({ ...prev, [key]: true }))
      const nextValue = !currentValue
      await adminAPI.updateAdminOfferCartVisibility(offerId, itemId, nextValue)
      setOffers((prev) =>
        prev.map((offer) =>
          offer.offerId === offerId && offer.dishId === itemId
            ? { ...offer, showInCart: nextValue }
            : offer,
        ),
      )
    } catch (err) {
      debugError("Error updating cart visibility:", err)
    } finally {
      setUpdatingCartVisibility((prev) => ({ ...prev, [key]: false }))
    }
  }

  // The server already applied the search across every offer, so filtering again here would
  // only narrow the current page and hide matches that live on other pages.
  const filteredOffers = offers

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-900">Restaurant Offers & Coupons</h1>
            <button
              type="button"
              onClick={() => {
                setIsAddOpen((prev) => !prev)
                setSubmitError("")
                setSubmitSuccess("")
              }}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              {isAddOpen ? "Close" : "Add Coupon"}
            </button>
          </div>

          {isAddOpen && (
            <form
              onSubmit={handleCreateCoupon}
              className="border border-slate-200 rounded-xl p-4 mb-5 bg-slate-50"
            >
              <h3 className="text-base font-semibold text-slate-900 mb-3">Create Coupon</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Coupon Code</label>
                  <input
                    type="text"
                    value={formData.couponCode}
                    onChange={(e) => handleFormChange("couponCode", e.target.value)}
                    placeholder="e.g. NEWUSER50"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Discount Type</label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => handleFormChange("discountType", e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="percentage">Percentage</option>
                    <option value="flat-price">Flat Amount</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {formData.discountType === "percentage" ? "Discount (%)" : "Discount Amount"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={formData.discountValue}
                    onChange={(e) => handleFormChange("discountValue", e.target.value)}
                    placeholder={formData.discountType === "percentage" ? "e.g. 20" : "e.g. 100"}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Max Discount {formData.discountType === "percentage" ? "(Optional)" : "(Ignored for flat)"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={formData.maxDiscount}
                    onChange={(e) => handleFormChange("maxDiscount", e.target.value)}
                    placeholder={formData.discountType === "percentage" ? "e.g. 150" : "Not needed for flat"}
                    disabled={formData.discountType !== "percentage"}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Minimum Order Value
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.minOrderValue}
                    onChange={(e) => handleFormChange("minOrderValue", e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Customer Scope</label>
                  <select
                    value={formData.customerScope}
                    onChange={(e) => handleFormChange("customerScope", e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Users</option>
                    <option value="first-time">First-time Users</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Restaurant Scope</label>
                  <select
                    value={formData.restaurantScope}
                    onChange={(e) => {
                      const nextScope = e.target.value
                      setFormData((prev) => ({
                        ...prev,
                        restaurantScope: nextScope,
                        restaurantIds: nextScope === "selected" ? prev.restaurantIds : [],
                      }))
                      if (nextScope !== "selected") {
                        setRestaurantSearch("")
                        setShowRestaurantSuggestions(false)
                      }
                      if (submitError) setSubmitError("")
                      if (submitSuccess) setSubmitSuccess("")
                    }}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Restaurants</option>
                    <option value="selected">Selected Restaurant</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Zone (Optional)</label>
                  <select
                    value={formData.zoneId}
                    onChange={(e) => {
                      const nextZoneId = e.target.value
                      setFormData((prev) => ({
                        ...prev,
                        zoneId: nextZoneId,
                        restaurantIds:
                          prev.restaurantScope === "selected" &&
                          nextZoneId &&
                          prev.restaurantIds.length > 0
                            ? prev.restaurantIds.filter((selectedRestaurantId) =>
                                restaurants.some((restaurant) => {
                                  const restaurantZoneId = restaurant?.zoneId?._id
                                    || restaurant?.zoneId
                                    || restaurant?.restaurantZoneId
                                    || ""
                                  return String(restaurant._id) === String(selectedRestaurantId)
                                    && String(restaurantZoneId) === String(nextZoneId)
                                }),
                              )
                            : prev.restaurantIds,
                      }))
                      if (formData.restaurantScope === "selected") {
                        setRestaurantSearch("")
                        setShowRestaurantSuggestions(false)
                      }
                      if (submitError) setSubmitError("")
                      if (submitSuccess) setSubmitSuccess("")
                    }}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Zones</option>
                    {zones.map((zone) => (
                      <option key={zone._id} value={zone._id}>
                        {zone.name || zone.zoneName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Expiry Date (Optional)</label>
                  <input
                    type="date"
                    min={today}
                    value={formData.endDate}
                    onChange={(e) => handleFormChange("endDate", e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {formData.restaurantScope === "selected" && (
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Select Restaurant</label>
                    {formData.restaurantIds.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {formData.restaurantIds.map((restaurantId) => {
                          const restaurant = restaurants.find(
                            (item) => String(item._id) === String(restaurantId),
                          )
                          if (!restaurant) return null

                          return (
                            <span
                              key={restaurantId}
                              className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                            >
                              {getRestaurantLabel(restaurant)}
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    restaurantIds: prev.restaurantIds.filter(
                                      (selectedId) => String(selectedId) !== String(restaurantId),
                                    ),
                                  }))
                                }}
                                className="text-blue-700 hover:text-blue-900"
                              >
                                ×
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                    <div className="relative">
                      <input
                        type="text"
                        value={restaurantSearch}
                        onChange={(e) => {
                          const value = e.target.value
                          setRestaurantSearch(value)
                          setShowRestaurantSuggestions(true)
                          if (submitError) setSubmitError("")
                          if (submitSuccess) setSubmitSuccess("")
                        }}
                        onFocus={() => setShowRestaurantSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowRestaurantSuggestions(false), 200)}
                        placeholder="Search restaurant by name, phone, or email"
                        className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />

                      {showRestaurantSuggestions && (
                        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                          {restaurantSuggestions.length > 0 ? (
                            restaurantSuggestions.map((restaurant) => (
                              <button
                                key={restaurant._id}
                                type="button"
                                onClick={() => {
                                  const alreadySelected = formData.restaurantIds.some(
                                    (selectedId) => String(selectedId) === String(restaurant._id),
                                  )
                                  if (alreadySelected) {
                                    setShowRestaurantSuggestions(false)
                                    setRestaurantSearch("")
                                    return
                                  }

                                  setFormData((prev) => ({
                                    ...prev,
                                    restaurantIds: [...prev.restaurantIds, restaurant._id],
                                  }))
                                  setRestaurantSearch("")
                                  setShowRestaurantSuggestions(true)
                                  if (submitError) setSubmitError("")
                                  if (submitSuccess) setSubmitSuccess("")
                                }}
                                className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                              >
                                <div className="text-sm font-medium text-slate-900">
                                  {getRestaurantLabel(restaurant)}
                                </div>
                                {(restaurant?.phone || restaurant?.email) && (
                                  <div className="text-xs text-slate-500">
                                    {[restaurant?.phone || restaurant?.mobile, restaurant?.email].filter(Boolean).join(" • ")}
                                  </div>
                                )}
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-sm text-slate-500">
                              No restaurants found
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {formData.restaurantIds.length > 0 && (
                      <p className="mt-1 text-xs text-green-600">
                        {formData.restaurantIds.length} restaurant{formData.restaurantIds.length > 1 ? "s" : ""} selected
                      </p>
                    )}

                    {/* Product lists belong to a single restaurant's menu, so limiting an
                        offer to specific products only makes sense for one restaurant. Say
                        so, rather than silently hiding the control and defaulting to all
                        products, which reads as the feature not existing. */}
                    {formData.restaurantIds.length !== 1 && (
                      <p className="mt-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        {formData.restaurantIds.length === 0
                          ? "Select one restaurant to limit this offer to specific products."
                          : "This offer will apply to all products. To pick specific products, select exactly one restaurant."}
                      </p>
                    )}

                    {formData.restaurantIds.length === 1 && (
                      <div className="mt-3 border-t border-slate-200 pt-3">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Offer Scope</label>
                        <select
                          value={formData.productScope}
                          onChange={(e) => {
                            const nextProductScope = e.target.value
                            setFormData((prev) => ({
                              ...prev,
                              productScope: nextProductScope,
                              selectedProducts: [],
                            }))
                            setProductSearch("")
                            setShowProductSuggestions(false)
                            if (submitError) setSubmitError("")
                            if (submitSuccess) setSubmitSuccess("")
                          }}
                          className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="all">All Products (Default)</option>
                          <option value="selected">Selected Products</option>
                        </select>

                        {formData.productScope === "selected" && (
                          <div className="mt-3">
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Select Products</label>
                            {formData.selectedProducts.length > 0 && (
                              <div className="mb-2 flex flex-wrap gap-2">
                                {formData.selectedProducts.map((prodId) => {
                                  const product = availableProducts.find((p) => String(p.id) === String(prodId))
                                  if (!product) return null

                                  return (
                                    <span
                                      key={prodId}
                                      className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                                    >
                                      {product.name} (₹{product.price})
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setFormData((prev) => ({
                                            ...prev,
                                            selectedProducts: prev.selectedProducts.filter((id) => String(id) !== String(prodId)),
                                          }))
                                        }}
                                        className="text-blue-700 hover:text-blue-900"
                                      >
                                        ×
                                      </button>
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                            <div className="relative">
                              <input
                                type="text"
                                value={productSearch}
                                onChange={(e) => {
                                  setProductSearch(e.target.value)
                                  setShowProductSuggestions(true)
                                }}
                                onFocus={() => setShowProductSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowProductSuggestions(false), 200)}
                                placeholder={loadingProducts ? "Loading products..." : "Search products by name"}
                                disabled={loadingProducts}
                                className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />

                              {showProductSuggestions && !loadingProducts && (
                                <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                  {availableProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).length > 0 ? (
                                    availableProducts
                                      .filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
                                      .slice(0, 20)
                                      .map((product) => (
                                        <button
                                          key={product.id}
                                          type="button"
                                          onClick={() => {
                                            const alreadySelected = formData.selectedProducts.includes(product.id)
                                            if (alreadySelected) {
                                              setShowProductSuggestions(false)
                                              setProductSearch("")
                                              return
                                            }

                                            setFormData((prev) => ({
                                              ...prev,
                                              selectedProducts: [...prev.selectedProducts, product.id],
                                            }))
                                            setProductSearch("")
                                            setShowProductSuggestions(true)
                                          }}
                                          className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 text-sm font-medium text-slate-900"
                                        >
                                          {product.name} (₹{product.price})
                                        </button>
                                      ))
                                  ) : (
                                    <div className="px-3 py-2 text-sm text-slate-500">
                                      No products found
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {formData.restaurantIds.length > 1 && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Product selection is available when exactly one restaurant is selected. For multiple restaurants, the coupon will apply to all products in each selected restaurant.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {(submitError || submitSuccess) && (
                <div className={`mt-3 text-sm font-medium ${submitError ? "text-red-600" : "text-green-600"}`}>
                  {submitError || submitSuccess}
                </div>
              )}

              <div className="mt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? "Creating..." : "Create Coupon"}
                </button>
              </div>
            </form>
          )}

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by restaurant name, dish name, or coupon code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Offers List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900">
              Offers List
            </h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {pagination.total} {pagination.total === 1 ? 'offer' : 'offers'}
            </span>
          </div>

          {/* Master switch: pauses every offer platform-wide without touching individual
              offer settings, so turning it back on restores exactly what was live before. */}
          <div
            className={`flex flex-wrap items-center justify-between gap-3 mb-5 px-4 py-3 rounded-xl border ${
              offersEnabled ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex w-2.5 h-2.5 rounded-full ${
                  offersEnabled ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
              <div>
                <p className={`text-sm font-semibold ${offersEnabled ? "text-emerald-900" : "text-rose-900"}`}>
                  All offers are {offersEnabled ? "ON" : "OFF"}
                </p>
                <p className={`text-xs ${offersEnabled ? "text-emerald-700" : "text-rose-700"}`}>
                  {offersEnabled
                    ? "Active offers are available to customers."
                    : "All coupons are paused platform-wide. Individual offer settings are preserved."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleAllOffers}
              disabled={switchBusy}
              role="switch"
              aria-checked={offersEnabled}
              aria-label="Enable or disable all offers"
              className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                offersEnabled ? "bg-emerald-500" : "bg-rose-500"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  offersEnabled ? "translate-x-8" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {loading ? (
            <div className="text-center py-20">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-sm text-slate-500 mt-4">Loading offers...</p>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-lg font-semibold text-red-600 mb-1">Error</p>
              <p className="text-sm text-slate-500">{error}</p>
            </div>
          ) : filteredOffers.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-lg font-semibold text-slate-700 mb-1">No Offers Found</p>
              <p className="text-sm text-slate-500">
                {searchQuery ? "No offers match your search criteria" : "No offers have been created yet"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">SI</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Zone</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Dish</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Offer Scope</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Coupon Code</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Customer Scope</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Discount</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Min Order</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Price</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Show In Cart</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Valid Until</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredOffers.map((offer) => (
                    <tr key={`${offer.offerId}-${offer.dishId}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-700">{offer.sl}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-900">{offer.restaurantName}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">{offer.zoneName || "All Zones"}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-700">{offer.dishName}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          offer.productScope === "selected"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          {offer.productScope === "selected" ? "Selected Products" : "All Products"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                          {offer.couponCode}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          offer.customerGroup === "new"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          {offer.customerGroup === "new" ? "First-time Users" : "All Users"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">
                          {offer.discountType === 'flat-price' 
                            ? `₹${offer.originalPrice - offer.discountedPrice} OFF`
                            : `${offer.discountPercentage}% OFF${offer.maxDiscount ? ` up to ₹${offer.maxDiscount}` : ""}`}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">
                          {offer.minOrderValue > 0 ? `Above ₹${offer.minOrderValue}` : "No minimum"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 line-through">₹{offer.originalPrice}</span>
                          <span className="text-sm font-semibold text-green-600">₹{offer.discountedPrice}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          offer.status === 'active' 
                            ? 'bg-green-100 text-green-700' 
                            : offer.status === 'paused'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {offer.status || 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleShowInCart(offer.offerId, offer.dishId, offer.showInCart !== false)}
                          disabled={!!updatingCartVisibility[`${offer.offerId}-${offer.dishId}`]}
                          className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors ${
                            offer.showInCart !== false ? "bg-green-600" : "bg-slate-300"
                          } disabled:opacity-60`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              offer.showInCart !== false ? "translate-x-7" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">
                          {offer.endDate ? new Date(offer.endDate).toLocaleDateString() : 'No expiry'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && pagination.pages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-200">
              <span className="text-sm text-slate-600">
                Showing{" "}
                <span className="font-semibold text-slate-900">
                  {(pagination.page - 1) * pagination.limit + 1}
                  {"-"}
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                </span>{" "}
                of <span className="font-semibold text-slate-900">{pagination.total}</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>

                <span className="px-3 py-1.5 text-sm text-slate-600">
                  Page <span className="font-semibold text-slate-900">{pagination.page}</span> of{" "}
                  <span className="font-semibold text-slate-900">{pagination.pages}</span>
                </span>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  disabled={pagination.page >= pagination.pages}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


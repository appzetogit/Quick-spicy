import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, ChevronDown, ChevronRight, Filter, Info, X } from "lucide-react"
import BottomNavOrders from "../components/BottomNavOrders"
import { restaurantAPI } from "@/lib/api"
import growCustomerBaseIcon from "@/assets/hub/icons/growyourcustomerbase.png"

export default function CreateOffers() {
  const navigate = useNavigate()
  const location = useLocation()
  const isInternalPage = location.pathname.includes("/create-offers")
  const [activeTab, setActiveTab] = useState("create-offers")
  const [offerStatus, setOfferStatus] = useState("active")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isPerformanceInfoOpen, setIsPerformanceInfoOpen] = useState(false)
  const [dateFormat, setDateFormat] = useState("weekly")
  const [dateRange, setDateRange] = useState("Weekly (15 - 17 Dec)")
  const [comparisonDate, setComparisonDate] = useState("previous week (8 - 10 Dec)")
  
  // Restaurant data state
  const [restaurant, setRestaurant] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(true)

  // Fetch restaurant data from backend
  useEffect(() => {
    const fetchRestaurant = async () => {
      try {
        setLoadingRestaurant(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        if (response?.data?.success && response?.data?.data?.restaurant) {
          setRestaurant(response.data.data.restaurant)
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          console.error("Error fetching restaurant data:", error)
        }
        // Continue with default values if fetch fails
      } finally {
        setLoadingRestaurant(false)
      }
    }

    fetchRestaurant()
  }, [])

  const offerGoals = [
    {
      id: "grow-customers",
      title: "Grow your customer base",
      description: "Offers to increase your customers and orders",
      icon: growCustomerBaseIcon,
    },
  ]

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/restaurant/hub-growth")}
              className="p-1 rounded-full hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900">
                  {loadingRestaurant ? "Loading..." : (restaurant?.name || "Restaurant")}
                </h1>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {(() => {
                  if (loadingRestaurant) return "Loading..."
                  
                  if (!restaurant?.location) return "Location not available"
                  
                  const loc = restaurant.location
                  
                  // Priority 1: Use formattedAddress if available
                  if (loc.formattedAddress && 
                      loc.formattedAddress.trim() !== "" && 
                      loc.formattedAddress !== "Select location") {
                    // Check if it's just coordinates (latitude, longitude format)
                    const isCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(loc.formattedAddress.trim())
                    if (!isCoordinates) {
                      return loc.formattedAddress.trim()
                    }
                  }
                  
                  // Priority 2: Use address field if available
                  if (loc.address && loc.address.trim() !== "") {
                    return loc.address.trim()
                  }
                  
                  // Priority 3: Build from individual components
                  const addressParts = [
                    loc.addressLine1,
                    loc.addressLine2,
                    loc.area,
                    loc.city,
                    loc.state,
                    loc.zipCode || loc.pincode || loc.postalCode
                  ].filter(Boolean)
                  
                  if (addressParts.length > 0) {
                    return addressParts.join(", ")
                  }
                  
                  return "Location not available"
                })()}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex border-t border-white">
          <button
            onClick={() => setActiveTab("create-offers")}
            className={`flex-1 py-3 text-sm font-medium relative ${
              activeTab === "create-offers"
                ? "text-blue-600"
                : "text-gray-500"
            }`}
          >
            Create offers
            {activeTab === "create-offers" && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"
                initial={false}
              />
            )}
          </button>
          <button
            onClick={() => setActiveTab("track-offers")}
            className={`flex-1 py-3 text-sm font-medium relative ${
              activeTab === "track-offers"
                ? "text-blue-600"
                : "text-gray-500"
            }`}
          >
            Track offers
            {activeTab === "track-offers" && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"
                initial={false}
              />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6">
        {activeTab === "create-offers" ? (
          <>
            {/* Custom Offer Section */}
            <div className="mb-6">
              <p className="text-xs uppercase text-gray-400 tracking-wider mb-3">CUSTOM OFFER FOR YOU</p>

              {/* Purple Banner */}
              <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg p-6 mb-4 relative overflow-hidden">
                <div className="relative z-10">
                  <h2 className="text-2xl font-bold text-white mb-2">What's your discounting goal?</h2>
                </div>
                {/* Target illustration */}
                <div className="absolute right-0 top-0 bottom-0 flex items-center pr-4">
                  <svg className="w-24 h-24 text-white/20" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth={3} />
                    <circle cx="50" cy="50" r="25" fill="none" stroke="currentColor" strokeWidth={3} />
                    <circle cx="50" cy="50" r="10" fill="currentColor" />
                    <path d="M50 10 L50 30 M50 70 L50 90 M10 50 L30 50 M70 50 L90 50" stroke="currentColor" strokeWidth={2} />
                    <path d="M50 10 L55 20 M50 10 L45 20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                  </svg>
                </div>
                {/* Pattern overlay */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute inset-0" style={{
                    backgroundImage: `radial-gradient(circle, white 1px, transparent 1px)`,
                    backgroundSize: '20px 20px'
                  }} />
                </div>
              </div>

              {/* Offer Goal Cards */}
              <div className="">
                {offerGoals.map((goal) => (
                  <motion.div
                    key={goal.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      navigate(`/restaurant/hub-growth/create-offers/${goal.id}`)
                    }}
                    className="bg-white rounded-lg p-4 flex items-center gap-4 border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="shrink-0">
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center relative overflow-hidden">
                        <img src={goal.icon} alt={goal.title} className="w-full h-full object-contain" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-gray-900 mb-1">{goal.title}</h3>
                      <p className="text-sm text-gray-600">{goal.description}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-blue-600 shrink-0" />
                  </motion.div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-6">
            {/* Overall Performance Card */}
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-gray-900">Overall performance</h3>
                  <button 
                    onClick={() => setIsPerformanceInfoOpen(true)}
                    className="p-1 rounded-full hover:bg-gray-100"
                  >
                    <Info className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>
              
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-gray-900">{dateRange}</p>
                  <button 
                    onClick={() => setIsFilterOpen(true)}
                    className="flex items-center gap-1 text-sm text-blue-600 font-medium"
                  >
                    Change
                    <Filter className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Comparison is with {comparisonDate}. Trendline is of latest 5 weeks for the same time period.
                </p>
              </div>

              {/* Metrics */}
              <div className="space-y-0 divide-y divide-gray-100">
                {[
                  { label: "Gross sales from offers", value: "₹0", change: "0%" },
                  { label: "Orders from offers", value: "0", change: "0%" },
                  { label: "Discount given", value: "₹0", change: "0%" },
                  { label: "Effective discount", value: "0.0%", change: "0%" },
                  { label: "Menu to order", value: "0.0%", change: "0%" },
                ].map((metric, index) => (
                  <div key={index} className="py-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">{metric.label}</span>
                    <div className="flex items-center gap-4">
                      {/* Trendline */}
                      <div className="flex items-center gap-0.5">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div key={i} className="w-1 h-1 rounded-full bg-blue-500" />
                        ))}
                        <div className="w-8 h-0.5 bg-blue-500" />
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-gray-900">{metric.value}</p>
                        <p className="text-xs text-gray-500">{metric.change}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* View detailed performance button */}
              {/* <button className="w-full mt-4 py-3 flex items-center justify-center gap-2 text-blue-600 font-bold text-sm hover:bg-blue-50 rounded-lg transition-colors">
                View detailed performance
                <ChevronRight className="w-4 h-4" />
              </button> */}
            </div>

            {/* Offers Section */}
            <div>
              {/* OFFERS Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-gray-200" />
                <h2 className="text-base font-bold text-gray-900 uppercase">OFFERS</h2>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Status Tabs */}
              <div className="flex gap-2 mb-4">
                {[
                  { id: "active", label: "Active" },
                  { id: "scheduled", label: "Scheduled" },
                  { id: "inactive", label: "Inactive" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setOfferStatus(tab.id)}
                    className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors ${
                      offerStatus === tab.id
                        ? "bg-black text-white"
                        : "bg-white text-gray-900 border border-gray-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Empty State */}
              <div className="bg-white rounded-lg p-8 border border-gray-200 text-center">
                <div className="mb-4">
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gray-100 mb-4">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">No offers to show here</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Delight your customers with great offers.<br />
                  Create an offer today!
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter Modal */}
      <AnimatePresence>
        {isFilterOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFilterOpen(false)}
              className="fixed inset-0 bg-black/50 z-[9999]"
            />
            
            {/* Filter Bottom Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-[9999] h-[45vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Filters</h2>
                <button
                  onClick={() => setIsFilterOpen(false)}
                  className="p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {/* Filter Content */}
              <div className="flex-1 flex overflow-hidden">
                {/* Left Column - Filter Categories */}
                <div className="w-32 bg-gray-50 border-r border-gray-200">
                  <div className="">
                    <button className="w-full text-left bg-white border-s-2 border-blue-500 px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900">Date format</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Right Column - Filter Options */}
                <div className="flex-1 bg-white overflow-y-auto">
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Date format</h3>
                    <div className="space-y-3">
                      {[
                        { id: "daily", label: "Daily" },
                        { id: "weekly", label: "Weekly" },
                        { id: "monthly", label: "Monthly" },
                      ].map((option) => (
                        <label
                          key={option.id}
                          className="flex items-center gap-3 cursor-pointer"
                        >
                          <input
                            type="radio"
                            name="dateFormat"
                            value={option.id}
                            checked={dateFormat === option.id}
                            onChange={(e) => setDateFormat(e.target.value)}
                            className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-900">{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Apply Button */}
              <div className="px-4 py-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    // Update date range based on selected format
                    const dateRanges = {
                      daily: "Daily (17 Dec)",
                      weekly: "Weekly (15 - 17 Dec)",
                      monthly: "Monthly (1 - 31 Dec)",
                    }
                    const comparisonDates = {
                      daily: "previous day (16 Dec)",
                      weekly: "previous week (8 - 10 Dec)",
                      monthly: "previous month (1 - 30 Nov)",
                    }
                    setDateRange(dateRanges[dateFormat])
                    setComparisonDate(comparisonDates[dateFormat])
                    setIsFilterOpen(false)
                  }}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors"
                >
                  Apply
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Overall Performance Info Popup */}
      <AnimatePresence>
        {isPerformanceInfoOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPerformanceInfoOpen(false)}
              className="fixed inset-0 bg-black/50 z-[9999]"
            />
            
            {/* Bottom Popup */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-[9999] max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Overall performance</h2>
                <button
                  onClick={() => setIsPerformanceInfoOpen(false)}
                  className="p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-3">
                  {/* Gross sales from offers */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-900 mb-2">Gross sales from offers</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Total sales value before any deductions from all discounted orders (includes orders with promo discounts, freebies, Buy 1 - Get 1, and menu slash pricing).
                    </p>
                  </div>

                  {/* Orders from offers */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-900 mb-2">Orders from offers</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Total number of all discounted orders.
                    </p>
                  </div>

                  {/* Discount given */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-900 mb-2">Discount given</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Total value of all discounts applied to discounted orders.
                    </p>
                  </div>

                  {/* Effective discount */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-900 mb-2">Effective discount</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Percentage of the total discount value given in relation to the gross sales from all discounted offers.
                    </p>
                  </div>

                  {/* Menu to order */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-900 mb-2">Menu to order</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Percentage of menu opens that resulted in successful orders placed.
                    </p>
                  </div>

                  {/* Brand Pack purchase count */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-900 mb-2">Brand Pack purchase count</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Total number of Brand Pack purchases.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer Button */}
              <div className="px-4 py-4 border-t border-gray-200">
                <button
                  onClick={() => setIsPerformanceInfoOpen(false)}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors"
                >
                  Okay
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <BottomNavOrders />
    </div>
  )
}

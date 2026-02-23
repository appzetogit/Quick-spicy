import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ChevronDown, Loader2, Gift, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useProgressStore } from "../store/progressStore"
import FeedNavbar from "../components/FeedNavbar"
import { deliveryAPI } from "@/lib/api"
import { fetchWalletTransactions } from "../utils/deliveryWalletState"

export default function TripHistory() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("daily")
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedTripType, setSelectedTripType] = useState("ALL TRIPS")
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTripTypePicker, setShowTripTypePicker] = useState(false)
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showBonusModal, setShowBonusModal] = useState(false)
  const [bonusTransactions, setBonusTransactions] = useState([])
  const [bonusLoading, setBonusLoading] = useState(false)
  const [hasViewedBonus, setHasViewedBonus] = useState(false)

  const tripTypes = ["ALL TRIPS", "Completed", "Cancelled", "Pending"]

  const { updateTodayTrips } = useProgressStore()

  // Fetch trips from API
  useEffect(() => {
    const fetchTrips = async () => {
      setLoading(true)
      setError("")
      
      try {
        const params = {
          period: activeTab,
          date: selectedDate.toISOString().split('T')[0],
          status: selectedTripType !== "ALL TRIPS" ? selectedTripType : undefined,
          limit: 1000
        }
        
        const response = await deliveryAPI.getTripHistory(params)
        
        if (response.data?.success && response.data?.data?.trips) {
          const tripsData = response.data.data.trips
          setTrips(tripsData)
          
          // Update store if viewing today's data and showing all trips
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const selectedDateNormalized = new Date(selectedDate)
          selectedDateNormalized.setHours(0, 0, 0, 0)
          
          if (activeTab === "daily" && selectedDateNormalized.getTime() === today.getTime() && selectedTripType === "ALL TRIPS") {
            updateTodayTrips(tripsData.length)
          }
        } else {
          setTrips([])
        }
      } catch (error) {
        console.error("Error fetching trip history:", error)
        setError("Failed to load trip history. Please try again.")
        setTrips([])
      } finally {
        setLoading(false)
      }
    }

    fetchTrips()
  }, [selectedDate, activeTab, selectedTripType, updateTodayTrips])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowDatePicker(false)
      setShowTripTypePicker(false)
    }
    if (showDatePicker || showTripTypePicker) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showDatePicker, showTripTypePicker])

  // Format date for display
  const formatDateDisplay = (date) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    if (date.toDateString() === today.toDateString()) {
      return "Today"
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday"
    } else {
      const options = { day: 'numeric', month: 'short' }
      return date.toLocaleDateString('en-US', options)
    }
  }

  // Generate recent dates for picker
  const generateRecentDates = () => {
    const dates = []
    for (let i = 0; i < 30; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      dates.push(date)
    }
    return dates
  }

  const recentDates = generateRecentDates()

  // Fetch bonus transactions when modal opens
  useEffect(() => {
    const fetchBonusTransactions = async () => {
      if (showBonusModal) {
        setBonusLoading(true)
        try {
          const transactions = await fetchWalletTransactions({ type: 'bonus', limit: 100 })
          setBonusTransactions(transactions)
          // Mark as viewed when modal opens and transactions are loaded
          if (transactions.length > 0) {
            setHasViewedBonus(true)
          }
        } catch (error) {
          console.error('Error fetching bonus transactions:', error)
          setBonusTransactions([])
        } finally {
          setBonusLoading(false)
        }
      }
    }

    fetchBonusTransactions()
  }, [showBonusModal])

  // Check for new bonuses on component mount and periodically
  useEffect(() => {
    const checkForBonuses = async () => {
      try {
        const transactions = await fetchWalletTransactions({ type: 'bonus', limit: 100 })
        setBonusTransactions(transactions)
      } catch (error) {
        console.error('Error checking bonus transactions:', error)
      }
    }

    checkForBonuses()
    // Check for new bonuses every 30 seconds
    const interval = setInterval(checkForBonuses, 30000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* Sticky Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center flex-shrink-0 sticky top-0 z-40">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors mr-2"
        >
          <ArrowLeft className="w-5 h-5 text-black" />
        </button>
        <h1 className="text-lg font-bold text-black flex-1 text-center">Trip History</h1>
        <button
          onClick={() => {
            setShowBonusModal(true)
            setHasViewedBonus(true)
          }}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors relative"
        >
          <Gift className="w-5 h-5 text-black" />
          {bonusTransactions.length > 0 && !hasViewedBonus && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 text-white text-xs rounded-full flex items-center justify-center">
              {bonusTransactions.length}
            </span>
          )}
        </button>
      </div>

      {/* Sticky Period Selection Tabs */}
      <div className="bg-white px-4 py-4 border-b border-gray-200 flex-shrink-0 sticky top-[57px] z-30">
        <div className="flex gap-6">
          <button
            onClick={() => {
              setActiveTab("daily")
              setShowDatePicker(false)
            }}
            className="relative"
          >
            <span className={`text-base font-medium transition-colors ${
              activeTab === "daily" ? "text-green-600" : "text-gray-500"
            }`}>
              Daily
            </span>
            {activeTab === "daily" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600 mt-2"></div>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab("weekly")
              setShowDatePicker(false)
            }}
            className="relative"
          >
            <span className={`text-base font-medium transition-colors ${
              activeTab === "weekly" ? "text-green-600" : "text-gray-500"
            }`}>
              Weekly
            </span>
            {activeTab === "weekly" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600 mt-2"></div>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab("monthly")
              setShowDatePicker(false)
            }}
            className="relative"
          >
            <span className={`text-base font-medium transition-colors ${
              activeTab === "monthly" ? "text-green-600" : "text-gray-500"
            }`}>
              Monthly
            </span>
            {activeTab === "monthly" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600 mt-2"></div>
            )}
          </button>
        </div>
      </div>

      {/* Sticky Filter Controls */}
      <div className="bg-white px-4 py-4 border-b border-gray-200 flex gap-3 flex-shrink-0 sticky top-[129px] z-30">
        {/* Date/Period Selector */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowDatePicker(!showDatePicker)
            setShowTripTypePicker(false)
          }}
          className="flex-1 flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <span className="text-sm font-medium text-black">
            {formatDateDisplay(selectedDate)}: {selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
        </button>

        {/* Trip Type Selector */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowTripTypePicker(!showTripTypePicker)
            setShowDatePicker(false)
          }}
          className="flex-1 flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <span className="text-sm font-medium text-black">{selectedTripType}</span>
          <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${showTripTypePicker ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Date Picker Dropdown */}
      {showDatePicker && (
        <div className="fixed left-4 right-4 top-[201px] bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {recentDates.map((date, index) => (
            <button
              key={index}
              onClick={() => {
                setSelectedDate(date)
                setShowDatePicker(false)
              }}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors ${
                date.toDateString() === selectedDate.toDateString() ? 'bg-gray-50 font-medium' : ''
              }`}
            >
              <span className="text-sm text-black">
                {formatDateDisplay(date)}: {date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Trip Type Picker Dropdown */}
      {showTripTypePicker && (
        <div className="fixed right-4 top-[201px] bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[150px]">
          {tripTypes.map((type, index) => (
            <button
              key={index}
              onClick={() => {
                setSelectedTripType(type)
                setShowTripTypePicker(false)
              }}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors ${
                type === selectedTripType ? 'bg-gray-50 font-medium' : ''
              }`}
            >
              <span className="text-sm text-black">{type}</span>
            </button>
          ))}
        </div>
      )}

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 pb-20">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-12 h-12 text-green-600 animate-spin mb-4" />
            <p className="text-gray-500 text-base">Loading trips...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600 text-base mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-green-600 text-sm underline"
            >
              Retry
            </button>
          </div>
        ) : trips.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-base">No trips found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map((trip) => (
              <div
                key={trip.id || trip.orderId}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="text-base font-semibold text-black">{trip.orderId}</p>
                    <p className="text-sm text-gray-600 mt-1">{trip.restaurant || trip.restaurantName || 'Unknown Restaurant'}</p>
                    {/* Payment Method Badge */}
                    {(() => {
                      const paymentMethod = trip.paymentMethod || trip.payment?.method || 'razorpay';
                      const isCOD = paymentMethod === 'cash' || paymentMethod === 'cod';
                      return (
                        <span className={`inline-block mt-2 text-xs font-medium px-2 py-1 rounded-full ${
                          isCOD ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {isCOD ? 'COD' : 'Online'}
                        </span>
                      );
                    })()}
                  </div>
                  <span className={`text-sm font-medium ${
                    trip.status === 'Completed' ? 'text-green-600' :
                    trip.status === 'Cancelled' ? 'text-red-600' :
                    'text-yellow-600'
                  }`}>
                    {trip.status}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">Time</p>
                    <p className="text-sm font-medium text-black mt-1">{trip.time}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Amount</p>
                    <p className="text-sm font-semibold text-black mt-1">₹{trip.amount}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bonus Transactions Modal */}
      <AnimatePresence>
        {showBonusModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowBonusModal(false)}
              className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md bg-white rounded-2xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Gift className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-black">Bonus History</h2>
                    <p className="text-xs text-gray-500">Admin added bonuses</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowBonusModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {bonusLoading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-green-600 animate-spin mb-4" />
                    <p className="text-gray-500 text-sm">Loading bonuses...</p>
                  </div>
                ) : bonusTransactions.length === 0 ? (
                  <div className="text-center py-12">
                    <Gift className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-base">No bonus transactions found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bonusTransactions.map((transaction) => (
                      <div
                        key={transaction._id || transaction.id}
                        className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="text-lg font-bold text-black">
                              ₹{transaction.amount?.toFixed(2) || '0.00'}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {transaction.description || transaction.metadata?.reference || 'Bonus'}
                            </p>
                            {transaction.metadata?.reference && (
                              <p className="text-xs text-gray-500 mt-1">
                                Reference: {transaction.metadata.reference}
                              </p>
                            )}
                          </div>
                          <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                            transaction.status === 'Completed' 
                              ? 'bg-green-100 text-green-700' 
                              : transaction.status === 'Pending'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {transaction.status || 'Pending'}
                          </span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs text-gray-500">
                            {transaction.createdAt || transaction.date
                              ? new Date(transaction.createdAt || transaction.date).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : 'N/A'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}


import { useState, useMemo, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { 
  ArrowLeft,
  HelpCircle,
  ChevronDown,
  Lock,
  Moon,
  Star,
  Calendar,
  X,
  Clock
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DateRangeCalendar } from "@/components/ui/date-range-calendar"

// Mock offers data
const generateOffers = () => {
  const today = new Date()
  const offers = []
  
  // This week offers
  for (let i = 0; i < 3; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    const isLive = i === 0
    
    offers.push({
      id: `this-week-${i}`,
      title: "Full Day Bonus",
      date: date,
      timeSlots: [
        { startTime: "8am", endTime: "12pm", label: "Morning" },
        { startTime: "12pm", endTime: "4pm", label: "Afternoon" },
        { startTime: "4pm", endTime: "8pm", label: "Evening" },
        { startTime: "8pm", endTime: "11:59pm", label: "Night" }
      ],
      status: isLive ? "Live" : "Upcoming",
      bonusAmount: 125,
      week: "this",
      incentiveTiers: [
        { label: "Incentive", amount: 0 },
        { label: "₹50", amount: 50 },
        { label: "₹75", amount: 75 },
        { label: "₹125", amount: 125 }
      ],
      gigsProgression: [1, 2, 3],
      ordersProgression: [6, 9, 14],
      compulsoryLogin: {
        start: "6pm",
        end: "11:59pm",
        hours: 4
      }
    })
  }
  
  // Next week offers
  for (let i = 0; i < 2; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + 7 + i)
    
    offers.push({
      id: `next-week-${i}`,
      title: "Full Day Bonus",
      date: date,
      timeSlots: [
        { startTime: "8am", endTime: "12pm", label: "Morning" },
        { startTime: "12pm", endTime: "4pm", label: "Afternoon" },
        { startTime: "4pm", endTime: "8pm", label: "Evening" },
        { startTime: "8pm", endTime: "11:59pm", label: "Night" }
      ],
      status: "Upcoming",
      bonusAmount: 125,
      week: "next",
      incentiveTiers: [
        { label: "Incentive", amount: 0 },
        { label: "₹50", amount: 50 },
        { label: "₹75", amount: 75 },
        { label: "₹125", amount: 125 }
      ],
      gigsProgression: [1, 2, 3],
      ordersProgression: [6, 9, 14],
      compulsoryLogin: {
        start: "6pm",
        end: "11:59pm",
        hours: 4
      }
    })
  }
  
  return offers
}

export default function OffersPage() {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState("this-week")
  const [showWeekSelector, setShowWeekSelector] = useState(false)
  const [selectedWeekStart, setSelectedWeekStart] = useState(null)
  const [selectedWeekEnd, setSelectedWeekEnd] = useState(null)
  const [selectedOffer, setSelectedOffer] = useState(null)
  const [showOfferDetails, setShowOfferDetails] = useState(false)
  const calendarRef = useRef(null)
  
  const allOffers = useMemo(() => generateOffers(), [])
  
  // Get current week range
  const getCurrentWeekRange = () => {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - dayOfWeek)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    return { start: startOfWeek, end: endOfWeek }
  }
  
  // Get next week range
  const getNextWeekRange = () => {
    const { start } = getCurrentWeekRange()
    const nextWeekStart = new Date(start)
    nextWeekStart.setDate(start.getDate() + 7)
    const nextWeekEnd = new Date(nextWeekStart)
    nextWeekEnd.setDate(nextWeekStart.getDate() + 6)
    return { start: nextWeekStart, end: nextWeekEnd }
  }
  
  // Filter offers based on active filter
  const filteredOffers = useMemo(() => {
    if (activeFilter === "this-week") {
      const { start, end } = getCurrentWeekRange()
      return allOffers.filter(offer => {
        const offerDate = new Date(offer.date)
        offerDate.setHours(0, 0, 0, 0)
        return offerDate >= start && offerDate <= end
      })
    } else if (activeFilter === "next-week") {
      const { start, end } = getNextWeekRange()
      return allOffers.filter(offer => {
        const offerDate = new Date(offer.date)
        offerDate.setHours(0, 0, 0, 0)
        return offerDate >= start && offerDate <= end
      })
    } else if (activeFilter === "select-week") {
      if (!selectedWeekStart || !selectedWeekEnd) {
        return []
      }
      return allOffers.filter(offer => {
        const offerDate = new Date(offer.date)
        offerDate.setHours(0, 0, 0, 0)
        return offerDate >= selectedWeekStart && offerDate <= selectedWeekEnd
      })
    }
    return []
  }, [activeFilter, allOffers, selectedWeekStart, selectedWeekEnd])
  
  // Format date display
  const formatDateDisplay = (date) => {
    const day = date.getDate()
    const month = date.toLocaleString('en-US', { month: 'short' })
    return `${day} ${month}`
  }
  
  // Format week range display
  const weekRangeDisplay = useMemo(() => {
    if (activeFilter === "select-week" && selectedWeekStart && selectedWeekEnd) {
      return `${formatDateDisplay(selectedWeekStart)} - ${formatDateDisplay(selectedWeekEnd)}`
    }
    return "Select week"
  }, [activeFilter, selectedWeekStart, selectedWeekEnd])
  
  // Handle week selection
  const handleWeekSelection = (start, end) => {
    setSelectedWeekStart(start)
    setSelectedWeekEnd(end)
    if (start && end) {
      setShowWeekSelector(false)
    }
  }
  
  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowWeekSelector(false)
      }
    }
    
    if (showWeekSelector) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showWeekSelector])
  
  return (
    <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-6 flex items-center justify-between rounded-b-3xl md:rounded-b-none sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Your offers</h1>
        </div>
        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <HelpCircle className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-4 bg-white border-b border-gray-200 rounded-b-3xl md:rounded-b-none">
        <div className="flex gap-3">
          <button
            onClick={() => {
              setActiveFilter("this-week")
              setShowWeekSelector(false)
            }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeFilter === "this-week"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            This week
          </button>
          <button
            onClick={() => {
              setActiveFilter("next-week")
              setShowWeekSelector(false)
            }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeFilter === "next-week"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Next week
          </button>
          <div className="relative flex-1" ref={calendarRef}>
            <button
              onClick={() => {
                setActiveFilter("select-week")
                setShowWeekSelector(!showWeekSelector)
              }}
                className={`w-full px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center justify-between ${
                activeFilter === "select-week"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <span className="text-sm">{weekRangeDisplay}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showWeekSelector ? 'rotate-180' : ''}`} />
            </button>
            
            {/* Calendar Popup */}
            {showWeekSelector && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 bg-black/50 z-40"
                  onClick={() => setShowWeekSelector(false)}
                />
                {/* Calendar Modal - Centered */}
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-xl shadow-2xl max-w-md w-full"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DateRangeCalendar
                      startDate={selectedWeekStart}
                      endDate={selectedWeekEnd}
                      onDateRangeChange={handleWeekSelection}
                      onClose={() => setShowWeekSelector(false)}
                    />
                  </motion.div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Offers List */}
      <div className="px-4 py-6 space-y-4">
        {filteredOffers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Calendar className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-600 text-base font-medium">No offers available</p>
            <p className="text-sm text-gray-500 mt-2">Check back later for new offers</p>
          </div>
        ) : (
          <AnimatePresence>
            {filteredOffers.map((offer, index) => (
              <motion.div
                key={offer.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="bg-white py-0 border border-gray-200 shadow-md hover:shadow-lg transition-shadow">
                  <CardContent className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">{offer.title}</h3>
                        <p className="text-sm text-gray-600 mb-2">
                          {formatDateDisplay(offer.date)}
                        </p>
                        {/* Time Slots - Horizontal Scrolling */}
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                          {offer.timeSlots.map((slot, idx) => (
                            <div
                              key={idx}
                              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200"
                            >
                              <Clock className="w-3 h-3 text-gray-600" />
                              <span className="text-xs font-medium text-gray-700 whitespace-nowrap">
                                {slot.startTime} - {slot.endTime}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {offer.status === "Live" && (
                          <> 
                            <div className="w-2 h-2 bg-neutral-900 rounded-full"></div>
                            <span className="text-sm font-medium text-green-600">Live</span>
                          </>
                        )}
                        {offer.status === "Upcoming" && (
                          <span className="text-sm font-medium text-gray-500">Upcoming</span>
                        )}
                        <div className="text-right">
                          <span className="text-lg font-bold text-gray-900">₹{offer.bonusAmount} Extra</span>
                        </div>
                      </div>
                    </div>

                    {/* Incentive Tiers */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2 overflow-x-auto pb-2">
                        {offer.incentiveTiers.map((tier, idx) => (
                          <div
                            key={idx}
                            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium ${
                              idx === 0
                                ? "bg-gray-100 text-gray-700"
                                : idx === offer.incentiveTiers.length - 1
                                ? "bg-green-100 text-green-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {tier.label}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Gigs Progression */}
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Gigs</p>
                      <div className="flex items-center gap-2">
                        {offer.gigsProgression.map((gig, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                              idx === 0
                                ? "bg-neutral-900 text-white"
                                : "bg-gray-200 text-gray-600"
                            }`}>
                              {gig}
                            </div>
                            {idx < offer.gigsProgression.length - 1 && (
                              <div className={`w-8 h-0.5 ${
                                idx === 0 ? "bg-neutral-900" : "bg-gray-300"
                              }`}></div>
                            )}
                            {idx > 0 && (
                              <Lock className="w-3 h-3 text-gray-400 ml-1" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Orders Progression */}
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Orders</p>
                      <div className="flex items-center gap-2">
                        {offer.ordersProgression.map((order, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                              idx === 0
                                ? "bg-neutral-900 text-white"
                                : "bg-gray-200 text-gray-600"
                            }`}>
                              {order}
                            </div>
                            {idx < offer.ordersProgression.length - 1 && (
                              <div className={`w-8 h-0.5 ${
                                idx === 0 ? "bg-neutral-900" : "bg-gray-300"
                              }`}></div>
                            )}
                            {idx > 0 && (
                              <Lock className="w-3 h-3 text-gray-400 ml-1" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Compulsory Login */}
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg flex items-center gap-3">
                      <Moon className="w-5 h-5 text-gray-600" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">
                          {offer.compulsoryLogin.start} - {offer.compulsoryLogin.end}
                        </p>
                        <p className="text-xs text-gray-500">{offer.compulsoryLogin.hours} hrs</p>
                      </div>
                    </div>

                    {/* View Details Button */}
                    <Button
                      onClick={() => {
                        setSelectedOffer(offer)
                        setShowOfferDetails(true)
                      }}
                      className="w-full py-3 rounded-lg font-semibold bg-gray-100 hover:bg-gray-200 text-gray-900"
                    >
                      View details
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Sticky Book Gigs Button */}
      <div className="fixed bottom-0 left-0 right-0 md:left-auto md:right-auto md:max-w-md md:mx-auto bg-white border-t border-gray-200 px-4 py-3 z-40 shadow-lg">
        <Button
          onClick={() => navigate("/delivery/gig")}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg"
        >
          Book Gigs
        </Button>
      </div>

      {/* Offer Details Bottom Sheet */}
      <AnimatePresence>
        {showOfferDetails && selectedOffer && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowOfferDetails(false)}
              className="fixed inset-0 bg-black/50 z-50"
            />
            
            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 md:left-auto md:right-auto md:max-w-md md:mx-auto bg-white rounded-t-3xl shadow-2xl z-50 max-h-[90vh] overflow-y-auto"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setShowOfferDetails(false)}
                className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>

              {/* Content */}
              <div className="px-6 pb-6">
                {/* Header */}
                <div className="mb-6 pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-2xl font-bold text-gray-900">{selectedOffer.title}</h2>
                    {selectedOffer.status === "Live" && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-neutral-900 rounded-full"></div>
                        <span className="text-sm font-medium text-green-600">Live</span>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    {formatDateDisplay(selectedOffer.date)}
                  </p>
                  <div className="text-2xl font-bold text-gray-900 mb-4">
                    ₹{selectedOffer.bonusAmount} Extra
                  </div>
                </div>

                {/* Time Slots */}
                <div className="mb-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-3">Available Time Slots</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedOffer.timeSlots.map((slot, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <p className="text-xs text-gray-500 mb-1">{slot.label}</p>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-gray-600" />
                          <span className="text-sm font-medium text-gray-700">
                            {slot.startTime} - {slot.endTime}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Incentive Tiers */}
                <div className="mb-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-3">Incentive Tiers</h3>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {selectedOffer.incentiveTiers.map((tier, idx) => (
                      <div
                        key={idx}
                        className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium ${
                          idx === 0
                            ? "bg-gray-100 text-gray-700"
                            : idx === selectedOffer.incentiveTiers.length - 1
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {tier.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Gigs Progression */}
                <div className="mb-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-3">Gigs Progression</h3>
                  <div className="flex items-center gap-2">
                    {selectedOffer.gigsProgression.map((gig, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                          idx === 0
                            ? "bg-neutral-900 text-white"
                            : "bg-gray-200 text-gray-600"
                        }`}>
                          {gig}
                        </div>
                        {idx < selectedOffer.gigsProgression.length - 1 && (
                          <div className={`w-8 h-0.5 ${
                            idx === 0 ? "bg-neutral-900" : "bg-gray-300"
                          }`}></div>
                        )}
                        {idx > 0 && (
                          <Lock className="w-3 h-3 text-gray-400 ml-1" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Orders Progression */}
                <div className="mb-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-3">Orders Progression</h3>
                  <div className="flex items-center gap-2">
                    {selectedOffer.ordersProgression.map((order, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                          idx === 0
                            ? "bg-neutral-900 text-white"
                            : "bg-gray-200 text-gray-600"
                        }`}>
                          {order}
                        </div>
                        {idx < selectedOffer.ordersProgression.length - 1 && (
                          <div className={`w-8 h-0.5 ${
                            idx === 0 ? "bg-neutral-900" : "bg-gray-300"
                          }`}></div>
                        )}
                        {idx > 0 && (
                          <Lock className="w-3 h-3 text-gray-400 ml-1" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Compulsory Login */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg flex items-center gap-3">
                  <Moon className="w-5 h-5 text-gray-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">
                      Compulsory Login: {selectedOffer.compulsoryLogin.start} - {selectedOffer.compulsoryLogin.end}
                    </p>
                    <p className="text-xs text-gray-500">{selectedOffer.compulsoryLogin.hours} hrs</p>
                  </div>
                </div>

                {/* Book Gigs Button */}
                <Button
                  onClick={() => {
                    setShowOfferDetails(false)
                    navigate("/delivery/gig")
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg"
                >
                  Book Gigs
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}


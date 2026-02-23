import { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Info, Calendar as CalendarIcon, ChevronDown, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import BottomNavOrders from "../components/BottomNavOrders"

export default function FreebiesTiming() {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedFreebies = [], selectedMinOrderValue = "" } = location.state || {}

  const [customerGroup, setCustomerGroup] = useState("all")
  const [offerDays, setOfferDays] = useState("all")
  const [startDate, setStartDate] = useState("18 Dec 2025")
  const [startDateDate, setStartDateDate] = useState(new Date())
  const [targetMealtime, setTargetMealtime] = useState("All mealtimes")

  const [isMealtimeOpen, setIsMealtimeOpen] = useState(false)
  const [tempMealtime, setTempMealtime] = useState(targetMealtime)

  const mealtimeOptions = [
    "All mealtimes",
    "Breakfast (8 AM - 11 AM)",
    "Lunch (11 AM - 3 PM)",
    "Snacks (3 PM - 7 PM)",
    "Dinner (7 PM - 11 PM)",
    "Late night (11 PM - 6 AM)",
  ]

  const formatDateLabel = (date) => {
    if (!date) return startDate
    const day = date.getDate().toString().padStart(2, "0")
    const month = date.toLocaleString("en-US", { month: "short" })
    const year = date.getFullYear()
    return `${day} ${month} ${year}`
  }

  const isFormValid =
    customerGroup && offerDays && startDate && targetMealtime && selectedFreebies.length > 0 && selectedMinOrderValue

  const handlePreview = () => {
    if (!isFormValid) return

    // TODO: Save offer to backend here
    console.log("Offer data:", {
      customerGroup,
      offerPreference: "all",
      discountType: "freebies",
      goalId: "delight-customers",
      offerDays,
      startDate,
      targetMealtime,
      minOrderValue: selectedMinOrderValue,
      freebieItems: selectedFreebies,
    })
    
    // Navigate back to create offers page
    alert("Offer created successfully!")
    navigate("/restaurant/hub-growth/create-offers")
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1 rounded-full hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Freebies</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6 space-y-6">
        {/* Customer target */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 tracking-wider mb-3">Customer target</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">All customers</p>
              </div>
              <input
                type="radio"
                name="customerGroupFreebies"
                value="all"
                checked={customerGroup === "all"}
                onChange={(e) => setCustomerGroup(e.target.value)}
                className="mt-1 w-5 h-5 text-black border-gray-400 focus:ring-black"
                style={{ accentColor: "#000000" }}
              />
            </label>
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">New customers</p>
                <p className="text-xs text-gray-500 mt-1">Customers who haven&apos;t ordered in the last 90 days</p>
              </div>
              <input
                type="radio"
                name="customerGroupFreebies"
                value="new"
                checked={customerGroup === "new"}
                onChange={(e) => setCustomerGroup(e.target.value)}
                className="mt-1 w-5 h-5 text-black border-gray-400 focus:ring-black"
                style={{ accentColor: "#000000" }}
              />
            </label>
          </div>
        </div>

        {/* Offer timings */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 tracking-wider mb-3">Offer timings</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            {/* Day chips */}
            <div className="flex gap-2">
              {[
                { id: "all", label: "All days" },
                { id: "mon-thu", label: "Mon - Thu" },
                { id: "fri-sun", label: "Fri - Sun" },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => setOfferDays(option.id)}
                  className={`flex-1 py-2.5 px-4 rounded-full text-sm font-medium border transition-colors ${
                    offerDays === option.id
                      ? "bg-black text-white border-black"
                      : "bg-white text-gray-900 border-gray-300"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="border-t border-dashed border-gray-200 my-3" />

            {/* Start date (shadcn calendar) */}
            <Popover>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">Start date</span>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="p-1 rounded-full hover:bg-gray-100"
                    >
                      <Info className="w-4 h-4 text-gray-500" />
                    </button>
                  </PopoverTrigger>
                </div>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white flex items-center justify-between text-sm font-medium text-gray-900"
                  >
                    <span>{startDate}</span>
                    <CalendarIcon className="w-4 h-4 text-gray-500" />
                  </button>
                </PopoverTrigger>
              </div>
              <PopoverContent align="center" className="p-2">
                <Calendar
                  mode="single"
                  selected={startDateDate}
                  onSelect={(date) => {
                    if (!date) return
                    setStartDateDate(date)
                    setStartDate(formatDateLabel(date))
                  }}
                  initialFocus
                  className="rounded-md border border-gray-200"
                />
              </PopoverContent>
            </Popover>

            {/* Target mealtime */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">Target mealtime</span>
                <button
                  onClick={() => setIsMealtimeOpen(true)}
                  className="p-1 rounded-full hover:bg-gray-100"
                >
                  <Info className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <button
                onClick={() => setIsMealtimeOpen(true)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white flex items-center justify-between text-sm font-medium text-gray-900"
              >
                <span>{targetMealtime}</span>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom button */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-4">
        <button
          onClick={handlePreview}
          disabled={!isFormValid}
          className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors ${
            isFormValid ? "bg-black text-white hover:bg-gray-900" : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
        >
          Preview offer
        </button>
      </div>

      {/* Mealtime Popup */}
      <AnimatePresence>
        {isMealtimeOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMealtimeOpen(false)}
              className="fixed inset-0 bg-black/50 z-[9999]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-[9999] max-h-[70vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 rounded-t-2xl">
                <h2 className="text-lg font-bold text-gray-900 tracking-wide">Select target mealtime</h2>
                <button
                  onClick={() => setIsMealtimeOpen(false)}
                  className="p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              <div className="flex-1 px-4 py-4 overflow-y-auto">
                <div className="space-y-2">
                  {mealtimeOptions.map((option) => (
                    <label
                      key={option}
                      className="flex items-center gap-3 py-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="targetMealtime"
                        value={option}
                        checked={tempMealtime === option}
                        onChange={(e) => setTempMealtime(e.target.value)}
                        className="w-5 h-5 text-black border-gray-400 focus:ring-black"
                        style={{ accentColor: "#000000" }}
                      />
                      <span className="text-sm font-medium text-gray-900">{option}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="px-4 py-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setTargetMealtime(tempMealtime)
                    setIsMealtimeOpen(false)
                  }}
                  className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors ${
                    tempMealtime
                      ? "bg-black text-white hover:bg-gray-900"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                  disabled={!tempMealtime}
                >
                  Confirm
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

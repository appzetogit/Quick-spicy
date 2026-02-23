import { useState, useMemo, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft,
  ChevronDown,
  Calendar,
  CheckCircle
} from "lucide-react"
import { formatCurrency } from "../../restaurant/utils/currency"
import { DateRangeCalendar } from "@/components/ui/date-range-calendar"
import WeekSelector from "../components/WeekSelector"

export default function TipsStatement() {
  const navigate = useNavigate()
  
  // Date range state
  const [startDate, setStartDate] = useState(() => {
    const today = new Date()
    const weekAgo = new Date(today)
    weekAgo.setDate(today.getDate() - 7)
    return weekAgo
  })
  const [endDate, setEndDate] = useState(new Date())
  const [showCalendar, setShowCalendar] = useState(false)
  const calendarRef = useRef(null)
  
  // Format date range display
  const dateRangeDisplay = useMemo(() => {
    if (!startDate || !endDate) return "Select date range"
    const formatDate = (date) => {
      const day = date.getDate()
      const month = date.toLocaleString('en-US', { month: 'short' })
      return `${day} ${month}`
    }
    return `${formatDate(startDate)} - ${formatDate(endDate)}`
  }, [startDate, endDate])
  
  // Handle date range change from calendar
  const handleDateRangeChange = (start, end) => {
    setStartDate(start)
    setEndDate(end)
    // Here you would fetch tips data for the selected date range
    // fetchTipsData(start, end)
  }
  
  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false)
      }
    }
    
    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCalendar])
  
  // Fetch tips data based on selected date range (mock function - replace with actual API call)
  const getTipsDataForDateRange = (start, end) => {
    // This would be an API call in a real application
    // For now, return empty array
    return []
  }
  
  // Get tips data for current selected date range
  const tips = useMemo(() => {
    if (!startDate || !endDate) return []
    return getTipsDataForDateRange(startDate, endDate)
  }, [startDate, endDate])
  
  return (
    <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-6 flex items-center gap-4 rounded-b-3xl md:rounded-b-none">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Customer tips statement</h1>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {/* Date Range Selector with Calendar */}
          <WeekSelector />

        {/* Transactions List */}
        {tips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            {/* Empty State Illustration */}
            <div className="flex flex-col gap-2 mb-6">
              <div className="bg-white rounded-lg p-4 shadow-md border border-gray-200 w-64">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded mt-1"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-2 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-md border border-gray-200 w-64">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-orange-500 rounded mt-1"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-2 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-md border border-gray-200 w-64">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded mt-1"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-2 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-gray-600 text-base font-medium">No transactions</p>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {tips.map((tip, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-4 shadow-md border border-gray-100"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded ${
                      index % 3 === 0 ? 'bg-green-500' : 
                      index % 3 === 1 ? 'bg-orange-500' : 'bg-blue-500'
                    }`}></div>
                    <div>
                      <p className="text-gray-900 text-sm font-medium">{tip.description}</p>
                      <p className="text-gray-500 text-xs">{tip.date}</p>
                    </div>
                  </div>
                  <div className="text-green-600 text-sm font-medium">
                    +{formatCurrency(Math.abs(tip.amount))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}


        {/* 100% TIP TRANSFER GUARANTEE Card */}
        <div className="bg-gray-50 rounded-xl p-2 shadow-sm border border-gray-50 fixed bottom-0 w-[90%] mx-auto left-1/2 transform -translate-x-1/2 mb-4">
  {/* Icon + Label */}
  <div className="flex items-center gap-2 mb-2">
    {/* Circular Icon */}
    <div className="relative shrink-0 scale-75">
      <svg width="80" height="80" viewBox="0 0 80 80" className="shrink-0">
        {/* Outer circle */}
        <circle cx="40" cy="40" r="38" fill="white" stroke="#9ca3af" strokeWidth="2"/>
        {/* Checkmark */}
        <path d="M 25 40 L 35 50 L 55 30" stroke="#9ca3af" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        {/* Circular text path */}
        <defs>
          <path id="tipCircle" d="M 40,40 m -30,0 a 30,30 0 1,1 60,0 a 30,30 0 1,1 -60,0" fill="none"/>
        </defs>
        <text fill="#9ca3af" fontSize="7" fontWeight="600" letterSpacing="0.5">
          <textPath href="#tipCircle" startOffset="0%">
            100% TIP TRANSFER
          </textPath>
        </text>
      </svg>
    </div>

    {/* Heading */}
    <div className="flex-1">
      <h2 className="text-sm md:text-md font-semibold text-gray-400 truncate">
        100% TIP TRANSFER GUARANTEE
      </h2>
    </div>
  </div>

  {/* Dotted Separator */}
  <div className="border-t border-dashed border-gray-400 mb-4"></div>

  {/* Bullet Points */}
  <div className="space-y-3">
    <div className="flex items-start gap-3">
      <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0"></div>
      <p className="text-gray-400 text-sm md:text-base">
        Tips are never used to settle your deductions.
      </p>
    </div>
    <div className="flex items-start gap-3">
      <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0"></div>
      <p className="text-gray-400 text-sm md:text-base">
        Tips are transferred to your bank account weekly, if not withdrawn.
      </p>
    </div>
  </div>
</div>

      </div>
    </div>
  )
}


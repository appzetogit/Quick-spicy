import { useState, useMemo, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  ChevronDown,
  Calendar,
  Wallet,
  CheckCircle,
  FuelIcon
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
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">HP Petrol Pump</h1>
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg  ml-auto text-green-600 border-green-600 border-2 bg-transparent transition-colors"
        >
          History
        </button>
      </div>

      {/* Main Content */}
      <div className="flex mt-64 text-center flex-col w-screen h-screen content-center  align-center ">
        <div className="mx-auto">
          <Wallet className="w-24 h-24 mx-auto text-black" />
        </div>
        <div className="text-black text-sm font-semibold">Your pocket balance is low</div>
        <div className="text-gray-800 text-sm ">Minimum <span>   <svg className="w-12 h-12 text-white absolute" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z" />
        </svg> </span> 100 pocket balance is required to pay for fuel </div>


      </div>
    </div>
  )
}


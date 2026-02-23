import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ChevronDown } from "lucide-react"
import { useProgressStore } from "../store/progressStore"

export default function TimeOnOrders() {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedTimeRange, setSelectedTimeRange] = useState("Select Time")
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimeRangePicker, setShowTimeRangePicker] = useState(false)

  const timeRanges = [
    "Select Time",
    "00:00 - 06:00",
    "06:00 - 12:00",
    "12:00 - 18:00",
    "18:00 - 24:00",
    "All Day"
  ]

  // Generate dummy session data
  const generateDummySessions = (date, timeRange) => {
    const sessions = []
    const seed = date.toISOString().split('T')[0].replace(/-/g, '')
    const seedNum = parseInt(seed) % 1000
    
    const count = (seedNum % 8) + 2 // 2-9 sessions

    for (let i = 0; i < count; i++) {
      const startHour = Math.floor((seedNum + i) % 24)
      const startMin = Math.floor((seedNum + i * 2) % 60)
      const duration = ((seedNum + i) % 180) + 30 // 30-210 minutes
      
      const endMin = startMin + duration
      const endHour = startHour + Math.floor(endMin / 60)
      const finalEndMin = endMin % 60
      
      const startTime = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`
      const endTime = `${String(endHour % 24).padStart(2, '0')}:${String(finalEndMin).padStart(2, '0')}`
      const timeRangeStr = `${startTime} - ${endTime}`
      
      const hours = Math.floor(duration / 60)
      const minutes = duration % 60
      const timeOnOrders = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

      sessions.push({
        id: i + 1,
        session: `Session ${i + 1}`,
        timeRange: timeRangeStr,
        timeOnOrders,
        hours,
        minutes,
        duration
      })
    }

    // Filter by time range if selected
    if (timeRange !== "Select Time" && timeRange !== "All Day") {
      const [start, end] = timeRange.split(' - ').map(t => {
        const [h, m] = t.split(':').map(Number)
        return h * 60 + m
      })
      
      return sessions.filter(session => {
        const [sessionStart] = session.timeRange.split(' - ').map(t => {
          const [h, m] = t.split(':').map(Number)
          return h * 60 + m
        })
        return sessionStart >= start && sessionStart < end
      })
    }

    return sessions.sort((a, b) => {
      const [aStart] = a.timeRange.split(' - ').map(t => {
        const [h, m] = t.split(':').map(Number)
        return h * 60 + m
      })
      const [bStart] = b.timeRange.split(' - ').map(t => {
        const [h, m] = t.split(':').map(Number)
        return h * 60 + m
      })
      return aStart - bStart
    })
  }

  const [sessions, setSessions] = useState(() => 
    generateDummySessions(selectedDate, selectedTimeRange)
  )

  const { updateTodayTimeOnOrders } = useProgressStore()

  useEffect(() => {
    const sessionsData = generateDummySessions(selectedDate, selectedTimeRange)
    setSessions(sessionsData)
    
    // Update store if viewing today's data and all day
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const selectedDateNormalized = new Date(selectedDate)
    selectedDateNormalized.setHours(0, 0, 0, 0)
    
    if (selectedDateNormalized.getTime() === today.getTime() && (selectedTimeRange === "Select Time" || selectedTimeRange === "All Day")) {
      const totalHours = finalHours + (finalMinutes / 60)
      updateTodayTimeOnOrders(totalHours)
    }
  }, [selectedDate, selectedTimeRange, updateTodayTimeOnOrders])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowDatePicker(false)
      setShowTimeRangePicker(false)
    }
    if (showDatePicker || showTimeRangePicker) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showDatePicker, showTimeRangePicker])

  // Calculate total hours
  const totalHours = sessions.reduce((sum, session) => sum + session.hours, 0)
  const totalMinutes = sessions.reduce((sum, session) => sum + session.minutes, 0)
  const finalHours = totalHours + Math.floor(totalMinutes / 60)
  const finalMinutes = totalMinutes % 60

  // Update store when sessions change
  useEffect(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const selectedDateNormalized = new Date(selectedDate)
    selectedDateNormalized.setHours(0, 0, 0, 0)
    
    if (selectedDateNormalized.getTime() === today.getTime() && (selectedTimeRange === "Select Time" || selectedTimeRange === "All Day")) {
      const totalHoursValue = finalHours + (finalMinutes / 60)
      updateTodayTimeOnOrders(totalHoursValue)
    }
  }, [sessions, finalHours, finalMinutes, selectedDate, selectedTimeRange, updateTodayTimeOnOrders])

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
      const options = { day: 'numeric', month: 'long' }
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

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors mr-2"
        >
          <ArrowLeft className="w-5 h-5 text-black" />
        </button>
        <h1 className="text-lg font-bold text-black flex-1 text-center">Time on orders</h1>
        <div className="w-10"></div>
      </div>

      {/* Date and Time Selection */}
      <div className="px-4 py-4 border-b border-gray-200 flex gap-3">
        {/* Date Selector */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowDatePicker(!showDatePicker)
            setShowTimeRangePicker(false)
          }}
          className="flex-1 flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <span className="text-sm font-medium text-black">
            {formatDateDisplay(selectedDate)}
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
        </button>

        {/* Time Range Selector */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowTimeRangePicker(!showTimeRangePicker)
            setShowDatePicker(false)
          }}
          className="flex-1 flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <span className="text-sm font-medium text-black">{selectedTimeRange}</span>
          <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${showTimeRangePicker ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Date Picker Dropdown */}
      {showDatePicker && (
        <div className="fixed left-4 right-4 top-32 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
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
              <span className="text-sm text-black">{formatDateDisplay(date)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Time Range Picker Dropdown */}
      {showTimeRangePicker && (
        <div className="fixed right-4 top-32 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px]">
          {timeRanges.map((range, index) => (
            <button
              key={index}
              onClick={() => {
                setSelectedTimeRange(range)
                setShowTimeRangePicker(false)
              }}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors ${
                range === selectedTimeRange ? 'bg-gray-50 font-medium' : ''
              }`}
            >
              <span className="text-sm text-black">{range}</span>
            </button>
          ))}
        </div>
      )}

      {/* Central Display */}
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-6xl font-bold text-black mb-2">
          {String(finalHours).padStart(2, '0')}:{String(finalMinutes).padStart(2, '0')}
        </p>
        <p className="text-base text-gray-600 mt-2">Hours on orders</p>
      </div>

      {/* Sessions Table */}
      {sessions.length > 0 && (
        <div className="px-4 pb-6">
          {/* Table Headers */}
          <div className="bg-gray-50 border-b-2 border-gray-300 px-4 py-3 flex items-center">
            <div className="flex-1">
              <p className="text-sm font-semibold text-black">Sessions</p>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-black">Time Range</p>
            </div>
            <div className="flex-1 text-right">
              <p className="text-sm font-semibold text-black">Time on orders</p>
            </div>
          </div>

          {/* Table Rows */}
          <div className="bg-white">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="border-b border-gray-200 px-4 py-4 flex items-center hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <p className="text-sm text-black">{session.session}</p>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-black">{session.timeRange}</p>
                </div>
                <div className="flex-1 text-right">
                  <p className="text-sm font-medium text-black">{session.timeOnOrders}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-base">No sessions found for selected time range</p>
        </div>
      )}
    </div>
  )
}


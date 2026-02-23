import { useState, useMemo } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, ChevronDown, Calendar, Clock, Ticket } from "lucide-react"
import { Button } from "@/components/ui/button"
import AnimatedPage from "../../components/AnimatedPage"
import { useEffect } from "react"
import { diningAPI } from "@/lib/api"
import Loader from "@/components/Loader"

export default function TableBooking() {
    const { slug } = useParams()
    const location = useLocation()
    const navigate = useNavigate()
    const [restaurant, setRestaurant] = useState(null)
    const [loading, setLoading] = useState(true)

    const [selectedGuests, setSelectedGuests] = useState(location.state?.guestCount || 2)
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [activeTimeOfDay, setActiveTimeOfDay] = useState("Lunch")
    const [selectedSlot, setSelectedSlot] = useState(null)

    useEffect(() => {
        const fetchRestaurant = async () => {
            try {
                const response = await diningAPI.getRestaurantBySlug(slug)
                if (response.data && response.data.success) {
                    const apiRestaurant = response.data.data
                    const actualRestaurant = apiRestaurant?.restaurant || apiRestaurant
                    setRestaurant(actualRestaurant)
                }
            } catch (error) {
                console.error("Error fetching restaurant:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchRestaurant()
    }, [slug])

    // Generate next 7 days
    const dates = useMemo(() => {
        const items = []
        for (let i = 0; i < 7; i++) {
            const date = new Date()
            date.setDate(date.getDate() + i)
            items.push(date)
        }
        return items
    }, [])

    const formatDate = (date) => {
        const today = new Date()
        const tomorrow = new Date()
        tomorrow.setDate(today.getDate() + 1)

        if (date.toDateString() === today.toDateString()) return "Today"
        if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow"

        return date.toLocaleDateString('en-GB', { weekday: 'short' })
    }

    const formatDayNum = (date) => {
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    }

    const slots = {
        Lunch: [
            { time: "12:00 PM", discount: "20% OFF" },
            { time: "12:30 PM", discount: "20% OFF" },
            { time: "1:00 PM", discount: "15% OFF" },
            { time: "1:30 PM", discount: "15% OFF" },
            { time: "2:00 PM", discount: "10% OFF" },
            { time: "2:30 PM", discount: "10% OFF" },
            { time: "3:00 PM", discount: "30% OFF" },
            { time: "3:30 PM", discount: "30% OFF" },
            { time: "3:45 PM", discount: "30% OFF" },
            { time: "4:00 PM", discount: "30% OFF" },
            { time: "4:15 PM", discount: "30% OFF" },
            { time: "4:30 PM", discount: "30% OFF" },
        ],
        Dinner: [
            { time: "7:00 PM", discount: "10% OFF" },
            { time: "7:30 PM", discount: "10% OFF" },
            { time: "8:00 PM", discount: "5% OFF" },
            { time: "8:30 PM", discount: "5% OFF" },
            { time: "9:00 PM", discount: "No OFF" },
            { time: "9:30 PM", discount: "No OFF" },
            { time: "10:00 PM", discount: "15% OFF" },
            { time: "10:30 PM", discount: "20% OFF" },
        ]
    }

    if (loading) return <Loader />
    if (!restaurant) return <div>Restaurant not found</div>

    const handleProceed = () => {
        if (!selectedSlot) return
        navigate("/dining/book-confirmation", {
            state: {
                restaurant,
                guests: selectedGuests,
                date: selectedDate,
                timeSlot: selectedSlot.time,
                discount: selectedSlot.discount
            }
        })
    }

    return (
        <AnimatedPage className="bg-slate-50 min-h-screen pb-24">
            {/* Header */}
            <div className="bg-white px-4 pt-4 pb-12 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-50 rounded-full blur-3xl opacity-50 -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-red-50 rounded-full blur-3xl opacity-30 -ml-16 -mb-16"></div>

                <div className="relative z-10">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 mb-4 bg-white shadow-sm rounded-full">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-gray-900">Book a table</h1>
                        <p className="text-gray-500 font-medium">{restaurant.name}</p>
                    </div>
                </div>
            </div>

            <div className="px-4 -mt-6 relative z-20 space-y-4">
                {/* Guest Selector */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
                    <span className="font-semibold text-gray-700">Select number of guests</span>
                    <div className="relative">
                        <select
                            value={selectedGuests}
                            onChange={(e) => setSelectedGuests(parseInt(e.target.value))}
                            className="appearance-none bg-slate-50 border border-slate-200 rounded-lg py-2 pl-4 pr-10 font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                            {Array.from({ length: restaurant.diningSettings?.maxGuests || 10 }, (_, i) => i + 1).map(num => (
                                <option key={num} value={num}>{num}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                    </div>
                </div>

                {/* Cashback Banner */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-4 flex items-center gap-4 border border-indigo-100 shadow-sm overflow-hidden relative">
                    <div className="absolute right-0 top-0 opacity-10">
                        <Ticket className="w-16 h-16 rotate-45" />
                    </div>
                    <div className="bg-indigo-500 p-2 rounded-xl text-white shadow-lg shadow-indigo-200">
                        <Ticket className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="font-bold text-gray-800 flex items-center gap-1">
                            Get an extra 10% cashback <span className="text-indigo-600">on your final bill</span>
                        </p>
                        <p className="text-xs text-indigo-500 font-medium">payment at the restaurant</p>
                    </div>
                </div>

                {/* Date Selector */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-red-500" />
                        Select date
                    </h3>
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                        {dates.map((date, idx) => (
                            <button
                                key={idx}
                                onClick={() => setSelectedDate(date)}
                                className={`min-w-[110px] p-3 rounded-2xl border transition-all flex flex-col items-center gap-1 ${selectedDate.toDateString() === date.toDateString()
                                    ? "bg-red-50 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                                    : "bg-white border-slate-100 hover:border-slate-200"
                                    }`}
                            >
                                <span className={`text-xs font-bold uppercase tracking-wider ${selectedDate.toDateString() === date.toDateString() ? "text-red-500" : "text-gray-400"
                                    }`}>
                                    {formatDate(date)}
                                </span>
                                <span className={`font-bold ${selectedDate.toDateString() === date.toDateString() ? "text-gray-900" : "text-gray-500"
                                    }`}>
                                    {formatDayNum(date)}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Time Selector */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 min-h-[400px]">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-red-500" />
                        Select time of day
                    </h3>

                    {/* Tabs */}
                    <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
                        {["Lunch", "Dinner"].map(type => (
                            <button
                                key={type}
                                onClick={() => setActiveTimeOfDay(type)}
                                className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTimeOfDay === type
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700"
                                    }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    {/* Slots Grid */}
                    <div className="grid grid-cols-3 gap-3">
                        {slots[activeTimeOfDay].map((slot, idx) => (
                            <button
                                key={idx}
                                onClick={() => setSelectedSlot(slot)}
                                className={`p-3 rounded-xl border transition-all text-center flex flex-col gap-0.5 ${selectedSlot?.time === slot.time
                                    ? "bg-red-500 border-red-500 text-white shadow-lg shadow-red-200"
                                    : "bg-white border-slate-100 hover:border-slate-200"
                                    }`}
                            >
                                <span className={`text-sm font-bold ${selectedSlot?.time === slot.time ? "text-white" : "text-gray-800"
                                    }`}>
                                    {slot.time}
                                </span>
                                {slot.discount !== "No OFF" && (
                                    <span className={`text-[10px] font-bold ${selectedSlot?.time === slot.time ? "text-white/90" : "text-[#EB590E]"
                                        }`}>
                                        {slot.discount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="mt-8 text-center text-red-500 font-bold text-sm flex items-center justify-center gap-1 cursor-pointer">
                        View all slots <ChevronDown className="w-4 h-4" />
                    </div>
                </div>
            </div>

            {/* Sticky Proceed Button */}
            <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-50">
                <Button
                    disabled={!selectedSlot}
                    onClick={handleProceed}
                    className={`w-full h-14 rounded-2xl font-bold text-lg transition-all ${selectedSlot
                        ? "bg-red-500 hover:bg-red-600 text-white shadow-xl shadow-red-200"
                        : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                >
                    Proceed
                </Button>
            </div>
        </AnimatedPage>
    )
}

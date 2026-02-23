import { useState, useEffect } from "react"
import { Calendar, Clock, Users, Search, Filter, MessageSquare, ChevronRight, CheckCircle2, XCircle, Clock4 } from "lucide-react"
import { diningAPI, restaurantAPI } from "@/lib/api"
import Loader from "@/components/Loader"
import { Badge } from "@/components/ui/badge"

export default function DiningReservations() {
    const [bookings, setBookings] = useState([])
    const [loading, setLoading] = useState(true)
    const [restaurant, setRestaurant] = useState(null)
    const [searchTerm, setSearchTerm] = useState("")

    useEffect(() => {
        const fetchAll = async () => {
            try {
                // First get the current restaurant
                const resResponse = await restaurantAPI.getCurrentRestaurant()
                if (resResponse.data.success) {
                    const resData = resResponse.data?.data?.restaurant || resResponse.data?.restaurant || resResponse.data?.data

                    const restaurantId = resData?._id || resData?.id

                    if (restaurantId) {
                        setRestaurant(resData)
                        // Then get its bookings
                        const bookingsResponse = await diningAPI.getRestaurantBookings(restaurantId)
                        if (bookingsResponse.data.success) {
                            setBookings(bookingsResponse.data.data)
                        }
                    } else {
                        console.error("Restaurant ID not found in response:", resData)
                    }
                }
            } catch (error) {
                console.error("Error fetching reservations:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchAll()
    }, [])

    const handleStatusUpdate = async (bookingId, newStatus) => {
        try {
            const response = await diningAPI.updateBookingStatusRestaurant(bookingId, newStatus)
            if (response.data.success) {
                // Update local state
                setBookings(prev => prev.map(b =>
                    b._id === bookingId ? { ...b, status: newStatus } : b
                ))
            }
        } catch (error) {
            console.error("Error updating status:", error)
        }
    }

    const filteredBookings = bookings.filter(booking =>
        booking.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        booking.bookingId?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    if (loading) return <Loader />

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            {/* Header */}
            <div className="bg-white p-6 border-b sticky top-0 z-30">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Table Reservations</h1>
                        <p className="text-slate-500 text-sm mt-1">Manage your upcoming guest bookings</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                id="reservation-search"
                                name="reservation-search"
                                placeholder="Search by name or ID..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:bg-white transition-all"
                            />
                        </div>
                        <button className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                            <Filter className="w-5 h-5 text-slate-600" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6">
                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <div className="flex items-center gap-4">
                            <div className="bg-blue-50 p-3 rounded-xl text-blue-600">
                                <Users className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-slate-500 text-sm font-medium">Total Bookings</p>
                                <p className="text-2xl font-bold text-slate-900">{bookings.length}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <div className="flex items-center gap-4">
                            <div className="bg-green-50 p-3 rounded-xl text-green-600">
                                <CheckCircle2 className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-slate-500 text-sm font-medium">Confirmed</p>
                                <p className="text-2xl font-bold text-slate-900">
                                    {bookings.filter(b => b.status === 'confirmed' || b.status === 'checked-in').length}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <div className="flex items-center gap-4">
                            <div className="bg-orange-50 p-3 rounded-xl text-orange-600">
                                <Clock4 className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-slate-500 text-sm font-medium">Today's Bookings</p>
                                <p className="text-2xl font-bold text-slate-900">
                                    {bookings.filter(b => new Date(b.date).toDateString() === new Date().toDateString()).length}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bookings List */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="font-bold text-slate-800">Recent Reservations</h2>
                    </div>

                    {filteredBookings.length > 0 ? (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Booking ID</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Guest Details</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date & Time</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Guests</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredBookings.map((booking) => (
                                        <tr key={booking._id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-slate-700">#{booking.bookingId}</td>
                                            <td className="px-6 py-4">
                                                <div>
                                                    <p className="font-bold text-slate-900">{booking.user?.name}</p>
                                                    <p className="text-xs text-slate-500">{booking.user?.phone || 'No phone'}</p>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                                        <Calendar className="w-4 h-4 text-slate-400" />
                                                        {new Date(booking.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                                        <Clock className="w-4 h-4 text-slate-400" />
                                                        {booking.timeSlot}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1.5 font-bold text-slate-700">
                                                    <Users className="w-4 h-4 text-slate-400" />
                                                    {booking.guests}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge className={`rounded-lg px-2.5 py-1 ${booking.status === 'confirmed' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                                                    booking.status === 'checked-in' ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' :
                                                        booking.status === 'completed' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                                                            'bg-red-100 text-red-700 hover:bg-red-200'
                                                    }`}>
                                                    {booking.status}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    {booking.status === 'confirmed' && (
                                                        <button
                                                            onClick={() => handleStatusUpdate(booking._id, 'checked-in')}
                                                            className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors"
                                                        >
                                                            Check-in
                                                        </button>
                                                    )}
                                                    {booking.status === 'checked-in' && (
                                                        <button
                                                            onClick={() => handleStatusUpdate(booking._id, 'completed')}
                                                            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
                                                        >
                                                            Check-out
                                                        </button>
                                                    )}
                                                    {booking.specialRequest && (
                                                        <button
                                                            title={booking.specialRequest}
                                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        >
                                                            <MessageSquare className="w-5 h-5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
                            <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Calendar className="w-8 h-8 text-slate-300" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">No reservations found</h3>
                            <p className="text-slate-500 mt-2">When guests book a table, they will appear here.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft,
  CheckCircle,
  Clock,
  IndianRupee
} from "lucide-react"
import { formatCurrency } from "../../restaurant/utils/currency"
import WeekSelector from "../components/WeekSelector"
import { deliveryAPI } from "@/lib/api"
import { fetchWalletTransactions } from "../utils/deliveryWalletState"

export default function PocketStatement() {
  const navigate = useNavigate()

  // Current week range (Sunday–Saturday)
  const getInitialWeekRange = () => {
    const now = new Date()
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }

  const [weekRange, setWeekRange] = useState(getInitialWeekRange)
  const [orders, setOrders] = useState([])
  const [bonusTransactions, setBonusTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  // Load trips (orders) and bonus for selected day
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // 1) Fetch trips for selected week
        const params = {
          period: "weekly",
          date: weekRange.start.toISOString().split("T")[0],
          status: "Completed",
          limit: 1000
        }
        const response = await deliveryAPI.getTripHistory(params)
        const trips = response?.data?.data?.trips || []

        // 2) Fetch bonus transactions for mapping by orderId (if present)
        const bonus = await fetchWalletTransactions({ type: "bonus", limit: 1000 })

        setOrders(trips)
        setBonusTransactions(bonus)
      } catch (error) {
        console.error("Error loading pocket statement data:", error)
        setOrders([])
        setBonusTransactions([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [weekRange])

  // Compute summary for selected week
  const summary = useMemo(() => {
    let totalEarning = 0
    let totalBonus = 0

    // Use trip's deliveryEarning / deliveryPayout if available
    orders.forEach((trip) => {
      const earning =
        trip.deliveryEarning ||
        trip.deliveryPayout ||
        trip.payout ||
        trip.estimatedEarnings?.totalEarning ||
        0
      totalEarning += earning
    })

    // Total bonus for this week using createdAt within range
    bonusTransactions.forEach((b) => {
      const baseDate = b.date || b.createdAt
      if (!baseDate) return
      const d = new Date(baseDate)
      if (d >= weekRange.start && d <= weekRange.end) {
        totalBonus += b.amount || 0
      }
    })

    return {
      totalEarning,
      totalBonus,
      grandTotal: totalEarning + totalBonus
    }
  }, [orders, bonusTransactions, weekRange])

  // Helper: format trip earning and bonus for one order
  const getOrderAmounts = (trip) => {
    const earning =
      trip.deliveryEarning ||
      trip.deliveryPayout ||
      trip.payout ||
      trip.estimatedEarnings?.totalEarning ||
      0

    // Try to find bonus transaction linked to this order
    const orderId = trip.orderId || trip.id || trip._id
    const bonusForOrder = bonusTransactions
      .filter((b) => b.orderId === orderId)
      .reduce((sum, b) => sum + (b.amount || 0), 0)

    return {
      earning,
      bonus: bonusForOrder,
      total: earning + bonusForOrder
    }
  }
  
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
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Pocket statement</h1>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {/* Week selector controls selected week range */}
        <WeekSelector
          onChange={setWeekRange}
        />

        {/* Summary */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-semibold text-gray-800">
                Pocket summary
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-gray-500">Orders earning</p>
              <p className="text-gray-900 font-semibold text-sm">
                {formatCurrency(summary.totalEarning)}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Bonus</p>
              <p className="text-gray-900 font-semibold text-sm">
                {formatCurrency(summary.totalBonus)}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Total (Pocket)</p>
              <p className="text-gray-900 font-semibold text-sm">
                {formatCurrency(summary.grandTotal)}
              </p>
            </div>
          </div>
        </div>

        {/* Orders List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Clock className="w-8 h-8 text-gray-400 mb-2 animate-spin" />
            <p className="text-gray-600 text-base">Loading pocket statement...</p>
          </div>
        ) : orders.length === 0 ? (
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
            {orders.map((trip, index) => {
              const amounts = getOrderAmounts(trip)
              const createdAt = trip.deliveredAt || trip.completedAt || trip.createdAt || trip.orderTime
              const dateText = createdAt
                ? new Date(createdAt).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit"
                  })
                : "N/A"

              const orderId = trip.orderId || trip.id || trip._id

              return (
              <div
                key={orderId || index}
                className="bg-white rounded-xl p-4 shadow-md border border-gray-100"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded ${
                      index % 3 === 0 ? 'bg-green-500' : 
                      index % 3 === 1 ? 'bg-orange-500' : 'bg-blue-500'
                    }`}></div>
                    <div>
                      <p className="text-gray-900 text-sm font-medium">
                        Order #{orderId || "—"}
                      </p>
                      <p className="text-gray-500 text-xs">{dateText}</p>
                      {trip.restaurantName && (
                        <p className="text-gray-500 text-xs mt-0.5">
                          {trip.restaurantName}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-gray-500">Earning</p>
                    <p className="text-gray-900 font-semibold">
                      {formatCurrency(amounts.earning)}
                    </p>
                    {amounts.bonus > 0 && (
                      <p className="text-green-600 font-semibold mt-1">
                        + Bonus {formatCurrency(amounts.bonus)}
                      </p>
                    )}
                    <div className="mt-1 pt-1 border-t border-gray-100">
                      <p className="text-gray-500">Total to pocket</p>
                      <p className="text-gray-900 font-semibold">
                        {formatCurrency(amounts.total)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>
    </div>
  )
}


import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft,
  Loader2,
  Package,
  IndianRupee,
  Gift
} from "lucide-react"
import { formatCurrency } from "../../restaurant/utils/currency"
import WeekSelector from "../components/WeekSelector"
import { deliveryAPI } from "@/lib/api"
import { fetchWalletTransactions } from "../utils/deliveryWalletState"

export default function PocketDetails() {
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
  const [paymentTransactions, setPaymentTransactions] = useState([])
  const [bonusTransactions, setBonusTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  // Load trips (orders), payment transactions, and bonus for selected week
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

        // Filter trips within the selected week range
        const filteredTrips = trips.filter((trip) => {
          const tripDate = trip.deliveredAt || trip.completedAt || trip.createdAt || trip.date
          if (!tripDate) return false
          const d = new Date(tripDate)
          return d >= weekRange.start && d <= weekRange.end
        })

        // 2) Fetch payment transactions (earnings) for mapping by orderId
        const payments = await fetchWalletTransactions({ type: "payment", limit: 1000 })
        
        // Filter payments within the selected week range
        const filteredPayments = payments.filter((p) => {
          const paymentDate = p.date || p.createdAt
          if (!paymentDate) return false
          const d = new Date(paymentDate)
          return d >= weekRange.start && d <= weekRange.end && p.status === "Completed"
        })

        // 3) Fetch bonus transactions for mapping by orderId
        const bonus = await fetchWalletTransactions({ type: "bonus", limit: 1000 })
        
        // Filter bonuses within the selected week range
        const filteredBonuses = bonus.filter((b) => {
          const bonusDate = b.date || b.createdAt
          if (!bonusDate) return false
          const d = new Date(bonusDate)
          return d >= weekRange.start && d <= weekRange.end && b.status === "Completed"
        })

        setOrders(filteredTrips)
        setPaymentTransactions(filteredPayments)
        setBonusTransactions(filteredBonuses)
      } catch (error) {
        console.error("Error loading pocket details data:", error)
        setOrders([])
        setPaymentTransactions([])
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

    // Calculate total earning from payment transactions
    paymentTransactions.forEach((p) => {
      totalEarning += p.amount || 0
    })

    // Total bonus for this week
    bonusTransactions.forEach((b) => {
      totalBonus += b.amount || 0
    })

    return {
      totalEarning,
      totalBonus,
      grandTotal: totalEarning + totalBonus
    }
  }, [paymentTransactions, bonusTransactions])

  // Helper: Get earning for a specific order from payment transactions
  const getOrderEarning = (orderId) => {
    if (!orderId) return 0
    // Try to find payment transaction by orderId
    const payment = paymentTransactions.find((p) => {
      const paymentOrderId = p.orderId || p.metadata?.orderId
      return paymentOrderId && String(paymentOrderId) === String(orderId)
    })
    if (payment) return payment.amount || 0
    
    // Fallback: try to match by date (same day)
    const order = orders.find(o => {
      const oId = o.orderId || o._id || o.id
      return String(oId) === String(orderId)
    })
    if (order) {
      const orderDate = order.deliveredAt || order.completedAt || order.createdAt || order.date
      if (orderDate) {
        const orderDateObj = new Date(orderDate)
        const matchingPayment = paymentTransactions.find((p) => {
          const paymentDate = new Date(p.date || p.createdAt)
          return paymentDate.toDateString() === orderDateObj.toDateString()
        })
        if (matchingPayment) return matchingPayment.amount || 0
      }
      
      // Last fallback: use order's own earning field
      return (
        order.deliveryEarning ||
        order.deliveryPayout ||
        order.payout ||
        order.estimatedEarnings?.totalEarning ||
        order.amount ||
        0
      )
    }
    return 0
  }

  // Helper: Get bonus for a specific order
  const getOrderBonus = (orderId) => {
    if (!orderId) return 0
    // Try to find bonus transaction by orderId
    const bonus = bonusTransactions.find((b) => {
      const bonusOrderId = b.orderId || b.metadata?.orderId
      return bonusOrderId && String(bonusOrderId) === String(orderId)
    })
    if (bonus) return bonus.amount || 0
    
    // Fallback: try to match by date (same day)
    const order = orders.find(o => {
      const oId = o.orderId || o._id || o.id
      return String(oId) === String(orderId)
    })
    if (order) {
      const orderDate = order.deliveredAt || order.completedAt || order.createdAt || order.date
      if (orderDate) {
        const orderDateObj = new Date(orderDate)
        const matchingBonus = bonusTransactions.find((b) => {
          const bonusDate = new Date(b.date || b.createdAt)
          return bonusDate.toDateString() === orderDateObj.toDateString()
        })
        if (matchingBonus) return matchingBonus.amount || 0
      }
    }
    return 0
  }

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "N/A"
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    } catch {
      return "N/A"
    }
  }

  // Get restaurant name from order
  const getRestaurantName = (order) => {
    return (
      order.restaurant ||
      order.restaurantName ||
      order.restaurantId?.name ||
      order.restaurant?.name ||
      "Restaurant"
    )
  }

  // Get order ID for display
  const getOrderId = (order) => {
    return order.orderId || order._id || order.id || "N/A"
  }

  // Get payment method for order
  const getPaymentMethod = (order) => {
    // Try multiple possible fields for payment method
    const paymentMethod = order.paymentMethod || 
                         order.payment?.method || 
                         (order.payment && typeof order.payment === 'object' ? order.payment.method : null)
    
    if (!paymentMethod) {
      // Default to Online if not found
      return { type: 'Online', label: 'Online', color: 'text-green-600' }
    }
    
    const method = String(paymentMethod).toLowerCase().trim()
    // Check if it's COD (cash or cod)
    if (method === 'cash' || method === 'cod') {
      return { type: 'COD', label: 'Cash on Delivery', color: 'text-amber-600' }
    }
    // Otherwise it's online payment (razorpay, wallet, upi, card, etc.)
    return { type: 'Online', label: 'Online', color: 'text-green-600' }
  }


  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden pb-24 md:pb-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg md:text-xl font-bold text-gray-900">Pocket Details</h1>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {/* Week Selector */}
        <div className="mb-6">
          <WeekSelector 
            onChange={(range) => setWeekRange(range)}
            weekStartsOn={0}
          />
        </div>

        {/* Summary Card */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Week Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Orders Earning</span>
              <span className="text-gray-900 font-semibold">{formatCurrency(summary.totalEarning)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Bonus</span>
              <span className="text-green-600 font-semibold">+{formatCurrency(summary.totalBonus)}</span>
            </div>
            <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
              <span className="text-gray-900 font-semibold">Total (Pocket)</span>
              <span className="text-gray-900 text-lg font-bold">{formatCurrency(summary.grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Orders List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-4" />
            <p className="text-gray-600 text-base">Loading orders...</p>
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Order Details</h2>
            {orders.map((order, index) => {
              const orderId = getOrderId(order)
              const earning = getOrderEarning(orderId)
              const bonus = getOrderBonus(orderId)
              const restaurantName = getRestaurantName(order)
              const orderDate = order.deliveredAt || order.completedAt || order.createdAt || order.date
              const paymentInfo = getPaymentMethod(order)

              return (
                <div
                  key={orderId || index}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Package className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-900 font-semibold text-sm">
                          Order #{orderId}
                        </span>
                      </div>
                      <p className="text-gray-600 text-xs mb-1">{restaurantName}</p>
                      <p className="text-gray-500 text-xs mb-1">{formatDate(orderDate)}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs">Payment:</span>
                        <span className={`text-xs font-semibold ${paymentInfo.color}`}>
                          {paymentInfo.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Earning and Bonus Breakdown */}
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <IndianRupee className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-600 text-sm">Earning</span>
                      </div>
                      <span className="text-gray-900 font-semibold">{formatCurrency(earning)}</span>
                    </div>
                    {bonus > 0 && (
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Gift className="w-4 h-4 text-green-500" />
                          <span className="text-gray-600 text-sm">Bonus</span>
                        </div>
                        <span className="text-green-600 font-semibold">+{formatCurrency(bonus)}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                      <span className="text-gray-700 font-medium text-sm">Total</span>
                      <span className="text-gray-900 font-bold">{formatCurrency(earning + bonus)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-900 text-lg font-semibold mb-2">No orders found</p>
            <p className="text-gray-600 text-sm text-center max-w-xs">
              No completed orders found for the selected week. Your order details will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}


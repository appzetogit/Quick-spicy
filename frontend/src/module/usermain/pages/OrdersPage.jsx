import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft,
  Clock,
  CheckCircle,
  Home,
  Heart,
  ShoppingBag,
  Menu,
  ChefHat,
  Loader2,
  AlertCircle
} from "lucide-react"
import { userAPI } from "@/lib/api"
import { toast } from "sonner"

export default function OrdersPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  // Fetch orders from API
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true)
        
        // Check authentication token
        const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
        const userData = localStorage.getItem('user_user') || localStorage.getItem('userProfile')
        let currentUserId = null
        if (userData) {
          try {
            const parsed = JSON.parse(userData)
            currentUserId = parsed._id || parsed.id
            console.log('👤 Current User ID:', currentUserId)
          } catch (e) {
            console.warn('⚠️ Could not parse user data:', e)
          }
        }
        
        console.log('🔐 User Token exists:', !!userToken)
        console.log('👤 Current User ID from localStorage:', currentUserId)
        console.log('🔄 Fetching user orders from API...')
        console.log('📡 API Endpoint: /api/user/orders')
        console.log('📡 Request params: { limit: 100, page: 1 }')
        
        const response = await userAPI.getOrders({
          limit: 100, // Get all orders
          page: 1
        })
        
        console.log('📦 User Orders API Response:', response?.data)
        console.log('📦 Response Status:', response?.status)
        console.log('📦 Full Response:', response)
        
        // Check multiple possible response structures
        let ordersData = []
        
        if (response?.data?.success && response?.data?.data?.orders) {
          ordersData = response.data.data.orders || []
          console.log('✅ Found orders in response.data.data.orders:', ordersData.length)
        } else if (response?.data?.orders) {
          ordersData = response.data.orders || []
          console.log('✅ Found orders in response.data.orders:', ordersData.length)
        } else if (response?.data?.data && Array.isArray(response.data.data)) {
          ordersData = response.data.data || []
          console.log('✅ Found orders in response.data.data (array):', ordersData.length)
        } else {
          console.warn('⚠️ No orders found in response')
          console.warn('⚠️ Response structure:', JSON.stringify(response?.data, null, 2))
          setOrders([])
          return
        }
        
        if (ordersData.length > 0) {
          console.log('✅ Processing orders:', ordersData.length)
          
          // Transform API orders to match UI structure
          const transformedOrders = ordersData.map(order => {
            const createdAt = new Date(order.createdAt)
            const deliveredAt = order.tracking?.delivered?.timestamp 
              ? new Date(order.tracking.delivered.timestamp)
              : null
            
            return {
              id: order.orderId || order._id,
              mongoId: order._id,
              restaurant: order.restaurantName || order.restaurantId?.name || 'Restaurant',
              restaurantId: order.restaurantId,
              status: getOrderStatus(order),
              date: createdAt,
              time: createdAt.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
              }),
              items: order.items?.length || 0,
              itemsList: order.items || [],
              total: order.pricing?.total || 0,
              subtotal: order.pricing?.subtotal || 0,
              deliveryFee: order.pricing?.deliveryFee || 0,
              tax: order.pricing?.tax || 0,
              address: order.address,
              payment: order.payment,
              deliveredAt: deliveredAt,
              createdAt: createdAt
            }
          })
          
          setOrders(transformedOrders)
          console.log('✅ Orders transformed and set:', transformedOrders.length)
        } else {
          console.warn('⚠️ No orders to transform')
          setOrders([])
        }
      } catch (error) {
        console.error('❌ Error fetching user orders:', error)
        console.error('❌ Error message:', error?.message)
        console.error('❌ Error response:', error?.response?.data)
        console.error('❌ Error status:', error?.response?.status)
        console.error('❌ Error config:', error?.config)
        
        // More detailed error message
        let errorMessage = 'Failed to load orders'
        if (error?.response?.status === 401) {
          errorMessage = 'Please login to view your orders'
        } else if (error?.response?.status === 403) {
          errorMessage = 'Access denied. Please login again'
        } else if (error?.response?.data?.message) {
          errorMessage = error.response.data.message
        } else if (error?.message) {
          errorMessage = error.message
        }
        
        toast.error(errorMessage)
        setOrders([])
      } finally {
        setLoading(false)
      }
    }

    fetchOrders()
  }, [])

  // Get order status text
  const getOrderStatus = (order) => {
    const status = order.status
    if (status === 'delivered' || status === 'completed') return 'Delivered'
    if (status === 'out_for_delivery') return 'Out for Delivery'
    if (status === 'ready') return 'Ready'
    if (status === 'preparing') return 'Preparing'
    if (status === 'confirmed') return 'Confirmed'
    return status || 'Pending'
  }

  // Format date helper
  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return "Today"
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday"
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }

  return (
    <div className="min-h-screen bg-[#f6e9dc] pb-20 md:pb-24">
      {/* Header */}
      <div className="bg-white sticky top-0 z-50 rounded-b-3xl">
        <div className="px-4 py-2.5 md:py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 md:p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 text-gray-800" />
          </button>
          <h1 className="text-base md:text-lg font-bold text-gray-900">My Orders</h1>
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="px-4 py-8 text-center">
          <div className="bg-white rounded-xl p-6 md:p-8 shadow-sm">
            <Loader2 className="w-12 h-12 md:w-16 md:h-16 text-[#ff8100] mx-auto mb-3 animate-spin" />
            <h3 className="text-sm md:text-base font-semibold text-gray-900 mb-1">Loading orders...</h3>
          </div>
        </div>
      ) : orders.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="bg-white rounded-xl p-6 md:p-8 shadow-sm">
            <ShoppingBag className="w-12 h-12 md:w-16 md:h-16 text-gray-300 mx-auto mb-3" />
            <h3 className="text-sm md:text-base font-semibold text-gray-900 mb-1">No orders yet</h3>
            <p className="text-xs md:text-sm text-gray-600 mb-4">Your orders will appear here</p>
            <button
              onClick={() => navigate('/usermain')}
              className="text-[#ff8100] text-xs md:text-sm font-semibold"
            >
              Start Shopping
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 md:py-4 space-y-2.5 md:space-y-4">
          {orders.map((order) => {
            // Check if payment failed
            const paymentFailed = order.payment?.status === 'failed' || order.payment?.status === 'pending'
            
            return (
              <div
                key={order.id || order.mongoId}
                className="bg-white rounded-xl p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2 md:mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs md:text-sm font-bold text-gray-900 mb-0.5 md:mb-1 truncate">
                      Order #{order.id}
                    </h3>
                    <p className="text-[10px] md:text-xs text-gray-600 truncate">
                      {order.restaurant || "Restaurant"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
                    <div className={`px-1.5 md:px-2 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-semibold ${
                      order.status === "Delivered" 
                        ? "bg-green-100 text-green-700"
                        : order.status === "Preparing" || order.status === "Ready"
                        ? "bg-orange-100 text-orange-700"
                        : order.status === "Out for Delivery"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-700"
                    }`}>
                      {order.status}
                    </div>
                    {paymentFailed && (
                      <div className="flex items-center gap-1 px-1.5 py-0.5 bg-red-50 rounded-full">
                        <AlertCircle className="w-2.5 h-2.5 text-red-600" />
                        <span className="text-[9px] text-red-600 font-semibold">Payment Failed</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs text-gray-600 mb-2 md:mb-3">
                  <Clock className="w-2.5 h-2.5 md:w-3 md:h-3 flex-shrink-0" />
                  <span className="truncate">{formatDate(order.date)} at {order.time}</span>
                </div>

                {/* Order Items Preview */}
                {order.itemsList && order.itemsList.length > 0 && (
                  <div className="mb-2 md:mb-3">
                    <div className="flex flex-wrap gap-1.5">
                      {order.itemsList.slice(0, 3).map((item, idx) => (
                        <span 
                          key={idx}
                          className="text-[10px] md:text-xs text-gray-600 bg-gray-50 px-2 py-0.5 rounded-full"
                        >
                          {item.quantity}x {item.name}
                        </span>
                      ))}
                      {order.itemsList.length > 3 && (
                        <span className="text-[10px] md:text-xs text-gray-500">
                          +{order.itemsList.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 md:pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-[10px] md:text-xs text-gray-600">{order.items} items</p>
                    <p className="text-sm md:text-base font-bold text-gray-900">
                      ₹{order.total.toFixed(2)}
                    </p>
                  </div>
                  <button 
                    onClick={() => navigate(`/usermain/orders/${order.id || order.mongoId}`)}
                    className="text-[#ff8100] text-[10px] md:text-xs font-semibold ml-2 flex-shrink-0 hover:underline"
                  >
                    View Details
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom Navigation Bar - Mobile Only */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
        <div className="flex items-center justify-around py-2 px-4">
          <button 
            onClick={() => navigate('/usermain')}
            className="flex flex-col items-center gap-1 p-2 text-gray-600 hover:text-[#ff8100] transition-colors"
          >
            <Home className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium">Home</span>
          </button>
          <button 
            onClick={() => navigate('/usermain/wishlist')}
            className="flex flex-col items-center gap-1 p-2 text-gray-600 hover:text-[#ff8100] transition-colors"
          >
            <Heart className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium">Wishlist</span>
          </button>
          <button className="flex flex-col items-center gap-1 p-2 -mt-8">
            <div className="bg-white rounded-full p-3 shadow-lg border-2 border-gray-200">
              <ChefHat className="w-6 h-6 text-gray-600" />
            </div>
          </button>
          <button 
            onClick={() => navigate('/usermain/orders')}
            className="flex flex-col items-center gap-1 p-2 text-[#ff8100]"
          >
            <ShoppingBag className="w-6 h-6" />
            <span className="text-xs text-[#ff8100] font-medium">Orders</span>
          </button>
          <button className="flex flex-col items-center gap-1 p-2 text-gray-600">
            <Menu className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium">Menu</span>
          </button>
        </div>
      </div>
    </div>
  )
}


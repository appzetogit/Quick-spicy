import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  Clock,
  MapPin,
  Phone,
  CheckCircle,
  Package,
  Home,
  Heart,
  ShoppingBag,
  Menu,
  ChefHat,
  Navigation,
  Map,
  X,
  Edit,
  AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"

export default function OrderDetailsPage() {
  const navigate = useNavigate()
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [showMap, setShowMap] = useState(false)
  const [remainingTime, setRemainingTime] = useState(0)
  const [canCancelOrEdit, setCanCancelOrEdit] = useState(false)

  useEffect(() => {
    // Load order from localStorage
    const savedOrders = localStorage.getItem('usermain_orders')
    if (savedOrders) {
      try {
        const orders = JSON.parse(savedOrders)
        const foundOrder = orders.find(o => o.id === orderId)
        if (foundOrder) {
          setOrder(foundOrder)
        }
      } catch (error) {
        console.error('Error loading order:', error)
      }
    }
  }, [orderId])

  // Timer for cancel/edit window
  useEffect(() => {
    if (!order) return

    const calculateRemainingTime = () => {
      const orderTime = new Date(order.timestamp || order.date).getTime()
      const currentTime = new Date().getTime()
      const elapsed = currentTime - orderTime
      const oneMinute = 60 * 1000 // 60 seconds in milliseconds

      if (elapsed < oneMinute) {
        const remaining = Math.ceil((oneMinute - elapsed) / 1000)
        setRemainingTime(remaining)
        setCanCancelOrEdit(true)
      } else {
        setRemainingTime(0)
        setCanCancelOrEdit(false)
      }
    }

    calculateRemainingTime()
    const interval = setInterval(calculateRemainingTime, 1000)

    return () => clearInterval(interval)
  }, [order])

  const handleCancelOrder = () => {
    if (!canCancelOrEdit) return

    if (window.confirm('Are you sure you want to cancel this order?')) {
      // Update order status to cancelled
      const savedOrders = localStorage.getItem('usermain_orders')
      if (savedOrders) {
        try {
          const orders = JSON.parse(savedOrders)
          const updatedOrders = orders.map(o =>
            o.id === orderId ? { ...o, status: 'Cancelled' } : o
          )
          localStorage.setItem('usermain_orders', JSON.stringify(updatedOrders))
          setOrder({ ...order, status: 'Cancelled' })
        } catch (error) {
          console.error('Error cancelling order:', error)
        }
      }
    }
  }

  const handleEditOrder = () => {
    if (!canCancelOrEdit) return
    // Navigate to edit order page or show edit modal
    navigate(`/usermain/orders/${orderId}/edit`)
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#f6e9dc] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Order not found</p>
          <Button
            onClick={() => navigate('/usermain/orders')}
            className="mt-4 bg-[#ff8100] hover:bg-[#e67300] text-white"
          >
            Back to Orders
          </Button>
        </div>
      </div>
    )
  }

  const orderDetails = order.orderDetails || {}
  const items = orderDetails.items || []

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
          <h1 className="text-base md:text-lg font-bold text-gray-900">Order Details</h1>
        </div>
      </div>

      {/* Order Status Card */}
      <div className="px-4 py-3 md:py-4">
        <div className="bg-white rounded-xl p-4 md:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm md:text-base font-bold text-gray-900 mb-1">Order #{order.id}</h3>
              <p className="text-xs md:text-sm text-gray-600">{order.restaurant}</p>
            </div>
            <div className={`px-2 md:px-3 py-1 md:py-1.5 rounded-full text-xs font-semibold ${order.status === "Delivered"
              ? "bg-green-100 text-green-700"
              : order.status === "Preparing"
                ? "bg-orange-100 text-orange-700"
                : "bg-blue-100 text-blue-700"
              }`}>
              {order.status}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600">
            <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span>{new Date(order.date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })} at {order.time}</span>
          </div>
        </div>
      </div>

      {/* Countdown Timer for Cancel/Edit Window */}
      {canCancelOrEdit && (
        <div className="px-4 py-3 md:py-4">
          <div className="bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-200 rounded-xl p-4 md:p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-orange-100 rounded-full p-2">
                <AlertCircle className="w-5 h-5 text-orange-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm md:text-base font-bold text-gray-900">Quick Action Window</h3>
                <p className="text-xs text-gray-600">You can cancel or edit your order</p>
              </div>
              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2">
                <Clock className="w-4 h-4 text-orange-600" />
                <span className="text-lg md:text-xl font-bold text-orange-600">{remainingTime}s</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <button
                onClick={handleCancelOrder}
                className="flex items-center justify-center gap-2 bg-white border-2 border-red-200 hover:bg-red-50 text-red-600 font-semibold rounded-lg py-2 md:py-3 text-sm md:text-base transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel Order
              </button>
              <button
                onClick={handleEditOrder}
                className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg py-2 md:py-3 text-sm md:text-base transition-colors"
              >
                <Edit className="w-4 h-4" />
                Edit Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map View Toggle */}
      <div className="px-4 mb-3 md:mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Map className="w-4 h-4 md:w-5 md:h-5 text-[#ff8100]" />
              <span className="text-sm md:text-base font-semibold text-gray-900">Track Order</span>
            </div>
            <button
              onClick={() => setShowMap(!showMap)}
              className="flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-[#ff8100] hover:bg-[#e67300] text-white rounded-lg text-xs md:text-sm font-semibold transition-colors"
            >
              <Navigation className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {showMap ? "Hide Map" : "Show Map"}
            </button>
          </div>
        </div>
      </div>

      {/* Map View */}
      {showMap && (
        <div className="px-4 mb-3 md:mb-4">
          <div className="bg-white rounded-xl overflow-hidden shadow-sm">
            <div className="relative w-full h-64 md:h-80 bg-gray-200">
              {/* Map placeholder - In real app, integrate Google Maps or Mapbox */}
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-100 to-blue-200">
                <div className="text-center">
                  <MapPin className="w-12 h-12 md:w-16 md:h-16 text-[#ff8100] mx-auto mb-2" />
                  <p className="text-sm md:text-base font-semibold text-gray-700">Live Tracking</p>
                  <p className="text-xs md:text-sm text-gray-600 mt-1">Order is on the way</p>
                </div>
              </div>
              {/* You can integrate Google Maps here */}
              {/* <iframe
                src="https://www.google.com/maps/embed?pb=..."
                className="w-full h-full"
                allowFullScreen
              /> */}
            </div>
            <div className="p-3 md:p-4">
              <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600">
                <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#ff8100]" />
                <span>{orderDetails.deliveryAddress || "202, Princess Centre, 2nd Floor, 6/3, 452001, New Delhi"}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Items */}
      <div className="px-4 mb-3 md:mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm">
          <h3 className="text-sm md:text-base font-bold text-gray-900 mb-3">Order Items</h3>
          <div className="space-y-2 md:space-y-3">
            {items.length > 0 ? (
              items.map((item, index) => (
                <div key={index} className="flex items-center justify-between pb-2 md:pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="flex-1">
                    <p className="text-xs md:text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-[10px] md:text-xs text-gray-500">Quantity: {item.quantity}</p>
                  </div>
                  <p className="text-xs md:text-sm font-bold text-gray-900">
                    ${(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs md:text-sm text-gray-600">No items found</p>
            )}
          </div>
        </div>
      </div>

      {/* Order Summary */}
      <div className="px-4 mb-3 md:mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm">
          <h3 className="text-sm md:text-base font-bold text-gray-900 mb-3">Order Summary</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs md:text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-900 font-medium">${(orderDetails.subtotal || 0).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs md:text-sm">
              <span className="text-gray-600">Delivery Fee</span>
              <span className="text-gray-900 font-medium">${(orderDetails.deliveryFee || 0).toFixed(2)}</span>
            </div>
            {orderDetails.discount > 0 && (
              <div className="flex items-center justify-between text-xs md:text-sm">
                <span className="text-gray-600">Discount</span>
                <span className="text-[#ff8100] font-medium">-${orderDetails.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm md:text-base font-bold text-gray-900">Total</span>
                <span className="text-lg md:text-xl font-bold text-[#ff8100]">${order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Information */}
      <div className="px-4 mb-3 md:mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm">
          <h3 className="text-sm md:text-base font-bold text-gray-900 mb-3">Delivery Information</h3>
          <div className="space-y-2 md:space-y-3">
            <div className="flex items-start gap-3">
              <div className="bg-[#ff8100] rounded-lg p-2 flex-shrink-0">
                <MapPin className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs md:text-sm font-semibold text-gray-900 mb-1">Delivery Address</p>
                <p className="text-[10px] md:text-xs text-gray-600">
                  {orderDetails.deliveryAddress || "202, Princess Centre, 2nd Floor, 6/3, 452001, New Delhi"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-[#ff8100] rounded-lg p-2 flex-shrink-0">
                <Clock className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs md:text-sm font-semibold text-gray-900 mb-1">Estimated Delivery</p>
                <p className="text-[10px] md:text-xs text-gray-600">
                  {orderDetails.estimatedTime || "30-40 min"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-[#ff8100] rounded-lg p-2 flex-shrink-0">
                <Package className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs md:text-sm font-semibold text-gray-900 mb-1">Payment Method</p>
                <p className="text-[10px] md:text-xs text-gray-600 capitalize">
                  {order.paymentMethod === "cash" ? "Cash on Delivery" : "Card Payment"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Support */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-[#ff8100] rounded-lg p-2">
              <Phone className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-xs md:text-sm font-semibold text-gray-900">Need Help?</p>
              <p className="text-[10px] md:text-xs text-gray-600">Contact our support team</p>
            </div>
            <Button
              className="bg-[#ff8100] hover:bg-[#e67300] text-white text-xs md:text-sm px-3 md:px-4 py-1.5 md:py-2"
              onClick={() => {
                // Handle contact support
                window.location.href = "tel:+1234567890"
              }}
            >
              Call
            </Button>
          </div>
        </div>
      </div>

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

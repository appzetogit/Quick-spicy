import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft,
  MapPin,
  CreditCard,
  Clock,
  ShoppingBag,
  Home,
  Heart,
  Menu,
  ChefHat
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function CheckoutPage() {
  const navigate = useNavigate()
  const [paymentMethod, setPaymentMethod] = useState("card")

  // Get order data from localStorage (set by CartPage) or use default
  const getOrderData = () => {
    const cartData = localStorage.getItem('usermain_cart')
    if (cartData) {
      try {
        const cartItems = JSON.parse(cartData)
        const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
        const deliveryFee = 5.00
        const discount = 0
        const total = subtotal + deliveryFee - discount

        return {
          items: cartItems,
          subtotal: subtotal,
          deliveryFee: deliveryFee,
          discount: discount,
          total: total,
          deliveryAddress: "202, Princess Centre, 2nd Floor, 6/3, 452001, New Delhi",
          estimatedTime: "30-40 min"
        }
      } catch (error) {
        console.error('Error parsing cart data:', error)
      }
    }
    
    // Default fallback data
    return {
      items: [
        { id: 1, name: "Fried Spicy Chicken Wings", quantity: 1, price: 37.99 },
        { id: 2, name: "Seafood Pizza", quantity: 1, price: 29.99 },
        { id: 3, name: "Tuna Salad", quantity: 2, price: 9.99 },
        { id: 4, name: "Hamburger", quantity: 2, price: 9.99 },
      ],
      subtotal: 88.98,
      deliveryFee: 5.00,
      discount: 0,
      total: 93.98,
      deliveryAddress: "202, Princess Centre, 2nd Floor, 6/3, 452001, New Delhi",
      estimatedTime: "30-40 min"
    }
  }

  const orderSummary = getOrderData()

  // Save order data to localStorage before navigating to payment
  const handleProceedToPayment = () => {
    localStorage.setItem('usermain_current_order', JSON.stringify(orderSummary))
    if (paymentMethod === "cash") {
      navigate(`/usermain/payment?method=cash`)
    } else {
      navigate(`/usermain/payment?method=card`)
    }
  }

  return (
    <div className="min-h-screen bg-[#f6e9dc] pb-24">
      {/* Header */}
      <div className="bg-white sticky top-0 z-50 rounded-b-3xl">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-800" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Checkout</h1>
        </div>
      </div>

      {/* Delivery Address */}
      <div className="px-4 py-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="bg-[#ff8100] rounded-lg p-2">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-900 mb-1">Delivery Address</h3>
              <p className="text-xs text-gray-600">{orderSummary.deliveryAddress}</p>
              <button className="text-[#ff8100] text-xs font-medium mt-2">
                Change Address
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Order Items */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Order Items</h3>
          <div className="space-y-3">
            {orderSummary.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-500">Quantity: {item.quantity}</p>
                </div>
                <p className="text-sm font-bold text-gray-900">
                  ${(item.price * item.quantity).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Order Summary */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Order Summary</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-900 font-medium">${orderSummary.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Delivery Fee</span>
              <span className="text-gray-900 font-medium">${orderSummary.deliveryFee.toFixed(2)}</span>
            </div>
            {orderSummary.discount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Discount</span>
                <span className="text-[#ff8100] font-medium">-${orderSummary.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold text-[#ff8100]">${orderSummary.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Estimated Delivery Time */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-[#ff8100] rounded-lg p-2">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Estimated Delivery Time</p>
              <p className="text-sm font-bold text-gray-900">{orderSummary.estimatedTime}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Method */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Payment Method</h3>
          <div className="space-y-2">
            <button
              onClick={() => setPaymentMethod("card")}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${
                paymentMethod === "card"
                  ? "border-[#ff8100] bg-[#ff8100]/10"
                  : "border-gray-200 bg-white"
              }`}
            >
              <CreditCard className={`w-5 h-5 ${paymentMethod === "card" ? "text-[#ff8100]" : "text-gray-400"}`} />
              <span className={`text-sm font-medium ${paymentMethod === "card" ? "text-[#ff8100]" : "text-gray-700"}`}>
                Credit/Debit Card
              </span>
            </button>
            <button
              onClick={() => setPaymentMethod("cash")}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${
                paymentMethod === "cash"
                  ? "border-[#ff8100] bg-[#ff8100]/10"
                  : "border-gray-200 bg-white"
              }`}
            >
              <ShoppingBag className={`w-5 h-5 ${paymentMethod === "cash" ? "text-[#ff8100]" : "text-gray-400"}`} />
              <span className={`text-sm font-medium ${paymentMethod === "cash" ? "text-[#ff8100]" : "text-gray-700"}`}>
                Cash on Delivery
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Proceed to Payment Button */}
      <div className="px-4 pb-20">
        <Button
          className="w-full bg-[#ff8100] hover:bg-[#e67300] text-white font-bold py-4 rounded-xl text-base"
          onClick={handleProceedToPayment}
        >
          {paymentMethod === "cash" ? "Place Order" : "Proceed to Payment"}
        </Button>
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
          <button className="flex flex-col items-center gap-1 p-2 text-gray-600">
            <ShoppingBag className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium">Orders</span>
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

import { useState, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { 
  ArrowLeft,
  CreditCard,
  Lock,
  CheckCircle,
  Home,
  Heart,
  ShoppingBag,
  Menu,
  ChefHat
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function PaymentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const paymentMethod = searchParams.get("method") || "card"
  
  const [cardNumber, setCardNumber] = useState("")
  const [cardName, setCardName] = useState("")
  const [expiryDate, setExpiryDate] = useState("")
  const [cvv, setCvv] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // Get order data from localStorage (set by CheckoutPage)
  const getOrderData = () => {
    const orderData = localStorage.getItem('usermain_current_order')
    if (orderData) {
      try {
        return JSON.parse(orderData)
      } catch (error) {
        console.error('Error parsing order data:', error)
      }
    }
    // Default fallback
    return {
      items: [],
      subtotal: 88.98,
      deliveryFee: 5.00,
      discount: 0,
      total: 93.98,
      deliveryAddress: "202, Princess Centre, 2nd Floor, 6/3, 452001, New Delhi",
      estimatedTime: "30-40 min"
    }
  }

  const [orderData] = useState(getOrderData())
  const totalAmount = orderData.total || 93.98

  // Save order to localStorage
  const saveOrder = () => {
    const newOrder = {
      id: `ORD-${Date.now()}`,
      date: new Date().toISOString(),
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      items: orderData.items?.length || 0,
      total: totalAmount,
      status: "Preparing",
      restaurant: "Hungry Puppets", // You can get this from orderData if available
      paymentMethod: paymentMethod,
      orderDetails: orderData
    }

    // Get existing orders
    const savedOrders = localStorage.getItem('usermain_orders')
    let orders = []
    if (savedOrders) {
      try {
        orders = JSON.parse(savedOrders)
      } catch (error) {
        console.error('Error parsing saved orders:', error)
      }
    }

    // Add new order at the beginning
    orders.unshift(newOrder)

    // Save back to localStorage
    localStorage.setItem('usermain_orders', JSON.stringify(orders))

    // Clear current order
    localStorage.removeItem('usermain_current_order')
  }

  // Auto-process Cash on Delivery
  useEffect(() => {
    if (paymentMethod === "cash") {
      setIsProcessing(true)
      setTimeout(() => {
        saveOrder()
        setIsProcessing(false)
        setIsSuccess(true)
        setTimeout(() => {
          navigate('/usermain/orders')
        }, 2000)
      }, 1500)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, navigate])

  const handleCardNumberChange = (e) => {
    let value = e.target.value.replace(/\s/g, "")
    if (value.length <= 16) {
      value = value.match(/.{1,4}/g)?.join(" ") || value
      setCardNumber(value)
    }
  }

  const handleExpiryChange = (e) => {
    let value = e.target.value.replace(/\D/g, "")
    if (value.length <= 4) {
      value = value.match(/.{1,2}/g)?.join("/") || value
      setExpiryDate(value)
    }
  }

  const handleCvvChange = (e) => {
    let value = e.target.value.replace(/\D/g, "")
    if (value.length <= 3) {
      setCvv(value)
    }
  }

  const handlePayment = () => {
    if (paymentMethod === "cash") {
      return // Already handled by useEffect
    }
    
    if (!cardNumber || !cardName || !expiryDate || !cvv) {
      return
    }
    
    setIsProcessing(true)
    
    // Simulate payment processing
    setTimeout(() => {
      saveOrder()
      setIsProcessing(false)
      setIsSuccess(true)
      
      // Navigate to success page after 2 seconds
      setTimeout(() => {
        navigate('/usermain/orders')
      }, 2000)
    }, 2000)
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#f6e9dc] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-6 md:p-8 text-center max-w-md w-full shadow-lg">
          <div className="bg-green-500 rounded-full p-3 md:p-4 w-16 h-16 md:w-20 md:h-20 mx-auto mb-3 md:mb-4 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 md:w-12 md:h-12 text-white" />
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
            {paymentMethod === "cash" ? "Order Placed!" : "Payment Successful!"}
          </h2>
          <p className="text-sm md:text-base text-gray-600 mb-4 md:mb-6">
            {paymentMethod === "cash" 
              ? "Your order has been placed. Pay cash on delivery." 
              : "Your order has been placed successfully."}
          </p>
          <Button
            className="w-full bg-[#ff8100] hover:bg-[#e67300] text-white font-semibold py-2.5 md:py-3 rounded-lg text-sm md:text-base"
            onClick={() => navigate('/usermain/orders')}
          >
            View Orders
          </Button>
        </div>
      </div>
    )
  }

  // Show processing for Cash on Delivery
  if (paymentMethod === "cash" && isProcessing) {
    return (
      <div className="min-h-screen bg-[#f6e9dc] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-6 text-center max-w-md w-full shadow-lg">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#ff8100] border-t-transparent mx-auto mb-4"></div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Placing Order...</h2>
          <p className="text-sm text-gray-600">Please wait</p>
        </div>
      </div>
    )
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
          <h1 className="text-base md:text-lg font-bold text-gray-900">Payment</h1>
        </div>
      </div>

      {/* Payment Amount */}
      <div className="px-4 py-3 md:py-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs md:text-sm font-medium text-gray-600">Total Amount</span>
            <span className="text-xl md:text-2xl font-bold text-[#ff8100]">${totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Card Details Form */}
      <div className="px-4 mb-3 md:mb-4">
        <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <CreditCard className="w-4 h-4 md:w-5 md:h-5 text-[#ff8100]" />
            <h3 className="text-xs md:text-sm font-bold text-gray-900">Card Details</h3>
          </div>

          <div className="space-y-3 md:space-y-4">
            {/* Card Number */}
            <div>
              <label className="text-[10px] md:text-xs font-medium text-gray-700 mb-1 block">Card Number</label>
              <Input
                type="text"
                placeholder="1234 5678 9012 3456"
                value={cardNumber}
                onChange={handleCardNumberChange}
                maxLength={19}
                className="h-10 md:h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#ff8100] text-sm"
              />
            </div>

            {/* Card Holder Name */}
            <div>
              <label className="text-[10px] md:text-xs font-medium text-gray-700 mb-1 block">Card Holder Name</label>
              <Input
                type="text"
                placeholder="John Doe"
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                className="h-10 md:h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#ff8100] text-sm"
              />
            </div>

            {/* Expiry and CVV */}
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div>
                <label className="text-[10px] md:text-xs font-medium text-gray-700 mb-1 block">Expiry Date</label>
                <Input
                  type="text"
                  placeholder="MM/YY"
                  value={expiryDate}
                  onChange={handleExpiryChange}
                  maxLength={5}
                  className="h-10 md:h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#ff8100] text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] md:text-xs font-medium text-gray-700 mb-1 block">CVV</label>
                <Input
                  type="text"
                  placeholder="123"
                  value={cvv}
                  onChange={handleCvvChange}
                  maxLength={3}
                  className="h-10 md:h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-[#ff8100] text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Security Info */}
      <div className="px-4 mb-3 md:mb-4">
        <div className="flex items-center gap-2 text-[10px] md:text-xs text-gray-600">
          <Lock className="w-3 h-3 md:w-4 md:h-4" />
          <span>Your payment is secured and encrypted</span>
        </div>
      </div>

      {/* Pay Button */}
      <div className="px-4 pb-16 md:pb-20">
        <Button
          className="w-full bg-[#ff8100] hover:bg-[#e67300] text-white font-bold py-3 md:py-4 rounded-xl text-sm md:text-base disabled:opacity-50"
          onClick={handlePayment}
          disabled={isProcessing || !cardNumber || !cardName || !expiryDate || !cvv}
        >
          {isProcessing ? "Processing..." : `Pay $${totalAmount.toFixed(2)}`}
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

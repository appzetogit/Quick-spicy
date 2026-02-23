import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { 
  X,
  ShoppingBag,
  Users,
  Minus,
  Plus,
  ChevronRight,
  Home,
  Heart,
  Menu,
  ChefHat
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function CartPage() {
  const navigate = useNavigate()
  
  // Mock cart items - in real app, this would come from cart context/state
  const [cartItems, setCartItems] = useState([
    {
      id: 1,
      name: "Fried Spicy Chicken Wings",
      image: "https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?w=400&h=400&fit=crop",
      price: 37.99,
      quantity: 1,
      stock: 999,
      popularity: 220
    },
    {
      id: 2,
      name: "Seafood Pizza",
      image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=400&fit=crop",
      price: 29.99,
      quantity: 1,
      stock: 999,
      popularity: 220
    },
    {
      id: 3,
      name: "Tuna Salad",
      image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=400&fit=crop",
      price: 9.99,
      quantity: 2,
      stock: 999,
      popularity: 220
    },
    {
      id: 4,
      name: "Hamburger",
      image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop",
      price: 9.99,
      quantity: 2,
      stock: 999,
      popularity: 220
    },
  ])

  const [discountCode, setDiscountCode] = useState("")

  const handleQuantityChange = (id, change) => {
    setCartItems(items =>
      items.map(item => {
        if (item.id === id) {
          const newQuantity = item.quantity + change
          return { ...item, quantity: newQuantity > 0 ? newQuantity : 1 }
        }
        return item
      })
    )
  }

  const handleRemoveItem = (id) => {
    setCartItems(items => items.filter(item => item.id !== id))
  }

  const calculateTotal = () => {
    return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0)
  }

  const total = calculateTotal()

  return (
    <div className="min-h-screen bg-[#f6e9dc] pb-24">
      {/* Header */}
      <div className="bg-white sticky top-0 z-50 rounded-b-3xl">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-800" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Cart</h1>
        </div>
      </div>

      {/* Cart Items */}
      <div className="px-4 py-4 space-y-4">
        {cartItems.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-xl overflow-hidden shadow-sm"
          >
            <div className="flex gap-3 p-3">
              {/* Food Image */}
              <div className="flex-shrink-0">
                <img 
                  src={item.image} 
                  alt={item.name}
                  className="w-20 h-20 rounded-lg object-cover"
                />
              </div>

              {/* Food Details */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-gray-900 mb-2">{item.name}</h3>
                
                {/* Availability Indicators */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-1">
                    <ShoppingBag className="w-3 h-3 text-gray-500" />
                    <span className="text-xs text-gray-600">{item.stock}+</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-gray-500" />
                    <span className="text-xs text-gray-600">{item.popularity}</span>
                  </div>
                </div>

                {/* Price and Quantity */}
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-gray-900">${item.price.toFixed(2)}</span>
                  
                  {/* Quantity Selector */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleQuantityChange(item.id, -1)}
                      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors"
                    >
                      <Minus className="w-4 h-4 text-gray-600" />
                    </button>
                    <span className="text-sm font-semibold text-gray-900 min-w-[30px] text-center">
                      {String(item.quantity).padStart(2, '0')}
                    </span>
                    <button
                      onClick={() => handleQuantityChange(item.id, 1)}
                      className="w-8 h-8 rounded-full bg-[#ff8100] text-white flex items-center justify-center hover:bg-[#e67300] transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Discount Code Section */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">Discount Code</span>
            <div className="flex-1 max-w-[200px] ml-4">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Enter or choose a code"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                  className="pr-8 h-9 bg-gray-50 border-gray-200 rounded-lg text-sm"
                />
                <ChevronRight className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Total Section */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">Total</span>
            <span className="text-xl font-bold text-[#ff8100]">${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Checkout Button */}
      <div className="px-4 pb-20">
        <Button
          className="w-full bg-[#ff8100] hover:bg-[#e67300] text-white font-bold py-4 rounded-xl text-base"
          onClick={() => {
            navigate('/usermain/checkout')
          }}
        >
          Checkout
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
          <button 
            onClick={() => navigate('/usermain/cart')}
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

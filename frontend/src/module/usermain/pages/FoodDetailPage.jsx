import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { 
  ArrowLeft,
  ShoppingCart,
  Share2,
  Heart,
  Star,
  Minus,
  Plus,
  Home,
  ShoppingBag,
  Menu,
  ChefHat
} from "lucide-react"
import { Button } from "@/components/ui/button"
import Toast from "../components/Toast"

export default function FoodDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [quantity, setQuantity] = useState(1)
  const [showFullDescription, setShowFullDescription] = useState(false)
  const [selectedSize, setSelectedSize] = useState(0)
  const [wishlist, setWishlist] = useState(() => {
    const saved = localStorage.getItem('wishlist')
    return saved ? JSON.parse(saved) : []
  })
  const [toast, setToast] = useState({ show: false, message: '' })

  // Show toast notification
  const showToast = (message) => {
    setToast({ show: true, message })
    setTimeout(() => {
      setToast({ show: false, message: '' })
    }, 3000)
  }

  // Mock food data - in real app, fetch based on id
  const foodData = {
    id: id || 1,
    name: "Chicken Burger",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=600&fit=crop",
    rating: 4.9,
    description: "A chicken burger includes a grilled or fried chicken patty, lettuce, tomatoes, cheese, and condiments like mayo or ketchup, served on a soft bun. Burger Variations may add bacon, avocado, or other toppings for extra flavor and texture.",
    sizes: [
      { name: "Small", price: 15, originalPrice: 18 },
      { name: "Medium", price: 18, originalPrice: 20 },
      { name: "Large", price: 22, originalPrice: 25 },
    ],
  }

  const currentPrice = foodData.sizes[selectedSize].price
  const currentOriginalPrice = foodData.sizes[selectedSize].originalPrice

  const handleDecrease = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1)
    }
  }

  const handleIncrease = () => {
    setQuantity(quantity + 1)
  }

  // Toggle wishlist item
  const toggleWishlist = () => {
    const itemId = `food-${foodData.id}`
    const { id, ...restFoodData } = foodData
    const wishlistItem = {
      id: itemId,
      type: 'food',
      originalId: foodData.id,
      ...restFoodData
    }
    
    setWishlist((prev) => {
      const isInWishlist = prev.some((w) => w.id === itemId)
      if (isInWishlist) {
        const updated = prev.filter((w) => w.id !== itemId)
        localStorage.setItem('wishlist', JSON.stringify(updated))
        // Dispatch custom event to notify other components
        window.dispatchEvent(new Event('wishlistUpdated'))
        return updated
      } else {
        // Show toast notification
        setToast({ 
          show: true, 
          message: `Your food item "${foodData.name}" is added to wishlist` 
        })
        setTimeout(() => {
          setToast({ show: false, message: '' })
        }, 3000)
        const updated = [...prev, wishlistItem]
        localStorage.setItem('wishlist', JSON.stringify(updated))
        // Dispatch custom event to notify other components
        window.dispatchEvent(new Event('wishlistUpdated'))
        return updated
      }
    })
  }

  // Check if item is in wishlist
  const isInWishlist = () => {
    const itemId = `food-${foodData.id}`
    return wishlist.some((w) => w.id === itemId)
  }

  return (
    <div className="min-h-screen bg-[#f6e9dc] pb-32">
      {/* Toast Notification */}
      <Toast show={toast.show} message={toast.message} onClose={() => setToast({ show: false, message: '' })} />
      {/* Top Header */}
      <div className="bg-white sticky top-0 z-10 rounded-b-3xl">
        <div className="px-4 py-3 flex items-center justify-between">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-900" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Details</h1>
          <button 
            onClick={() => navigate('/usermain/cart')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative"
          >
            <ShoppingCart className="w-5 h-5 text-gray-900" />
          </button>
        </div>
      </div>

      {/* Food Image */}
      <div className="w-full bg-white">
        <img 
          src={foodData.image} 
          alt={foodData.name}
          className="w-full h-80 object-cover"
        />
      </div>

      {/* Food Details Section */}
      <div className="bg-white px-4 py-4">
        {/* Title with Share and Heart */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-gray-900">{foodData.name}</h2>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {}}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Share2 className="w-5 h-5 text-gray-700" />
            </button>
            <button 
              onClick={toggleWishlist}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Heart 
                className={`w-5 h-5 transition-all ${
                  isInWishlist() 
                    ? 'text-red-500 fill-red-500' 
                    : 'text-gray-700 hover:text-red-500'
                }`} 
              />
            </button>
          </div>
        </div>

        {/* Description and Rating */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-medium text-gray-900">Description</h3>
            <div className="flex items-center gap-1">
              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              <span className="text-sm font-semibold text-gray-900">{foodData.rating}</span>
            </div>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            {showFullDescription 
              ? foodData.description 
              : `${foodData.description.substring(0, 120)}...`}
            {!showFullDescription && (
              <button 
                onClick={() => setShowFullDescription(true)}
                className="text-[#ff8100] font-medium ml-1"
              >
                See more
              </button>
            )}
          </p>
        </div>

        {/* Size Selection */}
        <div className="mb-4 pt-4 border-t border-gray-200">
          <h3 className="text-base font-medium text-gray-900 mb-3">Select Size</h3>
          <div className="flex gap-3">
            {foodData.sizes.map((size, index) => (
              <button
                key={index}
                onClick={() => setSelectedSize(index)}
                className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${
                  selectedSize === index
                    ? 'border-[#ff8100] bg-[#ff8100]/10'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="text-center">
                  <p className={`text-sm font-semibold mb-1 ${
                    selectedSize === index ? 'text-[#ff8100]' : 'text-gray-700'
                  }`}>
                    {size.name}
                  </p>
                  <div className="flex items-center justify-center gap-1">
                    <span className={`text-xs font-medium ${
                      selectedSize === index ? 'text-[#ff8100]' : 'text-gray-600'
                    }`}>
                      ${size.price}
                    </span>
                    <span className="text-xs text-gray-400 line-through">
                      ${size.originalPrice}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Price and Quantity */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">${currentPrice}</span>
            <span className="text-base text-gray-400 line-through">${currentOriginalPrice}</span>
          </div>
          
          {/* Quantity Selector */}
          <div className="flex items-center gap-3 bg-gray-100 rounded-lg px-2 py-1">
            <button
              onClick={handleDecrease}
              disabled={quantity === 1}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                quantity === 1 
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                  : 'bg-gray-800 text-white hover:bg-gray-700'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-base font-semibold text-gray-900 min-w-[20px] text-center">
              {quantity}
            </span>
            <button
              onClick={handleIncrease}
              className="w-8 h-8 rounded-full bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Add to Cart Button and Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 md:hidden">
        {/* Add to Cart Button */}
        <div className="p-4 pb-2">
          <Button 
            className="w-full bg-[#ff8100] hover:bg-[#e67300] text-white font-semibold py-3 rounded-lg text-base"
            onClick={() => {
              showToast("Item added to the cart")
              // Add to cart logic here
            }}
          >
            Add to Cart
          </Button>
        </div>
        
        {/* Bottom Navigation Bar */}
        <div className="flex items-center justify-around py-2 px-4 border-t border-gray-100">
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

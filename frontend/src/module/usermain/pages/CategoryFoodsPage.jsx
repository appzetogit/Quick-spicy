import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { motion } from "framer-motion"
import { 
  ArrowLeft,
  Search,
  Clock,
  Star,
  Plus,
  Filter,
  Heart
} from "lucide-react"
import Toast from "../components/Toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function CategoryFoodsPage() {
  const navigate = useNavigate()
  const { categoryName } = useParams()
  const [activeFilter, setActiveFilter] = useState("Popular")
  const [searchQuery, setSearchQuery] = useState("")
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

  // Toggle wishlist item
  const toggleWishlist = (item, type = 'food') => {
    const itemId = type === 'food' ? `food-${item.id}` : `restaurant-${item.id}`
    const { id, ...restItem } = item
    const wishlistItem = {
      id: itemId,
      type,
      originalId: item.id,
      ...restItem
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
          message: `Your food item "${item.name}" is added to wishlist` 
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
  const isInWishlist = (item, type = 'food') => {
    const itemId = type === 'food' ? `food-${item.id}` : `restaurant-${item.id}`
    return wishlist.some((w) => w.id === itemId)
  }

  // Filter tabs
  const filters = ["Nearby", "Popular", "Cuisines"]

  // Mock food items for the category
  const categoryFoods = [
    {
      id: 1,
      name: "Woke Ramen - Chan...",
      image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&h=300&fit=crop",
      discount: "10% OFF",
      deliveryTime: "50 mins",
      rating: 4.5,
      cuisine: "Chinese",
      price: 2.10,
      originalPrice: 6.10
    },
    {
      id: 2,
      name: "Good Taste Mala H...",
      image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=300&fit=crop",
      discount: "50% OFF",
      deliveryTime: "35 mins",
      rating: 4.2,
      cuisine: "Local & Malaysian",
      price: 5.80,
      originalPrice: 8.80
    },
    {
      id: 3,
      name: "Singa Cafe - UE Bizh...",
      image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=400&h=300&fit=crop",
      discount: "10% OFF",
      deliveryTime: "40 mins",
      rating: 4.2,
      cuisine: "Western",
      price: 4.00,
      originalPrice: 7.00
    },
    {
      id: 4,
      name: "Toko Burgers at Al M...",
      image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop",
      discount: "10% OFF",
      deliveryTime: "40 mins",
      rating: 4.5,
      cuisine: "Western",
      price: 5.30,
      originalPrice: 8.30
    },
    {
      id: 5,
      name: "Spicy Noodles House",
      image: "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=400&h=300&fit=crop",
      discount: "15% OFF",
      deliveryTime: "30 mins",
      rating: 4.7,
      cuisine: "Chinese",
      price: 3.50,
      originalPrice: 6.50
    },
    {
      id: 6,
      name: "Thai Delight Restaurant",
      image: "https://images.unsplash.com/photo-1559314809-0d155b1c5b8e?w=400&h=300&fit=crop",
      discount: "20% OFF",
      deliveryTime: "45 mins",
      rating: 4.6,
      cuisine: "Thai",
      price: 4.20,
      originalPrice: 7.20
    },
  ]

  return (
    <div className="min-h-screen bg-[#f6e9dc] pb-20">
      {/* Toast Notification */}
      <Toast show={toast.show} message={toast.message} />
      {/* Top Header */}
      <div className="bg-white sticky top-0 z-50 border-b border-gray-100">
        <div className="px-4 py-3">
          {/* Back Button and Search Bar Row */}
          <div className="flex items-center gap-3">
            {/* Back Button */}
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5 text-gray-800" />
            </button>

            {/* Search Bar - Using Input Component */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
              <Input
                type="text"
                placeholder="Would you like to eat something?"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 h-10 w-full bg-gray-50 border-gray-200 rounded-lg focus:bg-white focus:border-[#ff8100] transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="relative flex gap-2 overflow-x-auto scrollbar-hide flex-1 -mx-4 px-4">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`relative px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  activeFilter === filter
                    ? 'text-white'
                    : 'text-gray-700 border border-gray-200 bg-white'
                }`}
              >
                {activeFilter === filter && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-[#ff8100] rounded-full z-0"
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 30
                    }}
                  />
                )}
                <span className="relative z-10">{filter}</span>
              </button>
            ))}
          </div>
          
          {/* Filter Button */}
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 transition-colors flex-shrink-0">
            <Filter className="w-4 h-4" />
            <span>Filter</span>
          </button>
        </div>
      </div>

      {/* Food Items List */}
      <div className="px-4 py-4 space-y-4">
        {categoryFoods.map((food) => (
          <div
            key={food.id}
            className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate(`/usermain/food/${food.id}`)}
          >
            <div className="flex gap-3 p-3">
              {/* Food Image */}
              <div className="relative flex-shrink-0">
                <img 
                  src={food.image} 
                  alt={food.name}
                  className="w-24 h-24 rounded-lg object-cover"
                />
                {/* Heart Icon - Top Right */}
                <button 
                  className="absolute top-1 right-1 p-1 bg-white/80 backdrop-blur-sm rounded-full hover:scale-110 transition-transform z-10"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleWishlist(food, 'food')
                  }}
                >
                  <Heart 
                    className={`w-4 h-4 transition-all ${
                      isInWishlist(food, 'food') 
                        ? 'text-red-500 fill-red-500' 
                        : 'text-gray-400 hover:text-red-500'
                    }`} 
                  />
                </button>
              </div>

              {/* Food Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-sm font-bold text-gray-900 flex-1 truncate">{food.name}</h3>
                  {/* Discount Tag */}
                  <div className="bg-[#ff8100] text-white text-xs font-bold px-2 py-0.5 rounded ml-2 flex-shrink-0">
                    {food.discount}
                  </div>
                </div>

                {/* Delivery Time */}
                <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                  <Clock className="w-3 h-3" />
                  <span>{food.deliveryTime}</span>
                </div>

                {/* Rating and Cuisine */}
                <div className="flex items-center gap-1 text-xs text-gray-600 mb-2">
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                  <span>{food.rating}</span>
                  <span className="ml-1">{food.cuisine}</span>
                </div>

                {/* Price and Add Button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-bold text-gray-900">${food.price.toFixed(2)}</span>
                    <span className="text-xs text-gray-400 line-through">${food.originalPrice.toFixed(2)}</span>
                  </div>
                  
                  {/* Add Button */}
                  <Button
                    className="bg-[#ff8100] hover:bg-[#e67300] text-white rounded-lg px-4 py-1.5 h-auto flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      showToast("Item added to the cart")
                      // Handle add to cart logic here
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-xs font-semibold">Add</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
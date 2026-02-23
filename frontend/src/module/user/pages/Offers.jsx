import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Star, Clock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { restaurantAPI } from "@/lib/api"
import { toast } from "sonner"

// Import banner image
import offerBanner from "@/assets/offerpagebanner.png"

export default function Offers() {
  const navigate = useNavigate()
  const [offers, setOffers] = useState([])
  const [groupedOffers, setGroupedOffers] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch offers from API
  useEffect(() => {
    const fetchOffers = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await restaurantAPI.getPublicOffers()
        const data = response?.data?.data
        
        if (data) {
          setOffers(data.allOffers || [])
          setGroupedOffers(data.groupedByOffer || {})
        }
      } catch (err) {
        console.error('Error fetching offers:', err)
        console.error('Error details:', err?.response?.data || err?.message)
        const errorMessage = err?.response?.data?.message || err?.message || 'Failed to load offers'
        setError(errorMessage)
        toast.error(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    fetchOffers()
  }, [])

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      {/* Banner Section */}
      <div className="relative w-full overflow-hidden min-h-[25vh] md:min-h-[30vh]">
        {/* Back Button */}
        <button 
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 md:top-6 md:left-6 z-20 w-10 h-10 md:w-12 md:h-12 bg-gray-800/60 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-gray-800/80 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 md:h-6 md:w-6 text-white" />
        </button>
        
        {/* Banner Image */}
        <div className="absolute inset-0 z-0">
          <img 
            src={offerBanner} 
            alt="Great Offers" 
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 md:py-8 lg:py-10 space-y-6 md:space-y-8">
        <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
            <p className="mt-4 text-gray-500 dark:text-gray-400">Loading offers...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-red-500 dark:text-red-400 text-center">{error}</p>
            <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
          </div>
        )}

        {/* Offers Sections */}
        {!loading && !error && (
          <>
            {/* Grouped Offers Sections */}
            {Object.keys(groupedOffers).length > 0 && Object.entries(groupedOffers).map(([offerText, dishes]) => (
              <section key={offerText}>
                <h2 className="text-2xl sm:text-3xl font-black text-red-500 dark:text-red-400 text-center mb-4 tracking-wide">
                  {offerText}
                </h2>
                
                {/* Restaurant Cards - Grid Layout */}
                <div 
                  className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5 lg:gap-6"
                >
                  {dishes.slice(0, 8).map((dish) => (
                    <Link 
                      key={dish.id} 
                      to={`/user/restaurants/${dish.restaurantSlug}`}
                      className="w-full"
                    >
                      <div className="group">
                        {/* Image Container */}
                        <div className="relative h-32 sm:h-36 rounded-xl overflow-hidden mb-2">
                          <img 
                            src={dish.dishImage || dish.restaurantImage || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop"} 
                            alt={dish.dishName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          {/* Offer Badge */}
                          <div className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] sm:text-xs font-semibold px-2 py-1 rounded">
                            {dish.offer}
                          </div>
                        </div>
                        
                        {/* Rating Badge */}
                        <div className="flex items-center gap-1 mb-1">
                          <div className="bg-green-600 text-white text-xs font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            {dish.restaurantRating?.toFixed(1) || '0.0'}
                            <Star className="h-2.5 w-2.5 fill-white" />
                          </div>
                        </div>
                        
                        {/* Restaurant Info */}
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm line-clamp-1">
                          {dish.restaurantName}
                        </h3>
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mb-1">
                          {dish.dishName} - ₹{dish.discountedPrice}
                        </p>
                        <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 text-xs">
                          <Clock className="h-3 w-3" />
                          <span>{dish.deliveryTime}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          
            {offers.length === 0 && !loading && (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">No offers available at the moment</p>
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  )
}

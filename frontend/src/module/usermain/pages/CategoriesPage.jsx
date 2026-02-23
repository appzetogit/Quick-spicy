import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import Lenis from "lenis"
import { ArrowLeft, Home, Heart, ShoppingBag, Menu, ChefHat } from "lucide-react"

export default function CategoriesPage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Initialize Lenis for smooth scrolling
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  const categories = [
    { id: 1, name: "American", image: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=200&h=200&fit=crop" },
    { id: 2, name: "Bengali", image: "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=200&h=200&fit=crop" },
    { id: 3, name: "Caribbean", image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=200&h=200&fit=crop" },
    { id: 4, name: "Chinese", image: "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=200&h=200&fit=crop" },
    { id: 5, name: "Italian", image: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=200&h=200&fit=crop" },
    { id: 6, name: "Mexican", image: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=200&h=200&fit=crop" },
    { id: 7, name: "Indian", image: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=200&h=200&fit=crop" },
    { id: 8, name: "Thai", image: "https://images.unsplash.com/photo-1559314809-0d155b1c5b8e?w=200&h=200&fit=crop" },
    { id: 9, name: "Japanese", image: "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=200&h=200&fit=crop" },
    { id: 10, name: "French", image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=200&h=200&fit=crop" },
    { id: 11, name: "Mediterranean", image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=200&h=200&fit=crop" },
    { id: 12, name: "Korean", image: "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=200&h=200&fit=crop" },
    { id: 13, name: "Vietnamese", image: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=200&h=200&fit=crop" },
    { id: 14, name: "Turkish", image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=200&h=200&fit=crop" },
    { id: 15, name: "Greek", image: "https://images.unsplash.com/photo-1539252554453-80ab65ce3586?w=200&h=200&fit=crop" },
    { id: 16, name: "Spanish", image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=200&h=200&fit=crop" },
  ]

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.9 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: [0.4, 0, 0.2, 1],
      },
    },
  }

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-800" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">All Categories</h1>
        </div>
      </div>

      {/* Categories Grid - 4 Columns */}
      <div className="px-4 py-6">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-4 gap-4"
        >
          {categories.map((category) => (
            <motion.div
              key={category.id}
              variants={itemVariants}
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              className="flex flex-col items-center gap-2 cursor-pointer"
              onClick={() => {
                navigate(`/usermain/category/${category.name}`)
              }}
            >
              {/* Circular Image */}
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden shadow-md border-2 border-white">
                <img
                  src={category.image}
                  alt={category.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop&q=80`
                  }}
                />
              </div>
              {/* Category Name */}
              <p className="text-[10px] md:text-xs font-medium text-gray-700 text-center leading-tight">
                {category.name}
              </p>
            </motion.div>
          ))}
        </motion.div>
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

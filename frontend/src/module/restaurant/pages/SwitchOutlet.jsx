import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import Lenis from "lenis"
import { ArrowLeft, Search, Power } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { clearModuleAuth } from "@/lib/utils/auth"
import { authAPI } from "@/lib/api"
import { firebaseAuth } from "@/lib/firebase"

export default function SwitchOutlet() {
  const navigate = useNavigate()
  const [showOffline, setShowOffline] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // Mock outlet data - replace with actual data from your API/store
  const outlets = [
    {
      id: 20959122,
      name: "Kadhai Chammach Restaurant",
      address: "By Pass Road (South)",
      image: "/api/placeholder/80/80", // Replace with actual image URL
      status: "offline", // "online" or "offline"
    }
  ]

  const mappedOutletsCount = outlets.length

  // Filter outlets based on showOffline checkbox
  const visibleOutlets = showOffline 
    ? outlets 
    : outlets.filter(outlet => outlet.status === "online")

  // Lenis smooth scrolling
  useEffect(() => {
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

  const handleLogout = async () => {
    if (isLoggingOut) return // Prevent multiple clicks
    
    setIsLoggingOut(true)
    
    try {
      // Call backend logout API to invalidate refresh token
      try {
        await authAPI.logout()
      } catch (apiError) {
        // Continue with logout even if API call fails (network issues, etc.)
        console.warn("Logout API call failed, continuing with local cleanup:", apiError)
      }

      // Sign out from Firebase if user logged in via Google
      try {
        const { signOut } = await import("firebase/auth")
        const currentUser = firebaseAuth.currentUser
        if (currentUser) {
          await signOut(firebaseAuth)
        }
      } catch (firebaseError) {
        // Continue even if Firebase logout fails
        console.warn("Firebase logout failed, continuing with local cleanup:", firebaseError)
      }

      // Clear restaurant module authentication data
      clearModuleAuth("restaurant")
      
      // Clear any onboarding data from localStorage
      localStorage.removeItem("restaurant_onboarding")
      localStorage.removeItem("restaurant_accessToken")
      
      // Dispatch auth change event to notify other components
      window.dispatchEvent(new Event("restaurantAuthChanged"))

      // Small delay for UX, then navigate to welcome page
      setTimeout(() => {
        navigate("/restaurant/welcome", { replace: true })
      }, 300)
    } catch (error) {
      // Even if there's an error, we should still clear local data and logout
      console.error("Error during logout:", error)
      clearModuleAuth("restaurant")
      localStorage.removeItem("restaurant_onboarding")
      window.dispatchEvent(new Event("restaurantAuthChanged"))
      navigate("/restaurant/welcome", { replace: true })
    } finally {
      setIsLoggingOut(false)
    }
  }

  const handleOutletClick = (outletId) => {
    // Implement outlet switching logic here
    console.log("Switch to outlet:", outletId)
    // Example: Update current outlet, refresh data, etc.
    // navigate('/restaurant')
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ 
        duration: 0.2,
        ease: [0.25, 0.1, 0.25, 1]
      }}
      className="min-h-screen bg-white overflow-x-hidden"
    >
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ 
          duration: 0.25,
          ease: [0.25, 0.1, 0.25, 1]
        }}
        className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900">Switch outlet</h1>
              <p className="text-sm text-gray-600 mt-0.5">
                You are mapped to {mappedOutletsCount} outlet{mappedOutletsCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => console.log("Search clicked")}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Search"
          >
            <Search className="w-5 h-5 text-gray-900" />
          </button>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {/* Show Offline Outlets Checkbox */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="flex items-center gap-3 mb-6"
        >
          <Checkbox
            id="show-offline"
            checked={showOffline}
            onCheckedChange={setShowOffline}
            className="w-5 h-5 border-2 border-gray-300 rounded data-[state=checked]:bg-red-600 text-white data-[state=checked]:border-red-600"
          />
          <label
            htmlFor="show-offline"
            className="text-sm font-light text-red-600 cursor-pointer"
          >
            Show outlets currently offline
          </label>
        </motion.div>

        {/* Outlet Cards */}
        <div className="space-y-4 mb-8">
          {visibleOutlets.map((outlet, index) => (
            <motion.div
              key={outlet.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + (index * 0.05) }}
              onClick={() => handleOutletClick(outlet.id)}
              className="bg-blue-50 rounded-lg  cursor-pointer hover:bg-blue-100 border-blue-200 border transition-colors"
            >
              <div className="flex items-start gap-4 p-2 pb-1  rounded-t-lg">
                {/* Outlet Image */}
                <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center shrink-0 overflow-hidden shadow-sm border border-gray-200">
                  {outlet.image && outlet.image !== "/api/placeholder/80/80" ? (
                    <img 
                      src={outlet.image} 
                      alt={outlet.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none'
                        if (e.target.nextSibling) {
                          e.target.nextSibling.style.display = 'flex'
                        }
                      }}
                    />
                  ) : null}
                  <div 
                    className="w-full h-full bg-gray-100 flex items-center justify-center" 
                    style={{ display: (outlet.image && outlet.image !== "/api/placeholder/80/80") ? 'none' : 'flex' }}
                  >
                    <span className="text-3xl">🍔</span>
                  </div>
                </div>

                {/* Outlet Details */}
                <div className="flex-1 my-auto  min-w-0">
                  <h3 className="text-base font-bold text-gray-900 ">
                    {outlet.name}
                  </h3>
                  <p className="text-sm text-gray-700 ">
                    {outlet.address}
                  </p>
                  <p className="text-xs text-gray-600">
                    Outlet ID: {outlet.id}
                  </p>
                  
                </div>
              </div>
                  {/* Status Indicator */}
                  <div className="flex p-2 rounded-b-lg items-center w-full bg-gray-200 border border-blue-200 gap-1.5 mt-3">
                    <Power 
                      className={`w-4 h-4 ${
                        outlet.status === "offline" ? "text-red-600" : "text-green-600"
                      }`} 
                    />
                    <span className={`text-sm font-medium ${
                      outlet.status === "offline" ? "text-red-600" : "text-green-600"
                    }`}>
                      {outlet.status === "offline" ? "Offline" : "Online"}
                    </span>
                  </div>
            </motion.div>
          ))}
        </div>

        {/* Information Message */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="mb-6"
        >
          <p className="text-sm text-gray-900 leading-relaxed">
            Couldn't find the outlet you are looking for? Logout and try again with a different account.
          </p>
        </motion.div>

        {/* Logout Button */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex items-center gap-2 text-red-600 hover:text-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Power className={`w-5 h-5 ${isLoggingOut ? 'animate-spin' : ''}`} />
          <span className="text-base font-medium">
            {isLoggingOut ? "Logging out..." : "Logout"}
          </span>
        </motion.button>
      </div>
    </motion.div>
  )
}

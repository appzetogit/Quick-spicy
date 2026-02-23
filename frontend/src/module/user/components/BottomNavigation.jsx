import { Link, useLocation } from "react-router-dom"
import { UtensilsCrossed, Tag, User, Truck } from "lucide-react"

export default function BottomNavigation() {
  const location = useLocation()

  // Check active routes - support both /user/* and /* paths
  const isDining = location.pathname === "/dining" || location.pathname === "/user/dining"
  const isUnder250 = location.pathname === "/under-250" || location.pathname === "/user/under-250"
  const isProfile = location.pathname.startsWith("/profile") || location.pathname.startsWith("/user/profile")
  const isDelivery = !isDining && !isUnder250 && !isProfile && (location.pathname === "/" || location.pathname === "/user" || (location.pathname.startsWith("/") && !location.pathname.startsWith("/restaurant") && !location.pathname.startsWith("/delivery") && !location.pathname.startsWith("/admin") && !location.pathname.startsWith("/usermain")))

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 z-50 shadow-lg"
    >
      <div className="flex items-center justify-around h-auto px-4 sm:px-6">
        {/* Delivery Tab */}
        <Link
          to="/user"
          className={`flex flex-col items-center gap-1.5 px-4 sm:px-5 py-2 transition-all duration-200 relative ${isDelivery
              ? "text-green-700 dark:text-green-500"
              : "text-gray-600 dark:text-gray-400"
            }`}
        >
          <Truck className={`h-5 w-5 ${isDelivery ? "text-green-700 dark:text-green-500 fill-green-700 dark:fill-green-500" : "text-gray-600 dark:text-gray-400"}`} strokeWidth={2} />
          <span className={`text-xs sm:text-sm font-medium ${isDelivery ? "text-green-700 dark:text-green-500 font-semibold" : "text-gray-600 dark:text-gray-400"}`}>
            Delivery
          </span>
          {isDelivery && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-green-700 dark:bg-green-500 rounded-b-full" />
          )}
        </Link>

        {/* Divider */}
        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

        {/* Under 250 Tab */}
        <Link
          to="/user/under-250"
          className={`flex flex-col items-center gap-1.5 px-4 sm:px-5 py-2 transition-all duration-200 relative ${isUnder250
              ? "text-green-700 dark:text-green-500"
              : "text-gray-600 dark:text-gray-400"
            }`}
        >
          <Tag className={`h-5 w-5 ${isUnder250 ? "text-green-700 dark:text-green-500 fill-green-700 dark:fill-green-500" : "text-gray-600 dark:text-gray-400"}`} strokeWidth={2} />
          <span className={`text-xs sm:text-sm font-medium ${isUnder250 ? "text-green-700 dark:text-green-500 font-semibold" : "text-gray-600 dark:text-gray-400"}`}>
            Under 250
          </span>
          {isUnder250 && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-green-700 dark:bg-green-500 rounded-b-full" />
          )}
        </Link>

        {/* Divider */}
        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

        {/* Dining Tab */}
        <Link
          to="/user/dining"
          className={`flex flex-col items-center gap-1.5 px-4 sm:px-5 py-2 transition-all duration-200 relative ${isDining
              ? "text-green-700 dark:text-green-500"
              : "text-gray-600 dark:text-gray-400"
            }`}
        >
          <UtensilsCrossed className={`h-5 w-5 ${isDining ? "text-green-700 dark:text-green-500 fill-green-700 dark:fill-green-500" : "text-gray-600 dark:text-gray-400"}`} strokeWidth={2} />
          <span className={`text-xs sm:text-sm font-medium ${isDining ? "text-green-700 dark:text-green-500 font-semibold" : "text-gray-600 dark:text-gray-400"}`}>
            Dining
          </span>
          {isDining && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-green-700 dark:bg-green-500 rounded-b-full" />
          )}
        </Link>

        {/* Divider */}
        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700" />

        {/* Profile Tab */}
        <Link
          to="/user/profile"
          className={`flex flex-col items-center gap-1.5 px-4 sm:px-5 py-2 transition-all duration-200 relative ${isProfile
              ? "text-green-700 dark:text-green-500"
              : "text-gray-600 dark:text-gray-400"
            }`}
        >
          <User className={`h-5 w-5 ${isProfile ? "text-green-700 dark:text-green-500 fill-green-700 dark:fill-green-500" : "text-gray-600 dark:text-gray-400"}`} />
          <span className={`text-xs sm:text-sm font-medium ${isProfile ? "text-green-700 dark:text-green-500 font-semibold" : "text-gray-600 dark:text-gray-400"}`}>
            Profile
          </span>
          {isProfile && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-green-700 dark:bg-green-500 rounded-b-full" />
          )}
        </Link>
      </div>
    </div>
  )
}

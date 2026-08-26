import { Link, useLocation } from "react-router-dom"
import { Tag, User, Truck, Users } from "lucide-react"

// Route -> tab map. Routes are mounted under both `/*` and `/user/*`, so each
// entry is matched with and without the `/user` prefix.
// Order matters: the first matching entry wins, so list specific prefixes
// before broader ones.
const TAB_ROUTES = [
  { tab: "under250", exact: ["/under-250"] },
  { tab: "forOthers", prefix: ["/order-for-someone-else"] },
  // Account area. There is no dedicated Orders tab, so order/wallet/
  // notification screens belong to Profile.
  { tab: "profile", prefix: ["/profile", "/orders", "/wallet", "/notifications"] },
  // Browse & order flow.
  {
    tab: "delivery",
    exact: ["", "/"],
    prefix: [
      "/restaurants",
      "/category",
      "/search",
      "/product",
      "/cart",
      "/offers",
      "/collections",
      "/top-10",
      "/gourmet",
    ],
  },
]

export function resolveActiveTab(pathname) {
  const raw = String(pathname || "")
  // Normalise: strip the optional `/user` prefix and any trailing slash.
  const stripped = raw.replace(/^\/user(?=\/|$)/, "")
  const path = stripped.length > 1 ? stripped.replace(/\/+$/, "") : stripped

  for (const entry of TAB_ROUTES) {
    if (entry.exact?.some((p) => path === p)) return entry.tab
    if (entry.prefix?.some((p) => path === p || path.startsWith(`${p}/`))) return entry.tab
  }

  // Unmapped route - highlight nothing rather than guessing.
  return null
}

export default function BottomNavigation() {
  const location = useLocation()

  // Active-tab resolution.
  //
  // This was previously an exclusion-based catch-all: `isDelivery` matched any
  // path that wasn't explicitly excluded, so /orders (not in the exclusion list)
  // lit up the Delivery tab while the user was looking at Your Orders.
  // See BUGFIX_IMPLEMENTATION_GUIDE.md #028b.
  //
  // Now: an explicit allowlist, most specific first. Anything unmapped
  // highlights nothing - better than confidently highlighting the wrong tab.
  const activeTab = resolveActiveTab(location.pathname)

  const isDelivery = activeTab === "delivery"
  const isUnder250 = activeTab === "under250"
  const isForOthers = activeTab === "forOthers"
  const isProfile = activeTab === "profile"

  return (
    <div
      data-bottom-navigation="true"
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

        {/* Order for someone else */}
        <Link
          to="/user/order-for-someone-else"
          className={`flex flex-col items-center gap-1.5 px-4 sm:px-5 py-2 transition-all duration-200 relative ${isForOthers
              ? "text-green-700 dark:text-green-500"
              : "text-gray-600 dark:text-gray-400"
            }`}
        >
          <Users className={`h-5 w-5 ${isForOthers ? "text-green-700 dark:text-green-500" : "text-gray-600 dark:text-gray-400"}`} strokeWidth={2} />
          <span className={`text-xs sm:text-sm font-medium ${isForOthers ? "text-green-700 dark:text-green-500 font-semibold" : "text-gray-600 dark:text-gray-400"}`}>
            For Others
          </span>
          {isForOthers && (
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

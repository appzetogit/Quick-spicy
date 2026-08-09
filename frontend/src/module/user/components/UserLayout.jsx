import { Outlet, useLocation } from "react-router-dom"
import { useEffect, useState, createContext, useContext, lazy, Suspense } from "react"
import { ProfileProvider } from "../context/ProfileContext"
import { CartProvider } from "../context/CartContext"
import { OrdersProvider } from "../context/OrdersContext"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

// Lazy load overlays to reduce initial bundle size
const SearchOverlay = lazy(() => import("./SearchOverlay"))
const LocationSelectorOverlay = lazy(() => import("./LocationSelectorOverlay"))
import BottomNavigation from "./BottomNavigation"
import DesktopNavbar from "./DesktopNavbar"

// Create SearchOverlay context with default value
const SearchOverlayContext = createContext({
  isSearchOpen: false,
  searchValue: "",
  setSearchValue: () => {
    debugWarn("SearchOverlayProvider not available")
  },
  openSearch: () => {
    debugWarn("SearchOverlayProvider not available")
  },
  closeSearch: () => { }
})

export function useSearchOverlay() {
  const context = useContext(SearchOverlayContext)
  // Always return context, even if provider is not available (will use default values)
  return context
}

function SearchOverlayProvider({ children }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  const openSearch = () => {
    setIsSearchOpen(true)
  }

  const closeSearch = () => {
    setIsSearchOpen(false)
    setSearchValue("")
  }

  return (
    <SearchOverlayContext.Provider value={{ isSearchOpen, searchValue, setSearchValue, openSearch, closeSearch }}>
      {children}
      <Suspense fallback={null}>
        {isSearchOpen && (
          <SearchOverlay
            isOpen={isSearchOpen}
            onClose={closeSearch}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
          />
        )}
      </Suspense>
    </SearchOverlayContext.Provider>
  )
}

// Create LocationSelector context with default value
const LocationSelectorContext = createContext({
  isLocationSelectorOpen: false,
  openLocationSelector: () => {
    debugWarn("LocationSelectorProvider not available")
  },
  closeLocationSelector: () => { }
})

export function useLocationSelector() {
  const context = useContext(LocationSelectorContext)
  if (!context) {
    throw new Error("useLocationSelector must be used within LocationSelectorProvider")
  }
  return context
}

function LocationSelectorProvider({ children }) {
  const [isLocationSelectorOpen, setIsLocationSelectorOpen] = useState(false)

  const openLocationSelector = () => {
    setIsLocationSelectorOpen(true)
  }

  const closeLocationSelector = () => {
    setIsLocationSelectorOpen(false)
  }

  const value = {
    isLocationSelectorOpen,
    openLocationSelector,
    closeLocationSelector
  }

  return (
    <LocationSelectorContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        {isLocationSelectorOpen && (
          <LocationSelectorOverlay
            isOpen={isLocationSelectorOpen}
            onClose={closeLocationSelector}
          />
        )}
      </Suspense>
    </LocationSelectorContext.Provider>
  )
}

export default function UserLayout() {
  const location = useLocation()

  useEffect(() => {
    // Reset scroll to top whenever location changes (pathname, search, or hash)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [location.pathname, location.search, location.hash])

  // Note: Authentication checks and redirects are handled by ProtectedRoute components
  // UserLayout should not interfere with authentication redirects

  // The desktop navbar belongs to the landing-style pages only; it is a full header and
  // the inner pages draw their own.
  const showDesktopChrome = location.pathname === "/" ||
    location.pathname === "/user" ||
    location.pathname === "/under-250" ||
    location.pathname === "/user/under-250" ||
    location.pathname === "/profile" ||
    location.pathname.startsWith("/profile") ||
    location.pathname === "/user/profile" ||
    location.pathname.startsWith("/user/profile")

  // The mobile tab bar used to share the list above, which made it an allow-list: every
  // page added since - order for someone else, restaurant details, search, offers - silently
  // shipped with no way back to the tabs, and they were found one at a time by customers.
  // Inverted, so a new page HAS the tabs unless it is a flow that must not be interrupted:
  // signing in, the cart, and an individual order's tracking or invoice.
  const NO_TAB_BAR = [
    /^\/(user\/)?auth(\/|$)/,
    /^\/(user\/)?cart(\/|$)/,
    /^\/(user\/)?orders\/.+/,
  ]
  const showBottomNav = !NO_TAB_BAR.some((pattern) => pattern.test(location.pathname))

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] transition-colors duration-200">
      <CartProvider>
        <ProfileProvider>
          <OrdersProvider>
            <SearchOverlayProvider>
              <LocationSelectorProvider>
                {/* <Navbar /> */}
                {/* Desktop Navbar - Hidden on mobile, visible on medium+ screens */}
                <div className="hidden md:block">
                  {showDesktopChrome && <DesktopNavbar />}
                </div>
                <main className={showDesktopChrome ? "md:pt-40" : ""}>
                  <Outlet />
                </main>
                {showBottomNav && <BottomNavigation />}
              </LocationSelectorProvider>
            </SearchOverlayProvider>
          </OrdersProvider>
        </ProfileProvider>
      </CartProvider>
    </div>
  )
}



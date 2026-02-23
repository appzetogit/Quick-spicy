import { useNavigate, useLocation } from "react-router-dom"
import { useMemo, useRef, useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  FileText,
  Package,
  MessageSquare,
  Compass,
  TrendingUp,
  Utensils,
  Wallet,
  ArrowRightLeft,
  Building2
} from "lucide-react"

const ordersTabs = [
  { id: "orders", label: "Orders", icon: FileText, route: "/restaurant" },
  { id: "inventory", label: "Inventory", icon: Package, route: "/restaurant/inventory" },
  { id: "feedback", label: "Feedback", icon: MessageSquare, route: "/restaurant/feedback" },
  { id: "explore", label: "Explore", icon: Compass, route: "/restaurant/explore" },
]

const hubTabs = [
  { id: "hub", label: "  Hub  ", icon: Building2, route: "/restaurant/to-hub" },
  { id: "growth", label: "Growth", icon: TrendingUp, route: "/restaurant/hub-growth" },
  { id: "menu", label: "Menu", icon: Utensils, route: "/restaurant/hub-menu" },
  { id: "finance", label: "Finance", icon: Wallet, route: "/restaurant/hub-finance" },
]

// helper: longest route match wins
const findActiveTab = (tabs, pathname) =>
  tabs
    .slice()
    .sort((a, b) => b.route.length - a.route.length)
    .find(tab => pathname === tab.route || pathname.startsWith(tab.route + "/"))

export default function BottomNavOrders() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionPhase, setTransitionPhase] = useState('idle') // 'idle', 'entering', 'exiting'
  const [transitionDirection, setTransitionDirection] = useState('right')
  const prevIsHubModeRef = useRef(null)

  // Hide on internal pages (create-offers flow)
  const isInternalPage = pathname.includes("/create-offers")
  if (isInternalPage) {
    return null
  }

  // 🔒 single source of truth for mode
  const isHubMode = useMemo(() => {
    return pathname.startsWith("/restaurant/hub") || pathname.startsWith("/restaurant/to-hub")
  }, [pathname])

  const tabs = isHubMode ? hubTabs : ordersTabs

  const activeTab = useMemo(() => {
    const match = findActiveTab(tabs, pathname)
    return match?.id ?? (isHubMode ? "hub" : "orders")
  }, [tabs, pathname, isHubMode])

 
  // Handle mode change detection for transition
  useEffect(() => {
    if (prevIsHubModeRef.current !== null && prevIsHubModeRef.current !== isHubMode) {
      // Mode changed - new page has rendered, set it to start from opposite side
      const slideInStart = transitionDirection === 'right' ? '-100%' : '100%'
      document.body.style.transform = `translate3d(${slideInStart}, 0, 0)`
      document.body.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
      
      // Start exit phase - animate new page sliding in to center
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransitionPhase('exiting')
          document.body.style.transform = 'translate3d(0, 0, 0)'
        })
      })
      
      // After exit completes, reset
      const exitTimer = setTimeout(() => {
        setTransitionPhase('idle')
        setIsTransitioning(false)
        document.body.style.filter = ''
        document.body.style.transform = ''
        document.body.style.transition = ''
      }, 250)
      
      return () => clearTimeout(exitTimer)
    }
    prevIsHubModeRef.current = isHubMode
  }, [isHubMode, transitionDirection])

  // Apply slide transform to page content during transition (no blur)
  useEffect(() => {
    if (isTransitioning) {
      // Calculate slide direction: right = to Hub (slide right), left = to Orders (slide left)
      let slideTransform = 'translate3d(0, 0, 0)'
      
      if (transitionPhase === 'entering') {
        // Old page slides out in the transition direction
        const slideOutAmount = transitionDirection === 'right' ? '100%' : '-100%'
        slideTransform = `translate3d(${slideOutAmount}, 0, 0)`
      }
      // Note: exiting phase transform is handled in the mode change effect
      
      if (transitionPhase === 'entering') {
        document.body.style.transform = slideTransform
      }
      document.body.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
      document.body.style.willChange = 'transform'
      document.body.style.backfaceVisibility = 'hidden'
      document.body.style.WebkitBackfaceVisibility = 'hidden'
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.transform = ''
      document.body.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
      document.body.style.willChange = ''
      document.body.style.backfaceVisibility = ''
      document.body.style.WebkitBackfaceVisibility = ''
      document.body.style.overflow = ''
    }
    
    return () => {
      // Don't clean up during transition to avoid interrupting animation
      if (!isTransitioning) {
        document.body.style.transform = ''
        document.body.style.transition = ''
        document.body.style.willChange = ''
        document.body.style.backfaceVisibility = ''
        document.body.style.WebkitBackfaceVisibility = ''
        document.body.style.overflow = ''
      }
    }
  }, [isTransitioning, transitionPhase, transitionDirection])

  const handleTabClick = (tab) => {
    if (tab.route && tab.route !== pathname) {
      navigate(tab.route)
    }
  }

  const handleToggleMode = () => {
    const newMode = !isHubMode
    const direction = newMode ? 'right' : 'left' // right = to Hub, left = to Orders
    setTransitionDirection(direction)
    
    // Set initial state
    setIsTransitioning(true)
    setTransitionPhase('idle')
    
    // Force a reflow to ensure initial position is set, then start entering
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransitionPhase('entering')
        
        // After old page slides out, navigate and start exit (new page slides in)
        setTimeout(() => {
          navigate(isHubMode ? "/restaurant" : "/restaurant/to-hub")
          // Start exit phase - new page slides in from opposite direction
          requestAnimationFrame(() => {
            setTransitionPhase('exiting')
          })
        }, 200) // Wait for enter animation to complete (under 250ms)
      })
    })
  }

  return (
    <>
      {/* Floating badge indicator - 60fps smooth, under 250ms */}
      {isTransitioning && (
        <>
          {/* Badge with switching text - floating on top */}
          <div
            className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center"
            style={{
              opacity: transitionPhase === 'entering' ? 1 : transitionPhase === 'exiting' ? 0 : 0,
              transition: 'opacity 0.2s ease-out',
            }}
          >
            <div
              className="flex flex-col items-center gap-3"
              style={{
                transform: transitionPhase === 'entering' 
                  ? 'translate3d(0, 0, 0) scale(1)' 
                  : 'translate3d(0, -20px, 0) scale(0.9)',
                transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {/* Badge container */}
              <div
                className="px-6 py-3 rounded-full backdrop-blur-xl border shadow-2xl"
                style={{
                  background: transitionDirection === 'right'
                    ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(147, 51, 234, 0.25))'
                    : 'linear-gradient(135deg, rgba(236, 72, 153, 0.25), rgba(251, 146, 60, 0.25))',
                  borderColor: transitionDirection === 'right'
                    ? 'rgba(59, 130, 246, 0.4)'
                    : 'rgba(236, 72, 153, 0.4)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                }}
              >
                <div className="flex items-center gap-2">
                  <ArrowRightLeft 
                    className={`w-5 h-5 ${
                      transitionDirection === 'right' ? 'text-blue-400' : 'text-pink-400'
                    }`}
                    style={{
                      animation: transitionPhase === 'entering' ? 'spin 0.4s ease-in-out' : 'none',
                    }}
                  />
                  <span className="text-white font-medium text-sm">
                    {transitionDirection === 'right' ? 'Switching to Hub' : 'Switching to Orders'}
                  </span>
                </div>
              </div>
              
              {/* Loading indicator dots */}
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: transitionDirection === 'right'
                        ? 'rgba(59, 130, 246, 0.9)'
                        : 'rgba(236, 72, 153, 0.9)',
                      animation: transitionPhase === 'entering'
                        ? `pulse 1s ease-in-out ${i * 0.15}s infinite`
                        : 'none',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          
          {/* CSS animations */}
          <style>{`
            @keyframes pulse {
              0%, 100% {
                opacity: 0.4;
                transform: scale(0.8);
              }
              50% {
                opacity: 1;
                transform: scale(1);
              }
            }
            @keyframes spin {
              from {
                transform: rotate(0deg);
              }
              to {
                transform: rotate(180deg);
              }
            }
          `}</style>
        </>
      )}

      <div className="sticky bottom-0 z-40 pb-3">
        <div className="flex items-center gap-2 w-full">

        {/* Left toggle (Hub → Orders) */}
        {isHubMode && (
          <button
            onClick={handleToggleMode}
            className="flex flex-col items-center gap-1 bg-black text-white/90 pr-3 py-3 rounded-r-full rounded-l-[12px] shadow-md border border-black active:scale-95"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span className="text-[11px]">To Orders</span>
          </button>
        )}

        <div className="flex-1">
          <div className={`bg-black rounded-full py-1.5 px-1 shadow-lg relative ${isHubMode ? "mr-1" : "ml-1"}`}>
            <div className="flex items-center justify-around relative">
              {tabs.map(tab => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id

                return (
                  <motion.button
                    key={tab.id}
                    onClick={() => handleTabClick(tab)}
                    aria-current={isActive ? "page" : undefined}
                    className="relative flex flex-col items-center gap-1 px-4 py-2 rounded-full overflow-hidden z-10"
                    whileTap={{ scale: 0.95 }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="bottomNavActive"
                        className="absolute inset-0 bg-neutral-700 rounded-full -z-10"
                        initial={false}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 30,
                        }}
                      />
                    )}
                    <Icon className={`w-5 h-4 relative z-10 transition-colors duration-300 ease-in-out ${isActive ? "text-white" : "text-white/80"}`} />
                    <span className={`text-[11px] relative z-10 transition-colors duration-300 ease-in-out ${isActive ? "text-white" : "text-white/80"}`}>
                      {tab.label}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right toggle (Orders → Hub) */}
        {!isHubMode && (
          <button
            onClick={handleToggleMode}
            className="flex flex-col items-center gap-1 bg-black text-white/90 pl-3 py-3 rounded-l-full rounded-r-[12px] shadow-md border border-black active:scale-95"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span className="text-[11px]">To Hub</span>
          </button>
        )}
        </div>
      </div>
    </>
  )
}

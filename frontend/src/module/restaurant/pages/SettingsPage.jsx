import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import Lenis from "lenis"
import { 
  ArrowLeft,
  User,
  Bell,
  Shield,
  Globe,
  Moon,
  Sun,
  Info,
  LogOut,
  Lock,
  Mail,
  Phone,
  CreditCard,
  FileText,
  MessageSquare,
  ChevronRight,
  Trash2
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import BottomNavbar from "../components/BottomNavbar"
import MenuOverlay from "../components/MenuOverlay"
import { restaurantAPI } from "@/lib/api"
import { clearModuleAuth } from "@/lib/utils/auth"
import { firebaseAuth } from "@/lib/firebase"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function SettingsPage() {
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [darkMode, setDarkMode] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

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

  const cleanupRestaurantSession = async () => {
    try {
      const { signOut } = await import("firebase/auth")
      if (firebaseAuth.currentUser) {
        await signOut(firebaseAuth)
      }
    } catch (firebaseError) {
      debugWarn("Firebase sign-out failed during restaurant cleanup:", firebaseError)
    }

    clearModuleAuth("restaurant")
    localStorage.removeItem("restaurant_onboarding")
    localStorage.removeItem("restaurant_accessToken")
    localStorage.removeItem("restaurant_authenticated")
    localStorage.removeItem("restaurant_user")
    sessionStorage.removeItem("restaurantAuthData")
    window.dispatchEvent(new Event("restaurantAuthChanged"))
  }

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return

    const confirmed = window.confirm(
      "Delete your restaurant account permanently? This action cannot be undone."
    )
    if (!confirmed) return

    setIsDeletingAccount(true)

    try {
      await restaurantAPI.deleteAccount()
      await cleanupRestaurantSession()
      navigate("/restaurant/welcome", { replace: true })
    } catch (error) {
      debugError("Error deleting restaurant account:", error)
      alert(`Failed to delete account: ${error.response?.data?.message || error.message || "Please try again."}`)
      setIsDeletingAccount(false)
    }
  }

  // Settings sections
  const settingsSections = [
    {
      id: "account",
      title: "Account",
      items: [
        { id: "notifications", label: "Notifications", icon: Bell, hasToggle: true, toggleValue: notificationsEnabled, onToggle: setNotificationsEnabled },
        { id: "privacy", label: "Privacy & Security", icon: Shield, route: "/restaurant/privacy" },
      ]
    },
    {
      id: "preferences",
      title: "Preferences",
      items: [
        { id: "language", label: "Language", icon: Globe, route: "/restaurant/language", value: "English" },
        { id: "theme", label: "Theme", icon: darkMode ? Moon : Sun, hasToggle: true, toggleValue: darkMode, onToggle: setDarkMode },
      ]
    },
    {
      id: "support",
      title: "Support & Information",
      items: [
        { id: "conversation", label: "Conversation", icon: MessageSquare, route: "/restaurant/conversation" },
        { id: "support", label: "Support", icon: MessageSquare, route: "/restaurant/support" },
        { id: "terms", label: "Terms & Conditions", icon: FileText, route: "/restaurant/terms" },
        { id: "privacy-policy", label: "Privacy Policy", icon: Shield, route: "/restaurant/privacy" },
        { id: "about", label: "About", icon: Info, route: "/restaurant/about" },
      ]
    },
    {
      id: "actions",
      title: "Actions",
      items: [
        { id: "logout", label: "Logout", icon: LogOut, isDestructive: true, action: () => {
          debugLog("Logout clicked")
          // Add logout logic here
        } },
        {
          id: "delete-account",
          label: isDeletingAccount ? "Deleting account..." : "Delete account",
          icon: Trash2,
          isDestructive: true,
          action: handleDeleteAccount
        },
      ]
    }
  ]

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden pb-24 md:pb-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50 flex items-center gap-3">
        <button 
          onClick={() => navigate(-1)}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Settings</h1>
      </div>

      {/* Settings Content */}
      <div className="px-4 py-4 space-y-4">
        {settingsSections.map((section, sectionIndex) => (
          <motion.div
            key={section.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: sectionIndex * 0.1 }}
          >
            <Card className="bg-white shadow-sm border border-gray-100">
              <CardContent className="p-0">
                {/* Section Title */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    {section.title}
                  </h2>
                </div>

                {/* Section Items */}
                <div className="divide-y divide-gray-100">
                  {section.items.map((item, itemIndex) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: sectionIndex * 0.1 + itemIndex * 0.05 }}
                    >
                      <button
                        onClick={() => {
                          if (item.action) {
                            item.action()
                          } else if (item.route) {
                            navigate(item.route)
                          }
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors ${
                          item.isDestructive ? "text-red-600" : "text-gray-900"
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`flex-shrink-0 p-1.5 rounded-lg ${
                            item.isDestructive 
                              ? "bg-red-100" 
                              : "bg-[#ff8100]/10"
                          }`}>
                            <item.icon className={`w-4 h-4 ${
                              item.isDestructive 
                                ? "text-red-600" 
                                : "text-[#ff8100]"
                            }`} />
                          </div>
                          <span className="text-sm font-medium flex-1 text-left">
                            {item.label}
                          </span>
                          {item.value && (
                            <span className="text-xs text-gray-500 mr-2">
                              {item.value}
                            </span>
                          )}
                        </div>

                        {item.hasToggle ? (
                          <div className="flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (item.onToggle) {
                                  item.onToggle(!item.toggleValue)
                                }
                              }}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                item.toggleValue ? "bg-[#ff8100]" : "bg-gray-300"
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  item.toggleValue ? "translate-x-6" : "translate-x-1"
                                }`}
                              />
                            </button>
                          </div>
                        ) : (
                          !item.isDestructive && (
                            <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                          )
                        )}
                      </button>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Bottom Navigation Bar */}
      <BottomNavbar onMenuClick={() => setShowMenu(true)} />
      
      {/* Menu Overlay */}
      <MenuOverlay showMenu={showMenu} setShowMenu={setShowMenu} />
    </div>
  )
}



import { useState } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft,
  Bell,
  Moon,
  Globe,
  Shield
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

export default function Settings() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState({
    notifications: true,
    darkMode: false,
    locationServices: true,
    biometricAuth: false
  })

  const toggleSetting = (key) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const settingOptions = [
    {
      id: "notifications",
      label: "Push Notifications",
      description: "Receive notifications about new orders",
      icon: Bell,
      value: settings.notifications
    },
    {
      id: "darkMode",
      label: "Dark Mode",
      description: "Switch to dark theme",
      icon: Moon,
      value: settings.darkMode
    },
    {
      id: "locationServices",
      label: "Location Services",
      description: "Allow app to access your location",
      icon: Globe,
      value: settings.locationServices
    },
    {
      id: "biometricAuth",
      label: "Biometric Authentication",
      description: "Use fingerprint or face ID to login",
      icon: Shield,
      value: settings.biometricAuth
    }
  ]

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center gap-4 rounded-b-3xl md:rounded-b-none">
        <button 
          onClick={() => navigate("/delivery/profile")}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg md:text-xl font-bold text-gray-900">Settings</h1>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6 pb-24 md:pb-6">
        <div className="space-y-2 md:space-y-3">
          {settingOptions.map((option, index) => {
            const Icon = option.icon
            return (
              <motion.div
                key={option.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <Card className="bg-white shadow-sm border border-gray-100">
                  <CardContent className="px-2 md:px-4 py-1.5 md:py-3 gap-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 md:gap-3 flex-1">
                        <div className="bg-gray-100 rounded-full p-1.5 md:p-2">
                          <Icon className="w-4 h-4 md:w-5 md:h-5 text-gray-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-900 font-medium text-xs md:text-base">
                            {option.label}
                          </p>
                          <p className="text-gray-500 text-[10px] md:text-xs">
                            {option.description}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={option.value}
                        onCheckedChange={() => toggleSetting(option.id)}
                        className="data-[state=checked]:bg-[#ff8100]"
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>

    </div>
  )
}


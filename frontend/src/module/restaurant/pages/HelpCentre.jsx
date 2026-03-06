import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { 
  ChevronLeft, 
  Search, 
  Power, 
  Utensils, 
  Building2, 
  FileText, 
  Wallet,
  ChevronRight,
  Languages,
  Check
} from "lucide-react"
import BottomNavOrders from "../components/BottomNavOrders"
import { toast } from "sonner"

const helpTopics = [
  {
    id: 1,
    icon: Power,
    title: "Outlet online / offline status",
    subtitle: "Current status & details",
    path: "/restaurant/delivery-settings"
  },
  {
    id: 2,
    icon: Utensils,
    title: "Order related issues",
    subtitle: "Cancellations & delivery related concerns",
    path: "/restaurant/orders/all"
  },
  {
    id: 3,
    icon: Building2,
    title: "Restaurant",
    subtitle: "Timings, contacts, FSSAI, bank details, location etc.",
    path: "/restaurant/outlet-info"
  },
  {
    id: 5,
    icon: FileText,
    title: "Menu",
    subtitle: "Items, photos, prices, charges etc.",
    path: "/restaurant/hub-menu"
  },
  {
    id: 6,
    icon: Wallet,
    title: "Payments",
    subtitle: "Statement of account, invoices etc.",
    path: "/restaurant/hub-finance"
  }
]

export default function HelpCentre() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedLanguage, setSelectedLanguage] = useState(
    localStorage.getItem("restaurantHelpLanguage") || "en"
  )
  const [showLanguagePopup, setShowLanguagePopup] = useState(false)

  const languageOptions = [
    { code: "en", label: "English" },
    { code: "hi", label: "Hindi" },
  ]

  const contentByLanguage = {
    en: {
      headerTitle: "Help Center",
      helpTitle: "How can we help you",
      searchPlaceholder: "Search by issue",
      noResultPrefix: "No help topics found matching",
    },
    hi: {
      headerTitle: "Help Center",
      helpTitle: "How can we help you",
      searchPlaceholder: "Search by issue",
      noResultPrefix: "No help topics found matching",
    },
  }

  const content = contentByLanguage[selectedLanguage] || contentByLanguage.en

  const filteredTopics = helpTopics.filter(topic =>
    topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    topic.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedLanguageLabel = useMemo(
    () => languageOptions.find((lang) => lang.code === selectedLanguage)?.label || "English",
    [selectedLanguage]
  )

  const handleLanguageChange = (languageCode) => {
    setSelectedLanguage(languageCode)
    localStorage.setItem("restaurantHelpLanguage", languageCode)
    setShowLanguagePopup(false)
    toast.success(`Language changed to ${languageOptions.find((l) => l.code === languageCode)?.label || "English"}`)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white z-50 border-b border-gray-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">{content.headerTitle}</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowLanguagePopup(true)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Change language"
              title={`Language: ${selectedLanguageLabel}`}
            >
              <Languages className="w-6 h-6 text-gray-700" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* How can we help you section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-3">
            {content.helpTitle}
          </h2>
          
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={content.searchPlaceholder}
              className="w-full pl-10 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
        </div>

        {/* Help Topics List */}
        <div className="space-y-1">
          {filteredTopics.map((topic, index) => {
            const IconComponent = topic.icon
            return (
              <motion.button
                key={topic.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="w-full flex items-center gap-4 px-0 py-4 border-b border-gray-200 hover:bg-gray-50 transition-colors text-left"
                onClick={() => {
                  if (topic.path) {
                    navigate(topic.path)
                  }
                }}
              >
                {/* Icon */}
                <div className="flex-shrink-0">
                  <IconComponent className="w-6 h-6 text-gray-900" />
                </div>

                {/* Text Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1.5">
                    {topic.title}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {topic.subtitle}
                  </p>
                </div>

                {/* Navigation Arrow */}
                <div className="flex-shrink-0">
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </motion.button>
            )
          })}
        </div>

        {/* No results message */}
        {filteredTopics.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500">
              {content.noResultPrefix} "{searchQuery}"
            </p>
          </div>
        )}
      </div>

      {showLanguagePopup && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center sm:justify-center"
          onClick={() => setShowLanguagePopup(false)}
        >
          <div
            className="w-full sm:w-[420px] bg-white rounded-t-2xl sm:rounded-2xl p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 mb-3">Select language</h3>
            <div className="space-y-2">
              {languageOptions.map((option) => {
                const isSelected = selectedLanguage === option.code
                return (
                  <button
                    key={option.code}
                    onClick={() => handleLanguageChange(option.code)}
                    className={`w-full px-4 py-3 rounded-xl border flex items-center justify-between text-left transition-colors ${
                      isSelected
                        ? "border-gray-900 bg-gray-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900">{option.label}</span>
                    {isSelected && <Check className="w-4 h-4 text-gray-900" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNavOrders />
    </div>
  )
}

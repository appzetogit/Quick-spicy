import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Check } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const RESTAURANT_HELP_LANGUAGE_KEY = "restaurant_help_center_language"

const languageOptions = [
  { id: "en", label: "English" },
  { id: "hi", label: "Hindi" },
]

export default function RestaurantLanguage() {
  const navigate = useNavigate()
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    const saved = localStorage.getItem(RESTAURANT_HELP_LANGUAGE_KEY)
    return saved === "hi" ? "hi" : "en"
  })

  const selectedLabel = useMemo(
    () => languageOptions.find((option) => option.id === selectedLanguage)?.label || "English",
    [selectedLanguage],
  )

  const handleSelectLanguage = (languageId) => {
    const normalizedLanguage = languageId === "hi" ? "hi" : "en"
    setSelectedLanguage(normalizedLanguage)
    localStorage.setItem(RESTAURANT_HELP_LANGUAGE_KEY, normalizedLanguage)
  }

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          type="button"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Language</h1>
      </div>

      <div className="px-4 py-4">
        <Card className="bg-white shadow-sm border border-gray-100">
          <CardContent className="p-0">
            {languageOptions.map((option, index) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelectLanguage(option.id)}
                className={`w-full flex items-center justify-between px-4 py-4 text-left transition-colors hover:bg-gray-50 ${
                  index !== languageOptions.length - 1 ? "border-b border-gray-100" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{option.label}</p>
                </div>
                {selectedLanguage === option.id && (
                  <Check className="w-5 h-5 text-[#ff8100] flex-shrink-0" />
                )}
              </button>
            ))}
          </CardContent>
        </Card>

        <p className="text-xs text-gray-500 mt-3">
          Selected language: <span className="font-medium text-gray-700">{selectedLabel}</span>
        </p>
      </div>
    </div>
  )
}

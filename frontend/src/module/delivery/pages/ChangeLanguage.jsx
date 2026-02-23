import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Check } from "lucide-react"

export default function ChangeLanguage() {
  const navigate = useNavigate()
  
  const [selectedLanguage, setSelectedLanguage] = useState("english")

  const languages = [
    { code: "english", name: "English", nativeName: "English" },
    { code: "hindi", name: "Hindi", nativeName: "हिंदी" },
    { code: "tamil", name: "Tamil", nativeName: "தமிழ்" },
    { code: "telugu", name: "Telugu", nativeName: "తెలుగు" },
    { code: "kannada", name: "Kannada", nativeName: "ಕನ್ನಡ" },
    { code: "malayalam", name: "Malayalam", nativeName: "മലയാളം" },
    { code: "bengali", name: "Bengali", nativeName: "বাংলা" },
    { code: "gujarati", name: "Gujarati", nativeName: "ગુજરાતી" },
    { code: "marathi", name: "Marathi", nativeName: "मराठी" },
    { code: "punjabi", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  ]

  const handleLanguageChange = (code) => {
    setSelectedLanguage(code)
    // Here you would typically save the language preference and reload the app
    // localStorage.setItem('delivery_language', code)
    // window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center gap-4 px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Change language</h1>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        <p className="text-gray-600 text-sm mb-4">
          Select your preferred language for the app
        </p>

        {/* Language List */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {languages.map((language) => (
            <button
              key={language.code}
              onClick={() => handleLanguageChange(language.code)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              <div className="flex flex-col items-start">
                <span className="font-semibold text-gray-900">{language.name}</span>
                <span className="text-sm text-gray-600">{language.nativeName}</span>
              </div>
              {selectedLanguage === language.code && (
                <Check className="w-5 h-5 text-blue-600" />
              )}
            </button>
          ))}
        </div>

        {/* Info */}
        <div className="mt-4 bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            The app will restart to apply the language change.
          </p>
        </div>
      </div>
    </div>
  )
}


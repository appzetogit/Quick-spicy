import { useState, useEffect } from "react"
import { Settings, Key, Save, Loader2 } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

const InputField = ({ label, value, onChange, type = "text", placeholder = "" }) => {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700">{label}</label>
      {type === "textarea" ? (
        <textarea
          value={value || ""}
          onChange={onChange}
          placeholder={placeholder || `Enter ${label}`}
          rows={4}
          className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-sm resize-y"
        />
      ) : (
        <input
          type={type}
          value={value || ""}
          onChange={onChange}
          placeholder={placeholder || `Enter ${label}`}
          className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
        />
      )}
    </div>
  );
}

export default function SystemAddons() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Form state for all environment variables
  const [envData, setEnvData] = useState({
    // Razorpay
    RAZORPAY_API_KEY: "",
    RAZORPAY_SECRET_KEY: "",

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: "",
    CLOUDINARY_API_KEY: "",
    CLOUDINARY_API_SECRET: "",

    // Firebase
    FIREBASE_API_KEY: "",
    FIREBASE_AUTH_DOMAIN: "",
    FIREBASE_STORAGE_BUCKET: "",
    FIREBASE_MESSAGING_SENDER_ID: "",
    FIREBASE_APP_ID: "",
    MEASUREMENT_ID: "",
    FIREBASE_PROJECT_ID: "",
    FIREBASE_CLIENT_EMAIL: "",
    FIREBASE_PRIVATE_KEY: "",

    // SMTP
    SMTP_HOST: "",
    SMTP_PORT: "",
    SMTP_USER: "",
    SMTP_PASS: "",

    // SMS Hub India
    SMSINDIAHUB_API_KEY: "",
    SMSINDIAHUB_SENDER_ID: "",

    // Google Maps
    VITE_GOOGLE_MAPS_API_KEY: "",
  })

  // Load environment variables on component mount
  useEffect(() => {
    loadEnvVariables()
  }, [])

  const loadEnvVariables = async () => {
    try {
      setIsLoading(true)
      const response = await adminAPI.getEnvVariables()
      if (response.data.success && response.data.data) {
        setEnvData(prev => ({
          ...prev,
          ...response.data.data
        }))
      }
    } catch (error) {
      console.error("Error loading environment variables:", error)
      // Don't show error toast on initial load if endpoint doesn't exist yet
      if (error.response?.status !== 404) {
        toast.error("Failed to load environment variables")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (key, value) => {
    setEnvData(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      const response = await adminAPI.saveEnvVariables(envData)
      if (response.data.success) {
        toast.success("Environment variables saved successfully")

        // Clear Google Maps API key cache after saving
        try {
          const { clearGoogleMapsApiKeyCache } = await import('@/lib/utils/googleMapsApiKey.js');
          clearGoogleMapsApiKeyCache();
        } catch (cacheError) {
          console.warn("Failed to clear cache:", cacheError);
        }
      } else {
        toast.error(response.data.message || "Failed to save environment variables")
      }
    } catch (error) {
      console.error("Error saving environment variables:", error)
      toast.error(error.response?.data?.message || "Failed to save environment variables")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-slate-600 font-medium">Loading environment variables...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center">
                <Key className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">ENV Setup</h1>
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save All
                </>
              )}
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Razorpay Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Key className="w-4 h-4 text-blue-600" />
              </div>
              Razorpay Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField
                label="Razorpay API Key"
                value={envData.RAZORPAY_API_KEY}
                onChange={(e) => handleInputChange("RAZORPAY_API_KEY", e.target.value)}
              />
              <InputField
                label="Razorpay Secret Key"
                value={envData.RAZORPAY_SECRET_KEY}
                onChange={(e) => handleInputChange("RAZORPAY_SECRET_KEY", e.target.value)}
                type="password"
              />
            </div>
          </div>

          {/* Cloudinary Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <Key className="w-4 h-4 text-green-600" />
              </div>
              Cloudinary Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField
                label="Cloudinary Cloud Name"
                value={envData.CLOUDINARY_CLOUD_NAME}
                onChange={(e) => handleInputChange("CLOUDINARY_CLOUD_NAME", e.target.value)}
              />
              <InputField
                label="Cloudinary API Key"
                value={envData.CLOUDINARY_API_KEY}
                onChange={(e) => handleInputChange("CLOUDINARY_API_KEY", e.target.value)}
              />
              <InputField
                label="Cloudinary API Secret"
                value={envData.CLOUDINARY_API_SECRET}
                onChange={(e) => handleInputChange("CLOUDINARY_API_SECRET", e.target.value)}
                type="password"
              />
            </div>
          </div>

          {/* Firebase Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                <Key className="w-4 h-4 text-orange-600" />
              </div>
              Firebase Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField
                label="Firebase API Key"
                value={envData.FIREBASE_API_KEY}
                onChange={(e) => handleInputChange("FIREBASE_API_KEY", e.target.value)}
              />
              <InputField
                label="Firebase Auth Domain"
                value={envData.FIREBASE_AUTH_DOMAIN}
                onChange={(e) => handleInputChange("FIREBASE_AUTH_DOMAIN", e.target.value)}
              />
              <InputField
                label="Firebase Storage Bucket"
                value={envData.FIREBASE_STORAGE_BUCKET}
                onChange={(e) => handleInputChange("FIREBASE_STORAGE_BUCKET", e.target.value)}
              />
              <InputField
                label="Firebase Messaging Sender ID"
                value={envData.FIREBASE_MESSAGING_SENDER_ID}
                onChange={(e) => handleInputChange("FIREBASE_MESSAGING_SENDER_ID", e.target.value)}
              />
              <InputField
                label="Firebase App ID"
                value={envData.FIREBASE_APP_ID}
                onChange={(e) => handleInputChange("FIREBASE_APP_ID", e.target.value)}
              />
              <InputField
                label="Measurement ID"
                value={envData.MEASUREMENT_ID}
                onChange={(e) => handleInputChange("MEASUREMENT_ID", e.target.value)}
              />
              <InputField
                label="Firebase Project ID"
                value={envData.FIREBASE_PROJECT_ID}
                onChange={(e) => handleInputChange("FIREBASE_PROJECT_ID", e.target.value)}
              />
              <InputField
                label="Firebase Client Email"
                value={envData.FIREBASE_CLIENT_EMAIL}
                onChange={(e) => handleInputChange("FIREBASE_CLIENT_EMAIL", e.target.value)}
                type="email"
              />
              <div className="md:col-span-2">
                <InputField
                  label="Firebase Private Key"
                  value={envData.FIREBASE_PRIVATE_KEY}
                  onChange={(e) => handleInputChange("FIREBASE_PRIVATE_KEY", e.target.value)}
                  type="textarea"
                  placeholder="Enter Firebase Private Key (can be multiline)"
                />
              </div>
            </div>
          </div>

          {/* SMTP Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <Key className="w-4 h-4 text-purple-600" />
              </div>
              SMTP Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField
                label="SMTP Host"
                value={envData.SMTP_HOST}
                onChange={(e) => handleInputChange("SMTP_HOST", e.target.value)}
                placeholder="smtp.gmail.com"
              />
              <InputField
                label="SMTP Port"
                value={envData.SMTP_PORT}
                onChange={(e) => handleInputChange("SMTP_PORT", e.target.value)}
                type="number"
                placeholder="587"
              />
              <InputField
                label="SMTP User"
                value={envData.SMTP_USER}
                onChange={(e) => handleInputChange("SMTP_USER", e.target.value)}
                type="email"
              />
              <InputField
                label="SMTP Password"
                value={envData.SMTP_PASS}
                onChange={(e) => handleInputChange("SMTP_PASS", e.target.value)}
                type="password"
              />
            </div>
          </div>

          {/* SMS Hub India Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-pink-100 flex items-center justify-center">
                <Key className="w-4 h-4 text-pink-600" />
              </div>
              SMS Hub India Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField
                label="SMS Hub India API Key"
                value={envData.SMSINDIAHUB_API_KEY}
                onChange={(e) => handleInputChange("SMSINDIAHUB_API_KEY", e.target.value)}
              />
              <InputField
                label="SMS Hub India Sender ID"
                value={envData.SMSINDIAHUB_SENDER_ID}
                onChange={(e) => handleInputChange("SMSINDIAHUB_SENDER_ID", e.target.value)}
              />
            </div>
          </div>

          {/* Google Maps Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <Key className="w-4 h-4 text-red-600" />
              </div>
              Google Maps Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
              <InputField
                label="Google Maps API Key"
                value={envData.VITE_GOOGLE_MAPS_API_KEY}
                onChange={(e) => handleInputChange("VITE_GOOGLE_MAPS_API_KEY", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { restaurantAPI } from "@/lib/api"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

const countryCodes = [
  { code: "+1", country: "US/CA", flag: "????" },
  { code: "+44", country: "UK", flag: "????" },
  { code: "+91", country: "IN", flag: "????" },
  { code: "+86", country: "CN", flag: "????" },
  { code: "+81", country: "JP", flag: "????" },
  { code: "+49", country: "DE", flag: "????" },
  { code: "+33", country: "FR", flag: "????" },
  { code: "+39", country: "IT", flag: "????" },
  { code: "+34", country: "ES", flag: "????" },
  { code: "+61", country: "AU", flag: "????" },
  { code: "+7", country: "RU", flag: "????" },
  { code: "+55", country: "BR", flag: "????" },
  { code: "+52", country: "MX", flag: "????" },
  { code: "+82", country: "KR", flag: "????" },
  { code: "+65", country: "SG", flag: "????" },
  { code: "+971", country: "AE", flag: "????" },
  { code: "+966", country: "SA", flag: "????" },
  { code: "+27", country: "ZA", flag: "????" },
  { code: "+31", country: "NL", flag: "????" },
  { code: "+46", country: "SE", flag: "????" },
]

export default function RestaurantLogin() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [formData, setFormData] = useState(() => {
    const saved = sessionStorage.getItem("restaurantLoginPhone")
    return {
      phone: saved || "",
      countryCode: "+91",
    }
  })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)

  const selectedCountry = countryCodes.find((c) => c.code === formData.countryCode) || countryCodes[2]

  const validatePhone = (phone, countryCode) => {
    if (!phone || phone.trim() === "") return "Phone number is required"

    const digitsOnly = phone.replace(/\D/g, "")
    if (digitsOnly.length < 7) return "Phone number must be at least 7 digits"
    if (digitsOnly.length > 15) return "Phone number is too long"

    if (countryCode === "+91") {
      if (digitsOnly.length !== 10) return "Indian phone number must be 10 digits"
      if (!["6", "7", "8", "9"].includes(digitsOnly[0])) {
        return "Invalid Indian mobile number"
      }
    }

    return ""
  }

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10)
    setFormData((prev) => ({ ...prev, phone: value }))
    sessionStorage.setItem("restaurantLoginPhone", value)

    if (error) {
      setError(validatePhone(value, formData.countryCode))
    }
  }

  const handleCountryCodeChange = (value) => {
    setFormData((prev) => ({ ...prev, countryCode: value }))
    if (formData.phone) {
      setError(validatePhone(formData.phone, value))
    }
  }

  const handleSendOTP = async () => {
    const phoneError = validatePhone(formData.phone, formData.countryCode)
    setError(phoneError)
    if (phoneError) return

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)
      await restaurantAPI.sendOTP(fullPhone, "login")

      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "restaurant",
      }
      sessionStorage.setItem("restaurantAuthData", JSON.stringify(authData))
      navigate("/restaurant/otp")
    } catch (apiErr) {
      const message =
        apiErr?.response?.data?.message ||
        apiErr?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setError(message)
    } finally {
      setIsSending(false)
    }
  }

  const isValidPhone = !validatePhone(formData.phone, formData.countryCode)

  return (
    <div className="max-h-screen h-screen bg-white flex flex-col">
      <div className="flex flex-col items-center pt-8 pb-8 px-6">
        <h1
          className="text-3xl italic md:text-4xl tracking-wide font-extrabold text-black"
          style={{
            WebkitTextStroke: "0.5px black",
            textStroke: "0.5px black",
          }}
        >
          {companyName.toLowerCase()}
        </h1>
        <span className="text-gray-600 font-light text-sm tracking-wide block text-center">
          - restaurant partner -
        </span>
      </div>

      <div className="flex-1 flex flex-col px-6 overflow-y-auto">
        <div className="w-full max-w-md mx-auto space-y-6 py-4">
          <div className="text-center">
            <p className="text-base text-gray-700 leading-relaxed">
              Enter your registered phone number and we will send an OTP to continue
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex gap-2 items-stretch w-full">
              <Select value={formData.countryCode} onValueChange={handleCountryCodeChange}>
                <SelectTrigger
                  className="w-[100px] h-12 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center shrink-0"
                  style={{ height: "48px" }}
                >
                  <SelectValue>
                    <span className="flex items-center gap-1.5">
                      <span className="text-base">{selectedCountry.flag}</span>
                      <span className="text-sm font-medium text-gray-900">{selectedCountry.code}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {countryCodes.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      <span className="flex items-center gap-2">
                        <span>{country.flag}</span>
                        <span>{country.code}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex-1 flex flex-col">
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="Enter phone number"
                  value={formData.phone}
                  onChange={handlePhoneChange}
                  className={`w-full px-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 text-base border rounded-lg min-w-0 bg-white ${error && formData.phone.length > 0
                    ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                    : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                    }`}
                  style={{ height: "48px" }}
                />
                {error && <p className="text-red-500 text-xs mt-1 ml-1">{error}</p>}
              </div>
            </div>

            <Button
              onClick={handleSendOTP}
              disabled={!isValidPhone || isSending}
              className={`w-full h-12 rounded-lg font-bold text-base transition-colors ${isValidPhone && !isSending
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
            >
              {isSending ? "Sending OTP..." : "Send OTP"}
            </Button>
          </div>
        </div>
      </div>

      <div className="px-6 pb-8 pt-4" />
    </div>
  )
}

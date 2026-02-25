import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { AlertCircle, Loader2 } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authAPI } from "@/lib/api"
import loginBanner from "@/assets/loginbanner.png"

export default function SignIn() {
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
  })

  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem("userAuthData")
    if (!stored) return

    try {
      const data = JSON.parse(stored)
      const fullPhone = String(data.phone || "").trim()
      const phoneDigits = fullPhone.replace(/^\+91\s*/, "").replace(/\D/g, "").slice(0, 10)

      setFormData((prev) => ({
        ...prev,
        phone: phoneDigits || prev.phone,
      }))
    } catch (err) {
      console.error("Error parsing stored auth data:", err)
    }
  }, [])

  const validatePhone = (phone) => {
    if (!phone.trim()) return "Phone number is required"
    const cleanPhone = phone.replace(/\D/g, "")
    if (!/^\d{10}$/.test(cleanPhone)) return "Phone number must be exactly 10 digits"
    return ""
  }

  const handleChange = (e) => {
    const { name } = e.target
    let { value } = e.target

    if (name === "phone") {
      value = value.replace(/\D/g, "").slice(0, 10)
      setError(validatePhone(value))
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)

    const phoneError = validatePhone(formData.phone)
    setError(phoneError)

    if (phoneError) {
      setIsLoading(false)
      return
    }

    try {
      const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()
      await authAPI.sendOTP(fullPhone, "login", null)

      const authData = {
        method: "phone",
        phone: fullPhone,
        email: null,
        name: null,
        referralCode: null,
        isSignUp: false,
        module: "user",
      }

      sessionStorage.setItem("userAuthData", JSON.stringify(authData))
      navigate("/user/auth/otp")
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message ||
        apiError?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AnimatedPage className="h-screen flex flex-col bg-white dark:bg-[#0a0a0a] overflow-hidden !pb-0 md:flex-row md:overflow-hidden">
      <div className="relative md:hidden w-full shrink-0" style={{ height: "30vh", minHeight: "200px" }}>
        <img src={loginBanner} alt="Food Banner" className="w-full h-full object-cover object-center" />
      </div>

      <div className="relative hidden md:block w-full shrink-0 md:w-1/2 md:h-screen md:sticky md:top-0">
        <img src={loginBanner} alt="Food Banner" className="w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent" />
      </div>

      <div className="bg-white dark:bg-[#1a1a1a] p-4 sm:p-5 md:p-6 lg:p-8 xl:p-10 overflow-hidden md:w-1/2 md:h-screen">
        <div className="max-w-md lg:max-w-lg xl:max-w-xl mx-auto w-full h-full flex flex-col">
          <div className="text-center space-y-2 md:space-y-3">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-black dark:text-white leading-tight">
              India&apos;s #1 Food Delivery and Dining App
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 dark:text-gray-400">Log in with your phone number</p>
          </div>

          <form id="user-signin-form" onSubmit={handleSubmit} className="space-y-4 md:space-y-5 mt-6 md:mt-8">
            <div className="space-y-2">
              <div className="flex gap-2 items-stretch">
                <div className="flex items-center px-4 h-12 md:h-14 border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2a2a] text-black dark:text-white rounded-lg">
                  <span className="text-sm md:text-base font-medium">+91</span>
                </div>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  placeholder="Enter 10-digit Phone Number"
                  value={formData.phone}
                  onChange={handleChange}
                  className={`flex-1 h-12 md:h-14 text-base md:text-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white border-gray-300 dark:border-gray-700 rounded-lg ${error ? "border-red-500" : ""} transition-colors`}
                  aria-invalid={error ? "true" : "false"}
                />
              </div>

              {error && (
                <div className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </form>

          <div className="mt-auto pb-2">
            <div className="rounded-2xl border border-[#f4d7c6] bg-gradient-to-b from-[#fff7f3] to-white dark:from-[#1f1f1f] dark:to-[#171717] dark:border-[#333] p-4 md:p-5 shadow-sm">
              <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 text-center mb-3">
                You will receive a one-time password on this number
              </p>
              <Button
                type="submit"
                form="user-signin-form"
                className="w-full h-12 md:h-14 bg-[#EB590E] hover:bg-[#D94F0C] text-white font-bold text-base md:text-lg rounded-lg transition-all hover:shadow-lg active:scale-[0.98]"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Signing In...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>

              <div className="text-center text-xs md:text-sm text-gray-500 dark:text-gray-400 pt-4 md:pt-5">
                <p className="mb-1 md:mb-2">By continuing, you agree to our</p>
                <div className="flex justify-center gap-2 flex-wrap">
                  <Link to="/profile/terms" className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                    Terms of Service
                  </Link>
                  <span>-</span>
                  <Link to="/profile/privacy" className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                    Privacy Policy
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}

import { useState } from "react"
import { useNavigate, Link, useSearchParams } from "react-router-dom"
import { AlertCircle, Loader2 } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authAPI } from "@/lib/api"
import loginBanner from "@/assets/loginbanner.png"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const RUPEE = "₹"


export default function SignIn() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Referral links look like /user/auth/sign-in?mode=signup&ref=CODE. The code was never
  // read here and authData hardcoded null, so no referral has ever reached the backend and
  // not one reward has been paid. Stored so it survives the hop to the OTP screen, and
  // remembered across a reload in case the customer opens the link and comes back later.
  const referralCodeFromLink = (() => {
    const fromUrl = String(searchParams.get("ref") || "").trim().toUpperCase()
    if (fromUrl) {
      try { sessionStorage.setItem("pendingReferralCode", fromUrl) } catch { /* private mode */ }
      return fromUrl
    }
    try { return String(sessionStorage.getItem("pendingReferralCode") || "").trim().toUpperCase() } catch { return "" }
  })()


  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
    referralCode: referralCodeFromLink || "",
  })

  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  // Typed codes are only offered when the customer did not arrive through a referral link,
  // so a link cannot be silently overwritten by a stray keystroke.
  const [showReferralField, setShowReferralField] = useState(Boolean(referralCodeFromLink))

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

    // The backend uppercases and trims referral codes before lookup, so match it here and
    // stop a lowercase paste from being rejected as an invalid code.
    if (name === "referralCode") {
      value = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 32)
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
      const referralCode = formData.referralCode.trim() || null
      // A bad code fails here, on the screen that owns the field, rather than after the
      // customer has waited for an SMS and typed it in.
      await authAPI.sendOTP(fullPhone, "login", null, referralCode)

      const authData = {
        method: "phone",
        phone: fullPhone,
        email: null,
        name: null,
        referralCode,
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
              India&apos;s #1 Food Delivery App
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

            {/* Referral code. Only new accounts earn the referrer a reward - the backend
                ignores the code when the number already belongs to a registered customer -
                so it is offered here rather than being made to look mandatory. */}
            <div className="space-y-2">
              {showReferralField ? (
                <>
                  <label htmlFor="referralCode" className="block text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400">
                    Referral code {referralCodeFromLink ? "(from your invite)" : "(optional)"}
                  </label>
                  <Input
                    id="referralCode"
                    name="referralCode"
                    type="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={32}
                    placeholder="e.g. RAHU1234"
                    value={formData.referralCode}
                    onChange={handleChange}
                    className="h-12 md:h-14 text-base md:text-lg tracking-widest uppercase bg-white dark:bg-[#1a1a1a] text-black dark:text-white border-gray-300 dark:border-gray-700 rounded-lg"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Your friend gets {RUPEE}50 when your first order of {RUPEE}299+ is delivered.
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowReferralField(true)}
                  className="text-sm font-semibold text-[#EB590E] underline underline-offset-2"
                >
                  Have a referral code?
                </button>
              )}
            </div>
          </form>

          <div className="mt-auto pt-4 md:pt-5 pb-2">
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

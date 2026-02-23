import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { restaurantAPI } from "@/lib/api"
import { setAuthData as setRestaurantAuthData } from "@/lib/utils/auth"
import { checkOnboardingStatus } from "../../utils/onboardingUtils"

export default function RestaurantOTP() {
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [contactInfo, setContactInfo] = useState("") // Can be phone or email
  const [contactType, setContactType] = useState("phone") // "phone" or "email"
  const [focusedIndex, setFocusedIndex] = useState(null)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [showNameInput, setShowNameInput] = useState(false)
  const inputRefs = useRef([])

  useEffect(() => {
    // Get auth data from sessionStorage
    const stored = sessionStorage.getItem("restaurantAuthData")
    if (stored) {
      const data = JSON.parse(stored)
      setAuthData(data)

      // Handle both phone and email
      if (data.method === "email" && data.email) {
        setContactType("email")
        setContactInfo(data.email)
      } else if (data.phone) {
        setContactType("phone")
        // Extract and format phone number for display
        const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
        if (phoneMatch) {
          const formattedPhone = `${phoneMatch[1]}-${phoneMatch[2].replace(/\D/g, "")}`
          setContactInfo(formattedPhone)
        } else {
          setContactInfo(data.phone || "")
        }
      }
    } else {
      // No auth data, redirect to login
      navigate("/restaurant/login")
      return
    }

    // Start resend timer (60 seconds)
    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [navigate])

  useEffect(() => {
    // Focus first input on mount
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [])

  const handleChange = (index, value) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) {
      return
    }

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 6 digits are entered
    if (newOtp.every((digit) => digit !== "") && newOtp.length === 6) {
      handleVerify(newOtp.join(""))
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }
    // Handle paste
    if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      navigator.clipboard.readText().then((text) => {
        const digits = text.replace(/\D/g, "").slice(0, 6).split("")
        const newOtp = [...otp]
        digits.forEach((digit, i) => {
          if (i < 6) {
            newOtp[i] = digit
          }
        })
        setOtp(newOtp)
        if (digits.length === 6) {
          handleVerify(newOtp.join(""))
        } else {
          inputRefs.current[digits.length]?.focus()
        }
      })
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text")
    const digits = pastedData.replace(/\D/g, "").slice(0, 6).split("")
    const newOtp = [...otp]
    digits.forEach((digit, i) => {
      if (i < 6) {
        newOtp[i] = digit
      }
    })
    setOtp(newOtp)
    if (digits.length === 6) {
      handleVerify(newOtp.join(""))
      return
    } else {
      inputRefs.current[digits.length]?.focus()
    }
  }

  const handleVerify = async (otpValue = null) => {
    const code = otpValue || otp.join("")

    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code")
      return
    }

    // For email-based signup, use a two-step UX:
    // 1) First validate OTP format and show name input
    // 2) Then, once name is provided, call the backend
    // For email-based login, skip name input and go directly to verification
    if (contactType === "email" && authData?.isSignUp && !showNameInput) {
      // First step: show name input, don't hit backend yet (only for signups)
      setShowNameInput(true)
      setError("")
      return
    }

    // If we are on step 2 for email signup (or any flow where name input is visible), require name
    if (showNameInput) {
      if (!name.trim()) {
        setNameError("Please enter your name to continue")
        return
      }
      setNameError("")
    }

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please try logging in again.")
      }

      // Determine identifier type (phone or email)
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      const purpose = authData.isSignUp ? "register" : "login"

      // Decide which name to send:
      // - If we're currently showing the name input (either because backend returned needsName
      //   or because this is an email/phone signup flow), always send the typed name.
      // - Otherwise, for explicit signup flows where a name was already collected earlier,
      //   send that stored name.
      let nameToSend = null
      if (showNameInput) {
        nameToSend = name.trim()
      } else if (authData.isSignUp && authData.name) {
        nameToSend = authData.name
      }

      const response = await restaurantAPI.verifyOTP(phone, code, purpose, nameToSend, email)

      // Extract restaurant and token or special flags (like needsName) from backend response
      const data = response?.data?.data || response?.data

      // If backend says we need a name (restaurant not found on login), treat this as a new signup:
      // - flip authData.isSignUp -> true so subsequent verify calls use "register"
      // - persist this updated state back to sessionStorage
      // - show the name input instead of erroring
      if (data?.needsName) {
        setAuthData((prev) => {
          const updated = {
            ...prev,
            isSignUp: true,
            // Preserve any existing name, but prefer the typed one if present
            name: name?.trim() || prev?.name,
          }
          try {
            sessionStorage.setItem("restaurantAuthData", JSON.stringify(updated))
          } catch {
            // Ignore storage errors; state is enough for this flow
          }
          return updated
        })
        setShowNameInput(true)
        setError("")
        setNameError("")
        return
      }

      const accessToken = data?.accessToken
      const restaurant = data?.restaurant

      if (accessToken && restaurant) {
        // Store auth data using utility function to ensure proper module-specific token storage
        setRestaurantAuthData("restaurant", accessToken, restaurant)

        // Dispatch custom event for same-tab updates
        window.dispatchEvent(new Event("restaurantAuthChanged"))

        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")

        setTimeout(async () => {
          console.log({ authData })
          // After signup, send to onboarding
          if (authData?.isSignUp) {
            navigate("/restaurant/onboarding", { replace: true })
          } else {
            // After login, check if onboarding is incomplete
            try {
              const incompleteStep = await checkOnboardingStatus()
              if (incompleteStep) {
                // Navigate to onboarding with the incomplete step
                navigate(`/restaurant/onboarding?step=${incompleteStep}`, { replace: true })
              } else {
                // Onboarding is complete, go to restaurant home
                navigate("/restaurant", { replace: true })
              }
            } catch (err) {
              console.error("Failed to check onboarding status:", err)
              // Fallback to restaurant home
              navigate("/restaurant", { replace: true })
            }
          }
        }, 500)
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Invalid OTP. Please try again."
      setError(message)
      setOtp(["", "", "", "", "", ""])
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return

    setIsLoading(true)
    setError("")

    try {
      if (!authData) {
        throw new Error("Session expired. Please go back and try again.")
      }

      const purpose = authData.isSignUp ? "register" : "login"
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null

      await restaurantAPI.sendOTP(phone, purpose, email)
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to resend OTP. Please try again."
      setError(message)
    }

    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    setIsLoading(false)
    setOtp(["", "", "", "", "", ""])
    inputRefs.current[0]?.focus()
  }

  const isOtpComplete = otp.every((digit) => digit !== "")

  if (!authData) {
    return null
  }

  return (
    <div className="max-h-screen h-screen bg-white flex flex-col">
      {/* Header with Back Button and Title */}
      <div className="relative flex items-center justify-center py-4 px-4">
        <button
          onClick={() => navigate("/restaurant/login")}
          className="absolute left-4 top-1/2 -translate-y-1/2"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-black" />
        </button>
        <h2 className="text-lg font-bold text-black">Verify details</h2>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col px-6 overflow-y-auto">
        <div className="w-full max-w-md mx-auto space-y-8 py-8">
          {/* Instruction Text */}
          <div className="text-center">
            <p className="text-base text-gray-900 leading-relaxed">
              Enter OTP sent on <span className="font-semibold">{contactInfo}</span>. Do not share OTP with anyone.
            </p>
          </div>

          {/* OTP Input Fields - Horizontal Lines */}
          <div className="flex justify-center gap-4">
            {otp.map((digit, index) => {
              const hasValue = digit !== ""
              const isFocused = focusedIndex === index

              return (
                <div key={index} className="relative flex flex-col items-center min-w-[48px] py-2" style={{ minHeight: '60px' }}>
                  {/* Clickable Input Area - Large clickable zone */}
                  <input
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit || ""}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    onFocus={() => setFocusedIndex(index)}
                    onBlur={() => setFocusedIndex(null)}
                    disabled={isLoading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-text z-20"
                    style={{ minHeight: '60px' }}
                    aria-label={`OTP digit ${index + 1}`}
                  />
                  {/* Digit Display Above Line */}
                  {hasValue && (
                    <div className="absolute top-0 text-2xl font-semibold text-gray-900 pointer-events-none z-10">
                      {digit}
                    </div>
                  )}
                  {/* Visual Line Indicator */}
                  <div className="w-12 relative mt-8">
                    {hasValue ? (
                      <div className="absolute inset-0 bg-blue-600 h-0.5" />
                    ) : isFocused ? (
                      <div className="absolute inset-0 bg-blue-600 h-0.5" />
                    ) : (
                      <div className="absolute inset-0 h-0.5 border-b border-dashed border-gray-400" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Name input:
              - Email-based signup (existing behavior)
              - Phone-based login when backend returns needsName=true (auto-registration)
          */}
          {showNameInput && (
            <div className="mt-6 max-w-sm mx-auto text-left">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {authData?.method === "phone" ? "Restaurant name" : "Your name"}
              </label>
              <input
                type="text"
                value={name || ""}
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) setNameError("")
                }}
                placeholder="Enter your full name"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${nameError
                    ? "border-red-500 focus:ring-red-500"
                    : "border-gray-300 focus:ring-blue-500"
                  }`}
                disabled={isLoading}
              />
              <p className="mt-1 text-xs text-gray-500">
                If you&apos;re new, we&apos;ll use this to create your restaurant account.
              </p>
              {nameError && (
                <p className="mt-1 text-xs text-red-600">
                  {nameError}
                </p>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Resend OTP Timer */}
          <div className="text-center">
            {resendTimer > 0 ? (
              <p className="text-sm text-gray-900">
                Resend OTP in <span className="font-semibold">{resendTimer} secs</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={isLoading}
                className="text-sm text-blue-600 hover:underline font-medium disabled:opacity-50"
              >
                Resend OTP
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section - Continue Button */}
      <div className="px-6 pb-8 pt-4">
        <div className="w-full max-w-md mx-auto">
          <Button
            onClick={() => handleVerify()}
            disabled={isLoading || !isOtpComplete}
            className={`w-full h-12 rounded-lg font-bold text-base transition-colors ${!isLoading && isOtpComplete
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
          >
            {isLoading ? "Verifying..." : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  )
}

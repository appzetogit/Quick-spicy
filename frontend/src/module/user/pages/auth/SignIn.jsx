import { useState, useEffect, useRef } from "react"
import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { Mail, Phone, AlertCircle, Loader2 } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { authAPI } from "@/lib/api"
import { firebaseAuth, googleProvider, ensureFirebaseInitialized } from "@/lib/firebase"
import { setAuthData } from "@/lib/utils/auth"
import loginBanner from "@/assets/loginbanner.png"

// Common country codes
const countryCodes = [
  { code: "+1", country: "US/CA", flag: "🇺🇸" },
  { code: "+44", country: "UK", flag: "🇬🇧" },
  { code: "+91", country: "IN", flag: "🇮🇳" },
  { code: "+86", country: "CN", flag: "🇨🇳" },
  { code: "+81", country: "JP", flag: "🇯🇵" },
  { code: "+49", country: "DE", flag: "🇩🇪" },
  { code: "+33", country: "FR", flag: "🇫🇷" },
  { code: "+39", country: "IT", flag: "🇮🇹" },
  { code: "+34", country: "ES", flag: "🇪🇸" },
  { code: "+61", country: "AU", flag: "🇦🇺" },
  { code: "+7", country: "RU", flag: "🇷🇺" },
  { code: "+55", country: "BR", flag: "🇧🇷" },
  { code: "+52", country: "MX", flag: "🇲🇽" },
  { code: "+82", country: "KR", flag: "🇰🇷" },
  { code: "+65", country: "SG", flag: "🇸🇬" },
  { code: "+971", country: "AE", flag: "🇦🇪" },
  { code: "+966", country: "SA", flag: "🇸🇦" },
  { code: "+27", country: "ZA", flag: "🇿🇦" },
  { code: "+31", country: "NL", flag: "🇳🇱" },
  { code: "+46", country: "SE", flag: "🇸🇪" },
]

export default function SignIn() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isSignUp = searchParams.get("mode") === "signup"

  const [authMethod, setAuthMethod] = useState("phone") // "phone" or "email"
  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
    email: "",
    name: "",
    referralCode: "",
  })
  const [errors, setErrors] = useState({
    phone: "",
    email: "",
    name: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState("")
  const redirectHandledRef = useRef(false)
  const getPendingReferralCode = () => {
    const code = String(sessionStorage.getItem("pendingReferralCode") || "").trim().toUpperCase()
    return code || null
  }
  const clearPendingReferralCode = () => {
    sessionStorage.removeItem("pendingReferralCode")
  }

  // Helper function to process signed-in user
  const processSignedInUser = async (user, source = "unknown") => {
    if (redirectHandledRef.current) {
      console.log(`ℹ️ User already being processed, skipping (source: ${source})`)
      return
    }

    console.log(`✅ Processing signed-in user from ${source}:`, {
      email: user.email,
      uid: user.uid,
      displayName: user.displayName
    })

    redirectHandledRef.current = true
    setIsLoading(true)
    setApiError("")

    try {
      const idToken = await user.getIdToken()
      console.log(`✅ Got ID token from ${source}, calling backend...`)

      const response = await authAPI.firebaseGoogleLogin(idToken, "user", getPendingReferralCode())
      const data = response?.data?.data || {}

      console.log(`✅ Backend response from ${source}:`, {
        hasAccessToken: !!data.accessToken,
        hasUser: !!data.user,
        userEmail: data.user?.email
      })

      const accessToken = data.accessToken
      const appUser = data.user

      if (accessToken && appUser) {
        clearPendingReferralCode()
        setAuthData("user", accessToken, appUser)
        window.dispatchEvent(new Event("userAuthChanged"))

        // Clear any URL hash or params
        const hasHash = window.location.hash.length > 0
        const hasQueryParams = window.location.search.length > 0
        if (hasHash || hasQueryParams) {
          window.history.replaceState({}, document.title, window.location.pathname)
        }

        console.log(`✅ Navigating to user dashboard from ${source}...`)
        navigate("/user", { replace: true })
      } else {
        console.error(`❌ Invalid backend response from ${source}`)
        redirectHandledRef.current = false
        setIsLoading(false)
        setApiError("Invalid response from server. Please try again.")
      }
    } catch (error) {
      console.error(`❌ Error processing user from ${source}:`, error)
      console.error("Error details:", {
        code: error?.code,
        message: error?.message,
        response: error?.response?.data
      })
      redirectHandledRef.current = false
      setIsLoading(false)

      let errorMessage = "Failed to complete sign-in. Please try again."
      if (error?.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error?.message) {
        errorMessage = error.message
      }
      setApiError(errorMessage)
    }
  }

  // Handle Firebase redirect result on component mount and URL changes
  useEffect(() => {
    // Prevent multiple calls
    if (redirectHandledRef.current) {
      return
    }

    const handleRedirectResult = async () => {
      try {
        // Check if we're coming back from a redirect (URL might have hash or params)
        const currentUrl = window.location.href
        const hasHash = window.location.hash.length > 0
        const hasQueryParams = window.location.search.length > 0

        console.log("🔍 Checking for redirect result...", {
          url: currentUrl,
          hasHash,
          hasQueryParams,
          pathname: window.location.pathname,
          hash: window.location.hash,
          search: window.location.search
        })

        const { getRedirectResult, onAuthStateChanged } = await import("firebase/auth")

        // Ensure Firebase is initialized
        ensureFirebaseInitialized()

        // Check current user immediately (before getRedirectResult)
        const immediateUser = firebaseAuth.currentUser
        console.log("🔍 Immediate current user check:", {
          hasUser: !!immediateUser,
          userEmail: immediateUser?.email
        })

        console.log("🔍 About to call getRedirectResult...", {
          firebaseAuthExists: !!firebaseAuth,
          firebaseAuthApp: firebaseAuth?.app?.name,
          currentUser: firebaseAuth?.currentUser?.email || "none"
        })

        // First, try to get redirect result (non-blocking with timeout)
        // Note: getRedirectResult returns null if there's no redirect result (normal on first load)
        // We use a short timeout to avoid hanging, and rely on auth state listener as primary method
        let result = null
        try {
          console.log("🔍 Calling getRedirectResult now...")

          // Use a short timeout (3 seconds) - if it hangs, auth state listener will handle it
          result = await Promise.race([
            getRedirectResult(firebaseAuth),
            new Promise((resolve) =>
              setTimeout(() => {
                console.log("ℹ️ getRedirectResult timeout (normal - no redirect result), relying on auth state listener")
                resolve(null)
              }, 3000)
            )
          ])

          if (result !== null) {
            console.log("✅ getRedirectResult completed, result found")
          } else {
            console.log("ℹ️ No redirect result (normal on first page load)")
          }
        } catch (redirectError) {
          console.log("ℹ️ getRedirectResult error (will rely on auth state listener):", redirectError?.code || redirectError?.message)

          // Don't throw - auth state listener will handle sign-in
          result = null
        }

        console.log("🔍 Redirect result details:", {
          hasResult: !!result,
          hasUser: !!result?.user,
          userEmail: result?.user?.email,
          providerId: result?.providerId,
          operationType: result?.operationType
        })

        if (result && result.user) {
          // Process redirect result
          await processSignedInUser(result.user, "redirect-result")
        } else {
          // No redirect result - check if user is already signed in
          const currentUser = firebaseAuth.currentUser
          console.log("🔍 Checking current user after redirect check:", {
            hasCurrentUser: !!currentUser,
            userEmail: currentUser?.email,
            redirectHandled: redirectHandledRef.current
          })

          if (currentUser && !redirectHandledRef.current) {
            // Process current user
            await processSignedInUser(currentUser, "current-user-check")
          } else {
            // No redirect result - this is normal on first load
            console.log("ℹ️ No redirect result found (normal on first page load)")
            setIsLoading(false)
          }
        }
      } catch (error) {
        console.error("❌ Google sign-in redirect error:", error)
        console.error("Error details:", {
          code: error?.code,
          message: error?.message,
          stack: error?.stack
        })

        redirectHandledRef.current = false

        // Show error to user
        const errorCode = error?.code || ""
        const errorMessage = error?.message || ""

        // Don't show error for "no redirect result" - this is normal when page first loads
        if (errorCode === "auth/no-auth-event" || errorCode === "auth/popup-closed-by-user") {
          // These are expected cases, don't show error
          console.log("ℹ️ Expected case - no auth event or popup closed")
          setIsLoading(false)
          return
        }

        // Handle backend errors (500, etc.)
        let message = "Google sign-in failed. Please try again."

        if (error?.response) {
          // Axios error with response
          const status = error.response.status
          const responseData = error.response.data || {}

          if (status === 500) {
            message = responseData.message || responseData.error || "Server error. Please try again later."
          } else if (status === 400 || status === 401) {
            message = responseData.message || responseData.error || "Authentication failed. Please try again."
          } else {
            message = responseData.message || responseData.error || errorMessage || message
          }
        } else if (errorMessage) {
          message = errorMessage
        } else if (errorCode) {
          // Firebase auth error codes
          if (errorCode === "auth/network-request-failed") {
            message = "Network error. Please check your connection and try again."
          } else if (errorCode === "auth/invalid-credential") {
            message = "Invalid credentials. Please try again."
          } else {
            message = errorMessage || message
          }
        }

        setApiError(message)
        setIsLoading(false)
      }
    }

    // Helper function to process signed-in user
    const processSignedInUser = async (user, source = "unknown") => {
      if (redirectHandledRef.current) {
        console.log(`ℹ️ User already being processed, skipping (source: ${source})`)
        return
      }

      console.log(`✅ Processing signed-in user from ${source}:`, {
        email: user.email,
        uid: user.uid,
        displayName: user.displayName
      })

      redirectHandledRef.current = true
      setIsLoading(true)
      setApiError("")

      try {
        const idToken = await user.getIdToken()
        console.log(`✅ Got ID token from ${source}, calling backend...`)

        const response = await authAPI.firebaseGoogleLogin(idToken, "user", getPendingReferralCode())
        const data = response?.data?.data || {}

        console.log(`✅ Backend response from ${source}:`, {
          hasAccessToken: !!data.accessToken,
          hasUser: !!data.user,
          userEmail: data.user?.email
        })

        const accessToken = data.accessToken
        const appUser = data.user

        if (accessToken && appUser) {
          clearPendingReferralCode()
          setAuthData("user", accessToken, appUser)
          window.dispatchEvent(new Event("userAuthChanged"))

          // Clear any URL hash or params
          const hasHash = window.location.hash.length > 0
          const hasQueryParams = window.location.search.length > 0
          if (hasHash || hasQueryParams) {
            window.history.replaceState({}, document.title, window.location.pathname)
          }

          console.log(`✅ Navigating to user dashboard from ${source}...`)
          navigate("/user", { replace: true })
        } else {
          console.error(`❌ Invalid backend response from ${source}`)
          redirectHandledRef.current = false
          setIsLoading(false)
          setApiError("Invalid response from server. Please try again.")
        }
      } catch (error) {
        console.error(`❌ Error processing user from ${source}:`, error)
        console.error("Error details:", {
          code: error?.code,
          message: error?.message,
          response: error?.response?.data
        })
        redirectHandledRef.current = false
        setIsLoading(false)

        let errorMessage = "Failed to complete sign-in. Please try again."
        if (error?.response?.data?.message) {
          errorMessage = error.response.data.message
        } else if (error?.message) {
          errorMessage = error.message
        }
        setApiError(errorMessage)
      }
    }

    // Set up auth state listener FIRST (before getRedirectResult)
    // This ensures we catch auth state changes immediately
    let unsubscribe = null
    const setupAuthListener = async () => {
      try {
        const { onAuthStateChanged } = await import("firebase/auth")
        ensureFirebaseInitialized()

        console.log("🔔 Setting up auth state listener...")

        unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
          console.log("🔔 Auth state changed:", {
            hasUser: !!user,
            userEmail: user?.email,
            redirectHandled: redirectHandledRef.current,
            currentPath: window.location.pathname
          })

          // If user signed in and we haven't handled it yet
          if (user && !redirectHandledRef.current) {
            await processSignedInUser(user, "auth-state-listener")
          } else if (!user) {
            // User signed out
            console.log("ℹ️ User signed out")
            redirectHandledRef.current = false
          } else if (user && redirectHandledRef.current) {
            console.log("ℹ️ User already signed in and handled, skipping...")
          }
        })

        console.log("✅ Auth state listener set up successfully")
      } catch (error) {
        console.error("❌ Error setting up auth state listener:", error)
      }
    }

    // Set up auth listener first, then check redirect result
    setupAuthListener()

    // Also check current user immediately (in case redirect already completed)
    const checkCurrentUser = async () => {
      try {
        ensureFirebaseInitialized()
        const currentUser = firebaseAuth.currentUser
        if (currentUser && !redirectHandledRef.current) {
          console.log("✅ Current user found immediately, processing...")
          await processSignedInUser(currentUser, "immediate-check")
        }
      } catch (error) {
        console.error("❌ Error checking current user:", error)
      }
    }

    // Check current user immediately
    checkCurrentUser()

    // Small delay to ensure Firebase is ready, then check redirect result
    const timer = setTimeout(() => {
      handleRedirectResult()
    }, 500)

    return () => {
      clearTimeout(timer)
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [navigate, searchParams])

  // Pre-fill form from sessionStorage if data exists (e.g., when coming back from OTP)
  useEffect(() => {
    const stored = sessionStorage.getItem("userAuthData")
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (data.phone) {
          // Extract digits after +91
          const phoneDigits = data.phone.replace("+91", "").trim()
          setFormData(prev => ({
            ...prev,
            phone: phoneDigits,
            name: data.name || prev.name,
            email: data.email || prev.email,
            referralCode: data.referralCode || prev.referralCode,
          }))
          if (data.method) setAuthMethod(data.method)
        }
      } catch (err) {
        console.error("Error parsing stored auth data:", err)
      }
    }
  }, [])

  useEffect(() => {
    const refCode = searchParams.get("ref")
    if (refCode) {
      setFormData((prev) => ({
        ...prev,
        referralCode: String(refCode).trim().toUpperCase(),
      }))
    }
  }, [searchParams])

  // Get selected country details dynamically
  const selectedCountry = countryCodes.find(c => c.code === formData.countryCode) || countryCodes[2] // Default to India (+91)

  const validateEmail = (email) => {
    if (!email.trim()) {
      return "Email is required"
    }
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!emailRegex.test(email.trim())) {
      return "Please enter a valid email address"
    }
    return ""
  }

  const validatePhone = (phone) => {
    if (!phone.trim()) {
      return "Phone number is required"
    }
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, "")
    const phoneRegex = /^\d{10}$/
    if (!phoneRegex.test(cleanPhone)) {
      return "Phone number must be exactly 10 digits"
    }
    return ""
  }

  const validateName = (name) => {
    if (!name.trim()) {
      return "Name is required"
    }
    if (name.trim().length < 2) {
      return "Name must be at least 2 characters"
    }
    if (name.trim().length > 50) {
      return "Name must be less than 50 characters"
    }
    const nameRegex = /^[a-zA-Z\s'-]+$/
    if (!nameRegex.test(name.trim())) {
      return "Name can only contain letters, spaces, hyphens, and apostrophes"
    }
    return ""
  }

  const handleChange = (e) => {
    let { name, value } = e.target

    // Only allow numbers for phone field and limit to 10 digits
    if (name === "phone") {
      value = value.replace(/\D/g, "").slice(0, 10)
    }

    setFormData({
      ...formData,
      [name]: value,
    })

    // Real-time validation
    if (name === "email") {
      setErrors({ ...errors, email: validateEmail(value) })
    } else if (name === "phone") {
      setErrors({ ...errors, phone: validatePhone(value) })
    } else if (name === "name") {
      setErrors({ ...errors, name: validateName(value) })
    }
  }

  const handleCountryCodeChange = (value) => {
    setFormData({
      ...formData,
      countryCode: value,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setApiError("")

    // Validate based on auth method
    let hasErrors = false
    const newErrors = { phone: "", email: "", name: "" }

    if (authMethod === "phone") {
      const phoneError = validatePhone(formData.phone)
      newErrors.phone = phoneError
      if (phoneError) hasErrors = true
    } else {
      const emailError = validateEmail(formData.email)
      newErrors.email = emailError
      if (emailError) hasErrors = true
    }

    // Validate name for sign up
    if (isSignUp) {
      const nameError = validateName(formData.name)
      newErrors.name = nameError
      if (nameError) hasErrors = true
    }

    setErrors(newErrors)

    if (hasErrors) {
      setIsLoading(false)
      return
    }

    try {
      const purpose = isSignUp ? "register" : "login"
      const fullPhone = authMethod === "phone" ? `${formData.countryCode} ${formData.phone}`.trim() : null
      const email = authMethod === "email" ? formData.email.trim() : null

      // Call backend to send OTP
      await authAPI.sendOTP(fullPhone, purpose, email)

      // Store auth data in sessionStorage for OTP page
      const authData = {
        method: authMethod,
        phone: fullPhone,
        email: email,
        name: isSignUp ? formData.name.trim() : null,
        referralCode: isSignUp
          ? String(formData.referralCode || "").trim().toUpperCase()
          : null,
        isSignUp,
        module: "user",
      }
      sessionStorage.setItem("userAuthData", JSON.stringify(authData))

      // Navigate to OTP page
      navigate("/user/auth/otp")
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setApiError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setApiError("")
    setIsLoading(true)
    redirectHandledRef.current = false // Reset flag when starting new sign-in

    try {
      const queryReferralCode = String(searchParams.get("ref") || "").trim().toUpperCase()
      const normalizedReferralCode = String(formData.referralCode || queryReferralCode || "").trim().toUpperCase()
      if (isSignUp && normalizedReferralCode) {
        sessionStorage.setItem("pendingReferralCode", normalizedReferralCode)
      } else {
        clearPendingReferralCode()
      }

      // Ensure Firebase is initialized before use
      ensureFirebaseInitialized()

      // Validate Firebase Auth instance
      if (!firebaseAuth) {
        throw new Error("Firebase Auth is not initialized. Please check your Firebase configuration.")
      }

      const { signInWithRedirect } = await import("firebase/auth")

      // Log current origin for debugging
      console.log("🚀 Starting Google sign-in redirect...", {
        origin: window.location.origin,
        hostname: window.location.hostname,
        pathname: window.location.pathname
      })

      // Use redirect directly to avoid COOP issues
      // The redirect result will be handled by the useEffect hook above
      await signInWithRedirect(firebaseAuth, googleProvider)

      // Note: signInWithRedirect will cause a full page redirect to Google
      // After user authenticates, they'll be redirected back to this page
      // The useEffect hook will handle the result when the page loads again
      console.log("✅ Redirect initiated, user will be redirected to Google...")
      // Don't set loading to false here - page will redirect
    } catch (error) {
      console.error("❌ Google sign-in redirect error:", error)
      console.error("Error code:", error?.code)
      console.error("Error message:", error?.message)
      setIsLoading(false)
      redirectHandledRef.current = false

      const errorCode = error?.code || ""
      const errorMessage = error?.message || ""

      let message = "Google sign-in failed. Please try again."

      if (errorCode === "auth/configuration-not-found") {
        message = "Firebase configuration error. Please ensure your domain is authorized in Firebase Console. Current domain: " + window.location.hostname
      } else if (errorCode === "auth/popup-blocked") {
        message = "Popup was blocked. Please allow popups and try again."
      } else if (errorCode === "auth/popup-closed-by-user") {
        message = "Sign-in was cancelled. Please try again."
      } else if (errorCode === "auth/network-request-failed") {
        message = "Network error. Please check your connection and try again."
      } else if (errorMessage) {
        message = errorMessage
      } else if (error?.response?.data?.message) {
        message = error.response.data.message
      } else if (error?.response?.data?.error) {
        message = error.response.data.error
      }

      setApiError(message)
    }
  }

  const toggleMode = () => {
    const newMode = isSignUp ? "signin" : "signup"
    navigate(`/user/auth/sign-in?mode=${newMode}`, { replace: true })
    clearPendingReferralCode()
    // Reset form
    setFormData({ phone: "", countryCode: "+91", email: "", name: "", referralCode: "" })
    setErrors({ phone: "", email: "", name: "" })
  }

  const handleLoginMethodChange = () => {
    setAuthMethod(authMethod === "email" ? "phone" : "email")
  }

  return (
    <AnimatedPage className="max-h-screen flex flex-col bg-white dark:bg-[#0a0a0a] overflow-hidden !pb-0 md:flex-row md:overflow-hidden">

      {/* Mobile: Top Section - Banner Image */}
      {/* Desktop: Left Section - Banner Image */}
      <div className="relative md:hidden w-full shrink-0" style={{ height: "30vh", minHeight: "200px" }}>
        <img
          src={loginBanner}
          alt="Food Banner"
          className="w-full h-full object-cover object-center"
        />
      </div>

      <div className="relative hidden md:block w-full shrink-0 md:w-1/2 md:h-screen md:sticky md:top-0">
        <img
          src={loginBanner}
          alt="Food Banner"
          className="w-full h-full object-cover object-center"
        />
        {/* Overlay gradient for better text readability on desktop */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent" />
      </div>

      {/* Mobile: Bottom Section - White Login Form */}
      {/* Desktop: Right Section - Login Form */}
      <div className="bg-white dark:bg-[#1a1a1a] p-4 sm:p-5 md:p-6 lg:p-8 xl:p-10 overflow-hidden md:w-1/2 md:flex md:items-center md:justify-center md:h-screen">
        <div className="max-w-md lg:max-w-lg xl:max-w-xl mx-auto space-y-6 md:space-y-8 lg:space-y-10 w-full">
          {/* Heading */}
          <div className="text-center space-y-2 md:space-y-3">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-black dark:text-white leading-tight">
              India's #1 Food Delivery and Dining App
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 dark:text-gray-400">
              Log in or sign up
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
            {/* Name field for sign up - hidden by default, shown only when needed */}
            {isSignUp && (
              <div className="space-y-2">
                <Input
                  id="name"
                  name="name"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleChange}
                  className={`text-base md:text-lg h-12 md:h-14 bg-white dark:bg-[#1a1a1a] text-black dark:text-white ${errors.name ? "border-red-500" : "border-gray-300 dark:border-gray-700"} transition-colors`}
                  aria-invalid={errors.name ? "true" : "false"}
                />
                {errors.name && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.name}</span>
                  </div>
                )}
                <Input
                  id="referralCode"
                  name="referralCode"
                  placeholder="Referral code (optional)"
                  value={formData.referralCode}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      referralCode: e.target.value.toUpperCase(),
                    }))
                  }
                  className="text-base md:text-lg h-12 md:h-14 bg-white dark:bg-[#1a1a1a] text-black dark:text-white border-gray-300 dark:border-gray-700 transition-colors"
                />
              </div>
            )}

            {/* Phone Number Input */}
            {authMethod === "phone" && (
              <div className="space-y-2">
                <div className="flex gap-2 items-stretch">
                  <div className="flex items-center px-4 h-12 md:h-14 border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2a2a] text-black dark:text-white rounded-lg">
                    <span className="flex items-center gap-2 text-sm md:text-base font-medium">
                      <span>🇮🇳</span>
                      <span>+91</span>
                    </span>
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
                    className={`flex-1 h-12 md:h-14 text-base md:text-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white border-gray-300 dark:border-gray-700 rounded-lg ${errors.phone ? "border-red-500" : ""} transition-colors`}
                    aria-invalid={errors.phone ? "true" : "false"}
                  />
                </div>
                {errors.phone && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.phone}</span>
                  </div>
                )}
                {apiError && authMethod === "phone" && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{apiError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Email Input */}
            {authMethod === "email" && (
              <div className="space-y-2">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email address"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full h-12 md:h-14 text-base md:text-lg bg-white dark:bg-[#1a1a1a] text-black dark:text-white border-gray-300 dark:border-gray-700 rounded-lg ${errors.email ? "border-red-500" : ""} transition-colors`}
                  aria-invalid={errors.email ? "true" : "false"}
                />
                {errors.email && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{errors.email}</span>
                  </div>
                )}
                {apiError && authMethod === "email" && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    <span>{apiError}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod("phone")
                    setApiError("")
                  }}
                  className="text-xs text-[#EB590E] hover:underline text-left"
                >
                  Use phone instead
                </button>
              </div>
            )}

            {/* Continue Button */}
            <Button
              type="submit"
              className="w-full h-12 md:h-14 bg-[#EB590E] hover:bg-[#D94F0C] text-white font-bold text-base md:text-lg rounded-lg transition-all hover:shadow-lg active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isSignUp ? "Creating Account..." : "Signing In..."}
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </form>

          {/* Or Separator */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-[#1a1a1a] px-2 text-sm text-gray-500 dark:text-gray-400">
                or
              </span>
            </div>
          </div>

          {/* Social Login Icons */}
          <div className="flex justify-center gap-4 md:gap-6">
            {/* Google Login */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-12 h-12 md:w-14 md:h-14 rounded-full border border-gray-300 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-all hover:shadow-md active:scale-95"
              aria-label="Sign in with Google"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            </button>

            {/* Email Login */}
            <button
              type="button"
              onClick={handleLoginMethodChange}
              className="w-12 h-12 md:w-14 md:h-14 rounded-full border border-[#EB590E] flex items-center justify-center hover:bg-[#D94F0C] transition-all hover:shadow-md active:scale-95 bg-[#EB590E]"
              aria-label="Sign in with Email"
            >
              {authMethod == "phone" ? <Mail className="h-5 w-5 md:h-6 md:w-6 text-white" /> : <Phone className="h-5 w-5 md:h-6 md:w-6 text-white" />}
            </button>
          </div>

          {/* Legal Disclaimer */}
          <div className="text-center text-xs md:text-sm text-gray-500 dark:text-gray-400 pt-4 md:pt-6">
            <p className="mb-1 md:mb-2">
              By continuing, you agree to our
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              <Link to="/profile/terms" className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Terms of Service</Link>
              <span>•</span>
              <Link to="/profile/privacy" className="underline hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Privacy Policy</Link>
            </div>
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}

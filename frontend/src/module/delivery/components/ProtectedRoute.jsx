import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { deliveryAPI } from "@/lib/api"
import { clearModuleAuth, setAuthData } from "@/lib/utils/auth"

export default function ProtectedRoute({ children }) {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    let isMounted = true

    const runAuthCheck = async () => {
      if (localStorage.getItem("delivery_authenticated") === "true") {
        if (isMounted) {
          setIsAuthenticated(true)
          setIsCheckingAuth(false)
        }
        return
      }

      try {
        await deliveryAPI.refreshToken()
        const meResponse = await deliveryAPI.getCurrentDelivery()
        const currentUser = meResponse?.data?.data?.user || null

        setAuthData("delivery", "cookie-session", currentUser)

        if (isMounted) {
          setIsAuthenticated(true)
          setIsCheckingAuth(false)
        }
        return
      } catch (error) {
        // Ignore and fall through to unauthenticated path
      }

      clearModuleAuth("delivery")
      if (isMounted) {
        setIsAuthenticated(false)
        setIsCheckingAuth(false)
      }
    }

    runAuthCheck()

    return () => {
      isMounted = false
    }
  }, [])

  if (isCheckingAuth) {
    return <div className="min-h-screen bg-white" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/delivery/sign-in" replace />
  }

  return children
}

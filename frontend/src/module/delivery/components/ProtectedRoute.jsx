import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { deliveryAPI } from "@/lib/api"
import { getModuleToken, isTokenExpired, clearModuleAuth, setAuthData } from "@/lib/utils/auth"

export default function ProtectedRoute({ children }) {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    let isMounted = true

    const runAuthCheck = async () => {
      const currentToken = getModuleToken("delivery")

      if (currentToken && !isTokenExpired(currentToken)) {
        if (isMounted) {
          setIsAuthenticated(true)
          setIsCheckingAuth(false)
        }
        return
      }

      // Access token missing/expired: try silent refresh once.
      try {
        const response = await deliveryAPI.refreshToken()
        const data = response?.data?.data || response?.data || {}
        const refreshedAccessToken = data?.accessToken

        if (refreshedAccessToken && !isTokenExpired(refreshedAccessToken)) {
          let currentUser = null
          try {
            const storedUser = localStorage.getItem("delivery_user")
            currentUser = storedUser ? JSON.parse(storedUser) : null
          } catch (error) {
            currentUser = null
          }

          setAuthData("delivery", refreshedAccessToken, currentUser)

          if (isMounted) {
            setIsAuthenticated(true)
            setIsCheckingAuth(false)
          }
          return
        }
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

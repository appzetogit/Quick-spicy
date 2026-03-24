import { Navigate } from "react-router-dom"
import { isModuleAuthenticated } from "@/lib/utils/auth"

export default function ProtectedRoute({ children }) {
  // Validate using token state (more reliable than localStorage boolean flags)
  const isAuthenticated = isModuleAuthenticated("admin")

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }

  return children
}


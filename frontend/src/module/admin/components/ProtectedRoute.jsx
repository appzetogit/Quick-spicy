import { Navigate } from "react-router-dom"

export default function ProtectedRoute({ children }) {
  // Simple check - in real app, check authentication token
  const isAuthenticated = localStorage.getItem("admin_authenticated") === "true"

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }

  return children
}


import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import apiClient from "@/lib/api";
import Loader from "@/components/Loader";
import { clearModuleAuth, isModuleAuthenticated } from "@/lib/utils/auth";

/**
 * Role-based Protected Route Component
 * Only allows access if user is authenticated for the specific module
 */
export default function ProtectedRoute({ children, requiredRole, loginPath }) {
  const location = useLocation();
  const [isVerifying, setIsVerifying] = useState(true);
  const [hasVerifiedSession, setHasVerifiedSession] = useState(false);

  const isAuthenticated = requiredRole ? isModuleAuthenticated(requiredRole) : false;

  useEffect(() => {
    let isMounted = true;

    if (!requiredRole || !isAuthenticated) {
      setIsVerifying(false);
      setHasVerifiedSession(false);
      return () => {
        isMounted = false;
      };
    }

    const meEndpointByRole = {
      admin: "/admin/auth/me",
      restaurant: "/restaurant/auth/me",
      delivery: "/delivery/auth/me",
      user: "/auth/me",
    };

    const endpoint = meEndpointByRole[requiredRole];
    if (!endpoint) {
      setIsVerifying(false);
      setHasVerifiedSession(true);
      return () => {
        isMounted = false;
      };
    }

    setIsVerifying(true);
    apiClient
      .get(endpoint)
      .then(() => {
        if (!isMounted) return;
        setHasVerifiedSession(true);
      })
      .catch(() => {
        if (!isMounted) return;
        clearModuleAuth(requiredRole);
        setHasVerifiedSession(false);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsVerifying(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, requiredRole]);

  // If no role required, allow access
  if (!requiredRole) {
    return children;
  }

  // If not authenticated for this module, redirect to login
  if (!isAuthenticated) {
    if (loginPath) {
      return <Navigate to={loginPath} state={{ from: location.pathname }} replace />;
    }
    
    // Fallback: redirect to appropriate login page
    const roleLoginPaths = {
      'admin': '/admin/login',
      'restaurant': '/restaurant/login',
      'delivery': '/delivery/sign-in',
      'user': '/user/auth/sign-in'
    };
    
    const redirectPath = roleLoginPaths[requiredRole] || '/';
    return <Navigate to={redirectPath} replace />;
  }

  if (isVerifying) {
    return <Loader />;
  }

  if (!hasVerifiedSession) {
    const roleLoginPaths = {
      admin: "/admin/login",
      restaurant: "/restaurant/login",
      delivery: "/delivery/sign-in",
      user: "/user/auth/sign-in"
    };

    const redirectPath = loginPath || roleLoginPaths[requiredRole] || "/";
    return <Navigate to={redirectPath} state={{ from: location.pathname }} replace />;
  }

  return children;
}


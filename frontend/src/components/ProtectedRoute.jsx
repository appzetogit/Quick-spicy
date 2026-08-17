import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import apiClient from "@/lib/api";
import Loader from "@/components/Loader";
import { clearModuleAuth, isModuleAuthenticated, markModuleAuthenticated } from "@/lib/utils/auth";

/**
 * Role-based Protected Route Component
 * Only allows access if user is authenticated for the specific module
 */
export default function ProtectedRoute({ children, requiredRole, loginPath }) {
  const location = useLocation();
  const [isVerifying, setIsVerifying] = useState(true);
  const [hasVerifiedSession, setHasVerifiedSession] = useState(false);

  // The localStorage hint, and whether the server has since confirmed a session despite it
  // being absent. The hint alone used to decide access, so losing it - which a WebView does
  // routinely - threw customers straight to the OTP screen with a valid session in place.
  const hasLocalHint = requiredRole ? isModuleAuthenticated(requiredRole) : false;
  const [serverConfirmedSession, setServerConfirmedSession] = useState(false);
  const isAuthenticated = hasLocalHint || serverConfirmedSession;

  useEffect(() => {
    let isMounted = true;

    if (!requiredRole) {
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
        // The cookie is the session. Rebuild the local hint so the next launch renders
        // immediately instead of bouncing to login.
        markModuleAuthenticated(requiredRole);
        setServerConfirmedSession(true);
        setHasVerifiedSession(true);
      })
      .catch((error) => {
        if (!isMounted) return;
        // Same rule as the axios interceptor: only the server saying 401/403 means the
        // session is over. A timeout, a dropped mobile connection, or a 502 while the API
        // restarts says nothing about the session, and clearing auth on those is what
        // logged vendors and riders out at random on app launch. Keep the session and let
        // the next request decide.
        const status = error?.response?.status;
        if (status !== 401 && status !== 403) {
          // Unreachable server says nothing about the session. Trust the local hint if we
          // have one; without one there is nothing to render, so fall through to login.
          setHasVerifiedSession(hasLocalHint);
          return;
        }
        clearModuleAuth(requiredRole);
        setServerConfirmedSession(false);
        setHasVerifiedSession(false);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsVerifying(false);
      });

    return () => {
      isMounted = false;
    };
  }, [requiredRole, hasLocalHint]);

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


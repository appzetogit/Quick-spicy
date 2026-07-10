import jwtService from "../services/jwtService.js";
import User from "../models/User.js";
import { errorResponse } from "../../../shared/utils/response.js";
import { getAccessTokenFromRequest } from "../../../shared/utils/authCookies.js";

/**
 * Authentication Middleware
 * Verifies JWT access token and attaches user to request
 */
export const authenticate = async (req, res, next) => {
  try {
    let token = null;

    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    // 2. Check httpOnly access token cookie
    if (!token) {
      token = getAccessTokenFromRequest(req, "user");
    }

    if (!token) {
      return errorResponse(res, 401, "No token provided");
    }

    // Verify token
    const decoded = jwtService.verifyAccessToken(token);

    // Get user from database
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return errorResponse(res, 401, "User not found");
    }

    if (!user.isActive) {
      return errorResponse(res, 401, "User account is inactive");
    }

    // Check tokenVersion match to handle rotated/revoked sessions
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return errorResponse(res, 401, "Session expired or revoked. Please log in again.");
    }

    // Check email verification status for email registrations
    if (user.signupMethod === "email" && !user.emailVerified) {
      return errorResponse(res, 403, "Please verify your email address to proceed.");
    }

    // Attach user and decoded claims to request
    req.user = user;
    req.token = decoded;

    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || "Invalid token");
  }
};

/**
 * Role-based Authorization Middleware
 * @param {...string} roles - Allowed roles
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 401, "Authentication required");
    }

    if (!roles.includes(req.user.role)) {
      return errorResponse(
        res,
        403,
        "Access denied. Insufficient permissions.",
      );
    }

    next();
  };
};

export default { authenticate, authorize };

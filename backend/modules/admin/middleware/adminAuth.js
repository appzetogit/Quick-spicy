import jwtService from '../../auth/services/jwtService.js';
import Admin from '../models/Admin.js';
import { errorResponse } from '../../../shared/utils/response.js';
import { isAdminSessionActive, touchAdminSession } from '../services/adminSessionService.js';
import { getAccessTokenFromRequest } from '../../../shared/utils/authCookies.js';

/**
 * Admin Authentication Middleware
 * Verifies JWT access token and attaches admin to request
 */
export const authenticateAdmin = async (req, res, next) => {
  try {
    // Get token from Authorization header (case-insensitive check)
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const cookieToken = getAccessTokenFromRequest(req, 'admin');
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : cookieToken;

    if (!token) {
      return errorResponse(res, 401, 'No token provided');
    }

    // Verify token
    const decoded = jwtService.verifyAccessToken(token);

    // Ensure token is for admin role
    if (decoded.role !== 'admin') {
      return errorResponse(res, 403, 'Access denied. Admin access required.');
    }

    // Get admin from database
    const admin = await Admin.findById(decoded.userId).select('-password');
    
    if (!admin) {
      return errorResponse(res, 401, 'Admin not found');
    }

    if (!admin.isActive) {
      return errorResponse(res, 401, 'Admin account is inactive');
    }

    // Check tokenVersion match to handle rotated/revoked sessions
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== admin.tokenVersion) {
      return errorResponse(res, 401, 'Session expired or revoked. Please log in again.');
    }

    if (decoded.sessionId) {
      const activeSession = await isAdminSessionActive({
        adminId: admin._id,
        sessionId: decoded.sessionId,
      });

      if (!activeSession) {
        return errorResponse(res, 401, 'Admin session revoked or expired. Please log in again.');
      }

      await touchAdminSession({
        adminId: admin._id,
        sessionId: decoded.sessionId,
      });
    }

    // Attach admin to request (both req.user and req.admin for compatibility)
    req.user = admin;
    req.admin = admin; // Also set req.admin for consistency
    req.token = decoded;
    
    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid token');
  }
};

/**
 * Admin Role Authorization Middleware
 * @param {...string} roles - Allowed admin roles (super_admin, admin, moderator)
 */
export const authorizeAdmin = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 401, 'Authentication required');
    }

    if (!roles.includes(req.user.role)) {
      return errorResponse(res, 403, 'Access denied. Insufficient permissions.');
    }

    next();
  };
};

export default { authenticateAdmin, authorizeAdmin };


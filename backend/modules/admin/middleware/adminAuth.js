import jwtService from '../../auth/services/jwtService.js';
import Admin from '../models/Admin.js';
import { errorResponse } from '../../../shared/utils/response.js';

/**
 * Admin Authentication Middleware
 * Verifies JWT access token and attaches admin to request
 */
export const authenticateAdmin = async (req, res, next) => {
  try {
    // Get token from Authorization header (case-insensitive check)
    const authHeader = req.headers.authorization || req.headers.Authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'No token provided');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

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


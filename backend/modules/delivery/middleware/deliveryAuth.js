import jwtService from '../../auth/services/jwtService.js';
import Delivery from '../models/Delivery.js';
import { errorResponse } from '../../../shared/utils/response.js';
import { getAccessTokenFromRequest } from '../../../shared/utils/authCookies.js';

/**
 * Delivery Authentication Middleware
 * Verifies JWT access token and attaches delivery boy to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token) {
      token = getAccessTokenFromRequest(req, 'delivery');
    }

    if (!token) {
      // Rejections here are otherwise invisible: this returns before any controller
      // logging runs, and nginx access logs are disabled. A client that posts an FCM
      // token without credentials looks identical to a client that never posted at all.
      console.warn('🔒 Delivery auth rejected: no token', {
        path: req.originalUrl,
        origin: req.headers.origin || '',
        hasAuthHeader: Boolean(req.headers.authorization),
        cookieNames: Object.keys(req.cookies || {}),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 120),
      });
      return errorResponse(res, 401, 'No token provided');
    }

    // Verify token
    const decoded = jwtService.verifyAccessToken(token);

    // Ensure it's a delivery token
    if (decoded.role !== 'delivery') {
      return errorResponse(res, 403, 'Invalid token. Delivery access required.');
    }

    // Scoped push-registration tokens live in localStorage so the rider APK can read them,
    // which puts them within reach of any script on the page. Confine them to the one route
    // they exist for, so a stolen one cannot touch wallets, orders or profile data.
    if (decoded.scope === 'fcm' && !String(req.originalUrl || '').includes('/fcm-token')) {
      console.warn('🔒 Delivery push-scoped token rejected outside FCM route', {
        path: req.originalUrl,
        deliveryId: decoded.userId,
      });
      return errorResponse(res, 403, 'This token may only be used to register push tokens.');
    }

    // Get delivery boy from database
    const delivery = await Delivery.findById(decoded.userId).select('-password -refreshToken');
    
    if (!delivery) {
      console.error('❌ Delivery boy not found in database:', {
        userId: decoded.userId,
        role: decoded.role,
        email: decoded.email,
      });
      return errorResponse(res, 401, 'Delivery boy not found');
    }

    // Check tokenVersion match to handle rotated/revoked sessions
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== delivery.tokenVersion) {
      return errorResponse(res, 401, 'Session expired or revoked. Please log in again.');
    }

    // Allow blocked/pending status partners to access (they can see rejection reason or verification message)
    // Only block if account is inactive AND not blocked/pending (blocked/pending partners can login)
    if (!delivery.isActive && delivery.status !== 'blocked' && delivery.status !== 'pending') {
      console.error('❌ Delivery boy account is inactive:', {
        deliveryId: delivery._id,
        deliveryName: delivery.name,
        isActive: delivery.isActive,
        status: delivery.status,
      });
      return errorResponse(res, 401, 'Delivery boy account is inactive');
    }

    // Attach delivery boy to request
    req.delivery = delivery;
    req.token = decoded;
    
    next();
  } catch (error) {
    console.warn('🔒 Delivery auth rejected: token invalid', {
      path: req.originalUrl,
      reason: error?.name === 'TokenExpiredError' ? 'expired' : error?.message || 'verify failed',
      origin: req.headers.origin || '',
      via: req.headers.authorization ? 'bearer' : 'cookie',
    });
    return errorResponse(res, 401, error.message || 'Invalid token');
  }
};

export default { authenticate };


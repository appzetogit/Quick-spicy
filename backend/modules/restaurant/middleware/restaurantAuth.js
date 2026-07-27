import jwtService from '../../auth/services/jwtService.js';
import Restaurant from '../models/Restaurant.js';
import { errorResponse } from '../../../shared/utils/response.js';
import { getAccessTokenFromRequest } from '../../../shared/utils/authCookies.js';
import { isPushScopeViolation } from '../../../shared/utils/pushScopedToken.js';

/**
 * Restaurant Authentication Middleware
 * Verifies JWT access token and attaches restaurant to request
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
      token = getAccessTokenFromRequest(req, 'restaurant');
    }

    if (!token) {
      return errorResponse(res, 401, 'No token provided');
    }

    // Verify token
    const decoded = jwtService.verifyAccessToken(token);

    // Ensure it's a restaurant token
    if (decoded.role !== 'restaurant') {
      return errorResponse(res, 403, 'Invalid token. Restaurant access required.');
    }

    // Push-scoped tokens live in localStorage so the native app can read them, which puts
    // them within reach of page scripts. Confine them to FCM registration.
    if (isPushScopeViolation(decoded, req.originalUrl)) {
      console.warn('🔒 Restaurant push-scoped token rejected outside FCM route', {
        path: req.originalUrl,
        restaurantId: decoded.userId,
      });
      return errorResponse(res, 403, 'This token may only be used to register push tokens.');
    }

    // Get restaurant from database
    const restaurant = await Restaurant.findById(decoded.userId).select('-password');
    
    if (!restaurant) {
      console.error('❌ Restaurant not found in database:', {
        userId: decoded.userId,
        role: decoded.role,
        email: decoded.email,
      });
      return errorResponse(res, 401, 'Restaurant not found');
    }

    // Check tokenVersion match to handle rotated/revoked sessions
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== restaurant.tokenVersion) {
      return errorResponse(res, 401, 'Session expired or revoked. Please log in again.');
    }

    // Allow inactive restaurants to access onboarding and profile routes
    // They need to complete onboarding even if not yet approved by admin
    // Only block inactive restaurants from accessing other restricted routes
    const reqPath = req.path || '';
    const baseUrl = req.baseUrl || '';

    // Match on the routed path only. req.originalUrl carries the query string too, so
    // matching against it let a deactivated restaurant re-open blocked endpoints just
    // by appending ?x=/menu. Never reintroduce originalUrl here.
    const requestPath = `${baseUrl}${reqPath}`.replace(/\/+$/, '') || '/';

    // Exact segment match: '/menu' and '/menu/item' allow, '/wallet' never does,
    // regardless of what the query string says.
    const allowsPrefix = (prefix) => requestPath === prefix || requestPath.endsWith(prefix) || requestPath.includes(`${prefix}/`);

    const isOnboardingRoute = allowsPrefix('/onboarding');

    // /auth/me and /auth/reverify live under the /auth mount, so reqPath is /me or
    // /reverify there. /owner/me sits directly under /api/restaurant.
    const isProfileRoute =
      allowsPrefix('/auth/me') ||
      allowsPrefix('/auth/reverify') ||
      allowsPrefix('/owner/me') ||
      reqPath === '/me' ||
      reqPath === '/reverify';

    // Restaurants still need menu and inventory access while inactive so they can
    // finish setup before approval.
    const isMenuRoute = allowsPrefix('/menu');
    const isInventoryRoute = allowsPrefix('/inventory');
    
    // Debug logging for inactive restaurants
    if (!restaurant.isActive) {
      console.log('🔍 Inactive restaurant route check:', {
        restaurantId: restaurant._id,
        restaurantName: restaurant.name,
        isActive: restaurant.isActive,
        requestPath,
        reqPath,
        baseUrl,
        originalUrl: req.originalUrl,
        url: req.url,
        isOnboardingRoute,
        isProfileRoute,
        isMenuRoute,
        isInventoryRoute,
        willAllow: isOnboardingRoute || isProfileRoute || isMenuRoute || isInventoryRoute
      });
    }
    
    // Allow access to onboarding, profile, menu, and inventory routes even if inactive
    // These are essential for restaurant setup and management
    // Also allow access to getCurrentRestaurant endpoint (used to check status)
    if (!restaurant.isActive && !isOnboardingRoute && !isProfileRoute && !isMenuRoute && !isInventoryRoute) {
      console.error('❌ Restaurant account is inactive - access denied:', {
        restaurantId: restaurant._id,
        restaurantName: restaurant.name,
        isActive: restaurant.isActive,
        requestPath,
        reqPath,
        baseUrl,
        originalUrl: req.originalUrl,
        url: req.url,
        routeChecks: {
          isOnboardingRoute,
          isProfileRoute,
          isMenuRoute,
          isInventoryRoute
        }
      });
      return errorResponse(res, 401, 'Restaurant account is inactive. Please wait for admin approval.');
    }

    // Attach restaurant to request
    req.restaurant = restaurant;
    req.token = decoded;
    
    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid token');
  }
};

export default { authenticate };


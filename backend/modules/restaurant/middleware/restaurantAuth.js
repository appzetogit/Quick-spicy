import jwtService from '../../auth/services/jwtService.js';
import Restaurant from '../models/Restaurant.js';
import { errorResponse } from '../../../shared/utils/response.js';

/**
 * Restaurant Authentication Middleware
 * Verifies JWT access token and attaches restaurant to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'No token provided');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwtService.verifyAccessToken(token);

    // Ensure it's a restaurant token
    if (decoded.role !== 'restaurant') {
      return errorResponse(res, 403, 'Invalid token. Restaurant access required.');
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

    // Allow inactive restaurants to access onboarding and profile routes
    // They need to complete onboarding even if not yet approved by admin
    // Only block inactive restaurants from accessing other restricted routes
    const requestPath = req.originalUrl || req.url || '';
    const reqPath = req.path || '';
    const baseUrl = req.baseUrl || '';
    
    // Check for onboarding routes (can be /onboarding or /api/restaurant/onboarding)
    const isOnboardingRoute = requestPath.includes('/onboarding') || reqPath === '/onboarding' || reqPath.includes('onboarding');
    
    // Check for profile/auth routes
    // Note: /auth/me and /auth/reverify are handled by restaurantAuthRoutes mounted at /auth, so:
    // - Full path: /api/restaurant/auth/me or /api/restaurant/auth/reverify
    // - reqPath: /me or /reverify (relative to /auth mount point)
    // - baseUrl: /auth (if mounted)
    // /owner/me is directly under /api/restaurant, so reqPath would be /owner/me
    const isProfileRoute = requestPath.includes('/auth/me') || requestPath.includes('/auth/reverify') || 
                          requestPath.includes('/owner/me') || 
                          reqPath === '/me' || reqPath === '/reverify' || reqPath === '/owner/me' ||
                          (baseUrl.includes('/auth') && (reqPath === '/me' || reqPath === '/reverify'));
    
    // Check for menu routes - restaurants need to access menu even when inactive
    // They might need to set up menu during onboarding or after approval
    // Routes: /api/restaurant/menu, /api/restaurant/menu/section, /api/restaurant/menu/item/schedule, etc.
    const isMenuRoute = requestPath.includes('/menu') || 
                       reqPath === '/menu' || 
                       reqPath.startsWith('/menu/') ||
                       baseUrl.includes('/menu');
    
    // Check for inventory routes - restaurants need to manage inventory even when inactive
    // Routes: /api/restaurant/inventory
    const isInventoryRoute = requestPath.includes('/inventory') || 
                            reqPath === '/inventory' ||
                            reqPath.startsWith('/inventory/');
    
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


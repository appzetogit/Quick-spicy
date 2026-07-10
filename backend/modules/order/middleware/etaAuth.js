import jwtService from '../../auth/services/jwtService.js';
import User from '../../auth/models/User.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Delivery from '../../delivery/models/Delivery.js';
import Admin from '../../admin/models/Admin.js';
import { errorResponse } from '../../../shared/utils/response.js';
import { getAccessTokenFromRequest } from '../../../shared/utils/authCookies.js';

const MODEL_BY_ROLE = {
  user: User,
  restaurant: Restaurant,
  delivery: Delivery,
  admin: Admin,
};

const REQUEST_PROPERTY_BY_ROLE = {
  user: 'user',
  restaurant: 'restaurant',
  delivery: 'delivery',
  admin: 'admin',
};

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  for (const role of ['admin', 'restaurant', 'delivery', 'user']) {
    const cookieToken = getAccessTokenFromRequest(req, role);
    if (cookieToken) {
      return cookieToken;
    }
  }

  return null;
};

export const authenticateOrderActor = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const decoded = jwtService.verifyAccessToken(token);
    const role = decoded?.role;
    const Model = MODEL_BY_ROLE[role];

    if (!Model) {
      return errorResponse(res, 403, 'Unsupported actor role');
    }

    const actor = await Model.findById(decoded.userId).select('-password');
    if (!actor || actor.isActive === false) {
      return errorResponse(res, 401, 'Authenticated account not found or inactive');
    }

    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== actor.tokenVersion) {
      return errorResponse(res, 401, 'Session expired or revoked. Please log in again.');
    }

    req.actor = { role, account: actor, token: decoded };
    req.token = decoded;
    req[REQUEST_PROPERTY_BY_ROLE[role]] = actor;
    if (role === 'admin' || role === 'user') {
      req.user = actor;
    }

    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid token');
  }
};


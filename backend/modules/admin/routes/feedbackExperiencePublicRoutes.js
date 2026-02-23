import express from 'express';
import { createFeedbackExperience } from '../controllers/feedbackExperienceController.js';
import jwtService from '../../auth/services/jwtService.js';
import User from '../../auth/models/User.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import { errorResponse } from '../../../shared/utils/response.js';

const router = express.Router();

/**
 * Flexible Authentication Middleware
 * Accepts both user and restaurant tokens
 */
const authenticateFlexible = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'No token provided');
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = jwtService.verifyAccessToken(token);

    // Check if token is for user
    if (decoded.role === 'user') {
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return errorResponse(res, 401, 'User not found');
      }

      if (!user.isActive) {
        return errorResponse(res, 401, 'User account is inactive');
      }

      req.user = user;
      req.token = decoded;
      return next();
    }

    // Check if token is for restaurant
    if (decoded.role === 'restaurant') {
      const restaurant = await Restaurant.findById(decoded.userId).select('-password');
      
      if (!restaurant) {
        return errorResponse(res, 401, 'Restaurant not found');
      }

      // For feedback, attach restaurant as user for compatibility with controller
      req.user = restaurant; // Controller expects req.user
      req.restaurant = restaurant; // Also attach as req.restaurant for clarity
      req.token = decoded;
      return next();
    }

    // Check if token is for delivery
    if (decoded.role === 'delivery') {
      const Delivery = (await import('../../delivery/models/Delivery.js')).default;
      const delivery = await Delivery.findById(decoded.userId).select('-password');
      
      if (!delivery) {
        return errorResponse(res, 401, 'Delivery partner not found');
      }

      req.user = delivery; // Controller expects req.user
      req.delivery = delivery; // Also attach as req.delivery for clarity
      req.token = decoded;
      return next();
    }

    return errorResponse(res, 403, 'Invalid token role');
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid token');
  }
};

// Public route for creating feedback experience (requires user/restaurant/delivery authentication)
router.post('/feedback-experience', authenticateFlexible, createFeedbackExperience);

export default router;


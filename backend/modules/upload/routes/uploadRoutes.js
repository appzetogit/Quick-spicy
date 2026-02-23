import express from 'express';
import multer from 'multer';
import { uploadMiddleware } from '../../../shared/utils/cloudinaryService.js';
import { uploadSingleMedia } from '../controllers/uploadController.js';
import jwtService from '../../auth/services/jwtService.js';
import User from '../../auth/models/User.js';
import Admin from '../../admin/models/Admin.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import { errorResponse } from '../../../shared/utils/response.js';

const router = express.Router();

/**
 * Flexible authentication middleware
 * Accepts admin, user, restaurant, and delivery tokens
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

    // Check if token is for admin
    if (decoded.role === 'admin') {
      const admin = await Admin.findById(decoded.userId).select('-password');
      
      if (!admin) {
        return errorResponse(res, 401, 'Admin not found');
      }

      if (!admin.isActive) {
        return errorResponse(res, 401, 'Admin account is inactive');
      }

      req.user = admin;
      req.token = decoded;
      return next();
    }

    // Check if token is for restaurant
    if (decoded.role === 'restaurant') {
      const restaurant = await Restaurant.findById(decoded.userId).select('-password');
      
      if (!restaurant) {
        return errorResponse(res, 401, 'Restaurant not found');
      }

      // Allow inactive restaurants to access upload routes - they need to upload images during onboarding
      // Similar to delivery partners, inactive restaurants can access upload during onboarding/verification
      // The middleware in restaurant routes will handle blocking inactive restaurants from other restricted routes
      // if (!restaurant.isActive) {
      //   return errorResponse(res, 401, 'Restaurant account is inactive');
      // }

      req.user = restaurant; // Use req.user for consistency with other modules
      req.restaurant = restaurant; // Also attach as req.restaurant for clarity
      req.token = decoded;
      return next();
    }

    // Check if token is for delivery
    if (decoded.role === 'delivery') {
      try {
        const Delivery = (await import('../../delivery/models/Delivery.js')).default;
        const delivery = await Delivery.findById(decoded.userId).select('-password');
        
        if (!delivery) {
          return errorResponse(res, 401, 'Delivery partner not found');
        }

        // Allow blocked/pending status partners to access (they can see rejection reason or verification message)
        // Only block if account is inactive AND not blocked/pending (blocked/pending partners can login)
        if (!delivery.isActive && delivery.status !== 'blocked' && delivery.status !== 'pending') {
          return errorResponse(res, 401, 'Delivery partner account is inactive');
        }

        req.user = delivery;
        req.token = decoded;
        return next();
      } catch (importError) {
        // If Delivery model doesn't exist, skip delivery authentication
        console.warn('Delivery model not found, skipping delivery authentication');
      }
    }

    // Otherwise, try regular user authentication
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return errorResponse(res, 401, 'User not found');
    }

    if (!user.isActive) {
      return errorResponse(res, 401, 'User account is inactive');
    }

    req.user = user;
    req.token = decoded;
    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid token');
  }
};

// POST /api/upload/media - Accepts both admin and user tokens
// Handle multer errors before controller
router.post(
  '/media',
  authenticateFlexible,
  (req, res, next) => {
    uploadMiddleware.single('file')(req, res, (err) => {
      if (err) {
        console.error('❌ Multer upload error:', err);
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return errorResponse(res, 400, 'File size exceeds 20MB limit');
          }
          return errorResponse(res, 400, `Upload error: ${err.message}`);
        }
        // For non-multer errors (e.g., fileFilter errors)
        if (err.message) {
          return errorResponse(res, 400, err.message);
        }
        return errorResponse(res, 400, 'File upload error');
      }
      next();
    });
  },
  uploadSingleMedia
);

export default router;



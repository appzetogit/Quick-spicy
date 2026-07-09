import express from 'express';
import {
  adminLogin,
  verifyAdminLoginOtp,
  refreshAdminToken,
  getCurrentAdmin,
  adminLogout,
  adminLogoutAll
} from '../controllers/adminAuthController.js';
import {
  getAdminSessions,
  revokeSpecificAdminSession,
  saveCurrentAdminSessionLocation,
} from '../controllers/adminSessionController.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required().lowercase(),
  password: Joi.string().required()
});

const verifyLoginOtpSchema = Joi.object({
  email: Joi.string().email().required().lowercase(),
  password: Joi.string().required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required(),
  sessionContext: Joi.object({
    locationPermission: Joi.string().valid('prompt', 'granted', 'denied', 'unavailable').optional(),
    deviceName: Joi.string().max(120).allow('').optional(),
    location: Joi.object({
      latitude: Joi.number().optional(),
      longitude: Joi.number().optional(),
      accuracy: Joi.number().optional(),
      address: Joi.string().max(300).allow('').optional(),
      city: Joi.string().max(120).allow('').optional(),
      region: Joi.string().max(120).allow('').optional(),
      country: Joi.string().max(120).allow('').optional(),
      source: Joi.string().max(50).allow('').optional(),
    }).optional(),
  }).optional(),
});

const sessionLocationSchema = Joi.object({
  sessionContext: Joi.object({
    locationPermission: Joi.string().valid('prompt', 'granted', 'denied', 'unavailable').required(),
    deviceName: Joi.string().max(120).allow('').optional(),
    location: Joi.object({
      latitude: Joi.number().optional(),
      longitude: Joi.number().optional(),
      accuracy: Joi.number().optional(),
      address: Joi.string().max(300).allow('').optional(),
      city: Joi.string().max(120).allow('').optional(),
      region: Joi.string().max(120).allow('').optional(),
      country: Joi.string().max(120).allow('').optional(),
      source: Joi.string().max(50).allow('').optional(),
    }).optional(),
  }).required(),
});

// Public routes
router.post('/login', validate(loginSchema), adminLogin);
router.post('/verify-login-otp', validate(verifyLoginOtpSchema), verifyAdminLoginOtp);
router.post('/refresh-token', refreshAdminToken);

// Protected routes
router.get('/me', authenticateAdmin, getCurrentAdmin);
router.post('/logout', authenticateAdmin, adminLogout);
router.post('/logout-all', authenticateAdmin, adminLogoutAll);
router.get('/sessions', authenticateAdmin, getAdminSessions);
router.delete('/sessions/:sessionId', authenticateAdmin, revokeSpecificAdminSession);
router.post('/sessions/current/location', authenticateAdmin, validate(sessionLocationSchema), saveCurrentAdminSessionLocation);

export default router;


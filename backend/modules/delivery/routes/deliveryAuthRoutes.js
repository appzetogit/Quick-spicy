import express from 'express';
import {
  sendOTP,
  verifyOTP,
  refreshToken,
  logout,
  getCurrentDelivery,
  saveFcmToken,
  removeFcmToken
} from '../controllers/deliveryAuthController.js';
import { authenticate } from '../middleware/deliveryAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Validation schemas
const sendOTPSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .required(),
  purpose: Joi.string()
    .valid('login', 'register', 'reset-password', 'verify-phone')
    .default('login')
});

const verifyOTPSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .required(),
  otp: Joi.string().required().length(6),
  purpose: Joi.string()
    .valid('login', 'register', 'reset-password', 'verify-phone')
    .default('login'),
  name: Joi.string().allow(null, '').optional()
});

const fcmTokenSchema = Joi.object({
  token: Joi.string().trim().min(10).required(),
  platform: Joi.string().valid('web', 'android', 'ios', 'mobile', 'flutter', 'flutter-webview', 'apk', 'all', 'both').default('web'),
  channel: Joi.string().valid('web', 'mobile', 'both').optional(),
  deviceId: Joi.string().trim().optional(),
  source: Joi.string().trim().optional(),
});

const removeFcmTokenSchema = Joi.object({
  token: Joi.string().trim().optional(),
  platform: Joi.string().valid('web', 'android', 'ios', 'mobile', 'flutter', 'flutter-webview', 'apk', 'all', 'both').optional(),
  channel: Joi.string().valid('web', 'mobile', 'both').optional(),
  deviceId: Joi.string().trim().optional(),
}).or('token', 'platform', 'channel', 'deviceId');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes
router.post('/send-otp', authLimiter, validate(sendOTPSchema), sendOTP);
router.post('/verify-otp', authLimiter, validate(verifyOTPSchema), verifyOTP);
router.post('/refresh-token', authLimiter, refreshToken);

// Protected routes (require authentication)
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentDelivery);
router.post('/fcm-token', authenticate, validate(fcmTokenSchema), saveFcmToken);
router.delete('/fcm-token', authenticate, validate(removeFcmTokenSchema), removeFcmToken);

export default router;

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
});

const removeFcmTokenSchema = Joi.object({
  token: Joi.string().trim().optional(),
  platform: Joi.string().valid('web', 'android', 'ios', 'mobile', 'flutter', 'flutter-webview', 'apk', 'all', 'both').optional(),
  channel: Joi.string().valid('web', 'mobile', 'both').optional(),
}).or('token', 'platform', 'channel');

// Public routes
router.post('/send-otp', validate(sendOTPSchema), sendOTP);
router.post('/verify-otp', validate(verifyOTPSchema), verifyOTP);
router.post('/refresh-token', refreshToken);

// Protected routes (require authentication)
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentDelivery);
router.post('/fcm-token', authenticate, validate(fcmTokenSchema), saveFcmToken);
router.delete('/fcm-token', authenticate, validate(removeFcmTokenSchema), removeFcmToken);

export default router;

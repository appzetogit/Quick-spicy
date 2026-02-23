import express from 'express';
import {
  adminSignup,
  adminLogin,
  adminSignupWithOTP,
  getCurrentAdmin,
  adminLogout
} from '../controllers/adminAuthController.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const signupSchema = Joi.object({
  name: Joi.string().required().min(2).max(50),
  email: Joi.string().email().required().lowercase(),
  password: Joi.string().required().min(6).max(100),
  phone: Joi.string().optional().pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().lowercase(),
  password: Joi.string().required()
});

const signupOTPSchema = Joi.object({
  name: Joi.string().required().min(2).max(50),
  email: Joi.string().email().required().lowercase(),
  password: Joi.string().required().min(6).max(100),
  otp: Joi.string().required().length(6),
  phone: Joi.string().optional().pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
});

// Public routes
router.post('/signup', validate(signupSchema), adminSignup);
router.post('/signup/otp', validate(signupOTPSchema), adminSignupWithOTP);
router.post('/login', validate(loginSchema), adminLogin);

// Protected routes
router.get('/me', authenticateAdmin, getCurrentAdmin);
router.post('/logout', authenticateAdmin, adminLogout);

export default router;


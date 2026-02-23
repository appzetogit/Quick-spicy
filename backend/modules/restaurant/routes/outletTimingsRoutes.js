import express from 'express';
import {
  getOutletTimings,
  getOutletTimingsByRestaurantId,
  upsertOutletTimings,
  updateDayTiming,
  toggleOutletTimingsStatus,
  deleteOutletTimings
} from '../controllers/outletTimingsController.js';
import { authenticate } from '../middleware/restaurantAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const dayTimingSchema = Joi.object({
  day: Joi.string().valid('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday').required(),
  isOpen: Joi.boolean().default(true),
  openingTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM|am|pm)?$/).optional(),
  closingTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM|am|pm)?$/).optional()
});

const upsertOutletTimingsSchema = Joi.object({
  outletType: Joi.string().valid('Appzeto delivery', 'Dining', 'Takeaway', 'All').optional(),
  timings: Joi.array().items(dayTimingSchema).length(7).optional()
});

const updateDayTimingSchema = Joi.object({
  isOpen: Joi.boolean().optional(),
  openingTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM|am|pm)?$/).optional(),
  closingTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM|am|pm)?$/).optional()
}).or('isOpen', 'openingTime', 'closingTime');

const toggleStatusSchema = Joi.object({
  isActive: Joi.boolean().required()
});

// Protected routes - require authentication
router.use(authenticate);

// Get outlet timings for authenticated restaurant
router.get('/outlet-timings', getOutletTimings);

// Create or update outlet timings
router.put('/outlet-timings', validate(upsertOutletTimingsSchema), upsertOutletTimings);

// Update a specific day's timing
router.patch('/outlet-timings/day/:day', validate(updateDayTimingSchema), updateDayTiming);

// Toggle outlet timings status
router.patch('/outlet-timings/status', validate(toggleStatusSchema), toggleOutletTimingsStatus);

// Delete outlet timings (soft delete)
router.delete('/outlet-timings', deleteOutletTimings);

export default router;


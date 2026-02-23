import express from 'express';
import { updateLocation, getLocation, getZonesInRadius } from '../controllers/deliveryLocationController.js';
import { authenticate } from '../middleware/deliveryAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Location routes - validation handled in controller for flexibility
router.post('/location', updateLocation);
router.get('/location', getLocation);

// Zones routes
router.get('/zones/in-radius', getZonesInRadius);

export default router;


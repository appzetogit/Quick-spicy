import express from 'express';
import { createSafetyEmergency } from '../controllers/safetyEmergencyController.js';
import { authenticate } from '../../auth/middleware/auth.js';

const router = express.Router();

// Public route for creating safety emergency report (requires user authentication)
router.post('/safety-emergency', authenticate, createSafetyEmergency);

export default router;


import express from 'express';
import { createFeedback } from '../controllers/feedbackController.js';
import { authenticate } from '../../auth/middleware/auth.js';

const router = express.Router();

// Public route for creating feedback (requires user authentication)
router.post('/feedback', authenticate, createFeedback);

export default router;


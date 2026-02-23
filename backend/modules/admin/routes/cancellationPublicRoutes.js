import express from 'express';
import { getCancellationPublic } from '../controllers/cancellationPolicyController.js';

const router = express.Router();

// Public route for Cancellation Policy
router.get('/cancellation/public', getCancellationPublic);

export default router;


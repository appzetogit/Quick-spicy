import express from 'express';
import { getPublicFeeSettings } from '../controllers/feeSettingsController.js';

const router = express.Router();

// Public route - no authentication required
router.get('/fee-settings/public', getPublicFeeSettings);

export default router;


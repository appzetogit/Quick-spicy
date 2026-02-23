import express from 'express';
import { detectUserZone } from '../controllers/zoneController.js';

const router = express.Router();

// Public route - Zone detection for users (no auth required)
router.get('/zones/detect', detectUserZone);

export default router;

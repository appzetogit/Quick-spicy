import express from 'express';
import { detectUserZone, getPublicZones } from '../controllers/zoneController.js';

const router = express.Router();

router.get('/zones', getPublicZones);
// Public route - Zone detection for users (no auth required)
router.get('/zones/detect', detectUserZone);

export default router;

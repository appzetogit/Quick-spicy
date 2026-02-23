import express from 'express';
import { reverseGeocode, getNearbyLocations } from '../controllers/locationController.js';

const router = express.Router();

// Reverse geocode coordinates to address
router.get('/reverse', reverseGeocode);

// Get nearby locations
router.get('/nearby', getNearbyLocations);

export default router;


import express from 'express';
import {
  getZones,
  getZoneById,
  createZone,
  updateZone,
  deleteZone,
  toggleZoneStatus,
  getZonesByRestaurant,
  checkLocationInZone
} from '../controllers/zoneController.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// All zone routes require admin authentication
router.use(authenticateAdmin);

// Zone routes
router.get('/', getZones);
router.get('/restaurant/:restaurantId', getZonesByRestaurant);
router.post('/check-location', checkLocationInZone);
router.get('/:id', getZoneById);
router.post('/', createZone);
router.put('/:id', updateZone);
router.delete('/:id', deleteZone);
router.patch('/:id/status', toggleZoneStatus);

export default router;


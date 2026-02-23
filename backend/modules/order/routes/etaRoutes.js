import express from 'express';
import {
  getLiveETA,
  calculateInitialETA,
  getETAHistory,
  getOrderEvents,
  recalculateETA,
  handleRestaurantAccepted,
  handleRiderAssigned,
  handleRiderReachedRestaurant,
  handleFoodNotReady,
  handleRiderStartedDelivery,
  handleTrafficDetected,
  handleRiderNearby
} from '../controllers/etaController.js';
import { authenticate } from '../../../modules/auth/middleware/auth.js';

const router = express.Router();

// Public routes (for order tracking)
router.get('/orders/:orderId/eta', getLiveETA);
router.get('/orders/:orderId/eta/history', getETAHistory);
router.get('/orders/:orderId/events', getOrderEvents);

// Protected routes
router.post('/orders/calculate-eta', authenticate, calculateInitialETA);
router.post('/orders/:orderId/eta/recalculate', authenticate, recalculateETA);

// Event handlers (can be called by restaurant/delivery modules)
router.post('/orders/:orderId/events/restaurant-accepted', handleRestaurantAccepted);
router.post('/orders/:orderId/events/rider-assigned', handleRiderAssigned);
router.post('/orders/:orderId/events/rider-reached-restaurant', handleRiderReachedRestaurant);
router.post('/orders/:orderId/events/food-not-ready', handleFoodNotReady);
router.post('/orders/:orderId/events/rider-started-delivery', handleRiderStartedDelivery);
router.post('/orders/:orderId/events/traffic-detected', handleTrafficDetected);
router.post('/orders/:orderId/events/rider-nearby', handleRiderNearby);

export default router;


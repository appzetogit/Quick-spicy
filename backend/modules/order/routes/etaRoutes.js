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
import { authenticateOrderActor } from '../middleware/etaAuth.js';

const router = express.Router();

// Order ETA/tracking routes require authentication and order-level authorization
router.get('/orders/:orderId/eta', authenticateOrderActor, getLiveETA);
router.get('/orders/:orderId/eta/history', authenticateOrderActor, getETAHistory);
router.get('/orders/:orderId/events', authenticateOrderActor, getOrderEvents);

// Protected routes
router.post('/orders/calculate-eta', authenticate, calculateInitialETA);
router.post('/orders/:orderId/eta/recalculate', authenticateOrderActor, recalculateETA);

// Event handlers (can be called by restaurant/delivery modules)
router.post('/orders/:orderId/events/restaurant-accepted', authenticateOrderActor, handleRestaurantAccepted);
router.post('/orders/:orderId/events/rider-assigned', authenticateOrderActor, handleRiderAssigned);
router.post('/orders/:orderId/events/rider-reached-restaurant', authenticateOrderActor, handleRiderReachedRestaurant);
router.post('/orders/:orderId/events/food-not-ready', authenticateOrderActor, handleFoodNotReady);
router.post('/orders/:orderId/events/rider-started-delivery', authenticateOrderActor, handleRiderStartedDelivery);
router.post('/orders/:orderId/events/traffic-detected', authenticateOrderActor, handleTrafficDetected);
router.post('/orders/:orderId/events/rider-nearby', authenticateOrderActor, handleRiderNearby);

export default router;


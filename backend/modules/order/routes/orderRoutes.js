import express from 'express';
import {
  createOrder,
  verifyOrderPayment,
  getUserOrders,
  getOrderDetails,
  calculateOrder,
  cancelOrder
} from '../controllers/orderController.js';
import { authenticate } from '../../auth/middleware/auth.js';

const router = express.Router();

// Calculate order pricing (public endpoint - no auth required for cart preview)
// This must be before the authenticate middleware
router.post('/calculate', calculateOrder);

// All other routes require authentication
router.use(authenticate);

// Create order and initiate payment
router.post('/', createOrder);

// Verify payment
router.post('/verify-payment', verifyOrderPayment);

// Get user orders
router.get('/', getUserOrders);

// Get order details
router.get('/:id', getOrderDetails);

// Cancel order
router.patch('/:id/cancel', cancelOrder);

export default router;


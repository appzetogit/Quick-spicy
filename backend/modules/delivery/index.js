// Delivery module
import express from 'express';
import deliveryAuthRoutes from './routes/deliveryAuthRoutes.js';
import deliveryDashboardRoutes from './routes/deliveryDashboardRoutes.js';
import deliveryProfileRoutes from './routes/deliveryProfileRoutes.js';
import deliveryOrdersRoutes from './routes/deliveryOrdersRoutes.js';
import deliveryEarningsRoutes from './routes/deliveryEarningsRoutes.js';
import deliveryLocationRoutes from './routes/deliveryLocationRoutes.js';
import deliverySignupRoutes from './routes/deliverySignupRoutes.js';
import deliveryWalletRoutes from './routes/deliveryWalletRoutes.js';

const router = express.Router();

// Delivery authentication routes (public)
router.use('/auth', deliveryAuthRoutes);

// Delivery signup routes (protected - requires authentication)
router.use('/', deliverySignupRoutes);

// Delivery dashboard routes (protected)
router.use('/', deliveryDashboardRoutes);

// Delivery profile routes (protected)
router.use('/', deliveryProfileRoutes);

// Delivery orders routes (protected)
router.use('/', deliveryOrdersRoutes);

// Delivery earnings routes (protected)
router.use('/', deliveryEarningsRoutes);

// Delivery location routes (protected)
router.use('/', deliveryLocationRoutes);

// Delivery wallet routes (protected)
router.use('/wallet', deliveryWalletRoutes);

export default router;


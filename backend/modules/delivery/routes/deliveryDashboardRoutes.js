import express from 'express';
import { getEmergencyHelpPublic } from '../../admin/controllers/deliveryEmergencyHelpController.js';
import {
  getDashboard,
  getWalletBalance,
  claimJoiningBonus,
  getOrderStats
} from '../controllers/deliveryDashboardController.js';
import { authenticate } from '../middleware/deliveryAuth.js';

const router = express.Router();

// Public route - Emergency help (accessible without authentication)
router.get('/emergency-help', getEmergencyHelpPublic);

// All routes require authentication
router.use(authenticate);

// Dashboard routes
router.get('/dashboard', getDashboard);
// NOTE: Wallet endpoints are served from `/api/delivery/wallet/*` (deliveryWalletRoutes).
// Keep these legacy routes under `/dashboard/wallet*` to avoid clashing with the new wallet module.
router.get('/dashboard/wallet', getWalletBalance);
router.post('/dashboard/wallet/claim-joining-bonus', claimJoiningBonus);
router.get('/orders/stats', getOrderStats);

export default router;


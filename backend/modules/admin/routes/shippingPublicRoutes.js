import express from 'express';
import { getShippingPublic } from '../controllers/shippingPolicyController.js';

const router = express.Router();

// Public route for Shipping Policy
router.get('/shipping/public', getShippingPublic);

export default router;


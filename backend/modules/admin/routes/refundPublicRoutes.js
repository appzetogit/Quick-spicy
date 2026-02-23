import express from 'express';
import { getRefundPublic } from '../controllers/refundPolicyController.js';

const router = express.Router();

// Public route for Refund Policy
router.get('/refund/public', getRefundPublic);

export default router;


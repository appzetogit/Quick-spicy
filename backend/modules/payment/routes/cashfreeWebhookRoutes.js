import express from 'express';
import {
  handleCashfreeWebhook,
  webhookHealthCheck
} from '../controllers/cashfreeWebhookController.js';

const router = express.Router();

// ─── NO AUTHENTICATION on webhook routes ───
// Cashfree calls these directly. Security is via HMAC signature verification.

// Webhook endpoint — receives payment event notifications from Cashfree
// POST /api/payment/cashfree/webhook
router.post('/webhook', handleCashfreeWebhook);

// Health check — used to verify the webhook endpoint is reachable
// GET /api/payment/cashfree/webhook/health
router.get('/webhook/health', webhookHealthCheck);

export default router;

import winston from 'winston';
import mongoose from 'mongoose';
import {
  verifyCashfreeWebhookSignature,
  getCashfreeSecretKey,
  verifyCashfreeOrderPayment,
  mapCashfreePaymentMethod
} from '../services/cashfreeService.js';
import UserWallet from '../../user/models/UserWallet.js';
import User from '../../auth/models/User.js';
import Order from '../../order/models/Order.js';
import OrderSettlement from '../../order/models/OrderSettlement.js';
import AuditLog from '../../admin/models/AuditLog.js';


const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// In-memory set to quickly reject duplicate webhook attempts within same process
// This is a first-line defense; the real idempotency is in the DB atomic operation
const recentlyProcessedPayments = new Set();
const RECENT_CACHE_MAX_SIZE = 10000;

/**
 * Cashfree Webhook Handler
 * POST /api/payment/cashfree/webhook
 *
 * Handles incoming webhook notifications from Cashfree Payment Gateway.
 * This endpoint is unauthenticated (Cashfree calls it directly).
 * Security is via HMAC-SHA256 signature verification.
 *
 * Webhook event types handled:
 * - PAYMENT_SUCCESS_WEBHOOK: Credits the wallet
 * - PAYMENT_FAILED_WEBHOOK: Logs the failure
 * - PAYMENT_USER_DROPPED_WEBHOOK: Logs user drop-off
 */
export const handleCashfreeWebhook = async (req, res) => {
  const startTime = Date.now();
  const webhookAttempt = req.headers['x-webhook-attempt'] || '1';
  const idempotencyKey = req.headers['x-idempotency-key'] || null;

  logger.info('Cashfree webhook received', {
    eventType: req.body?.type || 'unknown',
    webhookAttempt,
    idempotencyKey,
    contentLength: req.headers['content-length']
  });

  try {
    // ─── Step 1: Verify webhook signature ───
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    if (!signature || !timestamp) {
      logger.warn('Cashfree webhook: missing signature headers', {
        hasSignature: !!signature,
        hasTimestamp: !!timestamp
      });
      return res.status(401).json({ error: 'Missing webhook signature headers' });
    }

    const secretKey = await getCashfreeSecretKey();
    if (!secretKey) {
      logger.error('Cashfree webhook: secret key not configured');
      // Return 500 so Cashfree retries later when config is fixed
      return res.status(500).json({ error: 'Webhook processing temporarily unavailable' });
    }

    // Use raw body for signature verification (set by rawBody middleware in server.js)
    const rawBody = req.rawBody;
    if (!rawBody) {
      logger.error('Cashfree webhook: raw body not available. Ensure rawBody middleware is configured.');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const isValidSignature = verifyCashfreeWebhookSignature(rawBody, timestamp, signature, secretKey);
    if (!isValidSignature) {
      logger.warn('Cashfree webhook: invalid signature', {
        timestamp,
        signaturePrefix: signature?.substring(0, 10) + '...'
      });
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    logger.info('Cashfree webhook: signature verified successfully');

    // ─── Step 2: Parse the webhook payload ───
    const event = req.body;
    const eventType = String(event?.type || '').toUpperCase();

    let orderId = '';
    let cfPaymentId = '';
    let paymentStatus = '';
    let paymentAmount = 0;
    let orderAmount = 0;
    let customerId = '';
    let orderTags = {};

    let refundData = {};
    let cfRefundId = '';
    let refundStatus = '';
    let refundAmount = 0;

    if (eventType === 'REFUND_STATUS_WEBHOOK') {
      refundData = event?.data?.refund || {};
      cfRefundId = String(refundData.cf_refund_id || '');
      cfPaymentId = String(refundData.cf_payment_id || '');
      orderId = String(refundData.order_id || '');
      refundAmount = Number(refundData.refund_amount || 0);
      refundStatus = String(refundData.refund_status || '').toUpperCase();

      logger.info('Cashfree webhook: refund event parsed', {
        eventType,
        cfRefundId,
        cfPaymentId,
        orderId,
        refundAmount,
        refundStatus
      });
    } else {
      const paymentData = event?.data?.payment || {};
      const orderData = event?.data?.order || {};
      const customerData = event?.data?.customer_details || {};

      cfPaymentId = String(paymentData.cf_payment_id || '');
      paymentStatus = String(paymentData.payment_status || '').toUpperCase();
      paymentAmount = Number(paymentData.payment_amount || 0);
      orderId = String(orderData.order_id || '');
      orderAmount = Number(orderData.order_amount || 0);
      customerId = String(customerData.customer_id || '');
      orderTags = orderData.order_tags || {};

      logger.info('Cashfree webhook: event parsed', {
        eventType,
        cfPaymentId,
        paymentStatus,
        paymentAmount,
        orderId,
        orderAmount,
        customerId,
        orderTags
      });
    }

    // Determine if this is a wallet top-up order
    const isWalletTopup = orderId.startsWith('WT_') || orderTags?.type === 'wallet_topup';

    // ─── Step 3: Handle Refund Events ───
    if (eventType === 'REFUND_STATUS_WEBHOOK') {
      if (isWalletTopup) {
        if (refundStatus !== 'SUCCESS') {
          logger.info('Cashfree refund webhook: non-success refund event for wallet top-up', {
            cfRefundId,
            refundStatus,
            orderId
          });
          return res.status(200).json({ status: 'acknowledged', message: `Refund event status ${refundStatus} acknowledged` });
        }

        logger.info('Cashfree refund webhook: success refund event for wallet top-up', {
          cfRefundId,
          cfPaymentId,
          orderId,
          refundAmount
        });

        try {
          // Find wallet by the original payment ID
          const wallet = await UserWallet.findOne({ 'transactions.paymentId': cfPaymentId });
          if (!wallet) {
            logger.error('Cashfree refund webhook: wallet not found for original payment ID', { cfPaymentId, orderId });
            return res.status(200).json({ status: 'error', message: 'Wallet not found for original payment' });
          }

          // Process wallet debit atomically
          const debitResult = await UserWallet.atomicDebitWallet(
            wallet.userId,
            {
              amount: refundAmount,
              paymentId: cfRefundId,
              cashfreeOrderId: orderId,
              cashfreeRefundId: cfRefundId,
              description: `Debit: Refunded ₹${refundAmount} to bank account`,
              source: 'webhook'
            }
          );

          if (debitResult.isDuplicate) {
            logger.info('Cashfree refund webhook: duplicate refund (DB-level), already debited', {
              userId: wallet.userId,
              cfRefundId,
              orderId,
              currentBalance: debitResult.wallet?.balance
            });
            return res.status(200).json({ status: 'duplicate', message: 'Refund already processed' });
          }

          if (!debitResult.updated) {
            logger.error('Cashfree refund webhook: wallet debit failed', {
              userId: wallet.userId,
              cfRefundId,
              orderId,
              refundAmount
            });
            return res.status(500).json({ status: 'error', message: 'Wallet debit failed' });
          }

          // Sync balance to User model
          try {
            await User.findByIdAndUpdate(wallet.userId, {
              $set: {
                'wallet.balance': debitResult.wallet.balance,
                'wallet.currency': debitResult.wallet.currency || 'INR'
              }
            });
          } catch (userUpdateError) {
            logger.error('Cashfree refund webhook: failed to sync balance to User model', {
              userId: wallet.userId,
              error: userUpdateError.message,
              walletBalance: debitResult.wallet.balance
            });
          }

          return res.status(200).json({
            status: 'success',
            message: 'Wallet debited for refund successfully'
          });
        } catch (refundError) {
          logger.error('Cashfree refund webhook: error processing wallet refund', {
            error: refundError.message,
            stack: refundError.stack
          });
          return res.status(500).json({ status: 'error', message: 'Failed to process wallet refund' });
        }
      } else {
        logger.info('Cashfree webhook: refund event for normal order received, processing...', {
          orderId,
          cfRefundId,
          refundStatus,
          refundAmount
        });

        // Process normal order refund completion
        try {
          let order = null;
          if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
            order = await Order.findById(orderId);
          }
          if (!order) {
            order = await Order.findOne({ orderId: orderId });
          }

          if (!order) {
            logger.error('Cashfree refund webhook: order not found', { orderId });
            return res.status(200).json({ status: 'error', message: 'Order not found' });
          }

          const settlement = await OrderSettlement.findOne({ orderId: order._id });
          if (!settlement) {
            logger.error('Cashfree refund webhook: settlement not found', { orderId: order._id });
            return res.status(200).json({ status: 'error', message: 'Settlement not found' });
          }

          if (refundStatus === 'SUCCESS') {
            settlement.cancellationDetails.refundStatus = 'processed';
            settlement.cancellationDetails.refundProcessedAt = new Date();
            await settlement.save();

            // Create audit log
            try {
              await AuditLog.createLog({
                entityType: 'order',
                entityId: order._id,
                action: 'cashfree_refund_success',
                actionType: 'refund',
                performedBy: {
                  type: 'system',
                  name: 'Cashfree Webhook'
                },
                transactionDetails: {
                  amount: refundAmount,
                  type: 'cashfree_refund',
                  status: 'success',
                  orderId: order._id,
                  cashfreeRefundId: cfRefundId,
                  cashfreeOrderId: orderId
                },
                description: `Cashfree refund successfully processed for order ${settlement.orderNumber || order.orderId}. Refund ID: ${cfRefundId}, Amount: ₹${refundAmount}`
              });
            } catch (auditError) {
              logger.error('Cashfree refund webhook: failed to create audit log', { error: auditError.message });
            }
          } else if (refundStatus === 'FAILED') {
            settlement.cancellationDetails.refundStatus = 'failed';
            settlement.cancellationDetails.refundFailureReason = refundData.status_description || 'Cashfree refund failed';
            await settlement.save();

            // Create audit log
            try {
              await AuditLog.createLog({
                entityType: 'order',
                entityId: order._id,
                action: 'cashfree_refund_failed',
                actionType: 'refund',
                performedBy: {
                  type: 'system',
                  name: 'Cashfree Webhook'
                },
                transactionDetails: {
                  amount: refundAmount,
                  type: 'cashfree_refund',
                  status: 'failed',
                  orderId: order._id,
                  cashfreeRefundId: cfRefundId,
                  cashfreeOrderId: orderId,
                  failureReason: refundData.status_description || 'Unknown reason'
                },
                description: `Cashfree refund failed for order ${settlement.orderNumber || order.orderId}. Refund ID: ${cfRefundId}, Reason: ${refundData.status_description || 'Unknown'}`
              });
            } catch (auditError) {
              logger.error('Cashfree refund webhook: failed to create audit log', { error: auditError.message });
            }
          }

          return res.status(200).json({
            status: 'success',
            message: `Order refund status ${refundStatus} processed successfully`
          });
        } catch (orderRefundError) {
          logger.error('Cashfree refund webhook: error processing normal order refund', {
            error: orderRefundError.message,
            stack: orderRefundError.stack
          });
          return res.status(500).json({ status: 'error', message: 'Failed to process order refund' });
        }
      }
    }

    // ─── Step 4: Determine if this is a wallet top-up ───
    if (!isWalletTopup) {
      logger.info('Cashfree webhook: not a wallet top-up order, skipping wallet processing', {
        orderId,
        orderTags
      });
      // Return 200 so Cashfree doesn't retry. Other order types are handled
      // via the verifyOrderPayment frontend flow.
      return res.status(200).json({ status: 'acknowledged', message: 'Non-wallet event acknowledged' });
    }

    // ─── Step 5: Handle only SUCCESS events for wallet crediting ───
    if (eventType !== 'PAYMENT_SUCCESS_WEBHOOK' || paymentStatus !== 'SUCCESS') {
      logger.info('Cashfree webhook: non-success event for wallet top-up', {
        eventType,
        paymentStatus,
        orderId,
        cfPaymentId
      });
      return res.status(200).json({ status: 'acknowledged', message: `Event ${eventType} logged` });
    }

    // ─── Step 5: Quick in-memory duplicate check ───
    if (recentlyProcessedPayments.has(cfPaymentId)) {
      logger.info('Cashfree webhook: duplicate payment (in-memory cache hit)', {
        cfPaymentId,
        orderId
      });
      return res.status(200).json({ status: 'duplicate', message: 'Payment already processed' });
    }

    // ─── Step 6: Resolve the user ID ───
    // The userId is stored in order_tags.userId or customer_details.customer_id
    const userId = orderTags?.userId || customerId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      logger.error('Cashfree webhook: cannot determine userId from webhook payload', {
        orderId,
        cfPaymentId,
        orderTags,
        customerId
      });
      // Return 200 to prevent retries — this is a data issue, not a transient error
      return res.status(200).json({ status: 'error', message: 'Cannot determine user from webhook data' });
    }

    // ─── Step 7: Determine the credit amount ───
    // Use payment_amount (actual amount paid) with fallback to order_amount
    const creditAmount = paymentAmount > 0 ? paymentAmount : orderAmount;
    if (!creditAmount || creditAmount <= 0) {
      logger.error('Cashfree webhook: invalid credit amount', {
        paymentAmount,
        orderAmount,
        orderId,
        cfPaymentId
      });
      return res.status(200).json({ status: 'error', message: 'Invalid payment amount' });
    }

    // ─── Step 8: Optionally verify payment with Cashfree API (defense-in-depth) ───
    let verifiedPaymentMethod = 'other';
    try {
      const verification = await verifyCashfreeOrderPayment(orderId);
      if (verification?.isPaid && verification?.payment) {
        verifiedPaymentMethod = mapCashfreePaymentMethod(verification.payment);
        logger.info('Cashfree webhook: API verification confirmed payment', {
          orderId,
          cfPaymentId,
          verifiedStatus: verification.order?.order_status
        });
      } else {
        // Webhook says SUCCESS but API says not paid yet — trust the webhook
        // but log for monitoring. Cashfree sometimes has slight propagation delay.
        logger.warn('Cashfree webhook: API verification did not confirm payment (may be propagation delay)', {
          orderId,
          cfPaymentId,
          orderStatus: verification?.order?.order_status
        });
      }
    } catch (verifyError) {
      // API verification failed — still proceed with webhook data (it's signed)
      logger.warn('Cashfree webhook: API verification call failed, proceeding with signed webhook data', {
        orderId,
        cfPaymentId,
        error: verifyError.message
      });
    }

    // ─── Step 9: Atomically credit the wallet ───
    const creditResult = await UserWallet.atomicCreditWallet(
      new mongoose.Types.ObjectId(userId),
      {
        amount: creditAmount,
        paymentId: cfPaymentId,
        cashfreeOrderId: orderId,
        cashfreePaymentId: cfPaymentId,
        paymentMethod: verifiedPaymentMethod,
        description: `Added ₹${creditAmount} via Cashfree`,
        source: 'webhook'
      }
    );

    // Update the in-memory cache
    if (recentlyProcessedPayments.size >= RECENT_CACHE_MAX_SIZE) {
      // Clear oldest entries (simple strategy — clear all when full)
      recentlyProcessedPayments.clear();
    }
    recentlyProcessedPayments.add(cfPaymentId);

    if (creditResult.isDuplicate) {
      logger.info('Cashfree webhook: duplicate payment (DB-level), already credited', {
        userId,
        cfPaymentId,
        orderId,
        currentBalance: creditResult.wallet?.balance
      });
      return res.status(200).json({ status: 'duplicate', message: 'Payment already processed' });
    }

    if (!creditResult.updated) {
      logger.error('Cashfree webhook: wallet credit failed', {
        userId,
        cfPaymentId,
        orderId,
        creditAmount
      });
      // Return 500 so Cashfree retries
      return res.status(500).json({ status: 'error', message: 'Wallet credit failed' });
    }

    // ─── Step 10: Sync balance to User model ───
    try {
      await User.findByIdAndUpdate(userId, {
        $set: {
          'wallet.balance': creditResult.wallet.balance,
          'wallet.currency': creditResult.wallet.currency || 'INR'
        }
      });
    } catch (userUpdateError) {
      // Log but don't fail — the authoritative balance is in UserWallet
      logger.error('Cashfree webhook: failed to sync balance to User model', {
        userId,
        error: userUpdateError.message,
        walletBalance: creditResult.wallet.balance
      });
    }

    const processingTime = Date.now() - startTime;

    logger.info('Cashfree webhook: wallet credited successfully', {
      userId,
      cfPaymentId,
      orderId,
      creditAmount,
      previousBalance: creditResult.previousBalance,
      newBalance: creditResult.wallet.balance,
      paymentMethod: verifiedPaymentMethod,
      webhookAttempt,
      processingTimeMs: processingTime
    });

    return res.status(200).json({
      status: 'success',
      message: 'Wallet credited successfully'
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error('Cashfree webhook: unhandled error', {
      error: error.message,
      stack: error.stack,
      processingTimeMs: processingTime,
      webhookAttempt
    });

    // Return 500 so Cashfree retries
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

/**
 * Health check for webhook endpoint
 * GET /api/payment/cashfree/webhook/health
 */
export const webhookHealthCheck = async (req, res) => {
  try {
    const secretKey = await getCashfreeSecretKey();
    return res.status(200).json({
      status: 'ok',
      configured: !!secretKey,
      recentCacheSize: recentlyProcessedPayments.size
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

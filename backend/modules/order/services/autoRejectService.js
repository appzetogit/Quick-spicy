import Order from '../models/Order.js';
import { notifyRestaurantOrderUpdate } from './restaurantNotificationService.js';
import { notifyUserOrderUpdate } from './userNotificationService.js';
import { calculateCancellationRefund } from './cancellationRefundService.js';

/**
 * Online orders whose payment is not confirmed yet.
 *
 * The restaurant only sees a prepaid order once its payment is confirmed, and that used to
 * depend entirely on the customer's app calling verify-payment at the right moment. When
 * that call failed, a PAID order sat invisible and this service then cancelled it as
 * "Restaurant did not respond in time" - 12 paid orders in one week, 9 of them never
 * refunded. Now the server asks Cashfree itself: paid means confirm it and hand it to the
 * restaurant (their accept clock starts then); still unpaid after the payment window means
 * close it as an unfinished payment, which is what it is.
 */
const FIRST_PAYMENT_CHECK_AFTER_MS = 45 * 1000;
const PAYMENT_RECHECK_EVERY_MS = 45 * 1000;
const PAYMENT_WINDOW_MS = Number(process.env.ONLINE_PAYMENT_WINDOW_MINUTES || 30) * 60 * 1000;

export const isAwaitingOnlinePayment = (order) =>
  order?.payment?.method === 'cashfree' && order?.payment?.status !== 'completed';

async function reconcileUnpaidOnlineOrder(order, now) {
  const ageMs = now - new Date(order.createdAt);
  if (ageMs < FIRST_PAYMENT_CHECK_AFTER_MS) return null;

  // Claim the check atomically: the cron runs in every worker.
  const claimed = await Order.findOneAndUpdate(
    {
      _id: order._id,
      status: { $in: ['pending', 'confirmed', 'cancelled'] },
      'payment.status': { $ne: 'completed' },
      $or: [
        { 'payment.lastReconciledAt': { $exists: false } },
        { 'payment.lastReconciledAt': null },
        { 'payment.lastReconciledAt': { $lt: new Date(now - PAYMENT_RECHECK_EVERY_MS) } },
      ],
    },
    { $set: { 'payment.lastReconciledAt': now } },
    { new: true },
  );
  if (!claimed) return null;

  // Same path the app uses, so a server-confirmed order gets exactly the same treatment:
  // payment record, escrow, restaurant notification.
  const { verifyOrderPayment } = await import('../controllers/orderController.js');
  const result = await new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ code: this.statusCode, body }); },
    };
    verifyOrderPayment({
      user: { id: String(claimed.userId) },
      body: { orderId: String(claimed._id), cashfreeOrderId: claimed.payment?.cashfreeOrderId },
      ip: 'server',
      get: () => 'payment-reconciler',
      headers: {},
    }, res).catch((error) => resolve({ code: 500, body: { message: error.message } }));
  });

  if (result.body?.success) {
    console.log(`✅ Payment for ${claimed.orderId} confirmed with Cashfree by the server; sent to the restaurant`);
    return 'confirmed';
  }

  if (ageMs < PAYMENT_WINDOW_MS) return null;

  const current = await Order.findById(claimed._id);
  if (!current || !['pending', 'confirmed'].includes(current.status) || current.payment?.status === 'completed') {
    return null;
  }
  current.status = 'cancelled';
  current.cancelledBy = 'system';
  current.cancelledAt = now;
  current.cancellationReason = 'Online payment was not completed.';
  await current.save();
  console.log(`ℹ️ Order ${current.orderId} closed: online payment not completed within the payment window`);
  try {
    await notifyUserOrderUpdate(current._id.toString(), 'cancelled');
  } catch (notifError) {
    console.error(`❌ Error sending user notification for order ${current.orderId}:`, notifError);
  }
  return 'closed';
}

/**
 * Automatically reject orders that haven't been accepted within the accept time limit
 * This runs as a cron job to check all pending/confirmed orders
 * Accept time limit: 240 seconds (4 minutes)
 * @returns {Promise<{processed: number, message: string}>}
 */
export async function processAutoRejectOrders() {
  try {
    const ACCEPT_TIME_LIMIT_SECONDS = 240; // 4 minutes
    const ACCEPT_TIME_LIMIT_MS = ACCEPT_TIME_LIMIT_SECONDS * 1000;

    // Find all orders with status 'pending' or 'confirmed' that haven't been accepted yet
    // These are orders waiting for restaurant to accept
    // A payment can complete after its order was cancelled (the customer cancelled while on
    // the payment page, or paid as the window closed). Keep asking Cashfree for an hour so
    // such a payment is found and refunded rather than kept (verifyOrderPayment refunds it).
    const recentlyCancelledUnpaid = await Order.find({
      status: 'cancelled',
      'payment.method': 'cashfree',
      'payment.status': { $ne: 'completed' },
      'payment.cashfreeOrderId': { $exists: true, $ne: null },
      cancelledAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
    }).lean();
    for (const cancelledOrder of recentlyCancelledUnpaid) {
      try {
        await reconcileUnpaidOnlineOrder(cancelledOrder, new Date());
      } catch (reconcileError) {
        console.error(`❌ Error checking late payment for ${cancelledOrder.orderId}:`, reconcileError);
      }
    }

    const validPendingOrders = await Order.find({
      status: { $in: ['pending', 'confirmed'] }
    }).lean();

    if (validPendingOrders.length === 0) {
      return { processed: 0, message: 'No pending orders to check' };
    }

    const now = new Date();
    let processedCount = 0;
    const rejectedOrders = [];

    for (const order of validPendingOrders) {
      if (isAwaitingOnlinePayment(order)) {
        try {
          await reconcileUnpaidOnlineOrder(order, now);
        } catch (reconcileError) {
          console.error(`❌ Error reconciling payment for order ${order.orderId}:`, reconcileError);
        }
        continue;
      }

      // The restaurant's clock starts when the order reaches them: at payment confirmation
      // for prepaid orders, not when the customer opened the payment page.
      const acceptClockStart = new Date(order.tracking?.confirmed?.timestamp || order.createdAt);
      const elapsedMs = now - acceptClockStart;

      // Check if accept time has expired
      if (elapsedMs >= ACCEPT_TIME_LIMIT_MS) {
        try {
          // Double-check order hasn't been accepted or cancelled by another process
          const currentOrder = await Order.findById(order._id);
          if (!currentOrder) {
            continue; // Order was deleted
          }

          // Only reject if still in pending/confirmed status
          if (!['pending', 'confirmed'].includes(currentOrder.status)) {
            continue; // Order was already accepted/rejected
          }

          // Update order status to cancelled
          currentOrder.status = 'cancelled';
          currentOrder.cancellationReason = 'Order not accepted within time limit. Restaurant did not respond in time.';
          currentOrder.cancelledBy = 'restaurant';
          currentOrder.cancelledAt = now;

          await currentOrder.save();

          rejectedOrders.push({
            orderId: currentOrder.orderId,
            elapsedSeconds: Math.floor(elapsedMs / 1000)
          });
          processedCount++;

          console.log(`✅ Order ${currentOrder.orderId} automatically rejected (elapsed: ${Math.floor(elapsedMs / 1000)}s >= ${ACCEPT_TIME_LIMIT_SECONDS}s)`);

          // Calculate refund amount and automatically process refund for all payment methods
          try {
            const paymentMethod = currentOrder.payment?.method;

            if (paymentMethod === 'cash') {
              // COD orders — no payment was collected, so no refund needed
              console.log(`ℹ️ Order ${currentOrder.orderId} was COD — no refund needed`);
            } else {
              const refundDetails = await calculateCancellationRefund(
                currentOrder._id,
                'Order not accepted within time limit. Restaurant did not respond in time.'
              );
              console.log(`✅ Cancellation refund calculated for order ${currentOrder.orderId}`);

              if (paymentMethod === 'wallet') {
                const { processWalletRefund } = await import('./cancellationRefundService.js');
                const refundAmount = refundDetails?.refundAmount ?? currentOrder.pricing?.total;
                await processWalletRefund(currentOrder._id, null, refundAmount);
                console.log(`✅ Automatic wallet refund processed for auto-rejected order ${currentOrder.orderId} of amount ${refundAmount}`);
              } else if (paymentMethod === 'cashfree') {
                const { processCashfreeRefund } = await import('./cancellationRefundService.js');
                await processCashfreeRefund(currentOrder._id, null);
                console.log(`✅ Automatic Cashfree refund processed for auto-rejected order ${currentOrder.orderId}`);
              } else {
                // Unknown/other payment method — log it but still calculate refund for admin review
                console.warn(`⚠️ Unknown payment method "${paymentMethod}" for order ${currentOrder.orderId} — refund calculated but not auto-processed`);
              }
            }
          } catch (refundError) {
            console.error(`❌ Error calculating/processing cancellation refund for order ${currentOrder.orderId}:`, refundError);
            // Don't fail order cancellation if refund calculation fails
          }

          // Notify about status update
          try {
            await notifyRestaurantOrderUpdate(currentOrder._id.toString(), 'cancelled');
          } catch (notifError) {
            console.error(`❌ Error sending notification for order ${currentOrder.orderId}:`, notifError);
          }
          try {
            await notifyUserOrderUpdate(currentOrder._id.toString(), 'cancelled');
          } catch (notifError) {
            console.error(`❌ Error sending user notification for order ${currentOrder.orderId}:`, notifError);
          }
        } catch (updateError) {
          console.error(`❌ Error auto-rejecting order ${order.orderId}:`, updateError);
        }
      }
    }

    return {
      processed: processedCount,
      message: processedCount > 0
        ? `Auto-rejected ${processedCount} order(s) that were not accepted within ${ACCEPT_TIME_LIMIT_SECONDS} seconds`
        : 'No orders to auto-reject'
    };
  } catch (error) {
    console.error('❌ Error processing auto-reject orders:', error);
    return { processed: 0, message: `Error: ${error.message}` };
  }
}

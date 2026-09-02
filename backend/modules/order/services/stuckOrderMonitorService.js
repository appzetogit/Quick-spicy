import Order from '../models/Order.js';

/**
 * Watch for orders stranded in the delivery leg. Reports only - never writes.
 *
 * The restaurant leg is covered: an order nobody accepts within 4 minutes is
 * auto-rejected and refunded. The delivery leg has no such timeout, so an order the
 * restaurant marked ready that no rider ever takes stays 'ready' forever. Ten of
 * them had accumulated, the oldest 115 days, and they were being re-offered to
 * riders as fresh work until that was fixed separately.
 *
 * This deliberately does NOT cancel anything. Auto-cancelling would move real money
 * (wallet and Cashfree refunds) and message customers, and the measured rate does
 * not justify that: across 347 orders in the previous week, zero got stuck. The
 * leak appears already closed, so what is wanted here is a tripwire that says so
 * loudly if it ever reopens - not an automated refund engine standing by for an
 * event that no longer happens.
 *
 * If the alert starts firing regularly, that is the signal to revisit auto-cancel.
 */

// How long an order may sit in the delivery leg before it counts as stranded.
// A normal order is picked up within minutes; an hour is far past any real wait.
const STUCK_AFTER_MINUTES = 60;

// Orders in the delivery leg.
const DELIVERY_LEG_STATUSES = ['preparing', 'ready'];

// Anything older than this is pre-existing backlog rather than a new failure. It is
// counted but not listed, so the ten historical zombies cannot bury a fresh one in
// noise every time this runs.
const BACKLOG_AFTER_HOURS = 24;

const minutesAgo = (date) => Math.round((Date.now() - new Date(date).getTime()) / 60000);

/**
 * One sweep. Read-only.
 * @returns {Promise<{newlyStuck: number, backlog: number, orders: Array}>}
 */
export async function checkStuckDeliveryOrders() {
  const stuckBefore = new Date(Date.now() - STUCK_AFTER_MINUTES * 60 * 1000);
  const backlogBefore = new Date(Date.now() - BACKLOG_AFTER_HOURS * 60 * 60 * 1000);

  const stranded = await Order.find({
    status: { $in: DELIVERY_LEG_STATUSES },
    createdAt: { $lt: stuckBefore },
  })
    .select('orderId status createdAt deliveryPartnerId restaurantName payment.method payment.status')
    .sort({ createdAt: -1 })
    .lean();

  if (stranded.length === 0) {
    return { newlyStuck: 0, backlog: 0, orders: [] };
  }

  const newlyStuck = stranded.filter((order) => new Date(order.createdAt) >= backlogBefore);
  const backlog = stranded.length - newlyStuck.length;

  if (newlyStuck.length > 0) {
    // Greppable prefix so this can be alerted on from the logs.
    console.warn(
      `[STUCK ORDERS] ${newlyStuck.length} order(s) stranded in the delivery leg for over ` +
      `${STUCK_AFTER_MINUTES} minutes - no rider has completed them. Not cancelled; needs a look.`
    );
    newlyStuck.forEach((order) => {
      console.warn(
        `[STUCK ORDERS]   ${order.orderId} | ${order.status} | ${minutesAgo(order.createdAt)}m old | ` +
        `restaurant=${order.restaurantName || '?'} | ` +
        `rider=${order.deliveryPartnerId ? 'assigned but not completed' : 'never assigned'} | ` +
        `pay=${order.payment?.method || '?'}/${order.payment?.status || '?'}`
      );
    });
    if (backlog > 0) {
      console.warn(`[STUCK ORDERS] (plus ${backlog} older than ${BACKLOG_AFTER_HOURS}h, pre-existing backlog)`);
    }
  }

  return { newlyStuck: newlyStuck.length, backlog, orders: newlyStuck };
}

export default checkStuckDeliveryOrders;

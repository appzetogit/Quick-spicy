import Order from '../models/Order.js';

/**
 * Take an order back from a rider who never answered it.
 *
 * There was no acceptance timeout at all. Assigning an order set deliveryPartnerId, and
 * nothing ever cleared it again except an explicit rejection - so an order offered to a
 * rider who simply ignored it stayed pinned to them permanently. The retry sweep could
 * not help, because it only looks at UNASSIGNED orders and these are assigned. Nine such
 * orders had built up, the oldest 116 days, and none ever reached another rider.
 *
 * The ~2 minutes people reported as "the timeout" was never one: it is the FCM ttl of
 * 120000 on the push. The notification expired; the order stayed stuck.
 *
 * This only RECLAIMS - it un-assigns the order and records the rider who ignored it. The
 * re-dispatch is left to pendingAssignmentService, which already sweeps unassigned orders,
 * already respects excludedDeliveryPartners, and already owns the fiddly business of
 * resolving a restaurant's coordinates. Duplicating that here is how the first version of
 * that very sweeper came to silently assign nothing at all for weeks, so this deliberately
 * does not try.
 *
 * WHAT COUNTS AS "NOT ACCEPTED" is the part that has to be right, because getting it wrong
 * pulls a live order away from a rider already on their way to the restaurant. Two
 * independent markers are checked and BOTH must say unaccepted:
 *
 *   - assignmentInfo.assignedBy !== 'delivery_accept'
 *   - deliveryState.acceptedAt is unset
 *
 * Neither is safe alone. Production holds an order stamped assignedBy 'nearest_available'
 * whose rider had genuinely accepted it - deliveryState.acceptedAt was set and assignedBy
 * was never updated. Trusting assignedBy by itself would have taken that order back from
 * a rider who was working it.
 *
 * Any other sign of real progress - reached pickup, confirmed the order id, moved past the
 * 'assigned' phase - protects the order too, whatever those two markers say.
 */

// How long a rider has to answer before the order goes back in the pool.
// 30-40 seconds was the figure discussed on the 3 September call.
const OFFER_TIMEOUT_MS = Number(process.env.OFFER_TIMEOUT_MS || 40_000);

// Only orders still waiting to be collected. Anything already out for delivery is
// somebody's active job whatever the assignment fields say.
const RECLAIMABLE_STATUSES = ['preparing', 'ready'];

// Each rider who ignores the order joins excludedDeliveryPartners so the next dispatch
// does not hand it straight back. Past this many attempts it stops being recycled and is
// left for the restaurant to reassign, rather than touring every rider on the platform.
const MAX_REOFFERS = Number(process.env.MAX_OFFER_ATTEMPTS || 5);

// Do not resurrect the dead. Reclaiming puts an order back in the pool, where the retry
// sweep offers it to somebody - so without this bound the first run would have taken six
// abandoned orders, the oldest 114 days, and pushed them to riders as live work. That is
// precisely the "order from weeks ago shown as a new order" fault that was just fixed.
// Those orders are inert where they are; the customer is long gone. Matches the 3-hour
// window discover uses to decide an unassigned order is still worth offering.
const MAX_RECLAIM_AGE_MS = Number(process.env.MAX_RECLAIM_AGE_MS || 3 * 60 * 60 * 1000);

const hasStartedWork = (order) => {
  const state = order?.deliveryState || {};
  if (state.acceptedAt) return true;
  if (state.reachedPickupAt) return true;
  if (state.orderIdConfirmedAt) return true;
  if (state.status && state.status !== 'pending') return true;
  if (state.currentPhase && state.currentPhase !== 'assigned') return true;
  return false;
};

const wasAcceptedByRider = (order) =>
  order?.assignmentInfo?.assignedBy === 'delivery_accept' || hasStartedWork(order);

/**
 * One sweep.
 * @returns {Promise<{checked:number, reclaimed:number, protected:number, exhausted:number}>}
 */
export async function processExpiredOffers() {
  const cutoff = new Date(Date.now() - OFFER_TIMEOUT_MS);

  const oldestReclaimable = new Date(Date.now() - MAX_RECLAIM_AGE_MS);

  const candidates = await Order.find({
    status: { $in: RECLAIMABLE_STATUSES },
    deliveryPartnerId: { $ne: null, $exists: true },
    createdAt: { $gte: oldestReclaimable },
    'assignmentInfo.assignedAt': { $lt: cutoff },
    'assignmentInfo.assignedBy': { $ne: 'delivery_accept' },
    'deliveryState.acceptedAt': { $in: [null, undefined] },
  }).limit(50);

  if (candidates.length === 0) {
    return { checked: 0, reclaimed: 0, protected: 0, exhausted: 0 };
  }

  let reclaimed = 0;
  let protectedCount = 0;
  let exhausted = 0;

  for (const order of candidates) {
    // The query cannot see the progress markers hasStartedWork checks, and the rider may
    // have accepted in the moment since it ran.
    if (wasAcceptedByRider(order)) {
      protectedCount += 1;
      continue;
    }

    const ignoredBy = order.deliveryPartnerId;
    const attempts = (order.excludedDeliveryPartners || []).length;

    if (attempts >= MAX_REOFFERS) {
      console.warn(
        `[OFFER TIMEOUT] Order ${order.orderId} ignored or declined by ${attempts} riders already. ` +
        `Leaving it assigned for the restaurant to reassign rather than recycling further.`
      );
      exhausted += 1;
      continue;
    }

    order.deliveryPartnerId = null;
    if (order.assignmentInfo) {
      order.assignmentInfo.deliveryPartnerId = null;
    }
    if (ignoredBy && !(order.excludedDeliveryPartners || []).some((id) => String(id) === String(ignoredBy))) {
      order.excludedDeliveryPartners = [...(order.excludedDeliveryPartners || []), ignoredBy];
    }

    await order.save();
    reclaimed += 1;

    console.log(
      `[OFFER TIMEOUT] Order ${order.orderId} unanswered by ${ignoredBy} after ` +
      `${Math.round(OFFER_TIMEOUT_MS / 1000)}s - returned to the pool (attempt ${attempts + 1}). ` +
      `The assignment retry sweep will offer it to the next rider.`
    );
  }

  return { checked: candidates.length, reclaimed, protected: protectedCount, exhausted };
}

export default processExpiredOffers;

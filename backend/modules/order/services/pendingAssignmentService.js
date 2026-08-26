import Order from '../models/Order.js';
import { assignOrderToDeliveryBoy } from './deliveryAssignmentService.js';
import { notifyDeliveryBoyNewOrder } from './deliveryNotificationService.js';

/**
 * Retry delivery assignment for orders that never got a partner.
 *
 * Assignment used to happen exactly ONCE, at the moment the restaurant marked an order
 * as preparing (restaurantOrderController). If no eligible partner existed at that
 * instant - every partner busy, none inside the zone, all over their COD cash limit -
 * the controller logged a warning, told the restaurant
 *
 *     "Order will be assigned when a delivery partner comes online"
 *
 * ...and nothing anywhere ever did that. There was no retry, no queue, no sweeper. The
 * order simply sat unassigned until a human noticed. That is the reported
 * "sometimes the order is not assigned to any delivery agent at all", and the apparent
 * randomness is just whether a partner happened to be free in that one instant.
 *
 * See BUGFIX_IMPLEMENTATION_GUIDE.md #027.
 *
 * This sweeper closes the gap: every unassigned order still awaiting pickup is retried
 * on each tick until it finds a partner. `assignOrderToDeliveryBoy` re-checks status and
 * existing assignment on entry, so retrying is idempotent and cannot double-assign.
 */

// Only orders the restaurant has accepted are eligible - matching the guard inside
// assignOrderToDeliveryBoy, which refuses anything else.
const ASSIGNABLE_STATUSES = ['preparing', 'ready'];

// Orders older than this are almost certainly a dispatch problem rather than a supply
// blip, so they are surfaced loudly instead of being retried in silence forever.
const STALE_AFTER_MINUTES = 10;

// Cap the work per tick. A backlog gets worked through over several ticks rather than
// one long run holding the event loop.
const MAX_PER_RUN = 25;

const minutesSince = (date) => {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 60000);
};

const extractRestaurantCoords = (restaurant) => {
  const location = restaurant?.location || restaurant?.onboarding?.step1?.location || null;
  if (!location) return { lat: null, lng: null };

  const lat = Number(location.latitude ?? location.lat ?? (Array.isArray(location.coordinates) ? location.coordinates[1] : null));
  const lng = Number(location.longitude ?? location.lng ?? (Array.isArray(location.coordinates) ? location.coordinates[0] : null));

  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
};

/**
 * One sweep. Safe to call concurrently with the original assignment path.
 * @returns {Promise<{processed: number, assigned: number, stale: number, message: string}>}
 */
export async function processPendingAssignments() {
  const pendingOrders = await Order.find({
    status: { $in: ASSIGNABLE_STATUSES },
    $or: [
      { deliveryPartnerId: null },
      { deliveryPartnerId: { $exists: false } },
    ],
  })
    .sort({ createdAt: 1 }) // oldest first - nobody should be overtaken while waiting
    .limit(MAX_PER_RUN)
    .populate('restaurantId', 'name location onboarding.step1.location');

  if (pendingOrders.length === 0) {
    return { processed: 0, assigned: 0, stale: 0, message: 'No unassigned orders awaiting a partner' };
  }

  let assigned = 0;
  let stale = 0;

  for (const order of pendingOrders) {
    const waitingMinutes = minutesSince(order.tracking?.preparing?.timestamp || order.createdAt);

    try {
      const { lat, lng } = extractRestaurantCoords(order.restaurantId);

      if (lat === null || lng === null) {
        // Without coordinates there is no "nearest" partner to find. This is a data
        // problem on the restaurant record and will never resolve on its own.
        console.error(
          `[Assignment Retry] Order ${order.orderId} cannot be assigned: restaurant ` +
          `${order.restaurantId?.name || order.restaurantId} has no usable coordinates.`
        );
        stale += 1;
        continue;
      }

      const result = await assignOrderToDeliveryBoy(
        order,
        lat,
        lng,
        order.restaurantId?._id || order.restaurantId
      );

      if (result?.deliveryPartnerId) {
        assigned += 1;
        console.log(
          `[Assignment Retry] Order ${order.orderId} assigned to ${result.deliveryPartnerName} ` +
          `after waiting ${waitingMinutes}m.`
        );

        // The original path notifies on assignment; a retry must too, or the partner
        // gets an order in their list with no alert.
        try {
          const populatedOrder = await Order.findById(order._id)
            .populate('userId', 'name phone')
            .lean();
          if (populatedOrder) {
            await notifyDeliveryBoyNewOrder(populatedOrder, result.deliveryPartnerId);
          }
        } catch (notifyError) {
          console.error(
            `[Assignment Retry] Order ${order.orderId} assigned but notification failed:`,
            notifyError?.message
          );
        }
        continue;
      }

      // Still nothing. Escalate once it stops looking like a momentary supply gap.
      if (waitingMinutes !== null && waitingMinutes >= STALE_AFTER_MINUTES) {
        stale += 1;
        console.warn(
          `[Assignment Retry] Order ${order.orderId} STILL UNASSIGNED after ${waitingMinutes}m ` +
          `(zone: ${order.assignmentInfo?.zoneId || 'none'}, excluded partners: ` +
          `${(order.excludedDeliveryPartners || []).length}). Needs manual dispatch.`
        );
      }
    } catch (error) {
      console.error(`[Assignment Retry] Error retrying order ${order.orderId}:`, error?.message);
    }
  }

  return {
    processed: pendingOrders.length,
    assigned,
    stale,
    message:
      `Retried ${pendingOrders.length} unassigned order(s): ${assigned} assigned` +
      (stale > 0 ? `, ${stale} needing attention` : ''),
  };
}

export default processPendingAssignments;

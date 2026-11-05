import Delivery from '../models/Delivery.js';
import Order from '../../order/models/Order.js';
import { ridersToMarkOffline } from '../../order/utils/riderLiveness.js';

// Well past the 30 minutes after which a rider stops being offered orders, because this
// is a statement about the rider rather than about one order. A rider who reopens the app
// is switched back on by their next position, since the app sends isOnline=true with it.
const RIDER_OFFLINE_AFTER_MINUTES = Number(process.env.RIDER_OFFLINE_AFTER_MINUTES || 120);

// An order untouched for this long is abandoned, not somebody's active job, so it should
// not keep a long-gone rider marked online forever.
const ACTIVE_ORDER_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * availability.isOnline was sticky: nothing cleared it when an app stopped reporting, so
 * production listed riders as online whose last position was 99 days old.
 */
export async function markStaleRidersOffline(now = Date.now()) {
  const online = await Delivery.find({ 'availability.isOnline': true, isDemo: { $ne: true } })
    .select('_id availability.lastLocationUpdate')
    .lean();
  if (online.length === 0) return { checked: 0, markedOffline: 0 };

  const busy = await Order.find({
    deliveryPartnerId: { $in: online.map((rider) => rider._id) },
    status: { $nin: ['delivered', 'cancelled'] },
    updatedAt: { $gte: new Date(now - ACTIVE_ORDER_WINDOW_MS) },
  })
    .select('deliveryPartnerId')
    .lean();
  const busyIds = new Set(busy.map((order) => String(order.deliveryPartnerId)));

  const stale = ridersToMarkOffline(online, busyIds, now, RIDER_OFFLINE_AFTER_MINUTES);
  if (stale.length === 0) return { checked: online.length, markedOffline: 0 };

  // Repeats the age condition so a position arriving since the read above wins.
  const cutoff = new Date(now - RIDER_OFFLINE_AFTER_MINUTES * 60000);
  const result = await Delivery.updateMany(
    {
      _id: { $in: stale.map((rider) => rider._id) },
      'availability.isOnline': true,
      $or: [
        { 'availability.lastLocationUpdate': { $lt: cutoff } },
        { 'availability.lastLocationUpdate': null },
      ],
    },
    { $set: { 'availability.isOnline': false } },
    { timestamps: false },
  );

  return { checked: online.length, markedOffline: result.modifiedCount || 0 };
}

export default markStaleRidersOffline;

import mongoose from 'mongoose';
import Delivery from '../../delivery/models/Delivery.js';
import Order from '../models/Order.js';
import {
  MAX_ASSIGNABLE_POSITION_AGE_MS,
  calculateDistance,
  filterPartnersByAvailableCashLimit,
  isPartnerInsideRequiredZone,
  resolveRequiredZone,
} from './deliveryAssignmentService.js';
import { notifyDeliveryBoyNewOrder } from './deliveryNotificationService.js';
import { extractRestaurantCoords, loadRestaurant } from './pendingAssignmentService.js';
import { positionAgeMinutes, sortDispatchCandidates } from '../utils/riderLiveness.js';

const DISPATCHABLE_STATUSES = ['preparing', 'ready'];

const dispatchError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const hasNoRider = (order) => !order?.deliveryPartnerId;

/**
 * Every approved rider an admin could send, with what they need to choose: most orders
 * are dispatched by phone, so a rider whose app is quiet is still a real option and is
 * listed with how long it has been quiet rather than hidden.
 */
export async function listDispatchCandidates(order) {
  const restaurant = await loadRestaurant(order.restaurantId, new Map());
  const { lat, lng } = extractRestaurantCoords(restaurant);

  let zone = null;
  try {
    zone = await resolveRequiredZone(
      order.assignmentInfo?.zoneId,
      restaurant?._id || order.restaurantId,
      lat,
      lng,
    );
  } catch (error) {
    console.warn(`[Manual Dispatch] Zone lookup failed for ${order.orderId}: ${error.message}`);
  }

  const riders = await Delivery.find({
    status: { $in: ['approved', 'active'] },
    isActive: true,
    isDemo: { $ne: true },
  })
    .select('name phone availability status zoneId')
    .lean();

  const [activeOrders, withinCashLimit] = await Promise.all([
    Order.find({
      deliveryPartnerId: { $in: riders.map((rider) => rider._id) },
      status: { $nin: ['delivered', 'cancelled'] },
      updatedAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    })
      .select('deliveryPartnerId')
      .lean(),
    filterPartnersByAvailableCashLimit(riders),
  ]);

  const activeCount = new Map();
  for (const active of activeOrders) {
    const key = String(active.deliveryPartnerId);
    activeCount.set(key, (activeCount.get(key) || 0) + 1);
  }
  const withinLimitIds = new Set(withinCashLimit.map((rider) => String(rider._id)));
  const declined = new Set((order.excludedDeliveryPartners || []).map(String));

  const candidates = riders.map((rider) => {
    const id = String(rider._id);
    const coordinates = rider.availability?.currentLocation?.coordinates;
    const hasPosition = Array.isArray(coordinates) && coordinates.length >= 2 &&
      !(coordinates[0] === 0 && coordinates[1] === 0);
    const riderLat = hasPosition ? coordinates[1] : null;
    const riderLng = hasPosition ? coordinates[0] : null;
    const ageMinutes = positionAgeMinutes(rider);

    return {
      id,
      name: rider.name || 'Unnamed rider',
      phone: rider.phone || null,
      online: Boolean(rider.availability?.isOnline),
      positionAgeMinutes: ageMinutes,
      live: ageMinutes !== null && ageMinutes * 60000 <= MAX_ASSIGNABLE_POSITION_AGE_MS,
      inZone: zone ? isPartnerInsideRequiredZone(rider, zone, riderLat, riderLng) : false,
      distanceKm: hasPosition && lat !== null && lng !== null
        ? Math.round(calculateDistance(lat, lng, riderLat, riderLng) * 10) / 10
        : null,
      activeOrders: activeCount.get(id) || 0,
      overCashLimit: !withinLimitIds.has(id),
      declined: declined.has(id),
    };
  });

  return {
    zoneName: zone?.name || zone?.zoneName || null,
    restaurantName: restaurant?.name || order.restaurantName || null,
    candidates: sortDispatchCandidates(candidates),
  };
}

/**
 * Put a rider chosen by an admin on an order. The update is conditional, so an order the
 * retry sweep or a rider has taken in the meantime is refused, never silently overwritten.
 * No money moves here: earnings and cash follow the existing completion paths.
 */
export async function assignRiderManually(order, riderId, adminId) {
  if (!mongoose.Types.ObjectId.isValid(String(riderId || ''))) {
    throw dispatchError(400, 'A valid rider is required');
  }
  if (!DISPATCHABLE_STATUSES.includes(order.status)) {
    throw dispatchError(400, `A rider cannot be assigned while the order is ${order.status}`);
  }
  if (!hasNoRider(order)) {
    throw dispatchError(409, 'This order already has a rider');
  }

  const rider = await Delivery.findOne({
    _id: riderId,
    status: { $in: ['approved', 'active'] },
    isActive: true,
    isDemo: { $ne: true },
  })
    .select('_id name phone')
    .lean();
  if (!rider) throw dispatchError(404, 'That rider is not approved and active');

  const updated = await Order.findOneAndUpdate(
    {
      _id: order._id,
      status: { $in: DISPATCHABLE_STATUSES },
      $or: [{ deliveryPartnerId: null }, { deliveryPartnerId: { $exists: false } }],
    },
    {
      $set: {
        deliveryPartnerId: rider._id,
        'assignmentInfo.deliveryPartnerId': String(rider._id),
        'assignmentInfo.assignedAt': new Date(),
        'assignmentInfo.assignedBy': 'manual',
        'assignmentInfo.assignedByAdminId': String(adminId || ''),
      },
    },
    { new: true },
  );
  if (!updated) throw dispatchError(409, 'This order was just taken or changed. Refresh and check.');

  console.log(`[Manual Dispatch] Order ${updated.orderId} assigned to rider ${rider._id} by admin ${adminId}`);

  // The assignment stands whatever happens to these: a rider without the app is reached
  // by phone anyway, and the order must not look unassigned because a push failed.
  try {
    const etaEventService = (await import('./etaEventService.js')).default;
    await etaEventService.handleRiderAssigned(updated._id.toString(), String(rider._id));
  } catch (error) {
    console.error(`[Manual Dispatch] ETA update failed for ${updated.orderId}: ${error?.message}`);
  }

  let notified = true;
  try {
    const populated = await Order.findById(updated._id).populate('userId', 'name phone').lean();
    await notifyDeliveryBoyNewOrder(populated, String(rider._id));
  } catch (error) {
    notified = false;
    console.error(`[Manual Dispatch] Rider notification failed for ${updated.orderId}: ${error?.message}`);
  }

  return { orderId: updated.orderId, riderId: String(rider._id), riderName: rider.name, riderPhone: rider.phone, notified };
}

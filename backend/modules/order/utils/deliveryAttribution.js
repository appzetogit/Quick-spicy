/**
 * Who actually delivered an order, and whether the cash was collected.
 *
 * Invoices and the admin order screens named `deliveryPartnerId` - whoever dispatch last
 * assigned. That is not the same thing as whoever delivered it. Of 549 delivered orders in
 * one 30-day window that named a rider, 337 named one who never accepted the order, never
 * reached the restaurant and never verified the customer's drop OTP; they were closed some
 * other way, usually an admin force-complete. Riders who had since been blocked were being
 * printed on invoices for deliveries they never made.
 *
 * The same assumption made every delivered cash order read "Collected". A rider who
 * completes a cash delivery has the order total added to their cashInHand, so that claim
 * is backed by a record. An admin force-complete adds it to nobody, so for those orders
 * "Collected" was a guess - usually about money nobody on record was holding.
 */

/**
 * True only when the named rider completed the handover themselves.
 *
 * In order of strength: the drop OTP verified by this rider (it outranks everything,
 * including who clicked complete); then completedBy, where it exists; then, for orders
 * that required an OTP and never got one, no. Orders from before drop OTPs carry no code
 * at all, and for those the rider's own engagement with the order is the best evidence.
 */
export const riderCompletedHandover = (order) => {
  if (!order?.deliveryPartnerId) return false;
  const riderId = String(order.deliveryPartnerId?._id || order.deliveryPartnerId);
  const dropOtp = order.deliveryVerification?.dropOtp;

  // The rider verifying the customer's drop OTP is the strongest proof of handover there
  // is: the code exists only on the customer's screen. It outranks whoever clicked
  // "complete" - an admin sometimes closes an order in the same moment the rider is
  // handing it over (seen in production: completed 07:06:10, OTP verified 07:06:14 by the
  // assigned rider), and crediting nobody there would withhold a delivery that happened.
  if (dropOtp?.verifiedAt && (!dropOtp.verifiedBy || String(dropOtp.verifiedBy) === riderId)) {
    return true;
  }

  if (order.completedBy) return order.completedBy === 'rider';

  // An order that required the OTP and never got it was not handed over by this rider.
  if (dropOtp?.code) return false;

  const state = order.deliveryState || {};
  return Boolean(state.acceptedAt || state.reachedPickupAt || state.orderIdConfirmedAt);
};

/** The rider to credit on an invoice, or null when no rider demonstrably delivered it. */
export const deliveredByRider = (order) => {
  if (!riderCompletedHandover(order)) return null;
  const rider = order.deliveryPartnerId;
  if (!rider || typeof rider !== 'object') return null;
  return { name: rider.name || null, phone: rider.phone || null };
};

/**
 * The rider an invoice may name, at any status. Delivered: only the rider who handed it
 * over. Before that: only a rider who has accepted the order. Being offered or assigned
 * it is not enough - dispatch can assign a rider who never sees the request, and the
 * invoice printed their name anyway.
 */
export const invoiceRider = (order) => {
  if (order?.status === 'delivered') return deliveredByRider(order);
  const rider = order?.deliveryPartnerId;
  if (!rider || typeof rider !== 'object') return null;
  const state = order.deliveryState || {};
  const accepted = Boolean(state.acceptedAt || state.reachedPickupAt || state.orderIdConfirmedAt) ||
    ['out_for_delivery', 'picked_up'].includes(order.status);
  return accepted ? { name: rider.name || null, phone: rider.phone || null } : null;
};

/**
 * Collection status for a cash order. Delivery on its own is not evidence of collection:
 * only a rider completion, which records the cash against that rider, is.
 */
export const cashCollectionStatus = (order) => {
  if (order?.status !== 'delivered') return 'Not Collected';
  return riderCompletedHandover(order) ? 'Collected' : 'Not recorded';
};

export default riderCompletedHandover;

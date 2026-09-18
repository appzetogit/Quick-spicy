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
 * completedBy is authoritative where it exists; it was introduced later, so older orders
 * fall back to the drop OTP, which the rider completion endpoint refuses to proceed
 * without. Orders from before drop OTPs existed carry no code at all, and for those the
 * rider's own engagement with the order is the best evidence left.
 */
export const riderCompletedHandover = (order) => {
  if (!order?.deliveryPartnerId) return false;
  if (order.completedBy) return order.completedBy === 'rider';

  const dropOtp = order.deliveryVerification?.dropOtp;
  if (dropOtp?.code) return Boolean(dropOtp.verifiedAt);

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
 * Collection status for a cash order. Delivery on its own is not evidence of collection:
 * only a rider completion, which records the cash against that rider, is.
 */
export const cashCollectionStatus = (order) => {
  if (order?.status !== 'delivered') return 'Not Collected';
  return riderCompletedHandover(order) ? 'Collected' : 'Not recorded';
};

export default riderCompletedHandover;

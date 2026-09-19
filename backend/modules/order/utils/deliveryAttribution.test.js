// Run: npm test          (from backend/)
//
// Guards who an invoice credits with a delivery, and when cash counts as collected. 337 of
// 549 delivered orders in 30 days named a rider who never accepted, never reached the
// restaurant and never verified the drop OTP - including riders later blocked - and every
// delivered cash order read "Collected" whether or not anyone had recorded collecting it.
import assert from 'node:assert/strict';
import { riderCompletedHandover, deliveredByRider, cashCollectionStatus, invoiceRider } from './deliveryAttribution.js';

const rider = { _id: 'r1', name: 'B Vikram', phone: '9000000000' };
const otpOrder = (extra = {}) => ({
  status: 'delivered',
  deliveryPartnerId: rider,
  deliveryVerification: { dropOtp: { code: '4802', verifiedAt: null } },
  deliveryState: {},
  ...extra,
});

// --- the reported case: assigned, never touched it, closed by someone else ------------
const neverWorked = otpOrder();
assert.equal(riderCompletedHandover(neverWorked), false, 'an assigned rider who never engaged did not deliver it');
assert.equal(deliveredByRider(neverWorked), null, 'so the invoice must not name them');
assert.equal(cashCollectionStatus(neverWorked), 'Not recorded', 'and nobody on record collected the cash');

// Even having accepted is not handing over, when the order required an OTP.
const acceptedOnly = otpOrder({ deliveryState: { acceptedAt: new Date(), reachedPickupAt: new Date() } });
assert.equal(riderCompletedHandover(acceptedOnly), false, 'accepting is not delivering');

// --- a genuine rider delivery ----------------------------------------------------------
const verified = otpOrder({ deliveryVerification: { dropOtp: { code: '4802', verifiedAt: new Date() } } });
assert.equal(riderCompletedHandover(verified), true);
assert.deepEqual(deliveredByRider(verified), { name: 'B Vikram', phone: '9000000000' });
assert.equal(cashCollectionStatus(verified), 'Collected', 'a rider completion records the cash against them');

// --- completedBy, where it exists, decides ---------------------------------------------
assert.equal(riderCompletedHandover(otpOrder({ completedBy: 'rider' })), true);
// An admin completion with no handover from the rider is not credited to them.
assert.equal(riderCompletedHandover(otpOrder({ completedBy: 'admin' })), false);
assert.equal(cashCollectionStatus(otpOrder({ completedBy: 'admin' })), 'Not recorded');

// Seen in production: an admin clicked complete at 07:06:10 and the assigned rider
// verified the customer's drop OTP at 07:06:14. The rider did hand it over - the OTP
// outranks whoever clicked complete.
const racedByAdmin = otpOrder({
  completedBy: 'admin',
  deliveryVerification: { dropOtp: { code: '1', verifiedAt: new Date(), verifiedBy: 'r1' } },
});
assert.equal(riderCompletedHandover(racedByAdmin), true, 'a verified OTP proves handover whoever clicked complete');
assert.deepEqual(deliveredByRider(racedByAdmin), { name: 'B Vikram', phone: '9000000000' });

// But an OTP verified by a DIFFERENT rider is not this rider's delivery.
const otherRider = otpOrder({
  deliveryVerification: { dropOtp: { code: '1', verifiedAt: new Date(), verifiedBy: 'someone-else' } },
});
assert.equal(riderCompletedHandover(otherRider), false, "another rider's OTP does not credit this one");

// --- orders from before drop OTPs fall back to engagement ------------------------------
const legacy = { status: 'delivered', deliveryPartnerId: rider, deliveryState: { acceptedAt: new Date() } };
assert.equal(riderCompletedHandover(legacy), true, 'pre-OTP order the rider accepted');
assert.equal(riderCompletedHandover({ status: 'delivered', deliveryPartnerId: rider, deliveryState: {} }), false);

// --- no rider, or only an id --------------------------------------------------------------
assert.equal(riderCompletedHandover({ status: 'delivered', deliveryPartnerId: null }), false);
assert.equal(deliveredByRider({ ...verified, deliveryPartnerId: 'r1' }), null, 'an unpopulated id has no name to print');
assert.equal(cashCollectionStatus({ status: 'delivered', deliveryPartnerId: null }), 'Not recorded');

// --- not delivered yet ---------------------------------------------------------------------
assert.equal(cashCollectionStatus(otpOrder({ status: 'out_for_delivery' })), 'Not Collected');
assert.equal(cashCollectionStatus(otpOrder({ status: 'cancelled' })), 'Not Collected');

// --- invoice before delivery: only a rider who accepted ---------------------------------
// Production: ORD-1789815508619-499, preparing, assigned to a rider offline for 17 days.
assert.equal(invoiceRider({ status: 'preparing', deliveryPartnerId: rider, deliveryState: { currentPhase: 'assigned' } }), null);
assert.deepEqual(invoiceRider({ status: 'preparing', deliveryPartnerId: rider, deliveryState: { acceptedAt: new Date() } }), { name: 'B Vikram', phone: '9000000000' });
assert.deepEqual(invoiceRider({ status: 'out_for_delivery', deliveryPartnerId: rider, deliveryState: {} }), { name: 'B Vikram', phone: '9000000000' });
assert.equal(invoiceRider(neverWorked), null, 'delivered: same rule as before');
assert.equal(invoiceRider({ status: 'preparing', deliveryPartnerId: null }), null);

console.log('deliveryAttribution: all assertions passed');

// Run: npm test          (from backend/)
//
// Guards who an invoice credits with a delivery, and when cash counts as collected. 337 of
// 549 delivered orders in 30 days named a rider who never accepted, never reached the
// restaurant and never verified the drop OTP - including riders later blocked - and every
// delivered cash order read "Collected" whether or not anyone had recorded collecting it.
import assert from 'node:assert/strict';
import { riderCompletedHandover, deliveredByRider, cashCollectionStatus } from './deliveryAttribution.js';

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
assert.equal(riderCompletedHandover(otpOrder({
  completedBy: 'admin',
  deliveryVerification: { dropOtp: { code: '1', verifiedAt: new Date() } },
})), false, 'an admin completion is never credited to the rider');
assert.equal(cashCollectionStatus(otpOrder({ completedBy: 'admin' })), 'Not recorded');

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

console.log('deliveryAttribution: all assertions passed');

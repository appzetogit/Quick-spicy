// Run: npm test          (from backend/)
import assert from 'node:assert/strict';
import { describeEmptyPool, positionAgeMinutes, ridersToMarkOffline, sortDispatchCandidates } from './riderLiveness.js';
import { dispatchedRider, deliveredByRider, invoiceRider } from './deliveryAttribution.js';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const minsAgo = (m) => new Date(NOW - m * 60000);
const rider = (id, age) => ({ _id: id, availability: { lastLocationUpdate: age === null ? undefined : minsAgo(age) } });

// --- the funnel names the stage that actually emptied the pool --------------------------
assert.equal(describeEmptyPool({ stale: 10 }), 'stale-position', 'quiet riders are not a zone problem');
assert.equal(describeEmptyPool({ stale: 10, wrongZone: 1 }), 'wrong-zone', 'the production case: one live rider, elsewhere');
assert.equal(describeEmptyPool({ stale: 2, wrongZone: 1, tooFar: 1 }), 'too-far');
assert.equal(describeEmptyPool({}), 'no-position');

// --- position age ------------------------------------------------------------------------
assert.equal(positionAgeMinutes(rider('a', 45), NOW), 45);
assert.equal(positionAgeMinutes(rider('a', null), NOW), null, 'never reported is unknown, not zero');

// --- offline sweep ------------------------------------------------------------------------
const pool = [rider('recent', 30), rider('edge', 120), rider('quiet', 121), rider('never', null), rider('working', 500)];
assert.deepEqual(
  ridersToMarkOffline(pool, new Set(['working']), NOW, 120).map((r) => r._id),
  ['quiet', 'never'],
  'switch off only quiet riders, and never one in the middle of an order',
);

// --- candidate order ----------------------------------------------------------------------
const c = (id, o) => ({ id, inZone: false, live: false, activeOrders: 0, overCashLimit: false, distanceKm: null, ...o });
assert.deepEqual(
  sortDispatchCandidates([
    c('otherZoneLive', { live: true, distanceKm: 1 }),
    c('zoneQuiet', { inZone: true, distanceKm: 2 }),
    c('zoneLiveBusy', { inZone: true, live: true, activeOrders: 1, distanceKm: 1 }),
    c('zoneLiveFar', { inZone: true, live: true, distanceKm: 9 }),
    c('zoneLiveNear', { inZone: true, live: true, distanceKm: 3 }),
    c('noPosition', { inZone: true }),
  ]).map((r) => r.id),
  ['zoneLiveNear', 'zoneLiveFar', 'zoneLiveBusy', 'zoneQuiet', 'noPosition', 'otherZoneLive'],
);

// --- a dispatched rider is on record, but is not claimed as having delivered ----------------
const named = { _id: 'r1', name: 'B Vikram', phone: '9000000000' };
const manual = {
  status: 'delivered',
  completedBy: 'admin',
  deliveryPartnerId: named,
  deliveryState: {},
  assignmentInfo: { assignedBy: 'manual' },
};
assert.deepEqual(dispatchedRider(manual), { name: 'B Vikram', phone: '9000000000' });
assert.equal(deliveredByRider(manual), null, 'an admin close is still not proof of handover');
assert.equal(dispatchedRider({ ...manual, assignmentInfo: { assignedBy: 'nearest_available' } }), null, 'auto-offers are not dispatch');
assert.equal(dispatchedRider({ ...manual, deliveryPartnerId: 'r1' }), null, 'needs the populated rider');
assert.equal(invoiceRider({ ...manual, status: 'ready' }), null, 'the invoice rule is unchanged');

console.log('riderLiveness: all passed');

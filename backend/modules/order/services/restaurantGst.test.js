// Run: npm test          (from backend/)
// GST is charged per restaurant: only where an admin switched it on, at the restaurant's
// own rate if set, otherwise the platform default.
import assert from 'node:assert/strict';
import { resolveRestaurantGst, gstAmount } from './orderCalculationService.js';
import { isValidGstin } from '../../admin/controllers/gstSettingsController.js';

// Off (or never configured): no GST whatever the default rate is.
assert.equal(resolveRestaurantGst({}, 5).rate, 0);
assert.equal(resolveRestaurantGst(null, 5).rate, 0);
assert.equal(resolveRestaurantGst({ gstSettings: { enabled: false, rate: 18 } }, 5).rate, 0);

// On, no own rate: the platform default.
assert.equal(resolveRestaurantGst({ gstSettings: { enabled: true, rate: null } }, 5).rate, 5);
assert.equal(resolveRestaurantGst({ gstSettings: { enabled: true } }, 0).rate, 0, 'default 0 means none');
// On, own rate: it overrides the default, including an explicit 0.
assert.equal(resolveRestaurantGst({ gstSettings: { enabled: true, rate: 18 } }, 5).rate, 18);
assert.equal(resolveRestaurantGst({ gstSettings: { enabled: true, rate: 0 } }, 5).rate, 0);
// Clamped to the legal range, GSTIN carried for the invoice.
assert.equal(resolveRestaurantGst({ gstSettings: { enabled: true, rate: 99 } }, 5).rate, 28);
assert.equal(resolveRestaurantGst({ gstSettings: { enabled: true, gstin: '37ABCDE1234F1Z5' } }, 5).gstin, '37ABCDE1234F1Z5');

// Amount: on the food total after discount, rounded.
assert.equal(gstAmount(200, 0, 5), 10);
assert.equal(gstAmount(200, 50, 5), 8, '5% of 150 = 7.5 -> 8');
assert.equal(gstAmount(100, 150, 5), 0, 'discount larger than subtotal never makes GST negative');
assert.equal(gstAmount(333, 0, 18), 60);
assert.equal(gstAmount(200, 0, 0), 0);

// GSTIN format.
assert.equal(isValidGstin('37ABCDE1234F1Z5'), true);
assert.equal(isValidGstin('37abcde1234f1z5'), true, 'case-insensitive');
for (const bad of ['', '37ABCDE1234F1Z', '37ABCDE1234F1X5', 'ABCDE1234F1Z537', '3XABCDE1234F1Z5']) {
  assert.equal(isValidGstin(bad), false, bad);
}
console.log('restaurantGst: all assertions passed');
process.exit(0);

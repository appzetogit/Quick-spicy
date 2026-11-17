// Run: npm test          (from backend/)
// Delivery charges per zone: no rule = platform charges; free delivery = 0; custom fields
// replace only what they set.
import assert from 'node:assert/strict';
import { applyZoneFeeRule } from './orderCalculationService.js';

const platform = { deliveryFee: 20, deliveryBaseDistanceKm: 2.5, deliveryFeePerKm: 7 };

const none = applyZoneFeeRule(platform, null);
assert.deepEqual(
  { f: none.deliveryFee, b: none.deliveryBaseDistanceKm, k: none.deliveryFeePerKm, free: none.freeDelivery, applied: none.zoneRuleApplied },
  { f: 20, b: 2.5, k: 7, free: false, applied: false },
  'no rule: platform charges',
);

assert.equal(applyZoneFeeRule(platform, { freeDelivery: true }).freeDelivery, true, 'free delivery');

const custom = applyZoneFeeRule(platform, { freeDelivery: false, deliveryFee: 10, deliveryBaseDistanceKm: null, deliveryFeePerKm: 0 });
assert.equal(custom.deliveryFee, 10, 'custom fixed charge');
assert.equal(custom.deliveryBaseDistanceKm, 2.5, 'empty field keeps the platform value');
assert.equal(custom.deliveryFeePerKm, 0, 'an explicit 0 is kept, not replaced');

assert.equal(applyZoneFeeRule({}, null).deliveryFee, 25, 'built-in default with no settings at all');
console.log('zoneFeeRule: all assertions passed');
process.exit(0);

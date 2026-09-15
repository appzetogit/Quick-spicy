// Run: npm test          (from backend/)
//
// Guards the bound on the distance a delivery fee may be computed from. Without it the
// per-km charge ran away with bad coordinates: a drop pinned at 0,0 produced a Rs 42,805
// delivery fee, and four orders in 60 days were recorded over 50km from their restaurant,
// one at 224km. Deliveries are zone-local and cross-zone ordering is blocked at checkout,
// so those distances are wrong data rather than long journeys.
import assert from 'node:assert/strict';
import { boundedFeeDistanceKm, MAX_FEE_DISTANCE_KM } from './orderCalculationService.js';

// Ordinary deliveries pass through untouched.
for (const km of [0, 0.4, 2.5, 7, 18.75, 49.9]) {
  const { distanceKm, implausible } = boundedFeeDistanceKm(km);
  assert.equal(distanceKm, km, `${km}km should be charged as itself`);
  assert.equal(implausible, false);
}

// The boundary itself is still a real delivery.
assert.deepEqual(boundedFeeDistanceKm(MAX_FEE_DISTANCE_KM), {
  distanceKm: MAX_FEE_DISTANCE_KM,
  implausible: false,
});

// Beyond it, the fee is computed from the cap and the order is flagged.
const far = boundedFeeDistanceKm(224);
assert.equal(far.distanceKm, MAX_FEE_DISTANCE_KM, 'a 224km "delivery" is charged at the cap');
assert.equal(far.implausible, true, 'and is flagged so the bad coordinates can be found');

// The null-island case that started this: 0,0 is thousands of km from Andhra Pradesh.
const nullIsland = boundedFeeDistanceKm(7043);
assert.equal(nullIsland.distanceKm, MAX_FEE_DISTANCE_KM);
assert.equal(nullIsland.implausible, true);

// Nonsense never becomes a charge.
for (const bad of [NaN, Infinity, -1, null, undefined, 'far']) {
  const { distanceKm, implausible } = boundedFeeDistanceKm(bad);
  assert.equal(distanceKm, 0, `${String(bad)} must not become a distance`);
  assert.equal(implausible, true);
}

// The cap is configurable per environment.
assert.deepEqual(boundedFeeDistanceKm(30, 10), { distanceKm: 10, implausible: true });
assert.deepEqual(boundedFeeDistanceKm(8, 10), { distanceKm: 8, implausible: false });

console.log('deliveryFeeDistance: all assertions passed');

// Run: npm test          (from backend/)
//
// Guards the per-order item limit on coupons. Coupons were being farmed by stacking units
// under a steep discount: GET75%OFF was applied to one order of twelve breakfast items for
// Rs 248 off. A cap existed but was optional, unset on every offer, counted each item line
// separately, and was skipped entirely by all-items coupons.
import assert from 'node:assert/strict';
import { capDiscountedUnits, couponItemLimit, COUPON_DEFAULT_MAX_ITEMS, capPerDish, couponPerDishLimit, COUPON_DEFAULT_MAX_PER_DISH } from './orderCalculationService.js';

const pct75 = (price) => price * 0.75;

// --- the abuse case --------------------------------------------------------------------
// 2x Vada, 4x Poori, 1x Idly, 3x Plain Dosa = 10 units under 75% off.
const breakfast = [
  { unitDiscount: pct75(40), quantity: 2 }, // vada
  { unitDiscount: pct75(50), quantity: 4 }, // poori
  { unitDiscount: pct75(40), quantity: 1 }, // idly
  { unitDiscount: pct75(45), quantity: 3 }, // plain dosa
];
const uncapped = capDiscountedUnits(breakfast, Infinity);
const capped = capDiscountedUnits(breakfast, 3);
assert.equal(uncapped, pct75(40) * 2 + pct75(50) * 4 + pct75(40) + pct75(45) * 3, 'uncapped is every unit');
assert.equal(capped, pct75(50) * 3, 'a limit of 3 discounts only the three most valuable units');
assert.ok(capped < uncapped / 3, 'the stacked order no longer gets the stacked discount');

// --- per order, not per line ------------------------------------------------------------
// The old cap applied per line, so four dishes at two each got eight units discounted.
const fourDishes = [10, 11, 12, 13].map((d) => ({ unitDiscount: d, quantity: 2 }));
assert.equal(capDiscountedUnits(fourDishes, 3), 13 + 13 + 12, 'three units across the whole order');

// --- within the limit nothing changes ---------------------------------------------------
const small = [{ unitDiscount: 30, quantity: 1 }, { unitDiscount: 20, quantity: 1 }];
assert.equal(capDiscountedUnits(small, 3), 50, 'an ordinary order keeps its full discount');
assert.equal(capDiscountedUnits(small, Infinity), 50);

// A global percentage coupon within the limit equals the old subtotal * rate.
const items = [{ price: 120, quantity: 1 }, { price: 80, quantity: 2 }];
const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
const asLines = items.map((i) => ({ unitDiscount: i.price * 0.2, quantity: i.quantity }));
assert.equal(Math.round(capDiscountedUnits(asLines, 3)), Math.round(subtotal * 0.2), 'global coupon unchanged within the limit');

// --- the best units are taken first -----------------------------------------------------
assert.equal(capDiscountedUnits([{ unitDiscount: 5, quantity: 5 }, { unitDiscount: 50, quantity: 1 }], 2), 55);

// --- junk never becomes a discount ------------------------------------------------------
assert.equal(capDiscountedUnits([], 3), 0);
assert.equal(capDiscountedUnits(null, 3), 0);
assert.equal(capDiscountedUnits([{ unitDiscount: -10, quantity: 5 }], 3), 0, 'negative discounts count as nothing');
assert.equal(capDiscountedUnits([{ unitDiscount: 10, quantity: 'lots' }], 3), 0);
assert.equal(capDiscountedUnits([{ unitDiscount: 10, quantity: 5 }], 0), 0, 'a limit of 0 discounts nothing');

// --- which limit applies ----------------------------------------------------------------
assert.equal(couponItemLimit({ maxDiscountedQuantity: 5 }), 5, "a coupon's own limit wins");
assert.equal(couponItemLimit({ maxDiscountedQuantity: 2.9 }), 2, 'whole units only');
const fallback = COUPON_DEFAULT_MAX_ITEMS > 0 ? COUPON_DEFAULT_MAX_ITEMS : Infinity;
for (const unset of [{}, { maxDiscountedQuantity: null }, { maxDiscountedQuantity: 0 }, { maxDiscountedQuantity: -1 }, { maxDiscountedQuantity: 'x' }, null]) {
  assert.equal(couponItemLimit(unset), fallback, `${JSON.stringify(unset)} falls back to the platform default`);
}
assert.ok(Number.isFinite(couponItemLimit({})), 'by default every coupon is limited');

// --- same-dish cap -------------------------------------------------------------------
// 10 of one pizza, per-dish 1, order limit 3: only one pizza is discounted.
assert.equal(capDiscountedUnits(capPerDish([{ unitDiscount: 27, quantity: 10 }], 1), 3), 27);
// Two dishes, per-dish 2, order limit 3: 2 of the best + 1 of the next.
assert.equal(capDiscountedUnits(capPerDish([{ unitDiscount: 30, quantity: 5 }, { unitDiscount: 10, quantity: 5 }], 2), 3), 70);
assert.equal(couponPerDishLimit({ maxQuantityPerDish: 1 }), 1, "a coupon's own per-dish limit wins");
const perDishFallback = COUPON_DEFAULT_MAX_PER_DISH > 0 ? COUPON_DEFAULT_MAX_PER_DISH : Infinity;
for (const unset of [{}, { maxQuantityPerDish: null }, { maxQuantityPerDish: 0 }, null]) {
  assert.equal(couponPerDishLimit(unset), perDishFallback);
}
assert.deepEqual(capPerDish(null, 1), []);

console.log('couponItemLimit: all assertions passed');

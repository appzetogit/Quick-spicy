// Run: node scripts/referralQualifier.test.mjs
//
// Pins the emergency rule change: a referral pays only on a delivered order of 299+, judged
// on food subtotal so a tip cannot lift a small order over the line.
import assert from "node:assert/strict";
import {
  qualifyingAmountOf,
  isQualifyingOrderAmount,
  REFERRAL_QUALIFYING_ORDER_MIN,
} from "../modules/order/services/referralRewardService.js";

assert.equal(REFERRAL_QUALIFYING_ORDER_MIN, 299);

// The abuse this closes: signup alone must be worth nothing - there is simply no order.
assert.equal(isQualifyingOrderAmount({}), false);
assert.equal(isQualifyingOrderAmount(null), false);

// Subtotal decides, not the charged total: a 100-rupee order with a 250-rupee tip charges
// 350 but must not qualify.
assert.equal(qualifyingAmountOf({ subtotal: 100, total: 350 }), 100);
assert.equal(isQualifyingOrderAmount({ subtotal: 100, total: 350 }), false);

// The example from the requirement: 299 exactly qualifies, 298.99 does not.
assert.equal(isQualifyingOrderAmount({ subtotal: 299 }), true);
assert.equal(isQualifyingOrderAmount({ subtotal: 298.99 }), false);
assert.equal(isQualifyingOrderAmount({ subtotal: 750 }), true);

// Old records without a subtotal fall back to total rather than never qualifying.
assert.equal(qualifyingAmountOf({ total: 320 }), 320);
assert.equal(isQualifyingOrderAmount({ total: 320 }), true);
assert.equal(isQualifyingOrderAmount({ total: 120 }), false);

// Garbage never qualifies.
assert.equal(isQualifyingOrderAmount({ subtotal: "abc", total: "xyz" }), false);
assert.equal(isQualifyingOrderAmount({ subtotal: -50 }), false);

console.log("referralQualifier: all assertions passed");

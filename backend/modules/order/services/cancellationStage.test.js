// Run: npm test          (from backend/)
//
// tracking.confirmed is set when an order is placed or paid, not when the restaurant accepts
// (accept sets tracking.preparing). Reading confirmed as "accepted" refunded only part of a
// prepaid order the restaurant never saw.
import assert from 'node:assert/strict';
import { getCancellationStage } from './cancellationRefundService.js';

const t = (flags) => ({ tracking: Object.fromEntries(flags.map((f) => [f, { status: true }])) });

assert.equal(getCancellationStage(t([])), 'pre_accept');
assert.equal(getCancellationStage(t(['confirmed'])), 'pre_accept', 'paid but not accepted is still before acceptance');
assert.equal(getCancellationStage(t(['confirmed', 'preparing'])), 'post_accept_pre_cook');
assert.equal(getCancellationStage(t(['confirmed', 'preparing', 'ready'])), 'post_cook');
assert.equal(getCancellationStage(t(['confirmed', 'preparing', 'ready', 'outForDelivery'])), 'post_pickup');
assert.equal(getCancellationStage({}), 'pre_accept', 'no tracking at all');

console.log('cancellationStage: all assertions passed');
process.exit(0);

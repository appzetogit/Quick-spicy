// Run: npm test          (from backend/)
//
// Paid Cashfree orders were cancelled as "restaurant did not respond": verification crashed
// on a null payment, and the accept timer ran on orders the restaurant could not yet see.
import assert from 'node:assert/strict';
import { mapCashfreePaymentMethod } from '../../payment/services/cashfreeService.js';
import { isAwaitingOnlinePayment } from './autoRejectService.js';

// No successful payment yet: must map, not throw.
assert.equal(mapCashfreePaymentMethod(null), 'other');
assert.equal(mapCashfreePaymentMethod(undefined), 'other');
assert.equal(mapCashfreePaymentMethod({ payment_group: 'upi' }), 'upi');

// The restaurant's accept timer must not run on an unconfirmed prepaid order.
assert.equal(isAwaitingOnlinePayment({ payment: { method: 'cashfree', status: 'pending' } }), true);
assert.equal(isAwaitingOnlinePayment({ payment: { method: 'cashfree', status: 'failed' } }), true);
assert.equal(isAwaitingOnlinePayment({ payment: { method: 'cashfree', status: 'completed' } }), false);
assert.equal(isAwaitingOnlinePayment({ payment: { method: 'cash', status: 'pending' } }), false);
assert.equal(isAwaitingOnlinePayment({ payment: { method: 'wallet', status: 'completed' } }), false);

console.log('prepaidReconcile: all assertions passed');
process.exit(0);

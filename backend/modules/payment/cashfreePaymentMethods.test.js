// Run: npm test          (from backend/)
//
// Guards the payment-method codes sent to Cashfree. An invalid code here does not degrade
// gracefully: Cashfree rejects the whole session, so nobody can pay online at all. That is
// what "wallet" (their code is "app") did - 162 orders left pending and cancelled over 30
// days, with zero successful online payments, and the customer told the restaurant had
// cancelled on them.
import assert from 'node:assert/strict';
import {
  CASHFREE_ALLOWED_METHODS,
  CASHFREE_PAYMENT_METHODS,
  cashfreePaymentMethodsValue,
  invalidCashfreeMethods,
} from './cashfreePaymentMethods.js';

// The rule that broke: every configured method must be one Cashfree accepts.
assert.deepEqual(
  invalidCashfreeMethods(),
  [],
  `configured methods Cashfree would reject: ${invalidCashfreeMethods().join(', ')}`,
);

// The specific mistake, so it cannot come back.
assert.ok(!CASHFREE_PAYMENT_METHODS.includes('wallet'), '"wallet" is not a Cashfree code - it is "app"');
assert.ok(CASHFREE_PAYMENT_METHODS.includes('app'), 'wallets are offered via "app"');
assert.deepEqual(invalidCashfreeMethods(['upi', 'cc', 'dc', 'nb', 'wallet']), ['wallet']);
assert.deepEqual(invalidCashfreeMethods(['upi', 'netbanking']), ['netbanking']);

// The allow-list is Cashfree's own, quoted from its rejection message.
for (const method of ['cc', 'dc', 'ppc', 'ccc', 'emi', 'paypal', 'upi', 'nb', 'app', 'paylater', 'applepay', 'googlepay']) {
  assert.ok(CASHFREE_ALLOWED_METHODS.includes(method), `${method} should be allowed`);
}

// The wire format is a comma-joined string with no spaces.
const value = cashfreePaymentMethodsValue();
assert.equal(value, 'upi,cc,dc,nb,app');
assert.ok(!/\s/.test(value), 'no whitespace in the joined value');

console.log('cashfreePaymentMethods: all assertions passed');

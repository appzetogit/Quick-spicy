/**
 * Which payment methods Cashfree is asked to offer.
 *
 * This is a small module with a test beside it because getting it wrong takes the entire
 * online payment flow down silently. `order_meta.payment_methods` was set to
 * "upi,cc,dc,nb,wallet", and "wallet" is not one of Cashfree's codes - theirs is "app".
 * Every session creation was rejected with:
 *
 *   order_meta.payment_methods : should be combination of cc,dc,ppc,ccc,emi,paypal,upi,
 *   nb,app,paylater,applepay,googlepay. Value received: upi,cc,dc,nb,wallet
 *
 * So every online order failed at checkout. In the 30 days before this was found there
 * were 162 cashfree orders left pending and then cancelled, and not one successful online
 * payment.
 */

/** Exactly the codes Cashfree names in its own rejection message. */
export const CASHFREE_ALLOWED_METHODS = Object.freeze([
  'cc', 'dc', 'ppc', 'ccc', 'emi', 'paypal', 'upi', 'nb', 'app', 'paylater', 'applepay', 'googlepay',
]);

/** Cards, UPI, net banking and wallets ("app"), matching what the checkout screen offers. */
export const CASHFREE_PAYMENT_METHODS = Object.freeze(['upi', 'cc', 'dc', 'nb', 'app']);

/** The comma-joined form the API expects in order_meta.payment_methods. */
export const cashfreePaymentMethodsValue = () => CASHFREE_PAYMENT_METHODS.join(',');

/** @returns {string[]} configured methods Cashfree would reject; empty when valid. */
export const invalidCashfreeMethods = (methods = CASHFREE_PAYMENT_METHODS) =>
  methods.filter((method) => !CASHFREE_ALLOWED_METHODS.includes(method));

export default cashfreePaymentMethodsValue;

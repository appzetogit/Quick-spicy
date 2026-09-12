// Run: npm test          (from frontend/)
// or:  node --test src/lib/utils
//
// Guards the order-tracking screen's presentation rules. Every assertion below stands for
// something a customer actually saw go wrong on 11 September 2026.
import assert from 'node:assert/strict'
import { viewForOrderStatus, formatPhoneForDisplay, riderFromOrder } from './orderPresentation.js'

// --- viewForOrderStatus ---------------------------------------------------------------

// The reported bug: food still sitting at the restaurant, screen saying it was picked up.
assert.equal(viewForOrderStatus('ready'), 'ready', "'ready' must have its own view")
assert.notEqual(viewForOrderStatus('ready'), 'pickup', "'ready' must never read as picked up")

// Only an actual pickup reads as one.
assert.equal(viewForOrderStatus('out_for_delivery'), 'pickup')

assert.equal(viewForOrderStatus('preparing'), 'preparing')
assert.equal(viewForOrderStatus('delivered'), 'delivered')
assert.equal(viewForOrderStatus('cancelled'), 'cancelled')

// Unrecognised or absent status leaves the view untouched instead of guessing a stage.
assert.equal(viewForOrderStatus('pending'), null)
assert.equal(viewForOrderStatus('confirmed'), null)
assert.equal(viewForOrderStatus(undefined), null)
assert.equal(viewForOrderStatus(null), null)

// --- formatPhoneForDisplay ------------------------------------------------------------

assert.equal(formatPhoneForDisplay('7660988295'), '+91 7660988295', 'bare 10-digit number')
assert.equal(formatPhoneForDisplay('917660988295'), '+91 7660988295', '91-prefixed')
assert.equal(formatPhoneForDisplay('+91 76609 88295'), '+91 7660988295', 'already spaced')

// Junk is returned unchanged rather than mangled into a fake number.
assert.equal(formatPhoneForDisplay(''), '')
assert.equal(formatPhoneForDisplay(null), '')
assert.equal(formatPhoneForDisplay(undefined), '')
assert.equal(formatPhoneForDisplay('not a number'), 'not a number')

// --- riderFromOrder -------------------------------------------------------------------

assert.deepEqual(
  riderFromOrder({ deliveryPartnerId: { name: 'Bunny', phone: '8125633886' } }),
  { name: 'Bunny', phone: '8125633886', avatar: null },
  'a populated rider keeps both name and phone',
)

// An unpopulated or partial rider still renders a card; the call button hides itself when
// there is no number, rather than dialling an empty string.
assert.equal(riderFromOrder({ deliveryPartnerId: { phone: '8125633886' } }).name, 'Delivery Partner')
assert.equal(riderFromOrder({ deliveryPartnerId: { name: 'Bunny' } }).phone, '')
assert.equal(riderFromOrder({ deliveryPartnerId: 'a-plain-id-string' }).phone, '')

// The guard that matters: an order with no rider shows no rider. Falling back to the last
// one seen would hand the customer a stranger's number after a reassignment or a reclaim.
assert.equal(riderFromOrder({ deliveryPartnerId: null }), null)
assert.equal(riderFromOrder({}), null)
assert.equal(riderFromOrder(undefined), null)

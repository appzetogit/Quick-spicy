// Run: npm test          (from backend/)
// or:  node --test modules shared
//
// Guards the check that decides whether an order may be taken back from a rider.
//
// The offer-timeout sweep is currently DISABLED (OFFER_TIMEOUT_ENABLED in server.js),
// because as shipped it excluded every rider who missed its 40-second window and stranded
// the order. These assertions must still pass before it is ever re-enabled: getting this
// wrong pulls a live order away from a rider already on their way to the restaurant.
import assert from 'node:assert/strict'
import { wasAcceptedByRider } from './offerTimeoutService.js'

// The ONLY shape that may be reclaimed: assigned to a rider, with no sign they engaged.
assert.equal(
  wasAcceptedByRider({
    assignmentInfo: { assignedBy: 'nearest_available' },
    deliveryState: { status: 'pending', currentPhase: 'assigned' },
  }),
  false,
  'an untouched assignment is the only reclaimable case',
)
assert.equal(wasAcceptedByRider({}), false)
assert.equal(wasAcceptedByRider(null), false)

// Explicit acceptance.
assert.equal(wasAcceptedByRider({ assignmentInfo: { assignedBy: 'delivery_accept' } }), true)

// Production holds an order stamped 'nearest_available' whose rider had genuinely
// accepted - assignedBy was never updated. Trusting assignedBy alone would have taken
// that order away from a rider who was working it, so acceptedAt must protect it too.
assert.equal(
  wasAcceptedByRider({
    assignmentInfo: { assignedBy: 'nearest_available' },
    deliveryState: { acceptedAt: new Date() },
  }),
  true,
  'acceptedAt protects the order even when assignedBy was never updated',
)

// Any other sign of real progress protects the order, whatever the two markers say.
assert.equal(wasAcceptedByRider({ deliveryState: { reachedPickupAt: new Date() } }), true)
assert.equal(wasAcceptedByRider({ deliveryState: { orderIdConfirmedAt: new Date() } }), true)
assert.equal(wasAcceptedByRider({ deliveryState: { status: 'accepted' } }), true)
assert.equal(wasAcceptedByRider({ deliveryState: { currentPhase: 'en_route_to_pickup' } }), true)
assert.equal(wasAcceptedByRider({ deliveryState: { currentPhase: 'en_route_to_delivery' } }), true)

// Run: npm test          (from frontend/)
//
// Guards the rule that decides whether a rider is sent back to the signup form. Getting
// this wrong in either direction is bad: too eager and an approved rider is trapped on a
// form they already completed, too lax and a genuinely half-finished signup is skipped.
import assert from 'node:assert/strict'
import {
  resolveSignupResumePath,
  DELIVERY_SIGNUP_DETAILS_PATH,
  DELIVERY_SIGNUP_DOCUMENTS_PATH,
} from './deliverySignupRule.js'

// --- the trap this fixes ---------------------------------------------------------------

// An approved rider who once opened the signup page had the flag set by that page alone.
// Both guards then redirected back to it on every load, forever.
assert.equal(
  resolveSignupResumePath({ flagSet: true, authenticated: true, status: 'approved' }),
  null,
  'an approved rider must never be sent back to signup',
)
assert.equal(
  resolveSignupResumePath({ flagSet: true, authenticated: true, status: 'active' }),
  null,
  'an active rider must never be sent back to signup',
)
assert.equal(
  resolveSignupResumePath({ flagSet: true, authenticated: true, status: 'APPROVED' }),
  null,
  'status casing must not matter',
)

// A flag with no session behind it is a leftover: signup always follows an OTP.
assert.equal(
  resolveSignupResumePath({ flagSet: true, authenticated: false, status: 'pending' }),
  null,
  'a flag without a session is stale',
)

// --- genuinely mid-signup riders are still resumed --------------------------------------

assert.equal(
  resolveSignupResumePath({ flagSet: true, authenticated: true, status: 'pending' }),
  DELIVERY_SIGNUP_DETAILS_PATH,
  'a pending rider with nothing saved resumes at step 1',
)
assert.equal(
  resolveSignupResumePath({ flagSet: true, authenticated: true, status: 'pending', hasSavedDetails: true }),
  DELIVERY_SIGNUP_DOCUMENTS_PATH,
  'a pending rider who filled step 1 resumes at documents',
)
assert.equal(
  resolveSignupResumePath({ flagSet: true, authenticated: true, status: 'blocked' }),
  DELIVERY_SIGNUP_DETAILS_PATH,
  'a blocked rider is still routed through signup, where the reason is shown',
)

// An unknown or missing status is not evidence of approval, so the flag stands.
assert.equal(
  resolveSignupResumePath({ flagSet: true, authenticated: true, status: '' }),
  DELIVERY_SIGNUP_DETAILS_PATH,
)
assert.equal(
  resolveSignupResumePath({ flagSet: true, authenticated: true, status: undefined }),
  DELIVERY_SIGNUP_DETAILS_PATH,
)

// --- no flag, no redirect ---------------------------------------------------------------

assert.equal(resolveSignupResumePath({ flagSet: false, authenticated: true, status: 'pending' }), null)
assert.equal(resolveSignupResumePath({}), null)
assert.equal(resolveSignupResumePath(), null)

console.log('deliverySignupRule: all assertions passed')

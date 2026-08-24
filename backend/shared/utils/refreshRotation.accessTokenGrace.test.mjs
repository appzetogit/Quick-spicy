// Run: node shared/utils/refreshRotation.accessTokenGrace.test.mjs
//
// The access-token middlewares (auth.js, restaurantAuth.js, deliveryAuth.js, etaAuth.js) all
// now accept a token whenever decideRotation says ROTATE or REPLAY, and reject only on
// REVOKE - this is the exact mapping they rely on, so it's worth pinning directly rather
// than only trusting decideRotation's own unit behaviour.
import assert from "node:assert/strict";
import { decideRotation, markRotated, ROTATION_DECISION } from "./refreshRotation.js";

const accepts = (decision) => decision !== ROTATION_DECISION.REVOKE;

const now = Date.now();
const account = { tokenVersion: 5 };

assert.ok(accepts(decideRotation(account, 5, now)), "current version must be accepted");
assert.ok(!accepts(decideRotation(account, 99, now)), "unrelated version must be rejected");

// A refresh happens - tokenVersion moves 5 -> 6 - while another request is still holding the
// access token that carried version 5, issued moments before. That request must not be
// treated as a stolen/reused token.
markRotated(account, now);
assert.equal(account.tokenVersion, 6);
assert.ok(
  accepts(decideRotation(account, 5, now + 500)),
  "the just-superseded version must be accepted inside the grace window",
);
assert.ok(
  !accepts(decideRotation(account, 5, now + 61_000)),
  "the same version must be rejected once the grace window has passed",
);

// A deliberate revocation (password reset) bumps tokenVersion directly, without going
// through markRotated, so it never sets previousTokenVersion for the version it kills. That
// must end the session immediately, not lease it another grace window.
const revoked = { tokenVersion: 5 };
revoked.tokenVersion = 6; // simulates the direct "+= 1" in a password-reset handler
assert.ok(
  !accepts(decideRotation(revoked, 5, now)),
  "a deliberate revocation must reject the old token immediately, no grace",
);

console.log("refreshRotation access-token grace mapping: all checks passed");

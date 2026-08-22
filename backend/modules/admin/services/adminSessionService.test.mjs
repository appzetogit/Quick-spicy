// Run: node modules/admin/services/adminSessionService.test.mjs
import assert from "node:assert/strict";

import {
  REFRESH_GRACE_MS,
  applyRefreshRotation,
  isAcceptableRefreshHash,
} from "./adminSessionService.js";

const now = Date.now();
const session = { refreshTokenHash: "h0", recentRefreshTokenHashes: [] };

assert.ok(isAcceptableRefreshHash(session, "h0", now), "current token must pass");
assert.ok(!isAcceptableRefreshHash(session, "unknown", now), "foreign token must fail");
assert.ok(!isAcceptableRefreshHash(session, null, now), "missing token must fail");

// After a rotation the superseded cookie still works briefly - this is the tab that was
// already in flight when another tab rotated. Before the grace window it got a 401 and the
// admin was bounced to the login screen.
applyRefreshRotation(session, "h1", new Date(now));
assert.equal(session.refreshTokenHash, "h1");
assert.ok(isAcceptableRefreshHash(session, "h1", now), "new token is current");
assert.ok(isAcceptableRefreshHash(session, "h0", now + 1000), "straggler inside grace");
assert.ok(
  !isAcceptableRefreshHash(session, "h0", now + REFRESH_GRACE_MS + 1),
  "grace must expire",
);

// Three tabs racing the same expiry: whichever cookie the browser ends up keeping must still
// be accepted, so the admin is never logged out by losing the race.
applyRefreshRotation(session, "h2", new Date(now));
applyRefreshRotation(session, "h3", new Date(now));
for (const hash of ["h1", "h2", "h3"]) {
  assert.ok(isAcceptableRefreshHash(session, hash, now + 1000), `${hash} survives the race`);
}

// A long-lived session must not accumulate hashes forever.
for (let i = 4; i < 20; i += 1) applyRefreshRotation(session, `h${i}`, new Date(now));
assert.ok(session.recentRefreshTokenHashes.length <= 5, "recent list stays bounded");

console.log("adminSessionService: all checks passed");

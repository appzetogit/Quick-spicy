// Run: node scripts/refreshRotation.test.mjs
//
// Pins the rule that stopped restaurant owners being logged out all day: a replay of the
// immediately-previous token within the grace window is normal life, not an attack.
import assert from "node:assert/strict";
import {
  decideRotation,
  markRotated,
  ROTATION_DECISION,
  REFRESH_GRACE_MS,
} from "../shared/utils/refreshRotation.js";

const NOW = 1_700_000_000_000;

// The happy path: the client presents the current version.
assert.equal(decideRotation({ tokenVersion: 3 }, 3, NOW), ROTATION_DECISION.ROTATE);

// The reported bug: a second tab, a retry, or a WebView that lost the new cookie presents
// the version that was current a moment ago. Must NOT kill the session.
const rotated = markRotated({ tokenVersion: 3 }, NOW);
assert.equal(rotated.tokenVersion, 4);
assert.equal(rotated.previousTokenVersion, 3);
assert.equal(decideRotation(rotated, 3, NOW + 5_000), ROTATION_DECISION.REPLAY);
assert.equal(decideRotation(rotated, 4, NOW + 5_000), ROTATION_DECISION.ROTATE);

// The security property survives: the same replay long after the rotation is genuine
// reuse of a stolen token and is still revoked.
assert.equal(
  decideRotation(rotated, 3, NOW + REFRESH_GRACE_MS + 1),
  ROTATION_DECISION.REVOKE
);

// Anything older than one rotation is revoked immediately, inside the window or not.
assert.equal(decideRotation(rotated, 1, NOW + 1_000), ROTATION_DECISION.REVOKE);
assert.equal(decideRotation(rotated, 0, NOW + 1_000), ROTATION_DECISION.REVOKE);

// Accounts that have never rotated (no previous recorded) cannot replay.
assert.equal(decideRotation({ tokenVersion: 2 }, 1, NOW), ROTATION_DECISION.REVOKE);

// Garbage in a token is revoked, never treated as version 0.
assert.equal(decideRotation({ tokenVersion: 0 }, undefined, NOW), ROTATION_DECISION.REVOKE);
assert.equal(decideRotation({ tokenVersion: 0 }, "abc", NOW), ROTATION_DECISION.REVOKE);

// A brand-new account at version 0 refreshes normally.
assert.equal(decideRotation({ tokenVersion: 0 }, 0, NOW), ROTATION_DECISION.ROTATE);

console.log("refreshRotation: all assertions passed");

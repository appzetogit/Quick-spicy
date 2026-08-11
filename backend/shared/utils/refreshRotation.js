/**
 * Refresh-token rotation with a grace window.
 *
 * Rotation alone - bump the version on every refresh, revoke on any mismatch - treats a
 * REPLAY as an ATTACK, and replays happen constantly in normal use:
 *
 *   - the restaurant app runs in a WebView that does not always persist the new cookie;
 *   - two tabs (or the app plus a background poll) refresh within milliseconds of each other;
 *   - the refresh succeeds but the response is lost to a dropped mobile connection.
 *
 * In every one of those the client still holds the immediately-previous token, presents it,
 * and the server destroys the session. That is what "the restaurant app logs out always"
 * was, and the same code sits in the customer and rider modules.
 *
 * The grace window distinguishes the two cases by AGE. A token one rotation old, presented
 * seconds after that rotation, is a replay: hand back the current tokens without rotating
 * again. Anything older is genuine reuse of a stolen token and is still revoked, so the
 * security property that matters survives.
 */

export const REFRESH_GRACE_MS = Number(process.env.REFRESH_GRACE_MS || 60_000);

export const ROTATION_DECISION = {
  ROTATE: 'rotate',
  REPLAY: 'replay',
  REVOKE: 'revoke',
};

/**
 * @param {object} account - the mongoose doc (must carry tokenVersion; may carry
 *   previousTokenVersion and tokenVersionRotatedAt)
 * @param {number|undefined} presentedVersion - tokenVersion inside the presented refresh token
 * @param {number} now - epoch ms, injectable for tests
 */
export function decideRotation(account, presentedVersion, now = Date.now()) {
  const current = Number(account?.tokenVersion || 0);
  const presented = Number(presentedVersion);

  if (!Number.isFinite(presented)) return ROTATION_DECISION.REVOKE;
  if (presented === current) return ROTATION_DECISION.ROTATE;

  const previous = account?.previousTokenVersion;
  const rotatedAt = account?.tokenVersionRotatedAt
    ? new Date(account.tokenVersionRotatedAt).getTime()
    : null;

  const isImmediatelyPrevious =
    previous !== null && previous !== undefined && Number(previous) === presented;
  const withinGrace = rotatedAt !== null && now - rotatedAt <= REFRESH_GRACE_MS;

  if (isImmediatelyPrevious && withinGrace) return ROTATION_DECISION.REPLAY;

  return ROTATION_DECISION.REVOKE;
}

/**
 * Record a rotation so the version just retired stays replayable for the grace window.
 * Mutates the doc; the caller saves it alongside its own changes.
 */
export function markRotated(account, now = Date.now()) {
  account.previousTokenVersion = Number(account.tokenVersion || 0);
  account.tokenVersion = Number(account.tokenVersion || 0) + 1;
  account.tokenVersionRotatedAt = new Date(now);
  return account;
}

export default decideRotation;

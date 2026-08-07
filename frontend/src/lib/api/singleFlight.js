/**
 * Run at most one operation per key at a time.
 *
 * Built for token refresh, where running two at once is actively harmful: refresh tokens
 * rotate, and the user endpoint treats a refresh carrying the superseded version as token
 * reuse and revokes every session. Callers that arrive while one is already running share
 * its result instead of starting their own.
 *
 * The entry is dropped once settled, so a later caller starts a fresh operation rather than
 * replaying a stale result.
 */
export function createSingleFlight(run) {
  const inFlight = new Map()

  return (key, ...args) => {
    const existing = inFlight.get(key)
    if (existing) return existing

    // Deferred through a resolved promise so a synchronous throw inside run() becomes a
    // rejection of the shared promise rather than escaping past the bookkeeping below.
    const pending = Promise.resolve()
      .then(() => run(key, ...args))
      .finally(() => {
        inFlight.delete(key)
      })

    inFlight.set(key, pending)
    return pending
  }
}

export default createSingleFlight

/**
 * What LocationGate should render. Kept pure and separate from the component so the one
 * thing that must not regress — never showing "unavailable" while we are still looking —
 * can be asserted directly. See locationGateDecision.test.mjs.
 *
 * Returns one of: "allow" | "wait" | "ask" | "retry" | "unavailable".
 */
export function decideGate({
  browseZoneId = null,
  permission = null, // null | "granted" | "prompt" | "denied"
  hasCoords = false,
  fixTimedOut = false,
  zoneStatus = "loading", // "loading" | "IN_SERVICE" | "OUT_OF_SERVICE"
  zoneError = null,
} = {}) {
  // An explicitly chosen branch is the customer saying where the food is going. It outranks
  // the detected zone and is the way out of this gate.
  if (browseZoneId) return "allow"

  if (permission === null) return "wait"
  if (permission === "denied") return "unavailable"
  if (permission !== "granted") return "ask"

  // Permission granted but no fix yet: wait, then offer a retry rather than spin forever.
  if (!hasCoords) return fixTimedOut ? "retry" : "wait"

  if (zoneStatus === "OUT_OF_SERVICE") return "unavailable"

  // zoneStatus is "loading" on first paint for every customer. Only a failed lookup
  // (zoneError) breaks out of the wait, and it fails open: a backend hiccup must not lock
  // everyone out, and the pages already refuse to show an unscoped catalogue.
  if (zoneStatus === "loading") return zoneError ? "allow" : "wait"

  return "allow"
}

export default decideGate

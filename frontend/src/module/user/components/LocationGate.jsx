import { useCallback, useEffect, useState } from "react"
import { Link, Outlet } from "react-router-dom"
import { Loader2, MapPin } from "lucide-react"
import { useLocation } from "../hooks/useLocation"
import { useZone } from "../hooks/useZone"
import { useOrderForSomeoneElse } from "../hooks/useOrderForSomeoneElse"
import { decideGate } from "./locationGateDecision"

/**
 * Gate in front of the restaurant-browsing routes.
 *
 * Restaurants are zone-scoped, so browsing them without knowing where the customer is
 * either shows another town's menu or an empty page with no explanation. This asks for
 * location first, then either lets the pages through or says plainly that we do not
 * deliver there.
 *
 * Deliberately NOT wrapped around auth, cart, orders or order tracking: a customer with a
 * live order must still be able to track it after denying location, and the escape hatch
 * (order for someone else) has to stay reachable or the gate becomes a dead end.
 */

// Longer than the hook's own 15s GPS timeout, so a slow fix is not mistaken for a failed one.
const FIX_TIMEOUT_MS = 20000

const hasPermissionsApi = typeof navigator !== "undefined" && Boolean(navigator.permissions?.query)

function Shell({ title, body, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-[#0a0a0a]">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 dark:bg-orange-950/50">
          <MapPin className="h-7 w-7 text-primary-orange" />
        </div>
        <h1 className="mt-5 text-lg font-semibold text-slate-900 dark:text-gray-100">{title}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">{body}</p>
        <div className="mt-6 space-y-3">{children}</div>
      </div>
    </div>
  )
}

function Spinner({ label }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white dark:bg-[#0a0a0a]">
      <Loader2 className="h-9 w-9 animate-spin text-primary-orange" />
      <p className="text-sm text-slate-500 dark:text-gray-400">{label}</p>
    </div>
  )
}

const primaryButton =
  "w-full rounded-xl bg-primary-orange py-3 text-sm font-semibold text-white disabled:opacity-60"
const secondaryButton =
  "block w-full rounded-xl border border-slate-300 py-3 text-sm font-medium text-slate-600 dark:border-gray-700 dark:text-gray-300"

export default function LocationGate() {
  const { location, requestLocation } = useLocation()
  const { zoneStatus, error: zoneError } = useZone(location)
  const { zoneId: browseZoneId } = useOrderForSomeoneElse()

  const [permission, setPermission] = useState(null) // null while we are still asking the browser
  const [requesting, setRequesting] = useState(false)
  const [fixTimedOut, setFixTimedOut] = useState(false)

  const hasCoords = Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)

  // Read the permission state instead of calling getCurrentPosition on load: after a denial
  // browsers silently drop repeat requests, so a blind call would hang with nothing on screen.
  useEffect(() => {
    if (!hasPermissionsApi) {
      setPermission("prompt")
      return
    }

    let cancelled = false
    let status = null
    const sync = () => {
      if (!cancelled && status) setPermission(status.state)
    }

    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (cancelled) return
        status = result
        setPermission(result.state)
        result.addEventListener("change", sync)
      })
      // Older Safari rejects for geolocation. Fall back to the explainer + explicit button,
      // which is the only thing that works there anyway.
      .catch(() => !cancelled && setPermission("prompt"))

    return () => {
      cancelled = true
      status?.removeEventListener("change", sync)
    }
  }, [])

  // Permission can be granted while the fix never arrives (indoors, GPS off, desktop).
  // Bound the wait so the gate offers a retry instead of spinning forever.
  useEffect(() => {
    if (permission !== "granted" || hasCoords) {
      setFixTimedOut(false)
      return
    }
    const timer = setTimeout(() => setFixTimedOut(true), FIX_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [permission, hasCoords])

  const allow = useCallback(async () => {
    setRequesting(true)
    try {
      const result = await requestLocation()
      if (Number.isFinite(result?.latitude) && Number.isFinite(result?.longitude)) {
        setPermission("granted")
        return
      }
      // useLocation resolves with a placeholder rather than throwing when the browser
      // refuses, so the absence of coordinates is the only signal here. Browsers with the
      // Permissions API report the real state through the change listener above; without
      // it, assume a denial so the customer is not left tapping a button the browser has
      // already decided to ignore. The unavailable screen carries a "Try again" for the
      // case where it was only a slow fix.
      if (!hasPermissionsApi) setPermission("denied")
    } catch {
      if (!hasPermissionsApi) setPermission("denied")
    } finally {
      setRequesting(false)
    }
  }, [requestLocation])

  const verdict = decideGate({ browseZoneId, permission, hasCoords, fixTimedOut, zoneStatus, zoneError })

  const explainer = (failed) => (
    <Shell
      title={failed ? "We couldn't find your location" : "Where should we deliver?"}
      body={
        failed
          ? "Check that location is switched on for this device, then try again."
          : "We use your location to show the restaurants that actually deliver to you."
      }
    >
      <button type="button" onClick={allow} disabled={requesting} className={primaryButton}>
        {requesting ? "Getting location..." : failed ? "Try again" : "Allow location"}
      </button>
      <Link to="/order-for-someone-else" className={secondaryButton}>
        Order for someone else
      </Link>
    </Shell>
  )

  const unavailable = (
    <Shell
      title="Service is currently unavailable in your area."
      body="We don't deliver here yet. You can still order to an area we cover."
    >
      <Link
        to="/order-for-someone-else"
        className={`${primaryButton} block text-center`}
      >
        Order for Someone Else
      </Link>
      <button type="button" onClick={allow} disabled={requesting} className={secondaryButton}>
        {requesting ? "Checking..." : "Try again"}
      </button>
    </Shell>
  )

  if (verdict === "unavailable") return unavailable
  if (verdict === "ask") return explainer(false)
  if (verdict === "retry") return explainer(true)
  if (verdict === "wait") {
    return <Spinner label={permission === null ? "Checking location access" : "Finding restaurants near you"} />
  }
  return <Outlet />
}

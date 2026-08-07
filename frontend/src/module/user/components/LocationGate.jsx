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

/**
 * "We haven't landed here yet" - a scout ship scanning an area we do not deliver to.
 *
 * Inline SVG and CSS keyframes rather than the animation libraries this app already
 * carries: this screen is the first thing a customer outside the service area sees, so it
 * must not wait on a lazy chunk to become something other than a blank panel.
 */
function OutOfZoneScene() {
  const stars = [
    { x: 26, y: 26, r: 1.6, d: "0s" },
    { x: 196, y: 34, r: 2, d: ".9s" },
    { x: 54, y: 14, r: 1.2, d: "1.7s" },
    { x: 168, y: 16, r: 1.4, d: "2.4s" },
    { x: 14, y: 62, r: 1.2, d: "1.2s" },
    { x: 208, y: 70, r: 1.6, d: "2s" },
  ]

  return (
    <div className="mx-auto w-full max-w-[240px]" aria-hidden="true">
      <style>{`
        @keyframes qsBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        @keyframes qsBeam { 0%,100% { opacity: .22 } 50% { opacity: .55 } }
        @keyframes qsBlink { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
        @keyframes qsTwinkle { 0%,100% { opacity: .15 } 50% { opacity: .85 } }
        @keyframes qsScan { 0%,100% { transform: scaleX(.82) } 50% { transform: scaleX(1) } }
        .qs-bob { animation: qsBob 3.6s ease-in-out infinite; }
        .qs-beam { animation: qsBeam 2.4s ease-in-out infinite; transform-origin: 112px 74px; }
        .qs-scan { animation: qsScan 2.4s ease-in-out infinite; transform-origin: 112px 74px; }
        .qs-blink { animation: qsBlink 1.6s ease-in-out infinite; }
        .qs-star { animation: qsTwinkle 2.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .qs-bob, .qs-beam, .qs-blink, .qs-star, .qs-scan { animation: none; }
        }
      `}</style>

      <svg viewBox="0 0 224 168" className="h-auto w-full" role="img">
        {stars.map((s) => (
          <circle
            key={`${s.x}-${s.y}`}
            className="qs-star fill-slate-300 dark:fill-slate-600"
            cx={s.x}
            cy={s.y}
            r={s.r}
            style={{ animationDelay: s.d }}
          />
        ))}

        {/* Ground line and the spot we cannot reach */}
        <ellipse className="fill-slate-100 dark:fill-slate-800/60" cx="112" cy="146" rx="66" ry="9" />
        <path
          className="stroke-slate-300 dark:stroke-slate-700"
          d="M112 128c-6.6 0-12-5.4-12-12 0-9 12-21 12-21s12 12 12 21c0 6.6-5.4 12-12 12z"
          fill="none"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        <g className="qs-scan">
          <g className="qs-beam">
            <path d="M96 74 L128 74 L154 142 L70 142 Z" fill="url(#qsBeamFill)" />
          </g>
        </g>

        <g className="qs-bob">
          {/* Saucer */}
          <ellipse className="fill-slate-200 dark:fill-slate-700" cx="112" cy="70" rx="52" ry="14" />
          <ellipse className="fill-slate-300 dark:fill-slate-600" cx="112" cy="66" rx="52" ry="12" />
          {/* Dome */}
          <path
            className="fill-orange-200 dark:fill-orange-900"
            d="M88 60a24 20 0 0 1 48 0z"
          />
          <path
            className="fill-orange-100 dark:fill-orange-800"
            d="M96 60a16 13 0 0 1 32 0z"
            opacity="0.85"
          />
          {/* Running lights */}
          {[78, 112, 146].map((cx, i) => (
            <circle
              key={cx}
              className="qs-blink"
              cx={cx}
              cy={72}
              r="3.4"
              fill="#EB590E"
              style={{ animationDelay: `${i * 0.35}s` }}
            />
          ))}
        </g>

        <defs>
          <linearGradient id="qsBeamFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#EB590E" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#EB590E" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

function Shell({ title, body, children, scene = null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-[#0a0a0a]">
      <div className="w-full max-w-sm text-center">
        {scene || (
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 dark:bg-orange-950/50">
            <MapPin className="h-7 w-7 text-primary-orange" />
          </div>
        )}
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
      scene={<OutOfZoneScene />}
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

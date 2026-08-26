import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"

/**
 * Keep the phone's back button inside the app.
 *
 * Inside the Flutter WebView the hardware back key pops browser history. When the
 * current screen is the FIRST entry there is nothing to pop, so the WebView itself
 * closes and the app appears to crash - the reported "app closes when I press back".
 * That happens on any cold entry: a deep link, a notification tap, or a redirect that
 * replaced history on the way in.
 *
 * The guard inserts a home screen underneath: replace the current entry with home, then
 * push the real screen back on top. History becomes [home, current], the customer still
 * sees `current`, and the first back press lands on home instead of exiting.
 *
 * Nothing changes when there IS history behind the screen - back still returns to
 * wherever the customer actually came from. A back press from the home screen itself is
 * a genuine exit and is left alone.
 *
 * This was originally written inline in the user module's UserLayout; the delivery and
 * restaurant modules had no equivalent and still carry the crash.
 * See BUGFIX_IMPLEMENTATION_GUIDE.md #019.
 *
 * @param {string} homePath   Where "home" is for this module, e.g. "/delivery".
 * @param {string[]} [homeAliases]  Extra paths that count as home (no guard needed there).
 */
export function useAppBackGuard(homePath, homeAliases = []) {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!homePath) return

    const isHome =
      location.pathname === homePath ||
      location.pathname === `${homePath}/` ||
      homeAliases.includes(location.pathname)

    const idx = window.history.state?.idx
    if (isHome || typeof idx !== "number" || idx > 0) return

    const current = location.pathname + location.search + location.hash

    navigate(homePath, { replace: true })
    navigate(current)
    // Intentionally keyed on pathname only: the guard is about how the screen was
    // entered, not about query-string changes within it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])
}

export default useAppBackGuard

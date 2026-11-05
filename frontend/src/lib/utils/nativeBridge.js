/**
 * Calls into the Flutter InAppWebView shell, bounded.
 *
 * `window.flutter_inappwebview.callHandler(...)` returns a promise that only the
 * native side can settle. Nothing guarantees it ever will: a shell build without
 * that handler registered, a permission the OS denied without telling the page, or
 * a crash inside the native picker all leave it pending forever. Awaiting it
 * directly then hangs the screen with no error and no way back - which is exactly
 * how a rider ended up stuck on "Uploading..." mid-delivery, unable to confirm the
 * order or reach the customer.
 *
 * Every call through here either settles or rejects with BRIDGE_TIMEOUT, so callers
 * can fall back to the ordinary browser control.
 */

export const BRIDGE_TIMEOUT = 'BRIDGE_TIMEOUT'

// Long enough for someone to actually take a photo, short enough that a bridge
// which is never going to answer does not hold the screen indefinitely.
export const NATIVE_BRIDGE_TIMEOUT_MS = 30000

export const hasNativeBridge = () =>
  typeof window !== 'undefined' &&
  !!window.flutter_inappwebview &&
  typeof window.flutter_inappwebview.callHandler === 'function'

export const isBridgeTimeout = (error) => error?.message === BRIDGE_TIMEOUT

/**
 * @throws {Error} with message BRIDGE_TIMEOUT if the shell does not answer in time.
 */
export const callNativeHandler = (handlerName, payload, timeoutMs = NATIVE_BRIDGE_TIMEOUT_MS) => {
  if (!hasNativeBridge()) {
    return Promise.reject(new Error('NO_NATIVE_BRIDGE'))
  }

  let timer = null
  return Promise.race([
    window.flutter_inappwebview.callHandler(handlerName, payload),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(BRIDGE_TIMEOUT)), timeoutMs)
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/** The camera specifically, since every caller passes the same options. */
export const openNativeCamera = (options = {}) =>
  callNativeHandler('openCamera', {
    source: 'camera',
    accept: 'image/*',
    multiple: false,
    quality: 0.8,
    ...options,
  })

/**
 * Open an external URL (maps, tel, web) without destroying the app.
 *
 * Inside the Flutter InAppWebView `window.open(url, "_blank")` returns null, because
 * the shell has no popup support. Callers that then fell back to
 * `window.location.href = url` navigated the WEBVIEW ITSELF to Google Maps - so the
 * app was replaced, and its URL became the maps link. Coming back re-loaded that
 * link and put the rider in front of the maps/app-chooser screen again instead of
 * their order. The order state was never the problem; the app had simply been
 * navigated away from.
 *
 * Inside the shell we therefore prefer to leave window.location alone: we ask the
 * native side to open the URL, then click a target="_blank" anchor, so the app stays
 * loaded underneath and returning shows exactly what the rider left.
 *
 * Neither of those can report failure, though. A bridge call can resolve without
 * anything having opened, and a _blank click is a silent no-op in a shell without
 * multiple-window support - which left the rider tapping the map button with nothing
 * happening. So success is judged by whether the app actually lost the foreground. If
 * it did not, navigating the WebView is the last resort: being able to reach the map
 * matters more mid-delivery than keeping the page underneath it.
 */
const NATIVE_OPEN_TIMEOUT_MS = 1500
const ANCHOR_OPEN_GRACE_MS = 1000

const clickBlankAnchor = (target) => {
  const anchor = document.createElement('a')
  anchor.href = target
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export const openExternalUrl = async (url) => {
  const target = String(url || '').trim()
  if (!target) return false

  if (hasNativeBridge()) {
    let leftApp = false
    const markLeft = () => { leftApp = true }
    const markIfHidden = () => { if (document.visibilityState === 'hidden') leftApp = true }
    window.addEventListener('blur', markLeft)
    window.addEventListener('pagehide', markLeft)
    document.addEventListener('visibilitychange', markIfHidden)

    try {
      try {
        const opened = await callNativeHandler('openExternalUrl', { url: target }, NATIVE_OPEN_TIMEOUT_MS)
        // Only an explicit yes counts: a handler the shell never registered can
        // resolve empty without having opened anything.
        if (opened === true || opened?.success === true || leftApp) return true
      } catch {
        // No handler answered. Fall through to the anchor.
      }

      try {
        clickBlankAnchor(target)
      } catch {
        // Fall through to the grace check and the last resort.
      }

      await new Promise((resolve) => setTimeout(resolve, ANCHOR_OPEN_GRACE_MS))
      if (leftApp) return true

      window.location.href = target
      return true
    } finally {
      window.removeEventListener('blur', markLeft)
      window.removeEventListener('pagehide', markLeft)
      document.removeEventListener('visibilitychange', markIfHidden)
    }
  }

  // An ordinary browser: a blocked popup here is safe to resolve by navigating,
  // because there is no native app whose state we would be destroying.
  const popup = window.open(target, '_blank', 'noopener,noreferrer')
  if (!popup) {
    window.location.href = target
  }
  return true
}

export default callNativeHandler

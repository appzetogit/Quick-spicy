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
 * Inside the shell we therefore never touch window.location. We ask the native side
 * to open it, and failing that click a target="_blank" anchor, which InAppWebView
 * surfaces to the OS through its own URL handling. Either way the app stays loaded
 * underneath, so returning shows exactly what the rider left.
 */
export const openExternalUrl = async (url) => {
  const target = String(url || '').trim()
  if (!target) return false

  if (hasNativeBridge()) {
    // Short timeout: if the shell has no such handler we want the fallback quickly,
    // not a 30-second wait with nothing happening.
    try {
      await callNativeHandler('openExternalUrl', { url: target }, 2500)
      return true
    } catch {
      // fall through to the anchor
    }

    try {
      const anchor = document.createElement('a')
      anchor.href = target
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      return true
    } catch {
      return false
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

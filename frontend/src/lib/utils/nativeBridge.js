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

export default callNativeHandler

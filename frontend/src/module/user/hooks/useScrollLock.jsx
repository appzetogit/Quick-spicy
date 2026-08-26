import { useEffect } from "react"

/**
 * Lock background page scrolling while an overlay is open.
 *
 * Opening the store's category sheet used to leave the page behind it scrollable,
 * so dragging inside the sheet scrolled the menu underneath and the customer lost
 * their place. See BUGFIX_IMPLEMENTATION_GUIDE.md #014.
 *
 * `overflow: hidden` on its own is not enough - iOS Safari happily scrolls the
 * body anyway. The reliable approach is to take the body out of flow with
 * `position: fixed` and offset it by the current scroll position, so the page
 * appears frozen exactly where it was.
 *
 * That offset MUST be restored on close, otherwise the page jumps to the top the
 * moment the sheet is dismissed - the classic regression with this pattern.
 *
 * Nested/concurrent overlays are reference-counted: the lock is applied when the
 * first one opens and only released when the last one closes, so a filter sheet
 * opening over a menu sheet cannot unlock the page early.
 *
 * @param {boolean} isLocked
 */
export function useScrollLock(isLocked) {
  useEffect(() => {
    if (!isLocked) return
    if (typeof document === "undefined") return

    const body = document.body
    const scrollY = window.scrollY || window.pageYOffset || 0

    const depth = Number(body.dataset.scrollLockDepth || 0)
    body.dataset.scrollLockDepth = String(depth + 1)

    // Only the outermost lock touches the styles; inner ones just bump the count.
    if (depth === 0) {
      body.dataset.scrollLockY = String(scrollY)
      body.dataset.scrollLockPrevPosition = body.style.position || ""
      body.dataset.scrollLockPrevTop = body.style.top || ""
      body.dataset.scrollLockPrevWidth = body.style.width || ""
      body.dataset.scrollLockPrevOverflow = body.style.overflow || ""

      body.style.position = "fixed"
      body.style.top = `-${scrollY}px`
      body.style.width = "100%"
      body.style.overflow = "hidden"
    }

    return () => {
      const current = Number(body.dataset.scrollLockDepth || 1)
      const next = current - 1

      if (next > 0) {
        body.dataset.scrollLockDepth = String(next)
        return
      }

      const restoreY = Number(body.dataset.scrollLockY || 0)

      body.style.position = body.dataset.scrollLockPrevPosition || ""
      body.style.top = body.dataset.scrollLockPrevTop || ""
      body.style.width = body.dataset.scrollLockPrevWidth || ""
      body.style.overflow = body.dataset.scrollLockPrevOverflow || ""

      delete body.dataset.scrollLockDepth
      delete body.dataset.scrollLockY
      delete body.dataset.scrollLockPrevPosition
      delete body.dataset.scrollLockPrevTop
      delete body.dataset.scrollLockPrevWidth
      delete body.dataset.scrollLockPrevOverflow

      // Put the customer back exactly where they were.
      window.scrollTo(0, restoreY)
    }
  }, [isLocked])
}

export default useScrollLock

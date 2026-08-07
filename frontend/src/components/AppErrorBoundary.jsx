import { Component } from "react"

/**
 * Root error boundary.
 *
 * Every page in this app is behind React.lazy(), and a failed dynamic import throws during
 * render. With no boundary anywhere in the tree, React unmounted the whole app and left the
 * customer staring at a blank white page with no way out but a manual refresh - which is
 * exactly the "app doesn't load, white screen" report.
 *
 * Two different failures end up here:
 *
 * - A chunk that cannot be fetched. Almost always a stale tab after a deploy: the browser
 *   still holds an index.html referencing hashed chunks that no longer exist. Reloading
 *   fetches the new index.html and fixes it, so we do that once, automatically. The
 *   sessionStorage marker stops a genuinely missing chunk from becoming a reload loop.
 * - A real render error. Nothing to retry, so show something honest with a way forward.
 */

const CHUNK_ERROR = /loading chunk|loading css chunk|dynamically imported module|importing a module script failed|failed to fetch dynamically/i

const RELOAD_MARKER = "chunkReloadAttemptedAt"
// Long enough that a second failure is a real bug rather than the same stale deploy, short
// enough that a customer hitting this next week still gets the automatic recovery.
const RELOAD_COOLDOWN_MS = 60 * 1000

const isChunkError = (error) =>
  CHUNK_ERROR.test(String(error?.message || "")) || CHUNK_ERROR.test(String(error?.name || ""))

const recentlyReloaded = () => {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_MARKER))
    return Number.isFinite(at) && Date.now() - at < RELOAD_COOLDOWN_MS
  } catch {
    // Storage unavailable (private mode): treat as not reloaded and accept one retry.
    return false
  }
}

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false, stale: false }
  }

  static getDerivedStateFromError(error) {
    return { failed: true, stale: isChunkError(error) }
  }

  componentDidCatch(error) {
    if (!isChunkError(error) || recentlyReloaded()) return
    try {
      sessionStorage.setItem(RELOAD_MARKER, String(Date.now()))
    } catch {
      // Without storage we cannot guard against a loop, so do not auto-reload at all.
      return
    }
    window.location.reload()
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-[#0a0a0a]">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-gray-100">
            {this.state.stale ? "Updating to the latest version" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
            {this.state.stale
              ? "This tab was running an older version of the app. Reload to continue."
              : "The page failed to load. Reloading usually fixes it."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 w-full rounded-xl bg-[#EB590E] py-3 text-sm font-semibold text-white"
          >
            Reload
          </button>
          <a
            href="/"
            className="mt-3 block w-full rounded-xl border border-slate-300 py-3 text-sm font-medium text-slate-600 dark:border-gray-700 dark:text-gray-300"
          >
            Go to home
          </a>
        </div>
      </div>
    )
  }
}

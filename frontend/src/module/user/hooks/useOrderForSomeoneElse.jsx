import { useCallback, useEffect, useState } from "react"

/**
 * "Order for someone else" mode.
 *
 * Two separate things live here, and conflating them was a mistake worth spelling out.
 *
 * `zoneId` is simply the branch being browsed. Customers may switch branch freely; browsing
 * another area is harmless because order creation independently resolves the zone from the
 * delivery address, so an undeliverable order is refused at checkout regardless.
 *
 * `active` means the customer said they are ordering for somebody else, which is what makes
 * checkout ask for the recipient's name and number. Browsing a branch must not imply that:
 * someone looking at another town out of curiosity should not be asked who they are buying
 * for.
 */
const STORAGE_KEY = "orderForSomeoneElse"
const CHANGE_EVENT = "orderForSomeoneElseChanged"

const EMPTY = { active: false, zoneId: null, zoneName: "", recipient: { name: "", phone: "", note: "" } }

const read = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return EMPTY
    return {
      active: parsed.active === true,
      zoneId: parsed.zoneId ? String(parsed.zoneId) : null,
      zoneName: parsed.zoneName || "",
      recipient: {
        name: parsed.recipient?.name || "",
        phone: parsed.recipient?.phone || "",
        note: parsed.recipient?.note || "",
      },
    }
  } catch {
    return EMPTY
  }
}

const write = (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Storage unavailable (private mode): the mode simply will not persist across reloads.
  }
  // Same-tab listeners; the storage event only fires in other tabs.
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useOrderForSomeoneElse() {
  const [state, setState] = useState(read)

  useEffect(() => {
    const sync = () => setState(read())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  // Explicit "ordering for someone else": browse that branch AND collect recipient details.
  const startForZone = useCallback((zoneId, zoneName = "") => {
    write({ ...read(), active: true, zoneId: zoneId ? String(zoneId) : null, zoneName })
  }, [])

  // Plain branch switching from the home page. Changes what is shown and nothing else.
  const setBrowseZone = useCallback((zoneId, zoneName = "") => {
    write({ ...read(), active: false, zoneId: zoneId ? String(zoneId) : null, zoneName })
  }, [])

  // Back to the customer's own detected area.
  const clearBrowseZone = useCallback(() => {
    write({ ...read(), active: false, zoneId: null, zoneName: "" })
  }, [])

  const setRecipient = useCallback((recipient) => {
    write({ ...read(), recipient: { ...read().recipient, ...recipient } })
  }, [])

  // Called after a successful order too, so the next order defaults back to ordering for
  // yourself rather than silently staying in another zone.
  const clear = useCallback(() => write(EMPTY), [])

  return { ...state, startForZone, setBrowseZone, clearBrowseZone, setRecipient, clear }
}

export default useOrderForSomeoneElse

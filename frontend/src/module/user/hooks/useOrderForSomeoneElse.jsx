import { useCallback, useEffect, useState } from "react"

/**
 * "Order for someone else" mode.
 *
 * Restaurant visibility normally follows the customer's GPS zone, because letting people
 * browse any zone is what produced orders from hundreds of kilometres away that restaurants
 * had to cancel after cooking. This mode is the sanctioned exception: the customer states up
 * front that they are ordering for another person, picks that person's zone, and supplies
 * the recipient's details at checkout.
 *
 * It only widens what is *shown*. The order itself is still validated against the delivery
 * address on the server, so nothing here can place an undeliverable order.
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

  const startForZone = useCallback((zoneId, zoneName = "") => {
    write({ ...read(), active: true, zoneId: zoneId ? String(zoneId) : null, zoneName })
  }, [])

  const setRecipient = useCallback((recipient) => {
    write({ ...read(), recipient: { ...read().recipient, ...recipient } })
  }, [])

  // Called after a successful order too, so the next order defaults back to ordering for
  // yourself rather than silently staying in another zone.
  const clear = useCallback(() => write(EMPTY), [])

  return { ...state, startForZone, setRecipient, clear }
}

export default useOrderForSomeoneElse

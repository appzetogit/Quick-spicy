const STORAGE_KEY = "pending_wallet_topup"

export function savePendingWalletTopup(data) {
  if (typeof window === "undefined" || !window.localStorage) {
    return
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        cashfreeOrderId: data.cashfreeOrderId,
        amount: data.amount ?? null,
        createdAt: Date.now(),
      }),
    )
  } catch {}
}

export function getPendingWalletTopup() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearPendingWalletTopup() {
  if (typeof window === "undefined" || !window.localStorage) {
    return
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

/**
 * Estimated delivery time input.
 *
 * The field was plain free text in three places - restaurant onboarding, admin add
 * restaurant, and the admin restaurant details form - so whatever was typed went
 * straight to customers. One live restaurant reads "Ergggvcf" where the delivery
 * estimate should be.
 *
 * It is also parsed as a number elsewhere: the Under-30-minutes filter does
 * `estimatedDeliveryTime.match(/(\d+)/)` and compares it, so a non-numeric value
 * silently drops the restaurant out of that filter rather than erroring.
 *
 * Accepted shapes are "25" or a "25-30" range. The " mins" suffix is added on display,
 * not stored, so existing records that already contain it still parse.
 */

const MAX_MINUTES = 180

/**
 * Strip anything that is not a digit or a single range hyphen, as the user types.
 * Deliberately permissive mid-typing - "25-" is allowed so a range can be entered -
 * and validated properly on save.
 *
 * @param {string} raw
 * @returns {string}
 */
export const sanitizeDeliveryTimeInput = (raw) => {
  let value = String(raw ?? "").replace(/[^\d-]/g, "")

  // Only one hyphen, never leading.
  value = value.replace(/^-+/, "")
  const firstHyphen = value.indexOf("-")
  if (firstHyphen !== -1) {
    value = value.slice(0, firstHyphen + 1) + value.slice(firstHyphen + 1).replace(/-/g, "")
  }

  // Keep each side to three digits; nobody quotes a four-digit minute estimate.
  const [low = "", high] = value.split("-")
  const clampPart = (part) => part.slice(0, 3)
  return high === undefined ? clampPart(low) : `${clampPart(low)}-${clampPart(high)}`
}

/**
 * Validate a sanitized value on save.
 * @returns {{ valid: boolean, error: string }}
 */
export const validateDeliveryTime = (raw) => {
  const value = sanitizeDeliveryTimeInput(raw)
  if (!value) return { valid: false, error: "Enter the estimated delivery time in minutes." }

  const parts = value.split("-")
  const numbers = parts.map((p) => Number(p))

  if (parts.some((p) => p === "") || numbers.some((n) => !Number.isFinite(n))) {
    return { valid: false, error: "Enter minutes as a number, for example 25 or 25-30." }
  }
  if (numbers.some((n) => n < 1)) {
    return { valid: false, error: "Delivery time must be at least 1 minute." }
  }
  if (numbers.some((n) => n > MAX_MINUTES)) {
    return { valid: false, error: `Delivery time cannot be more than ${MAX_MINUTES} minutes.` }
  }
  if (numbers.length === 2 && numbers[1] <= numbers[0]) {
    return { valid: false, error: "The second number must be larger than the first." }
  }

  return { valid: true, error: "" }
}

/**
 * What gets stored, so the existing display and the under-30-mins filter keep working.
 * @returns {string} e.g. "25-30 mins"
 */
export const formatDeliveryTimeForSave = (raw) => {
  const value = sanitizeDeliveryTimeInput(raw)
  if (!value) return ""
  return `${value} mins`
}

/** Pull the editable digits back out of a stored "25-30 mins". */
export const parseDeliveryTimeValue = (stored) =>
  sanitizeDeliveryTimeInput(String(stored ?? "").replace(/mins?/i, ""))

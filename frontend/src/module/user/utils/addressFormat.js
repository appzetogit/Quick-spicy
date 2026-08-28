/**
 * One place to turn a saved-address record into a readable line.
 *
 * Address records here overlap by construction: `additionalDetails` is usually the
 * complete formatted address, `street` frequently holds a Google Plus Code
 * ("PV6X+9XP"), and city/state/pincode are stored again individually. Every screen
 * that concatenated these fields shipped the same bug independently - the cart
 * header read "Cumbum, Andhra Pradesh 523333, Cumbum, Cumbum, Andhra Pradesh,
 * 523333, Cumbum, Andhra Pradesh, 523333", and the address book showed the same
 * thing. Two copies of the formatter had already diverged, which is how the fix
 * landed in one screen and not the other.
 */

// Open Location Code, e.g. "PV6X+9XP" - a machine reverse-geocode, not a street a
// person would recognise. Restricted alphabet: 23456789CFGHJMPQRVWX.
const PLUS_CODE_RE = /\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/gi

const stripPlusCodes = (value) =>
  String(value || "")
    .replace(PLUS_CODE_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim()

/**
 * Collapse repetition inside an already-joined address string, keeping first order.
 * Comma-separated tokens are compared case-insensitively, so
 * "Cumbum, Cumbum, Andhra Pradesh 523333, Cumbum" becomes "Cumbum, Andhra Pradesh 523333".
 *
 * @param {string} text
 * @returns {string}
 */
export const dedupeAddressText = (text) => {
  const kept = []
  for (const raw of stripPlusCodes(text).split(",")) {
    const t = raw.trim()
    if (!t) continue
    const key = t.toLowerCase()
    // Redundant when: an exact repeat; a token a kept token already begins with
    // ("Andhra Pradesh" next to "Andhra Pradesh 523333"); or an extension of a kept
    // token whose extra words all appear elsewhere in the line ("Andhra Pradesh
    // 523333" when both "Andhra Pradesh" and "523333" are already kept).
    const lineSoFar = kept.join(", ").toLowerCase()
    const redundant = kept.some((k) => {
      const kl = k.toLowerCase()
      if (kl === key || kl.startsWith(key + " ")) return true
      if (key.startsWith(kl + " ")) {
        const extraWords = key.slice(kl.length).trim().split(/\s+/)
        return extraWords.every((w) => lineSoFar.includes(w))
      }
      return false
    })
    if (!redundant) kept.push(t)
  }
  return kept.join(", ").replace(/,\s*India\s*$/i, "").trim()
}

/**
 * One readable line for a saved address record.
 *
 * Fields are added only when the line so far does not already contain them, then a
 * token pass collapses repetition the records carry internally. Lines that are only
 * a Plus Code drop out entirely.
 *
 * @param {object} address
 * @returns {string}
 */
export const formatSavedAddressLine = (address = {}) => {
  const parts = []
  for (const raw of [address.additionalDetails, address.street, address.city, address.state, address.zipCode]) {
    const value = stripPlusCodes(raw)
    if (!value) continue
    if (parts.join(", ").toLowerCase().includes(value.toLowerCase())) continue
    parts.push(value)
  }
  return dedupeAddressText(parts.join(", "))
}

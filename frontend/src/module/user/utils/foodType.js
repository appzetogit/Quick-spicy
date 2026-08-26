/**
 * Food type (Veg / Non-Veg) resolution.
 *
 * Menu items arrive from the store API carrying `foodType: "Veg" | "Non-Veg"`.
 * Cart/order payloads carry a boolean `isVeg`. Older records carry neither.
 *
 * Historically the cart normalised with `item.isVeg !== false`, which resolves
 * `undefined` to `true` - so every item added from a store menu (where only
 * `foodType` exists) was marked Veg. Non-veg items rendered with a green
 * indicator. See BUGFIX_IMPLEMENTATION_GUIDE.md #032.
 *
 * Rule: never default an unknown food type to Veg. Return null and let the
 * caller render nothing. A missing marker is a gap; a wrong veg marker is a
 * broken promise to the customer.
 */

/**
 * @param {object} item
 * @returns {boolean|null} true = veg, false = non-veg, null = unknown
 */
export const resolveIsVeg = (item) => {
  if (!item || typeof item !== "object") return null

  // Explicit boolean wins - it is the already-resolved value.
  if (typeof item.isVeg === "boolean") return item.isVeg

  // Menu items from the store API.
  const foodType = String(item.foodType ?? "").trim().toLowerCase()
  if (foodType === "veg") return true
  if (foodType === "non-veg" || foodType === "nonveg" || foodType === "non veg") return false

  // Legacy order records used `category` / `type`.
  const legacy = String(item.category ?? item.type ?? "").trim().toLowerCase()
  if (legacy === "veg") return true
  if (legacy === "non-veg" || legacy === "nonveg" || legacy === "non veg") return false

  return null
}

/**
 * Boolean form for API payloads, where the field is typed `Boolean`.
 * Unknown resolves to `false` rather than `true`: the server re-derives the
 * authoritative value from the menu record (orderCalculationService), so an
 * unknown here is never persisted as a false "Veg" claim.
 *
 * @param {object} item
 * @returns {boolean}
 */
export const resolveIsVegForPayload = (item) => resolveIsVeg(item) === true

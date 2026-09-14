/**
 * Reads the browser's view of a rider's signup state and applies the rule in
 * deliverySignupRule.js. Both guards that redirect riders - DeliverySignupFlowGuard in
 * App.jsx and AuthRedirect - go through this, so there is one rule rather than three
 * copies drifting apart.
 */
import { isModuleAuthenticated } from "@/lib/utils/auth"
import { resolveSignupResumePath } from "@/lib/utils/deliverySignupRule"

const readStoredDeliveryUser = () => {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem("delivery_user")
      if (raw) return JSON.parse(raw)
    } catch {
      // Unreadable or unparseable storage is treated as "no opinion".
    }
  }
  return null
}

const clearSignupFlag = () => {
  try {
    localStorage.removeItem("delivery_signup_required")
  } catch {
    // Nothing useful to do if storage refuses the write.
  }
}

/**
 * @returns {string|null} the path to resume signup at, or null when this rider is not
 * mid-signup and should be left alone.
 */
export const getDeliverySignupResumePath = () => {
  const flagSet = localStorage.getItem("delivery_signup_required") === "true"
  if (!flagSet) return null

  const resumePath = resolveSignupResumePath({
    flagSet,
    authenticated: isModuleAuthenticated("delivery"),
    status: readStoredDeliveryUser()?.status,
    hasSavedDetails: Boolean(sessionStorage.getItem("deliverySignupDetails")),
  })

  // The flag was set but does not describe a live signup - drop it so this is decided
  // once rather than on every render.
  if (!resumePath) clearSignupFlag()

  return resumePath
}

export default getDeliverySignupResumePath

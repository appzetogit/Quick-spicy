/**
 * The rule deciding whether a rider is mid-signup, kept free of storage and imports so it
 * can be tested directly. deliverySignup.js reads the browser state and applies it.
 *
 * `delivery_signup_required` is written by the signup screens themselves, so it outlives
 * the signup it described. Two guards redirect on it - DeliverySignupFlowGuard in App.jsx
 * and AuthRedirect - and when both trusted the flag alone, riders got trapped: opening
 * /delivery/signup/details set it, and every load afterwards bounced back to that form.
 * An approved rider could not reach the app again.
 */

/** Statuses meaning an admin has already decided; nothing is pending from the rider. */
export const SETTLED_DELIVERY_STATUSES = ['approved', 'active']

export const DELIVERY_SIGNUP_DETAILS_PATH = '/delivery/signup/details'
export const DELIVERY_SIGNUP_DOCUMENTS_PATH = '/delivery/signup/documents'

/**
 * @param {object} state
 * @param {boolean} state.flagSet          delivery_signup_required is "true"
 * @param {boolean} state.authenticated    a delivery session exists
 * @param {string}  state.status           status last reported for the account
 * @param {boolean} state.hasSavedDetails  step 1 was filled in earlier
 * @returns {string|null} path to resume at, or null to leave the rider alone
 */
export const resolveSignupResumePath = ({
  flagSet = false,
  authenticated = false,
  status = '',
  hasSavedDetails = false,
} = {}) => {
  if (!flagSet) return null

  // Signing up requires having verified an OTP first, so a flag with no session behind it
  // is left over from an abandoned attempt rather than a signup in progress.
  if (!authenticated) return null

  // An approved rider is not mid-signup, whatever the flag says.
  if (SETTLED_DELIVERY_STATUSES.includes(String(status || '').toLowerCase())) return null

  return hasSavedDetails ? DELIVERY_SIGNUP_DOCUMENTS_PATH : DELIVERY_SIGNUP_DETAILS_PATH
}

export default resolveSignupResumePath

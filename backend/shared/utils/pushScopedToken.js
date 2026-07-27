import jwtService from "../../modules/auth/services/jwtService.js";

export const PUSH_TOKEN_SCOPE = "fcm";

/**
 * Mint a token whose only power is registering an FCM push token.
 *
 * The native apps register their FCM token by calling the API directly. Their HTTP client
 * does not share the WebView cookie jar, so they read a bearer token out of localStorage
 * instead, which puts it in reach of any script running on the page. This is deliberately
 * NOT the session access token: paired with assertPushScopeViolation below, a stolen copy
 * can register a push token and nothing else.
 */
export const mintPushScopedToken = (userId, role) =>
  jwtService.generateAccessToken({
    userId: String(userId),
    role,
    scope: PUSH_TOKEN_SCOPE,
  });

/**
 * True when a push-scoped token is being used somewhere it has no business being.
 * Every FCM registration route across user, restaurant and delivery contains "/fcm-token",
 * so one check covers all of them; anything else is a violation.
 */
export const isPushScopeViolation = (decoded, originalUrl) =>
  decoded?.scope === PUSH_TOKEN_SCOPE &&
  !String(originalUrl || "").includes("/fcm-token");

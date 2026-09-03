const ACCESS_TOKEN_COOKIE_BY_ROLE = {
  user: "user_access_token",
  restaurant: "restaurant_access_token",
  delivery: "delivery_access_token",
  admin: "admin_access_token",
};

const REFRESH_TOKEN_COOKIE_BY_ROLE = {
  user: "user_refresh_token",
  restaurant: "restaurant_refresh_token",
  delivery: "delivery_refresh_token",
  admin: "admin_refresh_token",
};

const LEGACY_ACCESS_COOKIES = ["accessToken", "adminAccessToken"];
const LEGACY_REFRESH_COOKIES = ["refreshToken"];

// The frontend (Vercel) and this API (api.quickspicy.in) are different sites, so auth
// cookies must be SameSite=None or the browser drops them on every cross-site XHR.
// Browsers only accept SameSite=None together with Secure, so the two move as a pair.
// Set CROSS_SITE_COOKIES=false for local http dev, where Secure cookies can't be set.
const crossSiteCookies = process.env.CROSS_SITE_COOKIES !== "false";

const buildCookieOptions = (maxAge = null) => {
  const options = {
    httpOnly: true,
    secure: crossSiteCookies,
    sameSite: crossSiteCookies ? "none" : "lax",
    path: "/",
  };

  if (Number.isFinite(maxAge) && maxAge > 0) {
    options.maxAge = maxAge;
  }

  return options;
};

const resolveRoleCookieName = (map, role) => {
  const cookieName = map[role];
  if (!cookieName) {
    throw new Error(`Unsupported auth cookie role: ${role}`);
  }
  return cookieName;
};

export const getAccessCookieName = (role) =>
  resolveRoleCookieName(ACCESS_TOKEN_COOKIE_BY_ROLE, role);

export const getRefreshCookieName = (role) =>
  resolveRoleCookieName(REFRESH_TOKEN_COOKIE_BY_ROLE, role);

// The refresh cookie has to outlive the refresh token, or the browser throws the
// cookie away first and the longer token never gets used - the session would still
// end at 7 days and the OTP would still be sent. Admins keep the short window.
// Match the access token's own lifetime, or the browser bins the cookie while the
// token inside it is still perfectly valid.
const ACCESS_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_ACCESS_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const REFRESH_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const ADMIN_REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const accessCookieMaxAge = (role) =>
  String(role || '').toLowerCase() === 'admin'
    ? ADMIN_ACCESS_COOKIE_MAX_AGE_MS
    : ACCESS_COOKIE_MAX_AGE_MS;

const refreshCookieMaxAge = (role) =>
  String(role || '').toLowerCase() === 'admin'
    ? ADMIN_REFRESH_COOKIE_MAX_AGE_MS
    : REFRESH_COOKIE_MAX_AGE_MS;

export const setAuthCookies = (res, role, tokens = {}) => {
  const { accessToken = null, refreshToken = null } = tokens;

  if (accessToken) {
    res.cookie(
      getAccessCookieName(role),
      accessToken,
      buildCookieOptions(accessCookieMaxAge(role)),
    );
  }

  if (refreshToken) {
    res.cookie(
      getRefreshCookieName(role),
      refreshToken,
      buildCookieOptions(refreshCookieMaxAge(role)),
    );
  }
};

export const clearAuthCookies = (res, role) => {
  const clearOptions = buildCookieOptions();
  const cookieNames = [
    getAccessCookieName(role),
    getRefreshCookieName(role),
    ...LEGACY_ACCESS_COOKIES,
    ...LEGACY_REFRESH_COOKIES,
  ];

  cookieNames.forEach((cookieName) => {
    res.clearCookie(cookieName, clearOptions);
  });
};

export const getAccessTokenFromRequest = (req, role) => {
  const roleCookie = req.cookies?.[getAccessCookieName(role)];
  if (roleCookie) return roleCookie;

  for (const cookieName of LEGACY_ACCESS_COOKIES) {
    const legacyCookie = req.cookies?.[cookieName];
    if (legacyCookie) return legacyCookie;
  }

  return null;
};

export const getRefreshTokenFromRequest = (req, role) => {
  const roleCookie = req.cookies?.[getRefreshCookieName(role)];
  if (roleCookie) return roleCookie;

  for (const cookieName of LEGACY_REFRESH_COOKIES) {
    const legacyCookie = req.cookies?.[cookieName];
    if (legacyCookie) return legacyCookie;
  }

  return null;
};

export const parseCookieHeader = (cookieHeader = "") => {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) return cookies;

      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      if (!name) return cookies;

      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
};

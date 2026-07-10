const ACCESS_TOKEN_COOKIE_BY_ROLE = {
  user: "user_access_token",
  restaurant: "restaurant_access_token",
  delivery: "delivery_access_token",
};

const REFRESH_TOKEN_COOKIE_BY_ROLE = {
  user: "user_refresh_token",
  restaurant: "restaurant_refresh_token",
  delivery: "delivery_refresh_token",
};

const LEGACY_ACCESS_COOKIES = ["accessToken"];
const LEGACY_REFRESH_COOKIES = ["refreshToken"];

const buildCookieOptions = (maxAge = null) => {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
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

export const setAuthCookies = (res, role, tokens = {}) => {
  const { accessToken = null, refreshToken = null } = tokens;

  if (accessToken) {
    res.cookie(
      getAccessCookieName(role),
      accessToken,
      buildCookieOptions(15 * 60 * 1000),
    );
  }

  if (refreshToken) {
    res.cookie(
      getRefreshCookieName(role),
      refreshToken,
      buildCookieOptions(7 * 24 * 60 * 60 * 1000),
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

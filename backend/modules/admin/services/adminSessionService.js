import crypto from "crypto";

import AdminSession from "../models/AdminSession.js";

const LOCATION_PERMISSION_VALUES = new Set([
  "prompt",
  "granted",
  "denied",
  "unavailable",
]);

const hashRefreshToken = (refreshToken) => {
  if (!refreshToken) return null;
  return crypto.createHash("sha256").update(String(refreshToken)).digest("hex");
};

const truncate = (value, maxLength = 255) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
};

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeLocationPermission = (value) => {
  if (typeof value !== "string") return "prompt";
  const normalized = value.trim().toLowerCase();
  return LOCATION_PERMISSION_VALUES.has(normalized) ? normalized : "prompt";
};

const normalizeLocation = (location = null) => {
  if (!location || typeof location !== "object") {
    return null;
  }

  const latitude = toNumberOrNull(location.latitude);
  const longitude = toNumberOrNull(location.longitude);
  const accuracy = toNumberOrNull(location.accuracy);
  const address = truncate(location.address, 300);
  const city = truncate(location.city, 120);
  const region = truncate(location.region, 120);
  const country = truncate(location.country, 120);
  const source = truncate(location.source, 50);

  if (
    latitude === null &&
    longitude === null &&
    accuracy === null &&
    !address &&
    !city &&
    !region &&
    !country
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy,
    address,
    city,
    region,
    country,
    source,
    capturedAt: new Date(),
  };
};

const extractClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  return truncate(req.ip || req.socket?.remoteAddress || null, 120);
};

const parseUserAgent = (userAgent = "") => {
  const ua = String(userAgent || "");
  const normalized = ua.toLowerCase();

  let browser = "Unknown Browser";
  if (normalized.includes("edg/")) browser = "Microsoft Edge";
  else if (normalized.includes("chrome/") && !normalized.includes("edg/")) browser = "Google Chrome";
  else if (normalized.includes("firefox/")) browser = "Mozilla Firefox";
  else if (normalized.includes("safari/") && !normalized.includes("chrome/")) browser = "Safari";

  let os = "Unknown OS";
  if (normalized.includes("windows")) os = "Windows";
  else if (normalized.includes("android")) os = "Android";
  else if (normalized.includes("iphone") || normalized.includes("ipad") || normalized.includes("ios")) os = "iOS";
  else if (normalized.includes("mac os") || normalized.includes("macintosh")) os = "macOS";
  else if (normalized.includes("linux")) os = "Linux";

  let deviceType = "unknown";
  if (/bot|crawler|spider/i.test(ua)) deviceType = "bot";
  else if (/ipad|tablet/i.test(ua)) deviceType = "tablet";
  else if (/android|iphone|ipod|mobile/i.test(ua)) deviceType = "mobile";
  else if (ua) deviceType = "desktop";

  return { browser, os, deviceType };
};

const buildSessionDocument = ({ admin, sessionId, refreshToken, req, sessionContext = {} }) => {
  const userAgent = truncate(req.get("user-agent") || req.headers["user-agent"] || "", 500);
  const { browser, os, deviceType } = parseUserAgent(userAgent);
  const locationPermission = normalizeLocationPermission(sessionContext.locationPermission);
  const location = normalizeLocation(sessionContext.location);
  const now = new Date();

  return {
    admin: admin._id,
    sessionId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    ipAddress: extractClientIp(req),
    userAgent,
    deviceName: truncate(sessionContext.deviceName, 120),
    browser,
    os,
    deviceType,
    locationPermission,
    location,
    loginAt: now,
    lastSeenAt: now,
    isActive: true,
    revokedAt: null,
    revokeReason: null,
  };
};

export const createAdminSession = async ({
  admin,
  sessionId,
  refreshToken,
  req,
  sessionContext = {},
}) => {
  const sessionDocument = buildSessionDocument({
    admin,
    sessionId,
    refreshToken,
    req,
    sessionContext,
  });

  return AdminSession.create(sessionDocument);
};

export const validateAdminSession = async ({
  adminId,
  sessionId,
  refreshToken = null,
}) => {
  if (!sessionId) {
    return null;
  }

  const session = await AdminSession.findOne({
    admin: adminId,
    sessionId,
    isActive: true,
  });

  if (!session) {
    return null;
  }

  if (refreshToken && session.refreshTokenHash) {
    const incomingHash = hashRefreshToken(refreshToken);
    if (incomingHash !== session.refreshTokenHash) {
      return null;
    }
  }

  return session;
};

export const rotateAdminSession = async ({
  adminId,
  sessionId,
  currentRefreshToken,
  nextRefreshToken,
}) => {
  const session = await validateAdminSession({
    adminId,
    sessionId,
    refreshToken: currentRefreshToken,
  });

  if (!session) {
    return null;
  }

  session.refreshTokenHash = hashRefreshToken(nextRefreshToken);
  session.lastSeenAt = new Date();
  await session.save();

  return session;
};

export const isAdminSessionActive = async ({ adminId, sessionId }) => {
  if (!sessionId) {
    return false;
  }

  const session = await AdminSession.findOne({
    admin: adminId,
    sessionId,
    isActive: true,
  })
    .select("_id")
    .lean();

  return Boolean(session);
};

export const touchAdminSession = async ({ adminId, sessionId }) => {
  if (!sessionId) {
    return null;
  }

  return AdminSession.updateOne(
    {
      admin: adminId,
      sessionId,
      isActive: true,
    },
    {
      $set: {
        lastSeenAt: new Date(),
      },
    },
  );
};

export const revokeAdminSession = async ({
  adminId,
  sessionId,
  reason = "manual-revocation",
}) => {
  if (!sessionId) {
    return null;
  }

  return AdminSession.findOneAndUpdate(
    {
      admin: adminId,
      sessionId,
      isActive: true,
    },
    {
      $set: {
        isActive: false,
        revokedAt: new Date(),
        revokeReason: reason,
      },
    },
    { new: true },
  );
};

export const revokeAllAdminSessions = async (adminId, reason = "logout-all") => {
  return AdminSession.updateMany(
    {
      admin: adminId,
      isActive: true,
    },
    {
      $set: {
        isActive: false,
        revokedAt: new Date(),
        revokeReason: reason,
      },
    },
  );
};

export const listAdminSessions = async (adminId) => {
  return AdminSession.find({ admin: adminId })
    .sort({ isActive: -1, lastSeenAt: -1, loginAt: -1 })
    .lean();
};

export const updateAdminSessionLocation = async ({
  adminId,
  sessionId,
  sessionContext = {},
}) => {
  const update = {
    lastSeenAt: new Date(),
    locationPermission: normalizeLocationPermission(sessionContext.locationPermission),
  };

  if (sessionContext.deviceName !== undefined) {
    update.deviceName = truncate(sessionContext.deviceName, 120);
  }

  const normalizedLocation = normalizeLocation(sessionContext.location);
  if (normalizedLocation) {
    update.location = normalizedLocation;
  }

  return AdminSession.findOneAndUpdate(
    {
      admin: adminId,
      sessionId,
      isActive: true,
    },
    { $set: update },
    { new: true },
  ).lean();
};

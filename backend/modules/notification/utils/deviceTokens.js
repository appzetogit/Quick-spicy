import mongoose from "mongoose";

export const notificationDeviceSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      trim: true,
    },
    channel: {
      type: String,
      enum: ["web", "mobile"],
      required: true,
      default: "web",
    },
    platform: {
      type: String,
      enum: ["web", "android", "ios", "mobile", "flutter", "flutter-webview", "apk"],
      default: "web",
    },
    deviceId: {
      type: String,
      trim: true,
      default: "",
    },
    source: {
      type: String,
      trim: true,
      default: "",
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

export function normalizeFcmChannel(channel = null, platform = "web", headers = {}) {
  const normalizedChannel = String(channel || "").trim().toLowerCase();
  if (normalizedChannel === "web" || normalizedChannel === "mobile") {
    return normalizedChannel;
  }

  const normalizedPlatform = String(platform || "").trim().toLowerCase();
  if (normalizedPlatform === "web") {
    return "web";
  }
  if (["android", "ios", "mobile", "flutter", "flutter-webview", "apk"].includes(normalizedPlatform)) {
    return "mobile";
  }

  const userAgent = String(headers?.["user-agent"] || headers?.["User-Agent"] || "").toLowerCase();
  if (/\bwv\b|flutter|android|iphone|ipad|ipod/.test(userAgent)) {
    return "mobile";
  }

  return "web";
}

export function normalizeNotificationDeviceInput({
  token,
  platform = "web",
  channel = null,
  deviceId = "",
  source = "",
  headers = {},
} = {}) {
  const normalizedToken = String(token || "").trim();
  const normalizedPlatform = String(platform || "web").trim().toLowerCase();
  const normalizedChannel = normalizeFcmChannel(channel, normalizedPlatform, headers);

  return {
    token: normalizedToken,
    platform: normalizedPlatform,
    channel: normalizedChannel,
    deviceId: String(deviceId || "").trim(),
    source: String(source || "").trim().toLowerCase(),
    lastSeenAt: new Date(),
  };
}

export function syncLegacyFcmFields(record) {
  if (!record) return record;

  const devices = Array.isArray(record.notificationDevices) ? record.notificationDevices : [];
  const validDevices = devices.filter((device) => String(device?.token || "").trim().length >= 10);

  const latestByChannel = new Map();
  validDevices.forEach((device) => {
    const channel = device?.channel === "mobile" ? "mobile" : "web";
    const lastSeenAt = new Date(device?.lastSeenAt || 0).getTime();
    const existing = latestByChannel.get(channel);
    const existingLastSeenAt = existing ? new Date(existing.lastSeenAt || 0).getTime() : 0;

    if (!existing || lastSeenAt >= existingLastSeenAt) {
      latestByChannel.set(channel, device);
    }
  });

  record.fcmtokenweb = latestByChannel.get("web")?.token || null;
  record.fcmtokenmobile = latestByChannel.get("mobile")?.token || null;
  return record;
}

export function upsertNotificationDevice(record, rawDevice = {}) {
  if (!record) return null;

  const normalized = normalizeNotificationDeviceInput(rawDevice);
  if (!normalized.token || normalized.token.length < 10) {
    return null;
  }

  const devices = Array.isArray(record.notificationDevices) ? [...record.notificationDevices] : [];
  const matchIndex = devices.findIndex((device) => {
    const deviceToken = String(device?.token || "").trim();
    const storedDeviceId = String(device?.deviceId || "").trim();
    return (
      deviceToken === normalized.token ||
      (normalized.deviceId && storedDeviceId && storedDeviceId === normalized.deviceId)
    );
  });

  if (matchIndex >= 0) {
    devices[matchIndex] = {
      ...(devices[matchIndex]?.toObject?.() || devices[matchIndex]),
      ...normalized,
    };
  } else {
    devices.push(normalized);
  }

  const dedupedDevices = [];
  const seenKeys = new Set();
  devices.forEach((device) => {
    const token = String(device?.token || "").trim();
    if (token.length < 10) return;
    const key = `${device?.channel || "web"}::${String(device?.deviceId || "").trim()}::${token}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    dedupedDevices.push(device);
  });

  record.notificationDevices = dedupedDevices;
  syncLegacyFcmFields(record);
  return normalized.channel;
}

export function removeNotificationDevice(record, { token = null, platform = null, channel = null, deviceId = null, headers = {} } = {}) {
  if (!record) return null;

  const normalizedToken = token ? String(token).trim() : "";
  const normalizedDeviceId = deviceId ? String(deviceId).trim() : "";
  const normalizedChannel = platform || channel
    ? normalizeFcmChannel(channel, platform, headers)
    : null;

  let devices = Array.isArray(record.notificationDevices) ? [...record.notificationDevices] : [];

  if (normalizedToken || normalizedDeviceId) {
    devices = devices.filter((device) => {
      const matchesToken = normalizedToken && String(device?.token || "").trim() === normalizedToken;
      const matchesDeviceId = normalizedDeviceId && String(device?.deviceId || "").trim() === normalizedDeviceId;
      return !(matchesToken || matchesDeviceId);
    });
  } else if (normalizedChannel) {
    devices = devices.filter((device) => String(device?.channel || "").trim() !== normalizedChannel);
  } else {
    devices = [];
  }

  record.notificationDevices = devices;

  if (normalizedToken) {
    if (record.fcmtokenweb === normalizedToken) record.fcmtokenweb = null;
    if (record.fcmtokenmobile === normalizedToken) record.fcmtokenmobile = null;
  }

  syncLegacyFcmFields(record);
  return normalizedChannel;
}

export function extractNotificationTokens(record = null, platform = "all") {
  const webTokens = [];
  const mobileTokens = [];
  const addToken = (target, token) => {
    const normalized = String(token || "").trim();
    if (normalized.length >= 10) target.push(normalized);
  };

  const devices = Array.isArray(record?.notificationDevices) ? record.notificationDevices : [];
  devices.forEach((device) => {
    const channel = String(device?.channel || "").trim().toLowerCase();
    if (channel === "web" && (platform === "all" || platform === "web")) {
      addToken(webTokens, device?.token);
    }
    if (channel === "mobile" && (platform === "all" || platform === "mobile")) {
      addToken(mobileTokens, device?.token);
    }
  });

  if (webTokens.length === 0 && (platform === "all" || platform === "web")) {
    addToken(webTokens, record?.fcmtokenweb);
  }
  if (mobileTokens.length === 0 && (platform === "all" || platform === "mobile")) {
    addToken(mobileTokens, record?.fcmtokenmobile);
  }

  return {
    webTokens: [...new Set(webTokens)],
    mobileTokens: [...new Set(mobileTokens)],
  };
}

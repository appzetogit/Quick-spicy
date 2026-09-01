import admin from "firebase-admin";
import asyncHandler from "../../../shared/middleware/asyncHandler.js";
import { errorResponse, successResponse } from "../../../shared/utils/response.js";
import firebaseAuthService from "../../auth/services/firebaseAuthService.js";
import User from "../../auth/models/User.js";
import Delivery from "../../delivery/models/Delivery.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import ScheduledPushNotification from "../models/ScheduledPushNotification.js";
import { extractNotificationTokens } from "../../notification/utils/deviceTokens.js";
import { normalizePhoneNumber } from "../../../shared/utils/phoneUtils.js";
import mongoose from "mongoose";
import Zone from "../models/Zone.js";

const BATCH_SIZE = 500;
const PARTNER_ANDROID_CHANNEL_ID = "quick_spicy_popup_v2";
const PARTNER_ANDROID_SOUND = "original";
const INVALID_FCM_TOKEN_CODES = new Set([
  "messaging/invalid-argument",
  "messaging/registration-token-not-registered",
  // A token that is malformed or belongs to another Firebase project is just as dead
  // as an unregistered one, but was not being pruned - so it failed on every send
  // from then on and kept inflating the failure count.
  "messaging/invalid-registration-token",
  "messaging/mismatched-credential",
  "messaging/invalid-recipient",
]);

const normalizeTarget = (target = "customer") => {
  const normalized = String(target || "").trim().toLowerCase();
  if (["customer", "customers", "user", "users"].includes(normalized)) {
    return "customer";
  }
  if (["delivery", "deliveryman", "delivery-man", "delivery_partner"].includes(normalized)) {
    return "delivery";
  }
  if (["restaurant", "restaurants"].includes(normalized)) {
    return "restaurant";
  }
  if (["all"].includes(normalized)) {
    return "all";
  }
  return "customer";
};

const normalizePlatform = (platform = "all") => {
  const normalized = String(platform || "").trim().toLowerCase();
  if (["web"].includes(normalized)) return "web";
  if (["mobile", "android", "ios"].includes(normalized)) return "mobile";
  return "all";
};

const normalizeZone = (zone = "All") => String(zone || "All").trim() || "All";

const buildActiveOrLegacyFilter = () => ({
  $or: [{ isActive: true }, { isActive: { $exists: false } }],
});

const resolveTargetLink = (target = "customer") => {
  if (target === "delivery") return "/delivery";
  if (target === "restaurant") return "/restaurant";
  return "/";
};

const extractTokensByPlatform = (records = [], platform = "all") => {
  const webTokens = [];
  const mobileTokens = [];

  records.forEach((record) => {
    const tokenGroups = extractNotificationTokens(record, platform);
    webTokens.push(...(tokenGroups?.webTokens || []));
    mobileTokens.push(...(tokenGroups?.mobileTokens || []));
  });

  return {
    webTokens: [...new Set(webTokens)],
    mobileTokens: [...new Set(mobileTokens)],
  };
};

const extractCustomerTokensByPhone = (records = [], platform = "all") => {
  const sortedRecords = [...records].sort((a, b) => {
    const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime() || 0;
    const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime() || 0;
    return bTime - aTime;
  });
  const grouped = new Map();

  sortedRecords.forEach((record) => {
    const groupKey = normalizePhoneNumber(record?.phone || "") || String(record?._id || "");
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, { webTokens: [], mobileTokens: [] });
    }

    const tokenGroups = extractNotificationTokens(record, platform);
    grouped.get(groupKey).webTokens.push(...(tokenGroups?.webTokens || []));
    grouped.get(groupKey).mobileTokens.push(...(tokenGroups?.mobileTokens || []));
  });

  const webTokens = [];
  const mobileTokens = [];

  grouped.forEach((tokenGroups) => {
    const uniqueWeb = [...new Set(tokenGroups.webTokens.map((token) => String(token || "").trim()).filter(Boolean))];
    const uniqueMobile = [...new Set(tokenGroups.mobileTokens.map((token) => String(token || "").trim()).filter(Boolean))];

    if (platform === "web") {
      if (uniqueWeb[0]) webTokens.push(uniqueWeb[0]);
      return;
    }

    if (platform === "mobile") {
      if (uniqueMobile[0]) mobileTokens.push(uniqueMobile[0]);
      return;
    }

    if (uniqueMobile[0]) {
      mobileTokens.push(uniqueMobile[0]);
      return;
    }

    if (uniqueWeb[0]) {
      webTokens.push(uniqueWeb[0]);
    }
  });

  return {
    webTokens: [...new Set(webTokens)],
    mobileTokens: [...new Set(mobileTokens)],
  };
};

const dedupeCrossChannelTokens = (webTokens = [], mobileTokens = []) => {
  const webSet = new Set((webTokens || []).map((token) => String(token || "").trim()).filter(Boolean));
  const uniqueWeb = [...webSet];
  const uniqueMobile = [...new Set((mobileTokens || []).map((token) => String(token || "").trim()).filter(Boolean))]
    .filter((token) => !webSet.has(token));

  return {
    webTokens: uniqueWeb,
    mobileTokens: uniqueMobile,
  };
};

const chunk = (arr = [], size = BATCH_SIZE) => {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
};

// A customer has no zone of their own - the app never stores one on the account -
// so their zone is taken from the address they order to. Default address first,
// then any address that has coordinates.
const isUserInZone = (user, zone) => {
  const addresses = Array.isArray(user?.addresses) ? user.addresses : [];
  if (addresses.length === 0) return false;

  const ordered = [
    ...addresses.filter((a) => a?.isDefault),
    ...addresses.filter((a) => !a?.isDefault),
  ];

  for (const address of ordered) {
    const coords = address?.location?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const [lng, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (typeof zone.containsPoint === "function" && zone.containsPoint(lat, lng)) {
      return true;
    }
  }
  return false;
};

async function getTargetTokens(target, platform, zoneDoc = null) {
  const baseFilter = buildActiveOrLegacyFilter();
  const zoneIdString = zoneDoc?._id?.toString?.() || "";

  if (target === "customer") {
    const users = await User.find({ role: "user", ...baseFilter })
      .select("phone fcmtokenweb fcmtokenmobile notificationDevices createdAt updatedAt addresses")
      .lean();
    const scoped = zoneDoc ? users.filter((user) => isUserInZone(user, zoneDoc)) : users;
    return extractCustomerTokensByPhone(scoped, platform);
  }

  if (target === "delivery") {
    const deliveryPartners = await Delivery.find({
      ...baseFilter,
      ...(zoneIdString ? { zones: zoneIdString } : {}),
    })
      .select("fcmtokenweb fcmtokenmobile notificationDevices")
      .lean();
    return extractTokensByPlatform(deliveryPartners, platform);
  }

  if (target === "restaurant") {
    const restaurants = await Restaurant.find({
      ...baseFilter,
      ...(zoneIdString ? { zoneId: zoneIdString } : {}),
    })
      .select("fcmtokenweb fcmtokenmobile notificationDevices")
      .lean();
    return extractTokensByPlatform(restaurants, platform);
  }

  const [userTokens, deliveryTokens, restaurantTokens] = await Promise.all([
    getTargetTokens("customer", platform, zoneDoc),
    getTargetTokens("delivery", platform, zoneDoc),
    getTargetTokens("restaurant", platform, zoneDoc),
  ]);

  return {
    webTokens: [
      ...new Set([
        ...userTokens.webTokens,
        ...deliveryTokens.webTokens,
        ...restaurantTokens.webTokens,
      ]),
    ],
    mobileTokens: [
      ...new Set([
        ...userTokens.mobileTokens,
        ...deliveryTokens.mobileTokens,
        ...restaurantTokens.mobileTokens,
      ]),
    ],
  };
}

const sendBatches = async (tokens = [], payload = {}) => {
  const batches = chunk(tokens, BATCH_SIZE);
  let sentCount = 0;
  let failedCount = 0;
  const failedTokens = [];
  const failureCodeCounts = {};

  for (const tokenBatch of batches) {
    const batchResponse = await admin.messaging().sendEachForMulticast({
      ...payload,
      tokens: tokenBatch,
    });

    sentCount += batchResponse.successCount || 0;
    failedCount += batchResponse.failureCount || 0;

    batchResponse.responses.forEach((item, index) => {
      if (!item.success) {
        const errorCode = item.error?.code || "unknown";
        failureCodeCounts[errorCode] = (failureCodeCounts[errorCode] || 0) + 1;
        failedTokens.push({
          token: tokenBatch[index],
          code: errorCode,
          error: item.error?.message || "Unknown FCM error",
        });
      }
    });
  }

  return { sentCount, failedCount, failedTokens, failureCodeCounts };
};

const getTargetModels = (target = "customer") => {
  if (target === "customer") return [User];
  if (target === "delivery") return [Delivery];
  if (target === "restaurant") return [Restaurant];
  return [User, Delivery, Restaurant];
};

const pruneInvalidFcmTokens = async (target = "customer", failures = []) => {
  const invalidTokens = [
    ...new Set(
      failures
        .filter((failure) => INVALID_FCM_TOKEN_CODES.has(failure?.code))
        .map((failure) => String(failure?.token || "").trim())
        .filter(Boolean),
    ),
  ];

  if (invalidTokens.length === 0) return 0;

  const targetModels = getTargetModels(target);

  await Promise.all(
    targetModels.flatMap((Model) => [
      Model.updateMany(
        { fcmtokenweb: { $in: invalidTokens } },
        {
          $set: { fcmtokenweb: null },
          $pull: { notificationDevices: { token: { $in: invalidTokens } } },
        },
      ),
      Model.updateMany(
        { fcmtokenmobile: { $in: invalidTokens } },
        {
          $set: { fcmtokenmobile: null },
          $pull: { notificationDevices: { token: { $in: invalidTokens } } },
        },
      ),
      Model.updateMany(
        { "notificationDevices.token": { $in: invalidTokens } },
        { $pull: { notificationDevices: { token: { $in: invalidTokens } } } },
      ),
    ]),
  );

  return invalidTokens.length;
};

const executePushNotification = async ({
  title = "",
  description = "",
  imageUrl = "",
  target = "customer",
  platform = "all",
  zone = "All",
  notificationId: notificationIdOverride = "",
} = {}) => {
  const normalizedTitle = String(title || "").trim();
  const normalizedDescription = String(description || "").trim();
  const normalizedImageUrl = String(imageUrl || "").trim();
  const normalizedTarget = normalizeTarget(target);
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedZone = normalizeZone(zone);
  const targetLink = resolveTargetLink(normalizedTarget);
  const notificationId = String(notificationIdOverride || `admin-push:${normalizedTarget}:${normalizedPlatform}:${Date.now()}`);

  if (!normalizedTitle || !normalizedDescription) {
    return {
      ok: false,
      statusCode: 400,
      message: "Title and description are required",
    };
  }

  if (normalizedImageUrl) {
    try {
      const parsedUrl = new URL(normalizedImageUrl);
      if (parsedUrl.protocol !== "https:") {
        return {
          ok: false,
          statusCode: 400,
          message: "Notification image URL must be a valid HTTPS URL",
        };
      }
    } catch (_error) {
      return {
        ok: false,
        statusCode: 400,
        message: "Notification image URL is invalid",
      };
    }
  }

  await firebaseAuthService.init();
  if (!firebaseAuthService.isEnabled()) {
    return {
      ok: false,
      statusCode: 500,
      message:
        "Firebase is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY first.",
    };
  }

  // "All" means every zone. A specific zone is resolved once here and passed down,
  // so the audience is actually narrowed - picking a zone used to change nothing at
  // all: it was recorded on the notification and then ignored when choosing who to
  // send to, so every send went to everyone.
  let zoneDoc = null;
  if (normalizedZone && normalizedZone.toLowerCase() !== "all") {
    zoneDoc = mongoose.Types.ObjectId.isValid(normalizedZone)
      ? await Zone.findById(normalizedZone)
      : await Zone.findOne({ name: normalizedZone });
    if (!zoneDoc) {
      return {
        ok: false,
        statusCode: 400,
        message: `Zone "${normalizedZone}" was not found`,
      };
    }
  }

  const targetTokens = await getTargetTokens(normalizedTarget, normalizedPlatform, zoneDoc);
  const { webTokens, mobileTokens } = dedupeCrossChannelTokens(
    targetTokens.webTokens,
    targetTokens.mobileTokens,
  );
  const totalTokens = webTokens.length + mobileTokens.length;

  if (totalTokens === 0) {
    return {
      ok: true,
      statusCode: 200,
      message: "No FCM tokens found for selected audience",
      data: {
        target: normalizedTarget,
        platform: normalizedPlatform,
        zone: normalizedZone,
        totalTokens: 0,
        sentCount: 0,
        failedCount: 0,
      },
    };
  }

  const baseData = {
    notificationId,
    type: "admin_push_notification",
    target: normalizedTarget,
    platform: normalizedPlatform,
    zone: normalizedZone,
    link: targetLink,
    ...(normalizedImageUrl ? { imageUrl: normalizedImageUrl } : {}),
    sentAt: new Date().toISOString(),
  };

  const webPayload = {
    data: {
      ...baseData,
      title: normalizedTitle,
      body: normalizedDescription,
      ...(normalizedImageUrl ? { image: normalizedImageUrl, imageUrl: normalizedImageUrl } : {}),
    },
    notification: {
      title: normalizedTitle,
      body: normalizedDescription,
      ...(normalizedImageUrl ? { imageUrl: normalizedImageUrl } : {}),
    },
    webpush: {
      headers: {
        Urgency: "high",
        TTL: "120",
      },
      notification: {
        title: normalizedTitle,
        body: normalizedDescription,
        ...(normalizedImageUrl ? { image: normalizedImageUrl } : {}),
      },
      fcmOptions: {
        link: targetLink,
      },
    },
  };

  const isPartnerMobileTarget =
    (normalizedTarget === "restaurant" || normalizedTarget === "delivery") &&
    (normalizedPlatform === "mobile" || normalizedPlatform === "all");
  const shouldUseSystemRenderedMobileNotification = Boolean(normalizedImageUrl);

  const mobilePayload = {
    data: {
      ...baseData,
      title: normalizedTitle,
      body: normalizedDescription,
      ...(normalizedImageUrl ? { image: normalizedImageUrl, imageUrl: normalizedImageUrl } : {}),
      renderMode: shouldUseSystemRenderedMobileNotification ? "system" : "client",
      ...(isPartnerMobileTarget ? { androidChannelId: PARTNER_ANDROID_CHANNEL_ID, sound: PARTNER_ANDROID_SOUND } : {}),
    },
    ...(shouldUseSystemRenderedMobileNotification
      ? {
          notification: {
            title: normalizedTitle,
            body: normalizedDescription,
            imageUrl: normalizedImageUrl,
          },
        }
      : {}),
    android: {
      priority: "high",
      ttl: 120000,
      ...(shouldUseSystemRenderedMobileNotification
        ? {
            notification: {
              ...(isPartnerMobileTarget ? { channelId: PARTNER_ANDROID_CHANNEL_ID, sound: PARTNER_ANDROID_SOUND } : {}),
              imageUrl: normalizedImageUrl,
            },
          }
        : {}),
    },
    apns: {
      headers: {
        "apns-priority": "5",
      },
      fcmOptions: {
        ...(normalizedImageUrl ? { imageUrl: normalizedImageUrl } : {}),
      },
      payload: {
        aps: {
          alert: {
            title: normalizedTitle,
            body: normalizedDescription,
          },
          sound: "default",
          "content-available": 1,
          ...(normalizedImageUrl ? { "mutable-content": 1 } : {}),
        },
      },
    },
  };

  let sentCount = 0;
  let failedCount = 0;
  const failedTokens = [];
  const failureCodeCounts = {};

  if (webTokens.length > 0) {
    const result = await sendBatches(webTokens, webPayload);
    sentCount += result.sentCount;
    failedCount += result.failedCount;
    failedTokens.push(...result.failedTokens);
    Object.entries(result.failureCodeCounts).forEach(([code, count]) => {
      failureCodeCounts[code] = (failureCodeCounts[code] || 0) + count;
    });
  }

  if (mobileTokens.length > 0) {
    const result = await sendBatches(mobileTokens, mobilePayload);
    sentCount += result.sentCount;
    failedCount += result.failedCount;
    failedTokens.push(...result.failedTokens);
    Object.entries(result.failureCodeCounts).forEach(([code, count]) => {
      failureCodeCounts[code] = (failureCodeCounts[code] || 0) + count;
    });
  }

  const prunedCount = await pruneInvalidFcmTokens(normalizedTarget, failedTokens);

  // Recorded server-side, not just returned to the browser. The counts and the
  // reason codes only ever existed in the HTTP response, so once the admin closed
  // the page there was no way to find out who failed or why - a report of "~700
  // failed" left nothing to investigate.
  console.log(
    `[PUSH] target=${normalizedTarget} platform=${normalizedPlatform} zone=${normalizedZone} ` +
    `tokens=${totalTokens} sent=${sentCount} failed=${failedCount} ` +
    `pruned=${prunedCount || 0} codes=${JSON.stringify(failureCodeCounts)}`
  );

  const responseMessage =
    sentCount > 0
      ? "Push notification sent"
      : failedCount > 0
        ? "Push notification failed for all tokens"
        : "Push notification processed";

  return {
    ok: true,
    statusCode: 200,
    message: responseMessage,
    data: {
      target: normalizedTarget,
      platform: normalizedPlatform,
      zone: normalizedZone,
      totalTokens,
      sentCount,
      failedCount,
      failureCodeCounts,
      sampleFailures: failedTokens.slice(0, 20),
    },
  };
};

/**
 * Send push notification to saved FCM tokens by target.
 * POST /api/admin/push-notification/send
 */
export const sendPushNotification = asyncHandler(async (req, res) => {
  const {
    title = "",
    description = "",
    message = "",
    body = "",
    imageUrl = "",
    target = "customer",
    platform = "all",
    zone = "All",
    scheduleAt = null,
    scheduleAtList = [],
  } = req.body || {};

  const normalizedTitle = String(title || "").trim();
  const normalizedDescription = String(description || message || body || "").trim();
  const normalizedImageUrl = String(imageUrl || "").trim();
  const normalizedTarget = normalizeTarget(target);
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedZone = normalizeZone(zone);

  if (!normalizedTitle || !normalizedDescription) {
    return errorResponse(res, 400, "Title and description are required");
  }

  if (normalizedImageUrl) {
    try {
      const parsedUrl = new URL(normalizedImageUrl);
      if (parsedUrl.protocol !== "https:") {
        return errorResponse(res, 400, "Notification image URL must be a valid HTTPS URL");
      }
    } catch (_error) {
      return errorResponse(res, 400, "Notification image URL is invalid");
    }
  }

  const parsedScheduleAtList = Array.isArray(scheduleAtList)
    ? scheduleAtList
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
    : [];

  const parsedScheduleAtSingle = scheduleAt ? new Date(scheduleAt) : null;
  const hasSingleSchedule = Boolean(parsedScheduleAtSingle && !Number.isNaN(parsedScheduleAtSingle.getTime()));
  const hasRecurringSchedule = parsedScheduleAtList.length > 0;
  const isScheduleRequest = hasSingleSchedule || hasRecurringSchedule;

  if (scheduleAt && !hasSingleSchedule) {
    return errorResponse(res, 400, "Invalid schedule date/time");
  }

  if (Array.isArray(scheduleAtList) && scheduleAtList.length > 0 && !hasRecurringSchedule) {
    return errorResponse(res, 400, "Invalid recurring schedule date/time list");
  }

  const normalizedScheduleTimes = hasRecurringSchedule
    ? parsedScheduleAtList
    : (hasSingleSchedule ? [parsedScheduleAtSingle] : []);

  if (normalizedScheduleTimes.some((date) => date <= new Date())) {
    return errorResponse(res, 400, "Scheduled date/time must be in the future");
  }

  if (isScheduleRequest) {
    const createdByAdminId = req?.admin?._id || req?.user?._id || null;
    const uniqueScheduleTimes = [...new Set(normalizedScheduleTimes.map((date) => date.toISOString()))]
      .map((iso) => new Date(iso))
      .sort((a, b) => a.getTime() - b.getTime());

    const docs = uniqueScheduleTimes.map((when) => ({
      title: normalizedTitle,
      description: normalizedDescription,
      imageUrl: normalizedImageUrl || null,
      target: normalizedTarget,
      platform: normalizedPlatform,
      zone: normalizedZone,
      scheduleAt: when,
      status: "scheduled",
      createdBy: createdByAdminId,
    }));

    const created = await ScheduledPushNotification.insertMany(docs);

    return successResponse(res, 201, "Push notification scheduled successfully", {
      ids: created.map((item) => item._id),
      status: "scheduled",
      scheduledCount: created.length,
      scheduleAt: created[0]?.scheduleAt || null,
      scheduleAtList: created.map((item) => item.scheduleAt),
      target: normalizedTarget,
      platform: normalizedPlatform,
      zone: normalizedZone,
    });
  }

  const execution = await executePushNotification({
    title: normalizedTitle,
    description: normalizedDescription,
    imageUrl: normalizedImageUrl,
    target: normalizedTarget,
    platform: normalizedPlatform,
    zone: normalizedZone,
  });

  if (!execution.ok) {
    return errorResponse(res, execution.statusCode || 500, execution.message || "Failed to send push notification");
  }

  return successResponse(res, 200, execution.message, execution.data || {});
});

export const processDueScheduledPushNotifications = async ({ limit = 20 } = {}) => {
  const now = new Date();
  const dueNotifications = await ScheduledPushNotification.find({
    status: "scheduled",
    scheduleAt: { $lte: now },
  })
    .sort({ scheduleAt: 1 })
    .limit(Math.max(1, Math.min(Number(limit) || 20, 100)))
    .lean();

  if (!dueNotifications.length) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const due of dueNotifications) {
    const claimed = await ScheduledPushNotification.findOneAndUpdate(
      { _id: due._id, status: "scheduled" },
      { $set: { status: "processing", processingStartedAt: new Date() } },
      { new: true },
    );

    if (!claimed) {
      continue;
    }

    processed += 1;

    try {
      const execution = await executePushNotification({
        title: claimed.title,
        description: claimed.description,
        imageUrl: claimed.imageUrl || "",
        target: claimed.target,
        platform: claimed.platform,
        zone: claimed.zone,
        notificationId: `admin-push:scheduled:${claimed._id.toString()}`,
      });

      if (!execution.ok) {
        failed += 1;
        await ScheduledPushNotification.findByIdAndUpdate(claimed._id, {
          $set: {
            status: "failed",
            sentAt: new Date(),
            errorMessage: execution.message || "Failed to send scheduled notification",
          },
        });
        continue;
      }

      sent += 1;
      await ScheduledPushNotification.findByIdAndUpdate(claimed._id, {
        $set: {
          status: "sent",
          sentAt: new Date(),
          result: execution.data || {},
          errorMessage: "",
        },
      });
    } catch (error) {
      failed += 1;
      await ScheduledPushNotification.findByIdAndUpdate(claimed._id, {
        $set: {
          status: "failed",
          sentAt: new Date(),
          errorMessage: error?.message || "Unknown processing error",
        },
      });
    }
  }

  return { processed, sent, failed };
};

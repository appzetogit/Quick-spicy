import admin from "firebase-admin";
import asyncHandler from "../../../shared/middleware/asyncHandler.js";
import { errorResponse, successResponse } from "../../../shared/utils/response.js";
import firebaseAuthService from "../../auth/services/firebaseAuthService.js";
import User from "../../auth/models/User.js";
import Delivery from "../../delivery/models/Delivery.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import ScheduledPushNotification from "../models/ScheduledPushNotification.js";

const BATCH_SIZE = 500;
const PARTNER_ANDROID_CHANNEL_ID = "quick_spicy_popup_v1";
const PARTNER_ANDROID_SOUND = "original";

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
    if (platform === "web" || platform === "all") {
      if (record?.fcmtokenweb && String(record.fcmtokenweb).trim().length >= 10) {
        webTokens.push(String(record.fcmtokenweb).trim());
      }
    }

    if (platform === "mobile" || platform === "all") {
      if (record?.fcmtokenmobile && String(record.fcmtokenmobile).trim().length >= 10) {
        mobileTokens.push(String(record.fcmtokenmobile).trim());
      }
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

async function getTargetTokens(target, platform) {
  const baseFilter = buildActiveOrLegacyFilter();

  if (target === "customer") {
    const users = await User.find({ role: "user", ...baseFilter })
      .select("fcmtokenweb fcmtokenmobile")
      .lean();
    return extractTokensByPlatform(users, platform);
  }

  if (target === "delivery") {
    const deliveryPartners = await Delivery.find(baseFilter)
      .select("fcmtokenweb fcmtokenmobile")
      .lean();
    return extractTokensByPlatform(deliveryPartners, platform);
  }

  if (target === "restaurant") {
    const restaurants = await Restaurant.find(baseFilter)
      .select("fcmtokenweb fcmtokenmobile")
      .lean();
    return extractTokensByPlatform(restaurants, platform);
  }

  const [userTokens, deliveryTokens, restaurantTokens] = await Promise.all([
    getTargetTokens("customer", platform),
    getTargetTokens("delivery", platform),
    getTargetTokens("restaurant", platform),
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

  const targetTokens = await getTargetTokens(normalizedTarget, normalizedPlatform);
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
    },
    webpush: {
      headers: {
        Urgency: "high",
        TTL: "120",
      },
      fcmOptions: {
        link: targetLink,
      },
    },
  };

  const isPartnerMobileTarget =
    (normalizedTarget === "restaurant" || normalizedTarget === "delivery") &&
    (normalizedPlatform === "mobile" || normalizedPlatform === "all");

  const androidNotificationConfig = isPartnerMobileTarget
    ? {
      channelId: PARTNER_ANDROID_CHANNEL_ID,
      sound: PARTNER_ANDROID_SOUND,
      defaultSound: false,
      defaultVibrateTimings: true,
      vibrateTimingsMillis: [200, 100, 200, 100, 300],
    }
    : {
      sound: "default",
      defaultSound: true,
      defaultVibrateTimings: true,
      vibrateTimingsMillis: [200, 100, 200, 100, 300],
    };

  const apnsSound = isPartnerMobileTarget ? "default" : "default";

  const mobilePayload = {
    notification: {
      title: normalizedTitle,
      body: normalizedDescription,
      ...(normalizedImageUrl ? { imageUrl: normalizedImageUrl } : {}),
    },
    data: baseData,
    ...(normalizedImageUrl
      ? {
        android: {
          notification: {
            imageUrl: normalizedImageUrl,
            ...androidNotificationConfig,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: apnsSound,
            },
          },
          fcmOptions: {
            imageUrl: normalizedImageUrl,
          },
        },
      }
      : {
        android: {
          notification: {
            ...androidNotificationConfig,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: apnsSound,
            },
          },
        },
      }),
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

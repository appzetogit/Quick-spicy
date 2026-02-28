import admin from "firebase-admin";
import asyncHandler from "../../../shared/middleware/asyncHandler.js";
import { errorResponse, successResponse } from "../../../shared/utils/response.js";
import firebaseAuthService from "../../auth/services/firebaseAuthService.js";
import User from "../../auth/models/User.js";
import Delivery from "../../delivery/models/Delivery.js";
import Restaurant from "../../restaurant/models/Restaurant.js";

const BATCH_SIZE = 500;

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
  const tokens = [];

  records.forEach((record) => {
    if (platform === "web" || platform === "all") {
      if (record?.fcmtokenweb && String(record.fcmtokenweb).trim().length >= 10) {
        tokens.push(String(record.fcmtokenweb).trim());
      }
    }

    if (platform === "mobile" || platform === "all") {
      if (record?.fcmtokenmobile && String(record.fcmtokenmobile).trim().length >= 10) {
        tokens.push(String(record.fcmtokenmobile).trim());
      }
    }
  });

  return [...new Set(tokens)];
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

  return [...new Set([...userTokens, ...deliveryTokens, ...restaurantTokens])];
}

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
  } = req.body || {};

  const normalizedTitle = String(title || "").trim();
  const normalizedDescription = String(description || message || body || "").trim();
  const normalizedImageUrl = String(imageUrl || "").trim();
  const normalizedTarget = normalizeTarget(target);
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedZone = normalizeZone(zone);
  const targetLink = resolveTargetLink(normalizedTarget);

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

  await firebaseAuthService.init();
  if (!firebaseAuthService.isEnabled()) {
    return errorResponse(
      res,
      500,
      "Firebase is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY first.",
    );
  }

  const allTokens = await getTargetTokens(normalizedTarget, normalizedPlatform);
  if (allTokens.length === 0) {
    return successResponse(res, 200, "No FCM tokens found for selected audience", {
      target: normalizedTarget,
      platform: normalizedPlatform,
      zone: normalizedZone,
      totalTokens: 0,
      sentCount: 0,
      failedCount: 0,
    });
  }

  const payload = {
    notification: {
      title: normalizedTitle,
      body: normalizedDescription,
      ...(normalizedImageUrl ? { imageUrl: normalizedImageUrl } : {}),
    },
    data: {
      type: "admin_push_notification",
      target: normalizedTarget,
      platform: normalizedPlatform,
      zone: normalizedZone,
      link: targetLink,
      ...(normalizedImageUrl ? { imageUrl: normalizedImageUrl } : {}),
      sentAt: new Date().toISOString(),
    },
    webpush: {
      notification: {
        ...(normalizedImageUrl ? { image: normalizedImageUrl } : {}),
      },
      fcmOptions: {
        link: targetLink,
      },
    },
    ...(normalizedImageUrl
      ? {
          android: {
            notification: {
              imageUrl: normalizedImageUrl,
            },
          },
          apns: {
            fcmOptions: {
              imageUrl: normalizedImageUrl,
            },
          },
        }
      : {}),
  };

  const batches = chunk(allTokens, BATCH_SIZE);
  let sentCount = 0;
  let failedCount = 0;
  const failedTokens = [];
  const failureCodeCounts = {};

  for (const tokenBatch of batches) {
    // sendEachForMulticast gives per-token status and works with Firebase Admin SDK v12.
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

  const responseMessage =
    sentCount > 0
      ? "Push notification sent"
      : failedCount > 0
        ? "Push notification failed for all tokens"
        : "Push notification processed";

  return successResponse(res, 200, responseMessage, {
    target: normalizedTarget,
    platform: normalizedPlatform,
    zone: normalizedZone,
    totalTokens: allTokens.length,
    sentCount,
    failedCount,
    failureCodeCounts,
    sampleFailures: failedTokens.slice(0, 20),
  });
});

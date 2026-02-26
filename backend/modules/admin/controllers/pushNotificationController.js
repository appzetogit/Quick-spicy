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
  if (target === "customer") {
    const users = await User.find({ role: "user", isActive: true })
      .select("fcmtokenweb fcmtokenmobile")
      .lean();
    return extractTokensByPlatform(users, platform);
  }

  if (target === "delivery") {
    const deliveryPartners = await Delivery.find({ isActive: true })
      .select("fcmtokenweb fcmtokenmobile")
      .lean();
    return extractTokensByPlatform(deliveryPartners, platform);
  }

  if (target === "restaurant") {
    const restaurants = await Restaurant.find({ isActive: true })
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
    target = "customer",
    platform = "all",
    zone = "All",
  } = req.body || {};

  const normalizedTitle = String(title || "").trim();
  const normalizedDescription = String(description || "").trim();
  const normalizedTarget = normalizeTarget(target);
  const normalizedPlatform = normalizePlatform(platform);

  if (!normalizedTitle || !normalizedDescription) {
    return errorResponse(res, 400, "Title and description are required");
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
      zone,
      totalTokens: 0,
      sentCount: 0,
      failedCount: 0,
    });
  }

  const payload = {
    notification: {
      title: normalizedTitle,
      body: normalizedDescription,
    },
    data: {
      type: "admin_push_notification",
      target: normalizedTarget,
      platform: normalizedPlatform,
      zone: String(zone || "All"),
      sentAt: new Date().toISOString(),
    },
  };

  const batches = chunk(allTokens, BATCH_SIZE);
  let sentCount = 0;
  let failedCount = 0;
  const failedTokens = [];

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
        failedTokens.push({
          token: tokenBatch[index],
          error: item.error?.message || "Unknown FCM error",
        });
      }
    });
  }

  return successResponse(res, 200, "Push notification processed", {
    target: normalizedTarget,
    platform: normalizedPlatform,
    zone,
    totalTokens: allTokens.length,
    sentCount,
    failedCount,
    sampleFailures: failedTokens.slice(0, 20),
  });
});


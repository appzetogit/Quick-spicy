import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { errorResponse, successResponse } from "../../../shared/utils/response.js";
import {
  listAdminSessions,
  revokeAdminSession,
  updateAdminSessionLocation,
} from "../services/adminSessionService.js";

export const getAdminSessions = asyncHandler(async (req, res) => {
  const adminId = req.user?._id || req.user?.userId;
  const currentSessionId = req.token?.sessionId || null;

  const sessions = await listAdminSessions(adminId);

  return successResponse(res, 200, "Admin sessions retrieved successfully", {
    currentSessionId,
    sessions: sessions.map((session) => ({
      id: session._id,
      sessionId: session.sessionId,
      isActive: session.isActive,
      loginAt: session.loginAt,
      lastSeenAt: session.lastSeenAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      deviceName: session.deviceName,
      browser: session.browser,
      os: session.os,
      deviceType: session.deviceType,
      locationPermission: session.locationPermission,
      location: session.location || null,
      revokedAt: session.revokedAt,
      revokeReason: session.revokeReason,
      isCurrent: currentSessionId === session.sessionId,
    })),
  });
});

export const revokeSpecificAdminSession = asyncHandler(async (req, res) => {
  const adminId = req.user?._id || req.user?.userId;
  const { sessionId } = req.params;

  const session = await revokeAdminSession({
    adminId,
    sessionId,
    reason: "manual-session-revocation",
  });

  if (!session) {
    return errorResponse(res, 404, "Active admin session not found");
  }

  return successResponse(res, 200, "Admin session revoked successfully", {
    sessionId,
    currentSessionRevoked: req.token?.sessionId === sessionId,
  });
});

export const saveCurrentAdminSessionLocation = asyncHandler(async (req, res) => {
  const adminId = req.user?._id || req.user?.userId;
  const sessionId = req.token?.sessionId;

  if (!sessionId) {
    return errorResponse(res, 400, "Current admin session could not be identified");
  }

  const session = await updateAdminSessionLocation({
    adminId,
    sessionId,
    sessionContext: req.body?.sessionContext || {},
  });

  if (!session) {
    return errorResponse(res, 404, "Active admin session not found");
  }

  return successResponse(res, 200, "Admin session location updated successfully", {
    sessionId,
    locationPermission: session.locationPermission,
    location: session.location || null,
  });
});

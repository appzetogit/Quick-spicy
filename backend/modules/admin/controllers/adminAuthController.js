import Admin from '../models/Admin.js';
import jwtService from '../../auth/services/jwtService.js';
import otpService from '../../auth/services/otpService.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import winston from 'winston';
import { randomUUID } from 'crypto';
import {
  createAdminSession,
  revokeAdminSession,
  revokeAllAdminSessions,
  rotateAdminSession,
  validateAdminSession,
} from '../services/adminSessionService.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const ADMIN_REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

const ADMIN_ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000
};

const clearAdminRefreshCookie = (res) => {
  res.cookie('refreshToken', '', {
    ...ADMIN_REFRESH_COOKIE_OPTIONS,
    maxAge: 0
  });
};

const setAdminAccessCookie = (res, accessToken) => {
  res.cookie('adminAccessToken', accessToken, ADMIN_ACCESS_COOKIE_OPTIONS);
};

const clearAdminAccessCookie = (res) => {
  res.cookie('adminAccessToken', '', {
    ...ADMIN_ACCESS_COOKIE_OPTIONS,
    maxAge: 0
  });
};

const buildAdminTokenPayload = (admin, sessionId = null) => ({
  userId: admin._id.toString(),
  role: 'admin',
  email: admin.email,
  adminRole: admin.role,
  tokenVersion: admin.tokenVersion || 0,
  ...(sessionId ? { sessionId } : {})
});

const maskEmail = (email = '') => {
  const [local = '', domain = ''] = String(email).split('@');
  if (!local || !domain) return email;
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
};

const getAdminOtpTarget = (admin) => {
  if (admin.phoneVerified && admin.phone) {
    return {
      phone: admin.phone,
      email: null,
      channel: 'phone',
      maskedTarget: `******${String(admin.phone).replace(/\D/g, '').slice(-4)}`
    };
  }

  return {
    phone: null,
    email: admin.email,
    channel: 'email',
    maskedTarget: maskEmail(admin.email)
  };
};

/**
 * Admin Login
 * POST /api/admin/auth/login
 */
export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return errorResponse(res, 400, 'Email and password are required');
  }

  // Find admin by email (including password for comparison)
  const admin = await Admin.findOne({ email: email.toLowerCase() }).select('+password');

  if (!admin) {
    return errorResponse(res, 401, 'Invalid email or password');
  }

  if (!admin.isActive) {
    return errorResponse(res, 401, 'Admin account is inactive. Please contact super admin.');
  }

  // Verify password
  const isPasswordValid = await admin.comparePassword(password);

  if (!isPasswordValid) {
    return errorResponse(res, 401, 'Invalid email or password');
  }

  const otpTarget = getAdminOtpTarget(admin);
  await otpService.generateAndSendOTP(
    otpTarget.phone,
    'admin-login',
    otpTarget.email
  );

  logger.info(`Admin login OTP sent: ${admin._id}`, {
    email: admin.email,
    channel: otpTarget.channel
  });

  return successResponse(res, 200, 'OTP sent successfully', {
    requiresOtp: true,
    channel: otpTarget.channel,
    maskedTarget: otpTarget.maskedTarget,
    email: admin.email
  });
});

export const verifyAdminLoginOtp = asyncHandler(async (req, res) => {
  const { email, password, otp, sessionContext } = req.body;

  if (!email || !password || !otp) {
    return errorResponse(res, 400, 'Email, password, and OTP are required');
  }

  const admin = await Admin.findOne({ email: email.toLowerCase() }).select('+password');

  if (!admin) {
    return errorResponse(res, 401, 'Invalid email, password, or OTP');
  }

  if (!admin.isActive) {
    return errorResponse(res, 401, 'Admin account is inactive. Please contact super admin.');
  }

  const isPasswordValid = await admin.comparePassword(password);
  if (!isPasswordValid) {
    return errorResponse(res, 401, 'Invalid email, password, or OTP');
  }

  const otpTarget = getAdminOtpTarget(admin);
  await otpService.verifyOTP(
    otpTarget.phone,
    otp,
    'admin-login',
    otpTarget.email
  );

  await admin.updateLastLogin();

  const sessionId = randomUUID();
  const tokens = jwtService.generateTokens(buildAdminTokenPayload(admin, sessionId));
  await createAdminSession({
    admin,
    sessionId,
    refreshToken: tokens.refreshToken,
    req,
    sessionContext,
  });
  setAdminAccessCookie(res, tokens.accessToken);
  res.cookie('refreshToken', tokens.refreshToken, ADMIN_REFRESH_COOKIE_OPTIONS);

  const adminResponse = admin.toObject();
  delete adminResponse.password;

  logger.info(`Admin logged in with OTP: ${admin._id}`, { email: admin.email });

  return successResponse(res, 200, 'Login successful', {
    accessToken: tokens.accessToken,
    admin: adminResponse
  });
});

export const refreshAdminToken = asyncHandler(async (req, res) => {
  // Prefer explicit module refresh token header to avoid cross-module cookie collisions.
  const refreshToken = req.cookies?.refreshToken || req.headers['x-refresh-token'];

  if (!refreshToken) {
    return errorResponse(res, 401, 'Refresh token not found');
  }

  try {
    const decoded = jwtService.verifyRefreshToken(refreshToken);

    if (decoded.role !== 'admin') {
      return errorResponse(res, 401, 'Invalid token for admin');
    }

    const admin = await Admin.findById(decoded.userId);

    if (!admin || !admin.isActive) {
      return errorResponse(res, 401, 'Admin not found or inactive');
    }

    // Version check: if it changed, every outstanding session is revoked.
    if (decoded.tokenVersion !== admin.tokenVersion) {
      clearAdminRefreshCookie(res);
      return errorResponse(res, 401, 'Session expired or revoked. Please log in again.');
    }

    const activeSession = await validateAdminSession({
      adminId: admin._id,
      sessionId: decoded.sessionId,
      refreshToken,
    });

    if (!activeSession) {
      clearAdminRefreshCookie(res);
      return errorResponse(res, 401, 'Admin session not found or already revoked. Please log in again.');
    }

    // Re-issue tokens without changing session version.
    const tokens = jwtService.generateTokens(buildAdminTokenPayload(admin, decoded.sessionId));
    await rotateAdminSession({
      adminId: admin._id,
      sessionId: decoded.sessionId,
      currentRefreshToken: refreshToken,
      nextRefreshToken: tokens.refreshToken,
    });

    setAdminAccessCookie(res, tokens.accessToken);
    res.cookie('refreshToken', tokens.refreshToken, ADMIN_REFRESH_COOKIE_OPTIONS);

    return successResponse(res, 200, 'Token refreshed successfully', {
      accessToken: tokens.accessToken
    });
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid refresh token');
  }
});

/**
 * Get Current Admin
 * GET /api/admin/auth/me
 */
export const getCurrentAdmin = asyncHandler(async (req, res) => {
  try {
    // req.user should be set by admin authentication middleware
    const admin = await Admin.findById(req.user._id || req.user.userId)
      .select('-password')
      .lean();

    if (!admin) {
      return errorResponse(res, 404, 'Admin not found');
    }

    return successResponse(res, 200, 'Admin retrieved successfully', {
      admin
    });
  } catch (error) {
    logger.error(`Error fetching current admin: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch admin');
  }
});

/**
 * Logout Admin
 * POST /api/admin/auth/logout
 */
export const adminLogout = asyncHandler(async (req, res) => {
  await revokeAdminSession({
    adminId: req.user?._id || req.user?.userId,
    sessionId: req.token?.sessionId,
    reason: 'logout',
  });
  clearAdminAccessCookie(res);
  clearAdminRefreshCookie(res);

  logger.info(`Admin logged out: ${req.user?._id || req.user?.userId}`);

  return successResponse(res, 200, 'Logout successful');
});

/**
 * Logout all admin sessions by bumping token version.
 * POST /api/admin/auth/logout-all
 */
export const adminLogoutAll = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.user?._id || req.user?.userId);

  if (!admin) {
    clearAdminAccessCookie(res);
    clearAdminRefreshCookie(res);
    return errorResponse(res, 404, 'Admin not found');
  }

  admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  await admin.save();
  await revokeAllAdminSessions(admin._id, 'logout-all');
  clearAdminAccessCookie(res);
  clearAdminRefreshCookie(res);

  logger.info(`Admin logged out from all sessions: ${admin._id}`, {
    tokenVersion: admin.tokenVersion
  });

  return successResponse(res, 200, 'All admin sessions logged out successfully');
});


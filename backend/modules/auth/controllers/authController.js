import User from "../models/User.js";
import UserWallet from "../../user/models/UserWallet.js";
import otpService from "../services/otpService.js";
import jwtService from "../services/jwtService.js";
import googleAuthService from "../services/googleAuthService.js";
import firebaseAuthService from "../services/firebaseAuthService.js";
import {
  normalizeFcmChannel as normalizeSharedFcmChannel,
  removeNotificationDevice,
  upsertNotificationDevice,
} from "../../notification/utils/deviceTokens.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import {
  clearAuthCookies,
  getRefreshTokenFromRequest,
  setAuthCookies,
} from "../../../shared/utils/authCookies.js";
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

const REFERRAL_REWARD_AMOUNT = 50;
const NEW_USER_WALLET_CREDIT_AMOUNT = 20;
const normalizePhoneToTenDigits = (value = "") =>
  String(value || "")
    .replace(/\D/g, "")
    .slice(-10);

const normalizeReferralCode = (code = "") =>
  String(code || "").trim().toUpperCase();

const buildReferralBase = (name = "") => {
  const letters = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
  return letters || "USER";
};

const generateRandomSuffix = () =>
  Math.floor(1000 + Math.random() * 9000).toString();

const generateUniqueReferralCode = async (name = "") => {
  const base = buildReferralBase(name);
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const candidate = `${base}${generateRandomSuffix()}`;
    const exists = await User.exists({ referralCode: candidate });
    if (!exists) return candidate;
  }
  return `QS${Date.now().toString().slice(-8)}`;
};

const resolveReferrerByCode = async (referralCode) => {
  const code = normalizeReferralCode(referralCode);
  if (!code) return null;

  const referrer = await User.findOne({
    referralCode: code,
    role: "user",
    isActive: true,
  });

  if (!referrer) {
    throw new Error("Invalid referral code");
  }

  return referrer;
};

const applyReferralReward = async ({ newUser, referrer }) => {
  if (!newUser || !referrer || newUser.role !== "user") return;
  if (newUser.referralRewardGranted) return;

  const rewardDescription = `Referral reward: ${newUser.name || "New user"} joined`;

  const wallet = await UserWallet.findOrCreateByUserId(referrer._id);
  wallet.addTransaction({
    amount: REFERRAL_REWARD_AMOUNT,
    type: "addition",
    status: "Completed",
    description: rewardDescription,
    paymentMethod: "wallet",
    metadata: new Map([
      ["source", "referral_signup"],
      ["referredUserId", newUser._id.toString()],
      ["referredUserName", newUser.name || ""],
    ]),
  });
  await wallet.save();

  await User.findByIdAndUpdate(referrer._id, {
    "wallet.balance": wallet.balance,
    "wallet.currency": wallet.currency || "INR",
  });

  newUser.referredBy = referrer._id;
  newUser.referredAt = new Date();
  newUser.referralRewardGranted = true;
  await newUser.save();
};

const applyNewUserWalletCredit = async (user) => {
  if (!user || user.role !== "user") return;

  const wallet = await UserWallet.findOrCreateByUserId(user._id);
  const alreadyCredited = (wallet.transactions || []).some(
    (transaction) =>
      transaction?.status === "Completed" &&
      transaction?.type === "addition" &&
      transaction?.metadata?.get?.("source") === "new_user_signup_bonus",
  );

  if (alreadyCredited) {
    await User.findByIdAndUpdate(user._id, {
      "wallet.balance": wallet.balance,
      "wallet.currency": wallet.currency || "INR",
    });
    return;
  }

  wallet.addTransaction({
    amount: NEW_USER_WALLET_CREDIT_AMOUNT,
    type: "addition",
    status: "Completed",
    description: "Welcome bonus for new account signup",
    paymentMethod: "wallet",
    metadata: new Map([
      ["source", "new_user_signup_bonus"],
      ["reason", "new_user_wallet_credit"],
      ["userId", user._id.toString()],
    ]),
  });
  await wallet.save();

  await User.findByIdAndUpdate(user._id, {
    "wallet.balance": wallet.balance,
    "wallet.currency": wallet.currency || "INR",
  });
};

const ensureReferralCodeForUser = async (user) => {
  if (!user || user.role !== "user") return user;
  if (user.referralCode) return user;
  user.referralCode = await generateUniqueReferralCode(user.name || "USER");
  await user.save();
  return user;
};

const resolveFcmChannel = (channel = null, platform = "web", headers = {}) => {
  if (String(platform || "").trim().toLowerCase() === "both") {
    return "both";
  }
  return normalizeSharedFcmChannel(channel, platform, headers);
};

/**
 * Send OTP for phone number or email
 * POST /api/auth/send-otp
 */
export const sendOTP = asyncHandler(async (req, res) => {
  const { phone, email, purpose = "login" } = req.body;

  // Validate that either phone or email is provided
  if (!phone && !email) {
    return errorResponse(res, 400, "Either phone number or email is required");
  }

  // Validate phone number format if provided
  if (phone) {
    const phoneRegex =
      /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
    if (!phoneRegex.test(phone)) {
      return errorResponse(res, 400, "Invalid phone number format");
    }
  }

  // Validate email format if provided
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse(res, 400, "Invalid email format");
    }
  }

  try {
    const result = await otpService.generateAndSendOTP(
      phone || null,
      purpose,
      email || null,
    );
    return successResponse(res, 200, result.message, {
      expiresIn: result.expiresIn,
      identifierType: result.identifierType,
    });
  } catch (error) {
    logger.error(`Error sending OTP: ${error.message}`);
    return errorResponse(res, 500, error.message);
  }
});

/**
 * Verify OTP and login/register
 * POST /api/auth/verify-otp
 */
export const verifyOTP = asyncHandler(async (req, res) => {
  const {
    phone,
    email,
    otp,
    purpose = "login",
    name,
    role = "user",
    password,
    referralCode,
  } = req.body;

  // Validate that either phone or email is provided
  if ((!phone && !email) || !otp) {
    return errorResponse(
      res,
      400,
      "Either phone number or email, and OTP are required",
    );
  }

  // Validate role - admin can be used for admin signup/reset
  const allowedRoles = ["user", "restaurant", "delivery", "admin"];
  const userRole = role || "user";
  if (!allowedRoles.includes(userRole)) {
    return errorResponse(
      res,
      400,
      `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  // For email-based admin registration, password is mandatory
  if (purpose === "register" && !phone && userRole === "admin" && !password) {
    return errorResponse(
      res,
      400,
      "Password is required for admin email registration",
    );
  }

  try {
    let user;
    const identifier = phone || email;
    const identifierType = phone ? "phone" : "email";

    if (purpose === "register") {
      const referrer =
        userRole === "user" && referralCode
          ? await resolveReferrerByCode(referralCode)
          : null;

      // Registration flow
      // Check if user already exists with same email/phone AND role
      const findQuery = phone
        ? { phone, role: userRole }
        : { email, role: userRole };
      user = await User.findOne(findQuery);

      if (user) {
        return errorResponse(
          res,
          400,
          `User already exists with this ${identifierType} and role. Please login.`,
        );
      }

      // Name is mandatory for explicit registration
      if (!name) {
        return errorResponse(res, 400, "Name is required for registration");
      }

      // Verify OTP (phone or email) before creating user
      await otpService.verifyOTP(phone || null, otp, purpose, email || null);

      const userData = {
        name,
        role: userRole,
        signupMethod: phone ? "phone" : "email",
      };

      if (userRole === "user") {
        userData.referralCode = await generateUniqueReferralCode(name);
      }

      if (phone) {
        userData.phone = phone;
        userData.phoneVerified = true;
      }
      if (email) {
        userData.email = email;
        // Note: We could add emailVerified field if needed
      }

      // If password provided (email/password registration like admin signup), set it
      if (password && !phone) {
        userData.password = password;
      }

      try {
        user = await User.create(userData);
        await applyNewUserWalletCredit(user);
        if (referrer) {
          await applyReferralReward({ newUser: user, referrer });
        }
      } catch (createError) {
        // Handle duplicate key error - user might have been created between findOne and create
        if (createError.code === 11000) {
          // Try to find the user again
          const findQuery = phone
            ? { phone, role: userRole }
            : { email, role: userRole };
          user = await User.findOne(findQuery);
          if (!user) {
            throw createError; // Re-throw if still not found
          }
          // User exists, return error that they should login instead
          return errorResponse(
            res,
            400,
            `User already exists with this ${identifierType} and role. Please login.`,
          );
        } else {
          throw createError;
        }
      }

      logger.info(`New user registered: ${user._id}`, {
        [identifierType]: identifier,
        userId: user._id,
        role: userRole,
      });
    } else {
      // Login (with optional auto-registration)
      // Find user by email/phone AND role to ensure correct module access
      const findQuery = phone
        ? { phone, role: userRole }
        : { email, role: userRole };
      user = await User.findOne(findQuery);

      if (!user && !name) {
        // OTP has NOT been verified yet in this flow.
        // Tell the client that we need user's name to proceed with auto-registration.
        // The client should collect name and call this endpoint again with the same OTP and name.
        return successResponse(
          res,
          200,
          "User not found. Please provide name for registration.",
          {
            needsName: true,
            identifierType,
            identifier,
          },
        );
      }

      // Handle reset-password purpose
      if (purpose === "reset-password") {
        if (!user) {
          return errorResponse(
            res,
            404,
            `No ${userRole} account found with this email.`,
          );
        }
        // Verify OTP for password reset
        await otpService.verifyOTP(phone || null, otp, purpose, email || null);
        // Return success - frontend will call reset-password endpoint with OTP
        return successResponse(
          res,
          200,
          "OTP verified. You can now reset your password.",
          {
            verified: true,
            email: user.email,
          },
        );
      }

      // At this point, either:
      // - user exists (normal login), or
      // - user does not exist but name is provided (auto-registration)
      // In both cases we must verify OTP first.
      await otpService.verifyOTP(phone || null, otp, purpose, email || null);

      if (!user) {
        const referrer =
          userRole === "user" && referralCode
            ? await resolveReferrerByCode(referralCode)
            : null;

        // Auto-register new user after OTP verification
        const userData = {
          name,
          role: userRole,
          signupMethod: phone ? "phone" : "email",
        };

        if (userRole === "user") {
          userData.referralCode = await generateUniqueReferralCode(name);
        }

        if (phone) {
          userData.phone = phone;
          userData.phoneVerified = true;
        }
        // Only include email if provided (don't set to null)
        if (email) {
          userData.email = email;
        }

        if (password && !phone) {
          userData.password = password;
        }

        try {
          user = await User.create(userData);
          await applyNewUserWalletCredit(user);
          if (referrer) {
            await applyReferralReward({ newUser: user, referrer });
          }
        } catch (createError) {
          // Handle duplicate key error - user might have been created between findOne and create
          if (createError.code === 11000) {
            // Try to find the user again
            const findQuery = phone
              ? { phone, role: userRole }
              : { email, role: userRole };
            user = await User.findOne(findQuery);
            if (!user) {
              throw createError; // Re-throw if still not found
            }
            // User exists, continue with login flow
            logger.info(`User found after duplicate key error: ${user._id}`);
          } else {
            throw createError;
          }
        }

        logger.info(`New user auto-registered: ${user._id}`, {
          [identifierType]: identifier,
          userId: user._id,
          role: userRole,
        });
      } else {
        // Existing user login - update verification status if needed
        if (phone && !user.phoneVerified) {
          user.phoneVerified = true;
          await user.save();
        }
        // Could add email verification status update here if needed
      }
    }

    await ensureReferralCodeForUser(user);

    // Generate tokens
    const tokens = jwtService.generateTokens({
      userId: user._id.toString(),
      role: user.role,
      phone: user.phone,
      tokenVersion: user.tokenVersion || 0,
    });

    setAuthCookies(res, "user", tokens);

    // Return access token and user info
    return successResponse(res, 200, "Authentication successful", {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        role: user.role,
        profileImage: user.profileImage,
        signupMethod: user.signupMethod,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    logger.error(`Error verifying OTP: ${error.message}`);
    return errorResponse(res, 400, error.message);
  }
});

/**
 * Refresh Access Token
 * POST /api/auth/refresh-token
 */
export const refreshToken = asyncHandler(async (req, res) => {
  // Get refresh token from cookie
  const refreshToken = getRefreshTokenFromRequest(req, "user");

  if (!refreshToken) {
    return errorResponse(res, 401, "Refresh token not found");
  }

  try {
    // Verify refresh token
    const decoded = jwtService.verifyRefreshToken(refreshToken);

    // Get user
    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return errorResponse(res, 401, "User not found or inactive");
    }

    // RTR check: if tokenVersion mismatch, token reuse detected. Revoke all.
    if (decoded.tokenVersion !== user.tokenVersion) {
      user.tokenVersion += 1;
      await user.save();
      clearAuthCookies(res, "user");
      return errorResponse(res, 401, "Session expired or revoked. Please log in again.");
    }

    // Rotate version
    user.tokenVersion += 1;
    await user.save();

    // Generate new access and refresh tokens
    const tokens = jwtService.generateTokens({
      userId: user._id.toString(),
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    setAuthCookies(res, "user", tokens);

    return successResponse(res, 200, "Token refreshed successfully");
  } catch (error) {
    return errorResponse(res, 401, error.message || "Invalid refresh token");
  }
});

/**
 * Logout
 * POST /api/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  // Clear refresh token cookie
  clearAuthCookies(res, "user");

  return successResponse(res, 200, "Logged out successfully");
});

/**
 * Register with email and password
 * POST /api/auth/register
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, referralCode } = req.body;

  if (!name || !email || !password || !phone) {
    return errorResponse(
      res,
      400,
      "Name, email, password, and phone are required. Complete phone OTP verification to finish registration.",
    );
  }

  const userRole = "user";

  const findQuery = {};
  if (email) findQuery.email = email;
  if (phone) findQuery.phone = phone;
  findQuery.role = userRole;

  const existingUser = await User.findOne(findQuery);

  if (existingUser) {
    if (existingUser.email === email) {
      return errorResponse(
        res,
        400,
        `User with this email and role (${userRole}) already exists. Please login.`,
      );
    }
    if (existingUser.phone === phone) {
      return errorResponse(
        res,
        400,
        `User with this phone number and role (${userRole}) already exists. Please login.`,
      );
    }
  }

  const referrer =
    userRole === "user" && referralCode
      ? await resolveReferrerByCode(referralCode)
      : null;

  // Create new user
  const user = await User.create({
    name,
    email,
    password, // Will be hashed by pre-save hook
    phone: phone || null,
    role: userRole,
    signupMethod: "email", // Email/password registration
    ...(userRole === "user"
      ? { referralCode: await generateUniqueReferralCode(name) }
      : {}),
  });

  await applyNewUserWalletCredit(user);

  if (referrer) {
    await applyReferralReward({ newUser: user, referrer });
  }

  logger.info(`New user registered via email: ${user._id}`, {
    email,
    userId: user._id,
    role: userRole,
  });

  // Send welcome email
  if (user.email) {
    // Import emailService dynamically to avoid circular dependencies if any
    const emailService = (await import("../services/emailService.js")).default;
    emailService.sendWelcomeEmail(user.email, user.name).catch((err) => {
      logger.error(`Failed to send welcome email: ${err.message}`);
    });
  }

  return successResponse(
    res,
    201,
    "Registration created. Verify your phone with OTP before login.",
    {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      role: user.role,
      profileImage: user.profileImage,
      signupMethod: user.signupMethod,
      referralCode: user.referralCode,
    },
      requiresPhoneVerification: true,
    },
  );
});

/**
 * Login with email and password
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return errorResponse(res, 400, "Email and password are required");
  }

  const allowedRoles = ["user", "restaurant", "delivery", "admin"];
  const userRole = role || "user";
  if (!allowedRoles.includes(userRole)) {
    return errorResponse(
      res,
      400,
      `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  // Always scope login by role so each module authenticates against its own account type.
  const normalizedEmail = email.toLowerCase().trim();
  const findQuery = { email: normalizedEmail, role: userRole };

  const user = await User.findOne(findQuery).select("+password");

  if (!user) {
    return errorResponse(res, 401, "Invalid email or password");
  }

  if (!user.isActive) {
    return errorResponse(
      res,
      401,
      "Account is inactive. Please contact support.",
    );
  }

  // Check if user has a password set
  if (!user.password) {
    return errorResponse(
      res,
      400,
      "Account was created with phone. Please use OTP login.",
    );
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    return errorResponse(res, 401, "Invalid email or password");
  }

  await ensureReferralCodeForUser(user);

  // Generate tokens
  const tokens = jwtService.generateTokens({
    userId: user._id.toString(),
    role: user.role,
    email: user.email,
    tokenVersion: user.tokenVersion || 0,
  });

  // Set refresh token in httpOnly cookie
  res.cookie("refreshToken", tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  logger.info(`User logged in via email: ${user._id}`, {
    email: normalizedEmail,
    userId: user._id,
    role: userRole,
  });

  return successResponse(res, 200, "Login successful", {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      role: user.role,
      profileImage: user.profileImage,
      signupMethod: user.signupMethod,
      referralCode: user.referralCode,
    },
  });
});

/**
 * Reset Password with OTP verification
 * POST /api/auth/reset-password
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword, role } = req.body;

  if (!email || !otp || !newPassword) {
    return errorResponse(res, 400, "Email, OTP, and new password are required");
  }

  if (newPassword.length < 6) {
    return errorResponse(
      res,
      400,
      "Password must be at least 6 characters long",
    );
  }

  // Find user by email and role (if role provided) to ensure correct module access
  const findQuery = { email };
  if (role) {
    findQuery.role = role;
  }

  const user = await User.findOne(findQuery).select("+password");

  if (!user) {
    return errorResponse(
      res,
      404,
      role ? `No ${role} account found with this email.` : "User not found",
    );
  }

  // If role was provided but doesn't match, return error
  if (role && user.role !== role) {
    return errorResponse(res, 404, `No ${role} account found with this email.`);
  }

  // Verify OTP for reset-password purpose
  try {
    await otpService.verifyOTP(null, otp, "reset-password", email);
  } catch (error) {
    logger.error(
      `OTP verification failed for password reset: ${error.message}`,
    );
    return errorResponse(
      res,
      400,
      "Invalid or expired OTP. Please request a new one.",
    );
  }

  // Update password
  user.password = newPassword; // Will be hashed by pre-save hook
  await user.save();

  logger.info(`Password reset successful for user: ${user._id}`, {
    email,
    userId: user._id,
  });

  return successResponse(
    res,
    200,
    "Password reset successfully. Please login with your new password.",
  );
});

/**
 * Get current user
 * GET /api/auth/me
 */
export const getCurrentUser = asyncHandler(async (req, res) => {
  await ensureReferralCodeForUser(req.user);

  // User is attached by authenticate middleware
  return successResponse(res, 200, "User retrieved successfully", {
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      phoneVerified: req.user.phoneVerified,
      role: req.user.role,
      profileImage: req.user.profileImage,
      signupMethod: req.user.signupMethod,
      preferences: req.user.preferences,
      wallet: req.user.wallet,
      referralCode: req.user.referralCode,
      referredBy: req.user.referredBy,
      referredAt: req.user.referredAt,
      // Include additional profile fields
      dateOfBirth: req.user.dateOfBirth,
      anniversary: req.user.anniversary,
      gender: req.user.gender,
    },
  });
});

/**
 * Save/update FCM token for authenticated user (all roles in /auth module)
 * POST /api/auth/fcm-token
 */
export const saveFcmToken = asyncHandler(async (req, res) => {
  const { token, platform = "web", channel = null, deviceId = "", source = "" } = req.body || {};

  if (!token || !String(token).trim()) {
    return errorResponse(res, 400, "FCM token is required");
  }

  const normalizedToken = String(token).trim();
  const normalizedChannel = resolveFcmChannel(channel, platform, req.headers);

  const user = await User.findById(req.user._id);
  if (!user) {
    return errorResponse(res, 404, "User not found");
  }

  if (normalizedChannel === "both") {
    upsertNotificationDevice(user, {
      token: normalizedToken,
      channel: "web",
      platform: "web",
      deviceId: deviceId ? `${deviceId}:web` : "",
      source,
      headers: req.headers,
    });
    upsertNotificationDevice(user, {
      token: normalizedToken,
      channel: "mobile",
      platform: String(platform || "mobile").trim().toLowerCase(),
      deviceId: deviceId ? `${deviceId}:mobile` : "",
      source,
      headers: req.headers,
    });
  } else {
    upsertNotificationDevice(user, {
      token: normalizedToken,
      channel: normalizedChannel,
      platform,
      deviceId,
      source,
      headers: req.headers,
    });
  }

  await user.save();

  return successResponse(res, 200, "FCM token saved successfully", {
    role: user.role,
    channel: normalizedChannel,
    fcmtokenweb: user.fcmtokenweb || null,
    fcmtokenmobile: user.fcmtokenmobile || null,
    notificationDevices: user.notificationDevices || [],
  });
});

/**
 * Remove FCM token for authenticated user
 * DELETE /api/auth/fcm-token
 */
export const removeFcmToken = asyncHandler(async (req, res) => {
  const { token = null, platform = null, channel = null, deviceId = null } = req.body || {};
  const normalizedToken = token ? String(token).trim() : null;
  const normalizedChannel = platform || channel ? resolveFcmChannel(channel, platform, req.headers) : null;

  const user = await User.findById(req.user._id);
  if (!user) {
    return errorResponse(res, 404, "User not found");
  }

  if (normalizedChannel === "both" && !normalizedToken && !deviceId) {
    user.notificationDevices = [];
    user.fcmtokenweb = null;
    user.fcmtokenmobile = null;
  } else {
    removeNotificationDevice(user, {
      token: normalizedToken,
      platform,
      channel: normalizedChannel,
      deviceId,
      headers: req.headers,
    });
  }

  await user.save();

  return successResponse(res, 200, "FCM token removed successfully", {
    role: user.role,
    fcmtokenweb: user.fcmtokenweb || null,
    fcmtokenmobile: user.fcmtokenmobile || null,
    notificationDevices: user.notificationDevices || [],
  });
});

/**
 * Save web-only FCM token
 * POST /api/auth/fcm-token/web
 */
export const saveWebFcmToken = asyncHandler(async (req, res) => {
  req.body = { ...(req.body || {}), platform: "web" };
  return saveFcmToken(req, res);
});

/**
 * Save mobile-only FCM token (Flutter APK route)
 * POST /api/auth/fcm-token/mobile
 */
export const saveMobileFcmToken = asyncHandler(async (req, res) => {
  req.body = { ...(req.body || {}), platform: "mobile" };
  return saveFcmToken(req, res);
});

/**
 * Login / register using Firebase Google ID token
 * POST /api/auth/firebase/google-login
 */
export const firebaseGoogleLogin = asyncHandler(async (req, res) => {
  const { idToken, role = "restaurant", referralCode } = req.body;

  if (!idToken) {
    return errorResponse(res, 400, "Firebase ID token is required");
  }

  // Validate role - admin cannot be authenticated through this endpoint
  const allowedRoles = ["user", "restaurant", "delivery"];
  const userRole = role || "restaurant";
  if (!allowedRoles.includes(userRole)) {
    return errorResponse(
      res,
      400,
      `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  // Ensure Firebase Admin is configured
  await firebaseAuthService.init();
  if (!firebaseAuthService.isEnabled()) {
    return errorResponse(
      res,
      500,
      "Firebase Auth is not configured. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in backend .env",
    );
  }

  try {
    // Verify Firebase ID token
    const decoded = await firebaseAuthService.verifyIdToken(idToken);

    const firebaseUid = decoded.uid;
    const email = decoded.email || null;
    const name = decoded.name || decoded.display_name || "Google User";
    const picture = decoded.picture || decoded.photo_url || null;
    const emailVerified = !!decoded.email_verified;

    // Validate email is present
    if (!email) {
      logger.error("Firebase Google login failed: Email not found in token", {
        uid: firebaseUid,
      });
      return errorResponse(
        res,
        400,
        "Email not found in Firebase user. Please ensure email is available in your Google account.",
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      logger.error("Firebase Google login failed: Invalid email format", {
        email,
      });
      return errorResponse(
        res,
        400,
        "Invalid email format received from Google.",
      );
    }

    // Find existing user by firebase UID (stored in googleId) or email with same role
    let user = await User.findOne({
      $or: [{ googleId: firebaseUid }, { email, role: userRole }],
    });

    if (user) {
      // If user exists but googleId not linked yet, link it
      if (!user.googleId) {
        user.googleId = firebaseUid;
        user.googleEmail = email;
        if (!user.profileImage && picture) {
          user.profileImage = picture;
        }
        // Update signupMethod if not already set
        if (!user.signupMethod) {
          user.signupMethod = "google";
        }
        await user.save();
        logger.info("Linked Google account to existing user", {
          userId: user._id,
          email,
        });
      }

      // If this is a restaurant login, make sure role matches
      if (userRole === "restaurant" && user.role !== "restaurant") {
        return errorResponse(
          res,
          403,
          "This account is not registered as a restaurant partner",
        );
      }

      // If user role doesn't match requested role, return error
      if (user.role !== userRole) {
        return errorResponse(
          res,
          403,
          `This account is registered as ${user.role}, not ${userRole}`,
        );
      }

      logger.info("Existing user logged in via Firebase Google", {
        userId: user._id,
        email,
        role: user.role,
      });
    } else {
      const referrer =
        userRole === "user" && referralCode
          ? await resolveReferrerByCode(referralCode)
          : null;

      // Auto-register new user based on Firebase data
      const userData = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        googleId: firebaseUid,
        googleEmail: email.toLowerCase().trim(),
        role: userRole,
        signupMethod: "google",
        profileImage: picture || null,
        isActive: true,
        ...(userRole === "user"
          ? { referralCode: await generateUniqueReferralCode(name) }
          : {}),
      };

      try {
        user = await User.create(userData);
        await applyNewUserWalletCredit(user);
        if (referrer) {
          await applyReferralReward({ newUser: user, referrer });
        }

        logger.info("New user registered via Firebase Google login", {
          firebaseUid,
          email,
          userId: user._id,
          role: userRole,
          name: user.name,
        });
      } catch (createError) {
        // Handle duplicate key error - user might have been created between findOne and create
        if (createError.code === 11000) {
          logger.warn(
            "Duplicate key error during user creation, retrying find",
            { email, role: userRole },
          );
          user = await User.findOne({ email, role: userRole });
          if (!user) {
            logger.error("User not found after duplicate key error", {
              email,
              role: userRole,
            });
            throw createError;
          }
          // Link Google ID if not already linked
          if (!user.googleId) {
            user.googleId = firebaseUid;
            user.googleEmail = email;
            if (!user.profileImage && picture) {
              user.profileImage = picture;
            }
            if (!user.signupMethod) {
              user.signupMethod = "google";
            }
            await user.save();
          }
        } else {
          logger.error("Error creating user via Firebase Google login", {
            error: createError.message,
            email,
            role: userRole,
          });
          throw createError;
        }
      }
    }

    // Ensure user is active
    if (!user.isActive) {
      logger.warn("Inactive user attempted login", { userId: user._id, email });
      return errorResponse(
        res,
        403,
        "Your account has been deactivated. Please contact support.",
      );
    }

    await ensureReferralCodeForUser(user);

    // Generate JWT tokens for our app
    const tokens = jwtService.generateTokens({
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
      tokenVersion: user.tokenVersion || 0,
    });

    setAuthCookies(res, "user", tokens);

    return successResponse(
      res,
      200,
      "Firebase Google authentication successful",
      {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          phoneVerified: user.phoneVerified,
          role: user.role,
          profileImage: user.profileImage,
          signupMethod: user.signupMethod,
          referralCode: user.referralCode,
        },
      },
    );
  } catch (error) {
    logger.error(`Error in Firebase Google login: ${error.message}`);
    return errorResponse(
      res,
      400,
      error.message || "Firebase Google authentication failed",
    );
  }
});

/**
 * Initiate Google OAuth flow
 * GET /api/auth/google/:role
 */
export const googleAuth = asyncHandler(async (req, res) => {
  const { role } = req.params;

  // Validate role
  const allowedRoles = ["user", "restaurant", "delivery"];
  const userRole = role || "restaurant";

  if (!allowedRoles.includes(userRole)) {
    return errorResponse(
      res,
      400,
      `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  // Check if Google OAuth is configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return errorResponse(
      res,
      500,
      "Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env",
    );
  }

  try {
    const { authUrl, state } = googleAuthService.getAuthUrl(userRole);

    // Store state in session/cookie for verification (optional, for extra security)
    res.cookie("oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 10 * 60 * 1000, // 10 minutes
    });

    // Redirect to Google OAuth
    return res.redirect(authUrl);
  } catch (error) {
    logger.error(`Error initiating Google OAuth: ${error.message}`);
    return errorResponse(res, 500, "Failed to initiate Google OAuth");
  }
});

/**
 * Handle Google OAuth callback
 * GET /api/auth/google/:role/callback
 */
export const googleCallback = asyncHandler(async (req, res) => {
  const { role } = req.params;
  const { code, state, error } = req.query;

  // Validate role
  const allowedRoles = ["user", "restaurant", "delivery"];
  const userRole = role || "restaurant";

  if (!allowedRoles.includes(userRole)) {
    return errorResponse(
      res,
      400,
      `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  // Check for OAuth errors
  if (error) {
    logger.error(`Google OAuth error: ${error}`);
    return res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:5173"}/restaurant/login?error=oauth_failed`,
    );
  }

  if (!code) {
    return res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:5173"}/restaurant/login?error=no_code`,
    );
  }

  // Verify state parameter (mandatory for OAuth CSRF defense)
  const storedState = req.cookies?.oauth_state;
  if (!storedState || !state || state !== storedState) {
    logger.warn("OAuth state mismatch or missing - possible CSRF attack");
    return res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:5173"}/restaurant/login?error=invalid_state`,
    );
  }

  try {
    // Exchange code for tokens
    const tokens = await googleAuthService.getTokens(code);

    // Get user info from Google
    const googleUser = await googleAuthService.getUserInfoFromToken(tokens);

    if (!googleUser.email) {
      return res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:5173"}/restaurant/login?error=no_email`,
      );
    }

    // Find or create user
    let user = await User.findOne({
      $or: [{ googleId: googleUser.googleId }, { email: googleUser.email }],
    });

    if (user) {
      // Update Google info if not set
      if (!user.googleId) {
        user.googleId = googleUser.googleId;
        user.googleEmail = googleUser.email;
        if (!user.profileImage && googleUser.picture) {
          user.profileImage = googleUser.picture;
        }
        // Update signupMethod if not already set
        if (!user.signupMethod) {
          user.signupMethod = "google";
        }
        await user.save();
      }

      // Ensure role matches (for restaurant login, user should be restaurant)
      if (userRole === "restaurant" && user.role !== "restaurant") {
        return res.redirect(
          `${process.env.FRONTEND_URL || "http://localhost:5173"}/restaurant/login?error=wrong_role`,
        );
      }
    } else {
      // Create new user
      const userData = {
        name: googleUser.name || "Google User",
        email: googleUser.email,
        googleId: googleUser.googleId,
        googleEmail: googleUser.email,
        role: userRole,
        signupMethod: "google",
        profileImage: googleUser.picture || null,
        ...(userRole === "user"
          ? { referralCode: await generateUniqueReferralCode(googleUser.name) }
          : {}),
      };

      user = await User.create(userData);
      await applyNewUserWalletCredit(user);
      logger.info(`New user registered via Google: ${user._id}`, {
        email: googleUser.email,
        userId: user._id,
        role: userRole,
      });
    }

    await ensureReferralCodeForUser(user);

    // Generate JWT tokens
    const jwtTokens = jwtService.generateTokens({
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
      tokenVersion: user.tokenVersion || 0,
    });

    setAuthCookies(res, "user", jwtTokens);

    // Clear OAuth state cookie
    res.clearCookie("oauth_state");

    // Redirect to frontend with access token in hash fragment to hide from logs
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const redirectPath =
      userRole === "restaurant"
        ? "/restaurant/auth/google-callback"
        : userRole === "delivery"
          ? "/delivery/auth/google-callback"
          : "/user/auth/google-callback";

    const userDataObj = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      role: user.role,
      profileImage: user.profileImage,
      signupMethod: user.signupMethod,
      referralCode: user.referralCode,
    };

    const redirectUrl = `${frontendUrl}${redirectPath}?user=${encodeURIComponent(JSON.stringify(userDataObj))}#token=${jwtTokens.accessToken}`;

    return res.redirect(redirectUrl);
  } catch (error) {
    logger.error(`Error in Google OAuth callback: ${error.message}`);
    return res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:5173"}/restaurant/login?error=auth_failed`,
    );
  }
});

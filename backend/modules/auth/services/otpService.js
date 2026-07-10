import Otp from '../models/Otp.js';
import smsIndiaHubService from './smsIndiaHubService.js';
import emailService from './emailService.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const isProduction = process.env.NODE_ENV === 'production';
const getAllowedBypassOtp = () => {
  if (isProduction) {
    return null;
  }
  return process.env.BYPASS_OTP || null;
};

/**
 * Extract phone number digits (without country code)
 * @param {string} phone - Phone number in format like "+91 9098569620" or "+91-9098569620"
 * @returns {string} - Phone number digits only (e.g., "9098569620")
 */
const extractPhoneDigits = (phone) => {
  if (!phone) return '';
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  // If starts with country code (like 91), remove it to get last 10 digits
  // For Indian numbers, country code is 91, so we take last 10 digits
  if (digits.length > 10 && digits.startsWith('91')) {
    return digits.slice(-10);
  }
  // If exactly 10 digits or less, return as is
  return digits.length <= 10 ? digits : digits.slice(-10);
};

/**
 * Generate a random 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * OTP Service
 * Handles OTP generation, storage, and verification
 * Supports both phone and email OTP
 */
class OTPService {
  /**
   * Generate and send OTP via phone or email
   * @param {string} phone - Phone number (optional if email provided)
   * @param {string} email - Email address (optional if phone provided)
   * @param {string} purpose - Purpose of OTP (login, register, etc.)
   * @returns {Promise<Object>}
   */
  async generateAndSendOTP(phone = null, purpose = 'login', email = null) {
    try {
      // Validate that either phone or email is provided
      if (!phone && !email) {
        throw new Error('Either phone or email must be provided');
      }

      const normalizedPhone = phone ? extractPhoneDigits(phone) : null;
      const identifier = normalizedPhone || email;
      const identifierType = normalizedPhone ? 'phone' : 'email';

      // Check rate limiting (max 3 OTPs per identifier per hour) - using MongoDB
      if (process.env.NODE_ENV === 'production') {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const rateLimitQuery = {
          [identifierType]: identifier,
          purpose,
          createdAt: { $gte: oneHourAgo }
        };
        
        const recentOtpCount = await Otp.countDocuments(rateLimitQuery);
        if (recentOtpCount >= 3) {
          throw new Error('Too many OTP requests. Please try again after some time.');
        }
      }

      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Build query for invalidating previous OTPs
      const invalidateQuery = { purpose, verified: false };
      if (normalizedPhone) invalidateQuery.phone = normalizedPhone;
      if (email) invalidateQuery.email = email;

      // Invalidate previous OTPs for this identifier and purpose
      await Otp.updateMany(
        invalidateQuery,
        { verified: true } // Mark as used
      );

      // Store OTP in database
      const otpData = {
        otp,
        purpose,
        expiresAt
      };
      if (normalizedPhone) otpData.phone = normalizedPhone;
      if (email) otpData.email = email;

      const otpRecord = await Otp.create(otpData);

      // Send OTP via SMS or Email
      if (normalizedPhone) {
        // Use SMSIndia Hub for phone OTP
        try {
          const smsStartedAt = Date.now();
          const smsResult = await smsIndiaHubService.sendOTP(normalizedPhone, otp, purpose);
          logger.info(`SMS OTP dispatch completed`, {
            phone: normalizedPhone,
            purpose,
            requestMs: smsResult?.requestMs ?? (Date.now() - smsStartedAt),
            providerStatus: smsResult?.status || 'unknown',
            providerMessageId: smsResult?.messageId || null
          });
        } catch (smsError) {
          // In development, allow OTP flow to continue for local testing even if SMS provider is misconfigured.
          // Also allow it in production if a bypass OTP is enabled to prevent configuration lockouts.
          if (!isProduction) {
            logger.warn(`SMS send failed, continuing without SMS (bypass/development mode active): ${smsError.message}`, {
              phone: normalizedPhone,
              purpose
            });
          } else {
            throw smsError;
          }
        }
      } else if (email) {
        try {
          await emailService.sendOTP(email, otp, purpose);
        } catch (emailError) {
          if (!isProduction) {
            logger.warn(`Email send failed, continuing without Email (bypass/development mode active): ${emailError.message}`, {
              email,
              purpose
            });
          } else {
            throw emailError;
          }
        }
      }

      logger.info(`OTP generated and sent to ${identifier} (${identifierType})`, {
        [identifierType]: identifier,
        purpose,
        otpId: otpRecord._id
      });

      return {
        success: true,
        message: `OTP sent successfully to ${identifierType === 'phone' ? 'phone' : 'email'}`,
        expiresIn: 300, // 5 minutes in seconds
        identifierType
      };
    } catch (error) {
      logger.error(`Error generating OTP: ${error.message}`, {
        phone,
        email,
        purpose,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verify OTP
   * @param {string} phone - Phone number (optional if email provided)
   * @param {string} otp - OTP code
   * @param {string} purpose - Purpose of OTP
   * @param {string} email - Email address (optional if phone provided)
   * @returns {Promise<Object>}
   */
  async verifyOTP(phone = null, otp, purpose = 'login', email = null) {
    try {
      if (!phone && !email) {
        throw new Error('Either phone or email must be provided');
      }

      const normalizedPhone = phone ? extractPhoneDigits(phone) : null;
      const identifier = normalizedPhone || email;
      const identifierType = normalizedPhone ? 'phone' : 'email';

      // Master/Developer OTP bypass (if configured in .env)
      const bypassOtp = getAllowedBypassOtp();
      if (bypassOtp && otp === bypassOtp) {
        logger.info(`OTP verification bypassed using master OTP for ${identifier}`);
        return {
          success: true,
          message: 'OTP verified successfully'
        };
      }

      // Verify OTP from database
      if (purpose === 'reset-password') {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const verifiedQuery = {
          otp,
          purpose,
          verified: true,
          expiresAt: { $gt: new Date() },
          updatedAt: { $gt: tenMinutesAgo }
        };
        if (normalizedPhone) verifiedQuery.phone = normalizedPhone;
        if (email) verifiedQuery.email = email;
        
        const alreadyVerified = await Otp.findOne(verifiedQuery);
        if (alreadyVerified) {
          return {
            success: true,
            message: 'OTP verified successfully'
          };
        }
      }

      const query = {
        purpose,
        verified: false,
        expiresAt: { $gt: new Date() },
        attempts: { $lt: 5 }
      };
      if (normalizedPhone) query.phone = normalizedPhone;
      if (email) query.email = email;

      // Atomic increment on attempts. If it is already >= 5, document won't match the query.
      const otpRecord = await Otp.findOneAndUpdate(
        query,
        { $inc: { attempts: 1 } },
        { new: true }
      );

      if (!otpRecord) {
        throw new Error('Invalid OTP, expired, or locked out due to too many attempts.');
      }

      if (otpRecord.otp !== otp) {
        throw new Error('Invalid or expired OTP');
      }

      // Mark as verified
      otpRecord.verified = true;
      await otpRecord.save();

      logger.info(`OTP verified successfully for ${identifier} (${identifierType})`, {
        [identifierType]: identifier,
        purpose
      });

      return {
        success: true,
        message: 'OTP verified successfully'
      };
    } catch (error) {
      logger.error(`Error verifying OTP: ${error.message}`, {
        phone,
        email,
        purpose,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Resend OTP
   * @param {string} phone - Phone number (optional if email provided)
   * @param {string} purpose - Purpose of OTP
   * @param {string} email - Email address (optional if phone provided)
   * @returns {Promise<Object>}
   */
  async resendOTP(phone = null, purpose = 'login', email = null) {
    return await this.generateAndSendOTP(phone, purpose, email);
  }
}

export default new OTPService();

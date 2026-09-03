import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

/**
 * JWT Service
 * Handles JWT token generation and verification
 */
class JWTService {
  constructor() {
    let secret = process.env.JWT_SECRET;

    this.secret = secret;
    // The access token is the only credential that survives closing the app. It is a
    // Bearer token in localStorage (the rider APK reads that same value to register
    // FCM), and localStorage persists across app restarts - whereas the refresh cookie
    // does not, because the Android WebView drops cookies on process death unless the
    // shell flushes them. So at 24h a rider who closed the app was signed out the next
    // day no matter how long the refresh token lived: the cookie needed to renew it was
    // already gone. Logout now revokes server-side, so this can be long without
    // becoming unrevokable.
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '30d';
    // Admins are excluded from the long session for the same reason they are excluded
    // from the long refresh: far more privilege, few of them, and no SMS to save.
    this.adminAccessTokenExpiry = process.env.JWT_ADMIN_ACCESS_EXPIRY || '24h';

    // How long someone stays signed in without touching the OTP flow again.
    //
    // Every expiry is a login, and every login is an SMS we pay for. At 7 days a
    // customer who orders monthly paid for an OTP every single time. The access
    // token is still short and refreshes silently in the background, so this only
    // controls how long that silent refresh is allowed to continue.
    //
    // Admins are deliberately excluded. They hold far more privilege, there are only
    // a handful of them, and their logins are a rounding error in SMS spend - so
    // there is nothing to save by weakening them.
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '365d';
    this.adminRefreshTokenExpiry = process.env.JWT_ADMIN_REFRESH_EXPIRY || '7d';
  }

  /**
   * Refresh lifetime for a role. Admin sessions stay short; everyone else stays
   * signed in until they log out.
   */
  getAccessExpiryForRole(role) {
    return String(role || '').toLowerCase() === 'admin'
      ? this.adminAccessTokenExpiry
      : this.accessTokenExpiry;
  }

  getRefreshExpiryForRole(role) {
    return String(role || '').toLowerCase() === 'admin'
      ? this.adminRefreshTokenExpiry
      : this.refreshTokenExpiry;
  }

  /**
   * Generate Access Token
   * @param {Object} payload - Token payload (userId, role, etc.)
   * @returns {string} - JWT access token
   */
  generateAccessToken(payload) {
    return jwt.sign(
      {
        ...payload,
        type: 'access'
      },
      this.secret,
      {
        expiresIn: this.getAccessExpiryForRole(payload?.role)
      }
    );
  }

  /**
   * Generate Refresh Token
   * @param {Object} payload - Token payload (userId, role, etc.)
   * @returns {string} - JWT refresh token
   */
  generateRefreshToken(payload) {
    return jwt.sign(
      {
        ...payload,
        type: 'refresh'
      },
      this.secret,
      {
        expiresIn: this.getRefreshExpiryForRole(payload?.role)
      }
    );
  }

  /**
   * Generate both access and refresh tokens
   * @param {Object} payload - Token payload
   * @returns {Object} - { accessToken, refreshToken }
   */
  generateTokens(payload) {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    return {
      accessToken,
      refreshToken
    };
  }

  /**
   * Verify Token
   * @param {string} token - JWT token
   * @param {string} type - Token type ('access' or 'refresh')
   * @returns {Object} - Decoded token payload
   */
  verifyToken(token, type = 'access') {
    try {
      const decoded = jwt.verify(token, this.secret);
      
      if (decoded.type !== type) {
        throw new Error(`Invalid token type. Expected ${type}, got ${decoded.type}`);
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Verify Access Token
   * @param {string} token - Access token
   * @returns {Object} - Decoded token payload
   */
  verifyAccessToken(token) {
    return this.verifyToken(token, 'access');
  }

  /**
   * Verify Refresh Token
   * @param {string} token - Refresh token
   * @returns {Object} - Decoded token payload
   */
  verifyRefreshToken(token) {
    return this.verifyToken(token, 'refresh');
  }
}

export default new JWTService();


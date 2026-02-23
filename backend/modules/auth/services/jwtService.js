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
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '24h';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
    
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
        expiresIn: this.accessTokenExpiry
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
        expiresIn: this.refreshTokenExpiry
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


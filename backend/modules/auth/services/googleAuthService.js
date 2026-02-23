import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
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

/**
 * Google OAuth Service
 * Handles Google OAuth authentication
 */
class GoogleAuthService {
  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    // Build redirect URI - backend callback endpoint
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || `${backendUrl}/api/auth/google/restaurant/callback`;
    
    // Initialize OAuth2 client
    this.oauth2Client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );
  }

  /**
   * Generate Google OAuth URL
   * @param {string} role - User role (user, restaurant, delivery)
   * @param {string} state - Optional state parameter for CSRF protection
   * @returns {string} Authorization URL
   */
  getAuthUrl(role = 'restaurant', state = null) {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    // Generate state if not provided (for CSRF protection)
    const stateParam = state || this.generateState(role);

    // Update redirect URI based on role
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${backendUrl}/api/auth/google/${role}/callback`;
    this.oauth2Client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      redirectUri
    );

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      include_granted_scopes: true,
      state: stateParam,
      prompt: 'consent' // Force consent screen to get refresh token
    });

    logger.info('Google OAuth URL generated', { role, state: stateParam, redirectUri });
    return { authUrl, state: stateParam };
  }

  /**
   * Generate random state for CSRF protection
   */
  generateState(role) {
    const randomString = Math.random().toString(36).substring(2, 15) + 
                        Math.random().toString(36).substring(2, 15);
    return `${role}_${randomString}_${Date.now()}`;
  }

  /**
   * Verify state parameter
   */
  verifyState(state, role) {
    if (!state) return false;
    return state.startsWith(`${role}_`);
  }

  /**
   * Exchange authorization code for tokens
   * @param {string} code - Authorization code from Google
   * @returns {Promise<Object>} Tokens and user info
   */
  async getTokens(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      
      // Set credentials
      this.oauth2Client.setCredentials(tokens);

      logger.info('Google tokens obtained successfully');
      return tokens;
    } catch (error) {
      logger.error(`Error getting Google tokens: ${error.message}`);
      throw new Error(`Failed to exchange code for tokens: ${error.message}`);
    }
  }

  /**
   * Get user info from Google
   * @param {string} accessToken - Google access token
   * @returns {Promise<Object>} User profile information
   */
  async getUserInfo(accessToken) {
    try {
      // Verify the token and get user info
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken: accessToken,
        audience: this.clientId
      });

      const payload = ticket.getPayload();
      
      // Alternative: Use OAuth2 API to get user info
      // This works better for OAuth2 flow
      const { data } = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const userInfo = {
        googleId: payload?.sub || data?.id,
        email: payload?.email || data?.email,
        name: payload?.name || data?.name,
        picture: payload?.picture || data?.picture,
        verified: payload?.email_verified || data?.verified_email || false
      };

      logger.info('Google user info retrieved', { email: userInfo.email });
      return userInfo;
    } catch (error) {
      logger.error(`Error getting Google user info: ${error.message}`);
      
      // Fallback: try direct API call
      try {
        const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });
        
        const data = response.data;
        return {
          googleId: data.id,
          email: data.email,
          name: data.name,
          picture: data.picture,
          verified: data.verified_email || false
        };
      } catch (fallbackError) {
        logger.error(`Fallback Google API call failed: ${fallbackError.message}`);
        throw new Error(`Failed to get user info from Google: ${error.message}`);
      }
    }
  }

  /**
   * Get user info using OAuth2 token (simpler approach)
   */
  async getUserInfoFromToken(tokens) {
    try {
      this.oauth2Client.setCredentials(tokens);
      
      // Use the OAuth2 client to get user info
      const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });

      const data = response.data;
      
      return {
        googleId: data.id,
        email: data.email,
        name: data.name,
        picture: data.picture,
        verified: data.verified_email || false
      };
    } catch (error) {
      logger.error(`Error getting user info from token: ${error.message}`);
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }
}

export default new GoogleAuthService();


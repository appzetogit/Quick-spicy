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
 * SMSHub OTP Service
 * Sends OTP via SMSHub API
 */
class SMSHubService {
  constructor() {
    this.apiKey = process.env.SMSHUB_API_KEY;
    this.apiUrl = process.env.SMSHUB_API_URL || 'https://api.smshub.com';
    this.senderId = process.env.SMSHUB_SENDER_ID || 'APPZETO';
  }

  /**
   * Get company name from business settings
   */
  async getCompanyName() {
    try {
      const BusinessSettings = (await import('../../admin/models/BusinessSettings.js')).default;
      const settings = await BusinessSettings.getSettings();
      return settings?.companyName || 'Appzeto Food';
    } catch (error) {
      return 'Appzeto Food';
    }
  }

  /**
   * Generate OTP message
   */
  async generateOTPMessage(otp) {
    const companyName = await this.getCompanyName();
    return `Your ${companyName} OTP is ${otp}. Valid for 5 minutes. Do not share this OTP with anyone.`;
  }

  /**
   * Send OTP via SMSHub
   * @param {string} phone - Phone number with country code
   * @param {string} otp - OTP code
   * @returns {Promise<Object>} - Response from SMSHub
   */
  async sendOTP(phone, otp) {
    try {
      // Format phone number (ensure it starts with country code)
      const formattedPhone = this.formatPhoneNumber(phone);
      
      const message = await this.generateOTPMessage(otp);

      // SMSHub API endpoint
      // Note: Adjust the endpoint and payload structure based on your SMSHub provider's actual API documentation
      // Common patterns:
      // - POST /api/send or /send
      // - Query params: api_key, to, message, sender
      // - Body params: apiKey/api_key, phone/to, message, senderId/sender
      
      // Option 1: Body-based request (most common)
      const response = await axios.post(
        `${this.apiUrl}/send`,
        {
          apiKey: this.apiKey, // or api_key depending on provider
          phone: formattedPhone, // or 'to' depending on provider
          message: message, // or 'text' depending on provider
          senderId: this.senderId // or 'sender' depending on provider
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }) // If using Bearer token
          },
          timeout: 10000 // 10 seconds timeout
        }
      );
      
      // Alternative: Query-based request (uncomment if your provider uses query params)
      /*
      const response = await axios.get(
        `${this.apiUrl}/send`,
        {
          params: {
            api_key: this.apiKey,
            to: formattedPhone,
            message: message,
            sender: this.senderId
          },
          timeout: 10000
        }
      );
      */

      logger.info(`OTP sent successfully to ${formattedPhone}`, {
        phone: formattedPhone,
        status: response.data?.status
      });

      return {
        success: true,
        messageId: response.data?.messageId || null,
        status: response.data?.status || 'sent'
      };
    } catch (error) {
      logger.error(`Failed to send OTP via SMSHub: ${error.message}`, {
        phone,
        error: error.response?.data || error.message
      });

      // If SMSHub fails, you might want to fallback to Twilio or log for manual intervention
      throw new Error(`Failed to send OTP: ${error.message}`);
    }
  }

  /**
   * Format phone number to include country code
   * Assumes Indian numbers if no country code provided
   */
  formatPhoneNumber(phone) {
    // Remove any spaces, dashes, or special characters
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    
    // If phone doesn't start with +, assume it's Indian number and add +91
    if (!cleaned.startsWith('+')) {
      // If it starts with 0, remove it
      if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
      }
      // Add +91 for India
      cleaned = '+91' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Verify OTP delivery status (if SMSHub provides this)
   */
  async verifyDeliveryStatus(messageId) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/status/${messageId}`,
        {
          params: {
            apiKey: this.apiKey
          },
          timeout: 5000
        }
      );

      return {
        success: true,
        status: response.data?.status,
        deliveredAt: response.data?.deliveredAt
      };
    } catch (error) {
      logger.error(`Failed to verify delivery status: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new SMSHubService();


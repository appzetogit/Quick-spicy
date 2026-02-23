import axios from "axios";
import dotenv from "dotenv";

// Load environment variables if not already loaded
dotenv.config();

/**
 * SMSIndia Hub SMS Service for DriveOn
 * Handles OTP sending via SMSIndia Hub API
 * Same service as CreateBharat project
 */
class SMSIndiaHubService {
  constructor() {
    // Credentials will be loaded from database dynamically
    this.apiKey = null;
    this.senderId = null;
    this.baseUrl = "http://cloud.smsindiahub.in/vendorsms/pushsms.aspx";
    this.initializeCredentials();
  }

  async initializeCredentials() {
    const { getSMSHubIndiaCredentials } = await import('../../../shared/utils/envService.js');
    const creds = await getSMSHubIndiaCredentials();
    this.apiKey = creds.apiKey?.trim() || process.env.SMSINDIAHUB_API_KEY?.trim();
    this.senderId = creds.senderId?.trim() || process.env.SMSINDIAHUB_SENDER_ID?.trim();

    // Log configuration status (only in development)
    if (process.env.NODE_ENV === "development") {
      if (!this.apiKey || !this.senderId) {
        console.warn(
          "⚠️ SMSIndia Hub credentials not configured. SMS functionality will be disabled."
        );
        console.warn(
          "   Please check SMSINDIAHUB_API_KEY and SMSINDIAHUB_SENDER_ID in .env file"
        );
      } else {
        console.log("✅ SMSIndia Hub credentials loaded successfully");
      }
    }
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
   * Check if SMSIndia Hub is properly configured
   * @returns {boolean}
   */
  async isConfigured() {
    // Load credentials dynamically from database
    const { getSMSHubIndiaCredentials } = await import('../../../shared/utils/envService.js');
    const creds = await getSMSHubIndiaCredentials();
    const apiKey = (this.apiKey || creds.apiKey || process.env.SMSINDIAHUB_API_KEY)?.trim();
    const senderId = (this.senderId || creds.senderId || process.env.SMSINDIAHUB_SENDER_ID)?.trim();

    return !!(apiKey && senderId);
  }

  /**
   * Normalize phone number to Indian format with country code
   * @param {string} phone - Phone number to normalize
   * @returns {string} - Normalized phone number with country code (91XXXXXXXXXX)
   */
  normalizePhoneNumber(phone) {
    // Remove all non-digit characters
    const digits = phone.replace(/[^0-9]/g, "");

    // If it already has country code 91 and is 12 digits, return as is
    if (digits.startsWith("91") && digits.length === 12) {
      return digits;
    }

    // If it's 10 digits, add country code 91
    if (digits.length === 10) {
      return "91" + digits;
    }

    // If it's 11 digits and starts with 0, remove the 0 and add country code
    if (digits.length === 11 && digits.startsWith("0")) {
      return "91" + digits.substring(1);
    }

    // Return with country code as fallback
    return "91" + digits.slice(-10);
  }

  /**
   * Send OTP via SMS using SMSIndia Hub
   * @param {string} phone - Phone number to send SMS to
   * @param {string} otp - OTP code to send
   * @param {string} purpose - Purpose of OTP (register, login, reset_password) - optional
   * @returns {Promise<Object>} - Response object
   */
  async sendOTP(phone, otp, purpose = 'register') {
    try {
      // Load credentials dynamically from database
      const { getSMSHubIndiaCredentials } = await import('../../../shared/utils/envService.js');
      const creds = await getSMSHubIndiaCredentials();
      const apiKey = (this.apiKey || creds.apiKey || process.env.SMSINDIAHUB_API_KEY)?.trim();
      const senderId = (this.senderId || creds.senderId || process.env.SMSINDIAHUB_SENDER_ID)?.trim();

      if (!apiKey || !senderId) {
        console.error("❌ SMSIndia Hub Configuration Error:");
        console.error(
          "   SMSINDIAHUB_API_KEY:",
          apiKey ? "✓ Set" : "✗ Missing"
        );
        console.error(
          "   SMSINDIAHUB_SENDER_ID:",
          senderId ? "✓ Set" : "✗ Missing"
        );
        throw new Error(
          "SMSIndia Hub not configured. Please check your environment variables SMSINDIAHUB_API_KEY and SMSINDIAHUB_SENDER_ID in .env file."
        );
      }

      const normalizedPhone = this.normalizePhoneNumber(phone);

      // Validate phone number (should be 12 digits with country code)
      if (normalizedPhone.length !== 12 || !normalizedPhone.startsWith("91")) {
        throw new Error(
          `Invalid phone number format: ${phone}. Expected 10-digit Indian mobile number.`
        );
      }

      // SMSIndia Hub requires DLT registered templates for transactional SMS
      // The message text MUST match the registered DLT template EXACTLY
      // Check if custom message template is provided (must match registered DLT template exactly)
      const customTemplate = process.env.SMSINDIAHUB_MESSAGE_TEMPLATE?.trim();
      
      // Check if template ID is provided (for DLT registered templates)
      const templateId = process.env.SMSINDIAHUB_TEMPLATE_ID?.trim();
      
      // Check if promotional SMS is enabled (temporary workaround for template issues)
      // ⚠️ WARNING: Promotional SMS is not recommended for OTP - use only for testing
      const usePromotional = process.env.SMSINDIAHUB_USE_PROMOTIONAL === 'true';
      // Always use transactional SMS (gwid=2) like RentYatra, unless promotional is explicitly enabled
      const gatewayId = usePromotional ? "1" : "2"; // 1 = promotional, 2 = transactional
      
      if (usePromotional) {
        console.warn("⚠️ Using promotional SMS mode - not recommended for production OTP!");
      }
      
      // For transactional SMS (DLT), message must match registered template EXACTLY
      // Use fixed template text that matches DLT registration, regardless of purpose
      // Based on working template: "Welcome to the DriveOn powered by SMSINDIAHUB. Your OTP for registration is {otp}"
      let message;
      if (customTemplate) {
        // Use custom template with OTP replacement only (don't change purpose text for DLT)
        message = customTemplate.replace('{otp}', otp);
      } else if (usePromotional) {
        // For promotional SMS, we can use dynamic purpose text
        let purposeText = 'registration';
        if (purpose === 'login') {
          purposeText = 'login';
        } else if (purpose === 'reset_password') {
          purposeText = 'password reset';
        }
        const companyName = await this.getCompanyName();
        message = `Welcome to the ${companyName} powered by SMSINDIAHUB. Your OTP for ${purposeText} is ${otp}`;
      } else {
        // For transactional SMS, use fixed template text that matches DLT registration
        // IMPORTANT: This must match the registered DLT template exactly
        const companyName = await this.getCompanyName();
        message = `Welcome to the ${companyName} powered by SMSINDIAHUB. Your OTP for registration is ${otp}`;
      }
      
      // Build the API URL with query parameters (same format as RentYatra)
      const params = new URLSearchParams({
        APIKey: apiKey,
        msisdn: normalizedPhone,
        sid: senderId,
        msg: message,
        fl: "0", // Flash message flag (0 = normal SMS)
        dc: "0", // Delivery confirmation (0 = no confirmation)
        gwid: gatewayId, // Gateway ID (2 = transactional, same as RentYatra)
      });
      
      // Add template ID if provided (required for some DLT templates)
      if (templateId) {
        params.append('templateid', templateId);
      }

      const apiUrl = `${this.baseUrl}?${params.toString()}`;

      // Make GET request to SMSIndia Hub API
      const response = await axios.get(apiUrl, {
        headers: {
          "User-Agent": "DriveOn/1.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: 15000, // 15 second timeout
      });

      console.log("📱 SMSIndia Hub Response Status:", response.status);
      console.log("📱 SMSIndia Hub Response Data:", response.data);

      // SMSIndia Hub can return JSON or plain text response
      let responseData = response.data;
      const responseText = typeof responseData === "string" 
        ? responseData 
        : JSON.stringify(responseData);
      
      console.log("📱 SMSIndia Hub Response Text:", responseText);
      
      // Try to parse as JSON first (SMSIndia Hub sometimes returns JSON)
      let parsedResponse = null;
      if (typeof responseData === "string") {
        try {
          parsedResponse = JSON.parse(responseData);
        } catch (e) {
          // Not JSON, continue with string check
        }
      } else if (typeof responseData === "object") {
        parsedResponse = responseData;
      }
      
      // Check JSON response for error codes (like ErrorCode: "006" for template error)
      if (parsedResponse && typeof parsedResponse === "object") {
        if (parsedResponse.ErrorCode === "000" && parsedResponse.ErrorMessage === "Done") {
          console.log("✅ SMS sent successfully - JSON success response");
          const messageId = parsedResponse.MessageData && parsedResponse.MessageData[0]
            ? parsedResponse.MessageData[0].MessageId
            : `sms_${Date.now()}`;
          return {
            success: true,
            messageId: messageId,
            jobId: parsedResponse.JobId,
            status: 'sent',
            to: normalizedPhone,
            body: message,
            provider: 'SMSIndia Hub',
            response: parsedResponse
          };
        } else if (parsedResponse.ErrorCode && parsedResponse.ErrorCode !== "000") {
          const errorMsg = parsedResponse.ErrorMessage || "Unknown error";
          console.error("❌ SMS failed - JSON error response:", parsedResponse);
          throw new Error(`SMSIndia Hub API error: ${errorMsg} (Code: ${parsedResponse.ErrorCode})`);
        }
      }
      
      // Check for success indicators in text response (same logic as RentYatra)
      if (responseText.includes('success') || responseText.includes('sent') || responseText.includes('accepted')) {
        console.log("✅ SMS sent successfully - success indicator found in text");
        return {
          success: true,
          messageId: `sms_${Date.now()}`,
          status: 'sent',
          to: normalizedPhone,
          body: message,
          provider: 'SMSIndia Hub',
          response: responseText
        };
      } else if (responseText.includes('error') || responseText.includes('failed') || responseText.includes('invalid')) {
        console.error("❌ SMS failed - error indicator found in text:", responseText);
        throw new Error(`SMSIndia Hub API error: ${responseText}`);
      } else {
        // If we can't determine success/failure from response, assume success if we got a response (same as RentYatra)
        console.log("⚠️ Ambiguous response - assuming success (same as RentYatra)");
        return {
          success: true,
          messageId: `sms_${Date.now()}`,
          status: 'sent',
          to: normalizedPhone,
          body: message,
          provider: 'SMSIndia Hub',
          response: responseText
        };
      }
    } catch (error) {
      // Handle specific error cases
      if (error.response) {
        const errorData = error.response.data;

        if (error.response.status === 401) {
          throw new Error(
            "SMSIndia Hub authentication failed. Please check your API key."
          );
        } else if (error.response.status === 400) {
          throw new Error(
            `SMSIndia Hub request error: Invalid request parameters`
          );
        } else if (error.response.status === 429) {
          throw new Error(
            "SMSIndia Hub rate limit exceeded. Please try again later."
          );
        } else if (error.response.status === 500) {
          throw new Error("SMSIndia Hub server error. Please try again later.");
        } else {
          throw new Error(
            `SMSIndia Hub API error (${error.response.status}): ${errorData}`
          );
        }
      } else if (error.code === "ECONNABORTED") {
        throw new Error("SMSIndia Hub request timeout. Please try again.");
      } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        throw new Error(
          "Unable to connect to SMSIndia Hub service. Please check your internet connection."
        );
      } else if (error.code === "ECONNRESET") {
        throw new Error("SMSIndia Hub connection was reset. Please try again.");
      }

      throw error;
    }
  }

  /**
   * Send custom SMS message
   * @param {string} phone - Phone number to send SMS to
   * @param {string} message - Custom message to send
   * @returns {Promise<Object>} - Response object
   */
  async sendCustomSMS(phone, message) {
    try {
      // Load credentials dynamically from database
      const { getSMSHubIndiaCredentials } = await import('../../../shared/utils/envService.js');
      const creds = await getSMSHubIndiaCredentials();
      const apiKey = (this.apiKey || creds.apiKey || process.env.SMSINDIAHUB_API_KEY)?.trim();
      const senderId = (this.senderId || creds.senderId || process.env.SMSINDIAHUB_SENDER_ID)?.trim();

      if (!apiKey || !senderId) {
        console.error("❌ SMSIndia Hub Configuration Error:");
        console.error(
          "   SMSINDIAHUB_API_KEY:",
          apiKey ? "✓ Set" : "✗ Missing"
        );
        console.error(
          "   SMSINDIAHUB_SENDER_ID:",
          senderId ? "✓ Set" : "✗ Missing"
        );
        throw new Error(
          "SMSIndia Hub not configured. Please check your environment variables SMSINDIAHUB_API_KEY and SMSINDIAHUB_SENDER_ID in .env file."
        );
      }

      const normalizedPhone = this.normalizePhoneNumber(phone);

      // Validate phone number (should be 12 digits with country code)
      if (normalizedPhone.length !== 12 || !normalizedPhone.startsWith("91")) {
        throw new Error(
          `Invalid phone number format: ${phone}. Expected 10-digit Indian mobile number.`
        );
      }

      // Build the API URL with query parameters
      const params = new URLSearchParams({
        APIKey: apiKey,
        msisdn: normalizedPhone,
        sid: senderId,
        msg: message,
        fl: "0", // Flash message flag (0 = normal SMS)
        dc: "0", // Delivery confirmation (0 = no confirmation)
        gwid: "2", // Gateway ID (2 = transactional)
      });

      const apiUrl = `${this.baseUrl}?${params.toString()}`;

      // Make GET request to SMSIndia Hub API
      const response = await axios.get(apiUrl, {
        headers: {
          "User-Agent": "DriveOn/1.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: 15000, // 15 second timeout
      });

      const responseText = response.data.toString();

      // Check for success indicators in the response
      if (
        responseText.includes("success") ||
        responseText.includes("sent") ||
        responseText.includes("accepted")
      ) {
        return {
          success: true,
          messageId: `sms_${Date.now()}`,
          status: "sent",
          to: normalizedPhone,
          body: message,
          provider: "SMSIndia Hub",
          response: responseText,
        };
      } else if (
        responseText.includes("error") ||
        responseText.includes("failed") ||
        responseText.includes("invalid")
      ) {
        throw new Error(`SMSIndia Hub API error: ${responseText}`);
      } else {
        return {
          success: true,
          messageId: `sms_${Date.now()}`,
          status: "sent",
          to: normalizedPhone,
          body: message,
          provider: "SMSIndia Hub",
          response: responseText,
        };
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Test SMSIndia Hub API connection and credentials
   * @returns {Promise<Object>} - Test result
   */
  async testConnection() {
    try {
      // Load credentials dynamically from database
      const { getSMSHubIndiaCredentials } = await import('../../../shared/utils/envService.js');
      const creds = await getSMSHubIndiaCredentials();
      const apiKey = (this.apiKey || creds.apiKey || process.env.SMSINDIAHUB_API_KEY)?.trim();
      const senderId = (this.senderId || creds.senderId || process.env.SMSINDIAHUB_SENDER_ID)?.trim();

      if (!apiKey || !senderId) {
        console.error("❌ SMSIndia Hub Configuration Error:");
        console.error(
          "   SMSINDIAHUB_API_KEY:",
          apiKey ? "✓ Set" : "✗ Missing"
        );
        console.error(
          "   SMSINDIAHUB_SENDER_ID:",
          senderId ? "✓ Set" : "✗ Missing"
        );
        throw new Error(
          "SMSIndia Hub not configured. Please check your environment variables SMSINDIAHUB_API_KEY and SMSINDIAHUB_SENDER_ID in .env file."
        );
      }

      // Test with a simple SMS to verify connection
      const testPhone = "919109992290"; // Use a test phone number
      const testMessage =
        "Test message from DriveOn. SMS service is working correctly.";

      const params = new URLSearchParams({
        APIKey: apiKey,
        msisdn: testPhone,
        sid: senderId,
        msg: testMessage,
        fl: "0",
        dc: "0",
        gwid: "2",
      });

      const testUrl = `${this.baseUrl}?${params.toString()}`;

      const response = await axios.get(testUrl, {
        headers: {
          "User-Agent": "DriveOn/1.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: 10000,
      });

      return {
        success: true,
        message: "SMSIndia Hub connection successful",
        response: response.data.toString(),
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection test failed: ${error.message}`,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Get account balance from SMSIndia Hub
   * @returns {Promise<Object>} - Balance information
   */
  async getBalance() {
    try {
      // Load credentials dynamically from database
      const { getSMSHubIndiaCredentials } = await import('../../../shared/utils/envService.js');
      const creds = await getSMSHubIndiaCredentials();
      const apiKey = (this.apiKey || creds.apiKey || process.env.SMSINDIAHUB_API_KEY)?.trim();

      if (!apiKey) {
        console.error("❌ SMSIndia Hub Configuration Error:");
        console.error(
          "   SMSINDIAHUB_API_KEY:",
          apiKey ? "✓ Set" : "✗ Missing"
        );
        throw new Error(
          "SMSIndia Hub not configured. Please check your environment variable SMSINDIAHUB_API_KEY in .env file."
        );
      }

      // SMSIndia Hub balance API endpoint
      const balanceUrl = `http://cloud.smsindiahub.in/vendorsms/checkbalance.aspx?APIKey=${apiKey}`;

      const response = await axios.get(balanceUrl, {
        headers: {
          "User-Agent": "DriveOn/1.0",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout: 10000,
      });

      const responseText = response.data.toString();

      // Parse balance from response (SMSIndia Hub typically returns balance as text)
      const balanceMatch = responseText.match(/(\d+\.?\d*)/);
      const balance = balanceMatch ? parseFloat(balanceMatch[1]) : 0;

      return {
        success: true,
        balance: balance,
        currency: "INR",
        response: responseText,
      };
    } catch (error) {
      throw new Error(`Failed to fetch SMSIndia Hub balance: ${error.message}`);
    }
  }
}

// Create singleton instance
const smsIndiaHubService = new SMSIndiaHubService();

export default smsIndiaHubService;
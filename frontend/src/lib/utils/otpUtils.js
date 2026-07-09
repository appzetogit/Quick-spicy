/**
 * OTP Utility Functions
 * Production-safe helpers. No client-side test OTP shortcuts are allowed.
 */

/**
 * Extract phone number digits (without country code)
 * @param {string} phone - Phone number in format like "+91 9098569620" or "+91-9098569620"
 * @returns {string} - Phone number digits only (e.g., "9098569620")
 */
export const extractPhoneDigits = (phone) => {
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
 * Check if a phone number is a test number
 * @param {string} phone - Phone number in any format
 * @returns {boolean} - True if phone number is a test number
 */
export const isTestPhoneNumber = (phone) => {
  return false;
};

/**
 * Get default OTP for test phone numbers
 * @param {string} phone - Phone number to check
 * @returns {string|null} - Default OTP if test number, null otherwise
 */
export const getDefaultOTP = (phone) => {
  return null;
};


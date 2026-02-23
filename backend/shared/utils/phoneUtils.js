/**
 * Normalize phone number by removing spaces, dashes, and other formatting characters
 * Normalizes to consistent format: digits only, with country code for Indian numbers
 * @param {string} phone - Phone number to normalize
 * @returns {string|null} - Normalized phone number or null if invalid
 */
export const normalizePhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return null;
  }
  
  // Remove all non-digit characters (including +)
  const digitsOnly = phone.trim().replace(/\D/g, '');
  
  // If it's empty after cleaning, return null
  if (!digitsOnly) {
    return null;
  }
  
  // Handle Indian phone numbers (most common case)
  // If it's 10 digits, assume it's Indian and add country code 91
  if (digitsOnly.length === 10) {
    return `91${digitsOnly}`;
  }
  
  // If it's 11 digits and starts with 0, remove leading 0 and add 91
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return `91${digitsOnly.substring(1)}`;
  }
  
  // If it's 12 digits and starts with 91, return as is
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return digitsOnly;
  }
  
  // For other lengths, return as is (could be other country codes)
  return digitsOnly;
};

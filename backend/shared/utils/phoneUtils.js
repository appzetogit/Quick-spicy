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

/**
 * Every way this platform has ever stored the same number.
 *
 * Account lookup matches the raw string, and the clients disagree about the format: the
 * customer and delivery apps send "+91 9999999999" (country code, space), restaurant auth
 * normalises to "919999999999", and older records hold bare ten digits. The same person
 * signing in from two of them therefore created two accounts - 15 numbers had done so,
 * and 8 of those had orders or wallet money stranded on both sides, one with Rs 550 on
 * one account and Rs 800 on the other. The unique index cannot catch it, because the
 * strings genuinely differ.
 */
export const phoneVariants = (phone) => {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length >= 10 ? digits.slice(-10) : '';
  if (!ten) return raw ? [raw] : [];
  return Array.from(new Set([
    raw,
    ten,
    `91${ten}`,
    `91 ${ten}`,
    `+91${ten}`,
    `+91 ${ten}`,
    `+91-${ten}`,
    `0${ten}`,
  ].filter(Boolean)));
};

/** A query matching any stored spelling of this number, or null when it is unusable. */
export const buildPhoneQuery = (phone) => {
  const variants = phoneVariants(phone);
  if (!variants.length) return null;
  return { $or: variants.map((value) => ({ phone: value })) };
};

/**
 * Find an account by phone in any stored format.
 *
 * Deliberately tries the exact string first. Where a number already has two accounts, the
 * client keeps reaching the same one it always did - switching somebody to their other
 * account would hide their order history and wallet balance without warning. The variant
 * search only catches the case where no exact match exists, which is precisely where a
 * second account used to be created.
 */
export const findByPhoneVariants = async (Model, phone, extraQuery = {}) => {
  if (!phone) return null;
  const exact = await Model.findOne({ phone, ...extraQuery });
  if (exact) return exact;
  const query = buildPhoneQuery(phone);
  return query ? Model.findOne({ ...query, ...extraQuery }) : null;
};

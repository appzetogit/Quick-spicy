/**
 * Google Maps API Key Utility
 * Fetches API key from backend database instead of .env file
 */

let cachedApiKey = null;
let apiKeyPromise = null;

function sanitizeApiKey(value) {
  if (!value) return "";
  return String(value).trim().replace(/^['"]|['"]$/g, "");
}

/**
 * Get Google Maps API Key from backend
 * Uses caching to avoid multiple requests
 * @returns {Promise<string>} Google Maps API Key
 */
export async function getGoogleMapsApiKey() {
  // Return cached key if available
  if (cachedApiKey) {
    return cachedApiKey;
  }

  // Return existing promise if already fetching
  if (apiKeyPromise) {
    return apiKeyPromise;
  }

  // Fetch from backend
  apiKeyPromise = (async () => {
    const envFallbackKey = sanitizeApiKey(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
    try {
      const { adminAPI } = await import('../api/index.js');
      const response = await adminAPI.getPublicEnvVariables();

      const dbKey = sanitizeApiKey(response?.data?.data?.VITE_GOOGLE_MAPS_API_KEY);
      if (response?.data?.success && dbKey) {
        cachedApiKey = dbKey;
        return cachedApiKey;
      }

      if (envFallbackKey) {
        console.warn('⚠️ Google Maps API key not found in database. Using VITE_GOOGLE_MAPS_API_KEY fallback.');
        cachedApiKey = envFallbackKey;
        return cachedApiKey;
      }

      console.warn('⚠️ Google Maps API key missing in both database and frontend env.');
      return "";
    } catch (error) {
      console.warn('Failed to fetch Google Maps API key from backend:', error.message);
      if (envFallbackKey) {
        console.warn('⚠️ Using VITE_GOOGLE_MAPS_API_KEY fallback after backend key fetch failure.');
        cachedApiKey = envFallbackKey;
        return cachedApiKey;
      }
      return "";
    } finally {
      apiKeyPromise = null;
    }
  })();

  return apiKeyPromise;
}

/**
 * Clear cached API key (call after updating in admin panel)
 */
export function clearGoogleMapsApiKeyCache() {
  cachedApiKey = null;
  apiKeyPromise = null;
}


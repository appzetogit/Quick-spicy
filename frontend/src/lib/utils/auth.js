/**
 * JWT Token Utilities
 * Decode and extract information from JWT tokens
 */

/**
 * Decode JWT token without verification (client-side only)
 * @param {string} token - JWT token
 * @returns {Object|null} - Decoded token payload or null if invalid
 */
export function decodeToken(token) {
  if (!token) return null;

  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Decode base64url encoded payload
    const payload = parts[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = JSON.parse(atob(paddedBase64));
    
    return decoded;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
}

/**
 * Get user role from token
 * @param {string} token - JWT token
 * @returns {string|null} - User role or null if not found
 */
export function getRoleFromToken(token) {
  const decoded = decodeToken(token);
  return decoded?.role || null;
}

/**
 * Check if token is expired
 * @param {string} token - JWT token
 * @returns {boolean} - True if expired or invalid
 */
export function isTokenExpired(token) {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  
  // exp is in seconds, Date.now() is in milliseconds
  return decoded.exp * 1000 < Date.now();
}

/**
 * Get user ID from token
 * @param {string} token - JWT token
 * @returns {string|null} - User ID or null if not found
 */
export function getUserIdFromToken(token) {
  const decoded = decodeToken(token);
  return decoded?.userId || decoded?.id || null;
}

/**
 * Check if user has access to a module based on role
 * @param {string} role - User role
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @returns {boolean} - True if user has access
 */
export function hasModuleAccess(role, module) {
  const roleModuleMap = {
    'admin': 'admin',
    'restaurant': 'restaurant',
    'delivery': 'delivery',
    'user': 'user'
  };

  return roleModuleMap[role] === module;
}

/**
 * Get module-specific access token
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @returns {string|null} - Access token or null
 */
export function getModuleToken(module) {
  if (module === "admin") {
    return null;
  }
  return localStorage.getItem(`${module}_accessToken`);
}

/**
 * Get module-specific refresh token (fallback for WebView environments where cookies may be unreliable)
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @returns {string|null} - Refresh token or null
 */
export function getModuleRefreshToken(module) {
  if (module === "admin") {
    return null;
  }
  return localStorage.getItem(`${module}_refreshToken`);
}

/**
 * Get current user's role from a specific module's token
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @returns {string|null} - Current user role or null
 */
export function getCurrentUserRole(module = null) {
  // If module is specified, check that module's token
  if (module) {
    const token = getModuleToken(module);
    if (!token) return null;
    
    if (isTokenExpired(token)) {
      // Token expired, clear it
      clearModuleAuth(module);
      return null;
    }
    
    return getRoleFromToken(token);
  }
  
  // Legacy: check all modules and return the first valid role found
  // This is for backward compatibility but should be avoided
  const modules = ['user', 'restaurant', 'delivery', 'admin'];
  for (const mod of modules) {
    const token = getModuleToken(mod);
    if (token && !isTokenExpired(token)) {
      return getRoleFromToken(token);
    }
  }
  
  return null;
}

/**
 * Check if user is authenticated for a specific module
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @returns {boolean} - True if authenticated
 */
export function isModuleAuthenticated(module) {
  if (module === "admin") {
    return (
      sessionStorage.getItem("admin_authenticated") === "true" ||
      localStorage.getItem("admin_authenticated") === "true"
    );
  }

  const token = getModuleToken(module);
  if (!token) return false;
  
  if (isTokenExpired(token)) {
    clearModuleAuth(module);
    return false;
  }
  
  return true;
}

/**
 * Clear authentication data for a specific module
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 */
export function clearModuleAuth(module) {
  localStorage.removeItem(`${module}_accessToken`);
  localStorage.removeItem(`${module}_refreshToken`);
  localStorage.removeItem(`${module}_authenticated`);
  localStorage.removeItem(`${module}_user`);
  sessionStorage.removeItem(`${module}_accessToken`);
  sessionStorage.removeItem(`${module}_refreshToken`);
  sessionStorage.removeItem(`${module}_authenticated`);
  sessionStorage.removeItem(`${module}_user`);
  if (module === "restaurant") {
    clearRestaurantSessionCache();
  }
  // Also clear any sessionStorage data
  sessionStorage.removeItem(`${module}AuthData`);
}

/**
 * Clear restaurant-local cached UI data to prevent cross-account stale state.
 */
export function clearRestaurantSessionCache() {
  const keys = [
    "restaurant_owner_contact",
    "restaurant_onboarding",
    "restaurant_onboarding_data",
    "restaurant_invited_users",
    "restaurant_schedule_off",
    "restaurant_online_status",
    "restaurant_outlet_timings",
    "restaurant_hub_menu_active_tab",
    "restaurant_name",
    "restaurantName",
  ];

  keys.forEach((key) => localStorage.removeItem(key));
}

/**
 * Clear all authentication data for all modules
 */
export function clearAuthData() {
  const modules = ['admin', 'restaurant', 'delivery', 'user'];
  modules.forEach(module => {
    clearModuleAuth(module);
  });
  // Also clear legacy token if it exists
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
}

/**
 * Set authentication data for a specific module
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @param {string} token - Access token
 * @param {Object} user - User data
 * @param {string|null} refreshToken - Optional refresh token
 * @throws {Error} If localStorage is not available or quota exceeded
 */
export function setAuthData(module, token, user, refreshToken = null) {
  try {
    // Check if localStorage is available
    if (typeof Storage === 'undefined' || !localStorage) {
      throw new Error('localStorage is not available');
    }

    // Validate inputs
    if (!module || !token) {
      throw new Error(`Invalid parameters: module=${module}, token=${!!token}`);
    }

    console.log(`[setAuthData] Storing auth for module: ${module}`, {
      hasToken: !!token,
      tokenLength: token?.length,
      hasUser: !!user
    });

    // Store module-specific token (don't clear other modules)
    const tokenKey = `${module}_accessToken`;
    const refreshTokenKey = `${module}_refreshToken`;
    const authKey = `${module}_authenticated`;
    const userKey = `${module}_user`;
    const primaryStorage = module === "admin" ? sessionStorage : localStorage;
    const secondaryStorage = module === "admin" ? localStorage : null;

    // Prevent stale restaurant profile data from previous account after re-login.
    if (module === "restaurant") {
      clearRestaurantSessionCache();
    }

    if (module === "admin") {
      primaryStorage.setItem(authKey, "true");
    } else {
      primaryStorage.setItem(tokenKey, token);
      if (refreshToken && typeof refreshToken === "string") {
        primaryStorage.setItem(refreshTokenKey, refreshToken);
      }
      primaryStorage.setItem(authKey, 'true');
    }
    
    if (user) {
      try {
        primaryStorage.setItem(userKey, JSON.stringify(user));
      } catch (userError) {
        console.warn('Failed to store user data, but token was stored:', userError);
        // Don't throw - token storage is more important
      }
    }

    if (secondaryStorage) {
      secondaryStorage.removeItem(tokenKey);
      secondaryStorage.removeItem(refreshTokenKey);
      secondaryStorage.removeItem(authKey);
      secondaryStorage.removeItem(userKey);
    }

    // Verify the token was stored correctly
    const storedAuth = primaryStorage.getItem(authKey);

    if (module !== "admin") {
      const storedToken = primaryStorage.getItem(tokenKey);
      if (storedToken !== token) {
        console.error(`[setAuthData] Token mismatch:`, {
          expected: token?.substring(0, 20) + '...',
          stored: storedToken?.substring(0, 20) + '...'
        });
        throw new Error(`Token storage verification failed for module: ${module}`);
      }
    }

    if (storedAuth !== 'true') {
      console.error(`[setAuthData] Auth flag mismatch:`, {
        expected: 'true',
        stored: storedAuth
      });
      throw new Error(`Authentication flag storage failed for module: ${module}`);
    }

    console.log(`[setAuthData] Successfully stored auth data for ${module}`);
  } catch (error) {
    // If quota exceeded, try to clear some space
    if (error.name === 'QuotaExceededError' || error.code === 22) {
      console.warn('localStorage quota exceeded. Attempting to clear old data...');
      // Clear legacy tokens
      try {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        // Retry storing
        primaryStorage.setItem(`${module}_authenticated`, 'true');
        if (module !== "admin") {
          primaryStorage.setItem(`${module}_accessToken`, token);
          if (refreshToken && typeof refreshToken === "string") {
            primaryStorage.setItem(`${module}_refreshToken`, refreshToken);
          }
        }
        if (user) {
          primaryStorage.setItem(`${module}_user`, JSON.stringify(user));
        }
        
        // Verify again after retry
        if (module !== "admin") {
          const storedToken = primaryStorage.getItem(`${module}_accessToken`);
          if (storedToken !== token) {
            throw new Error('Token storage failed even after clearing space');
          }
        }
      } catch (retryError) {
        console.error('Failed to store auth data after clearing space:', retryError);
        throw new Error('Unable to store authentication data. Please clear browser storage and try again.');
      }
    } else {
      console.error('[setAuthData] Error storing auth data:', error);
      throw error;
    }
  }
}

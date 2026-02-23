/**
 * Backend Connection Test Utility
 * Tests if backend server is accessible
 */

import { API_BASE_URL } from './config.js';

/**
 * Test backend connection
 * @returns {Promise<{success: boolean, message: string, data?: any}>}
 */
export async function testBackendConnection() {
  try {
    const baseUrl = API_BASE_URL.replace('/api', '');
    const healthUrl = `${baseUrl}/health`;
    
    console.log('🔍 Testing backend connection...');
    console.log('📍 Health check URL:', healthUrl);
    
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Add timeout
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log('✅ Backend connection successful!');
    console.log('📦 Response:', data);
    
    return {
      success: true,
      message: 'Backend server is running',
      data
    };
  } catch (error) {
    console.error('❌ Backend connection failed:', error.message);
    
    return {
      success: false,
      message: error.message || 'Failed to connect to backend',
      error: error
    };
  }
}

/**
 * Test API endpoint
 * @param {string} endpoint - API endpoint to test
 * @returns {Promise<{success: boolean, message: string, data?: any}>}
 */
export async function testAPIEndpoint(endpoint) {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    
    console.log('🔍 Testing API endpoint:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    
    console.log('✅ API endpoint test successful!');
    console.log('📦 Response:', data);
    
    return {
      success: true,
      message: 'API endpoint is accessible',
      data
    };
  } catch (error) {
    console.error('❌ API endpoint test failed:', error.message);
    
    return {
      success: false,
      message: error.message || 'Failed to access API endpoint',
      error: error
    };
  }
}

/**
 * Run all connection tests
 */
export async function runConnectionTests() {
  console.log('🚀 Starting connection tests...');
  console.log('🌐 API Base URL:', API_BASE_URL);
  console.log('🌐 Backend URL:', API_BASE_URL.replace('/api', ''));
  
  const results = {
    health: await testBackendConnection(),
    // Add more tests as needed
  };
  
  console.log('📊 Connection Test Results:', results);
  
  return results;
}

// Auto-run tests in development mode
if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Run tests after a short delay to avoid blocking initial load
  setTimeout(() => {
    runConnectionTests().catch(console.error);
  }, 2000);
}


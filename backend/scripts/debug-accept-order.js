/**
 * Quick Debug Script for Accept Order Issue
 * 
 * This script tests the accept order endpoint directly to see the exact error
 * 
 * Usage:
 * node scripts/debug-accept-order.js <orderId> <deliveryToken> <lat> <lng>
 * 
 * Example:
 * node scripts/debug-accept-order.js 697dcab27d7c272426973030 "your_token" 22.728051 75.884523
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// Get arguments
const args = process.argv.slice(2);
const orderId = args[0];
const deliveryToken = args[1] || process.env.DELIVERY_TOKEN;
const lat = parseFloat(args[2]) || 22.728051;
const lng = parseFloat(args[3]) || 75.884523;

if (!orderId) {
  console.error('❌ Order ID is required');
  console.log('Usage: node scripts/debug-accept-order.js <orderId> [deliveryToken] [lat] [lng]');
  process.exit(1);
}

if (!deliveryToken) {
  console.error('❌ Delivery token is required');
  console.log('Set DELIVERY_TOKEN in .env or pass as second argument');
  process.exit(1);
}

console.log('🔍 Testing Accept Order Endpoint');
console.log('='.repeat(60));
console.log(`Order ID: ${orderId}`);
console.log(`Location: ${lat}, ${lng}`);
console.log(`Base URL: ${BASE_URL}`);
console.log('='.repeat(60));

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${deliveryToken}`
  }
});

async function testAcceptOrder() {
  try {
    console.log('\n📤 Sending request...');
    const response = await api.patch(`/api/delivery/orders/${orderId}/accept`, {
      currentLat: lat,
      currentLng: lng
    });
    
    console.log('\n✅ SUCCESS!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log('\n❌ ERROR OCCURRED');
    console.log('='.repeat(60));
    
    if (error.response) {
      // Server responded with error
      console.log(`Status: ${error.response.status}`);
      console.log(`Status Text: ${error.response.statusText}`);
      console.log('\nResponse Data:');
      console.log(JSON.stringify(error.response.data, null, 2));
      
      if (error.response.data?.message) {
        console.log(`\n💡 Error Message: ${error.response.data.message}`);
      }
      
      if (error.response.data?.error) {
        console.log(`\n💡 Error Details: ${error.response.data.error}`);
      }
    } else if (error.request) {
      // Request was made but no response
      console.log('No response received from server');
      console.log('Request:', error.request);
    } else {
      // Error in request setup
      console.log('Error setting up request:', error.message);
    }
    
    console.log('\nFull Error Object:');
    console.log({
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack
    });
  }
}

testAcceptOrder();

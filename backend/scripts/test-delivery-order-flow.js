/**
 * Test Script: Complete Delivery Order Flow
 * 
 * This script tests the complete delivery flow from order acceptance to delivery completion:
 * 1. Accept Order
 * 2. Reached Pickup
 * 3. Confirm Order ID
 * 4. Reached Drop
 * 5. Order Delivered
 * 
 * Usage:
 * node scripts/test-delivery-order-flow.js
 * 
 * Environment Variables Required:
 * - BASE_URL: Backend API URL (default: http://localhost:5000)
 * - DELIVERY_TOKEN: JWT token for delivery boy authentication
 * - ORDER_ID: Order ID to test (optional - will use first available order if not provided)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';
import Order from '../modules/order/models/Order.js';
import Delivery from '../modules/delivery/models/Delivery.js';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const DELIVERY_TOKEN = process.env.DELIVERY_TOKEN;
const ORDER_ID = process.env.ORDER_ID;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`STEP ${step}: ${message}`, 'bright');
  log('='.repeat(60), 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Create axios instance with authentication
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${DELIVERY_TOKEN}`
  }
});

// Test data
let testOrderId = null;
let deliveryBoyLocation = { lat: 22.7196, lng: 75.8577 }; // Indore coordinates
let restaurantLocation = null;
let customerLocation = null;

/**
 * Step 1: Connect to MongoDB and get test order
 */
async function setup() {
  logStep(0, 'Setting up test environment');
  
  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/appzetofood';
  logInfo(`Connecting to MongoDB: ${mongoUri}`);
  
  try {
    await mongoose.connect(mongoUri);
    logSuccess('Connected to MongoDB');
  } catch (error) {
    logError(`Failed to connect to MongoDB: ${error.message}`);
    process.exit(1);
  }
  
  // Get test order
  if (ORDER_ID) {
    testOrderId = ORDER_ID;
    logInfo(`Using provided ORDER_ID: ${testOrderId}`);
  } else {
    // Find an order that's ready for delivery
    const order = await Order.findOne({
      status: { $in: ['preparing', 'ready'] },
      deliveryPartnerId: { $exists: true }
    })
      .populate('restaurantId', 'location')
      .populate('address', 'location')
      .lean();
    
    if (!order) {
      logError('No suitable order found. Please create an order first or provide ORDER_ID');
      process.exit(1);
    }
    
    testOrderId = order._id.toString();
    logInfo(`Found test order: ${testOrderId} (${order.orderId})`);
    
    // Get restaurant and customer locations
    if (order.restaurantId?.location?.coordinates) {
      restaurantLocation = {
        lat: order.restaurantId.location.coordinates[1],
        lng: order.restaurantId.location.coordinates[0]
      };
    }
    
    if (order.address?.location?.coordinates) {
      customerLocation = {
        lat: order.address.location.coordinates[1],
        lng: order.address.location.coordinates[0]
      };
    }
  }
  
  // Get delivery boy info
  if (!DELIVERY_TOKEN) {
    logError('DELIVERY_TOKEN is required. Please set it in .env file');
    process.exit(1);
  }
  
  logSuccess('Setup completed');
}

/**
 * Step 1: Accept Order
 */
async function testAcceptOrder() {
  logStep(1, 'Accept Order');
  
  try {
    logInfo(`Accepting order: ${testOrderId}`);
    logInfo(`Delivery boy location: ${deliveryBoyLocation.lat}, ${deliveryBoyLocation.lng}`);
    
    const response = await api.patch(`/api/delivery/orders/${testOrderId}/accept`, {
      currentLat: deliveryBoyLocation.lat,
      currentLng: deliveryBoyLocation.lng
    });
    
    if (response.data?.success) {
      logSuccess('Order accepted successfully');
      logInfo(`Order status: ${response.data.data?.order?.status}`);
      logInfo(`Delivery phase: ${response.data.data?.order?.deliveryState?.currentPhase}`);
      logInfo(`Route distance: ${response.data.data?.route?.distance?.toFixed(2)} km`);
      logInfo(`Estimated earnings: ₹${response.data.data?.estimatedEarnings?.totalEarning || 'N/A'}`);
      return true;
    } else {
      logError('Order acceptance failed');
      logError(`Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    logError(`Error accepting order: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

/**
 * Step 2: Reached Pickup
 */
async function testReachedPickup() {
  logStep(2, 'Reached Pickup');
  
  try {
    logInfo(`Confirming reached pickup for order: ${testOrderId}`);
    
    const response = await api.patch(`/api/delivery/orders/${testOrderId}/reached-pickup`, {
      currentLat: restaurantLocation?.lat || deliveryBoyLocation.lat,
      currentLng: restaurantLocation?.lng || deliveryBoyLocation.lng
    });
    
    if (response.data?.success) {
      logSuccess('Reached pickup confirmed successfully');
      logInfo(`Current phase: ${response.data.data?.order?.deliveryState?.currentPhase}`);
      logInfo(`Order status: ${response.data.data?.order?.status}`);
      return true;
    } else {
      logError('Reached pickup confirmation failed');
      logError(`Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    logError(`Error confirming reached pickup: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

/**
 * Step 3: Confirm Order ID
 */
async function testConfirmOrderId() {
  logStep(3, 'Confirm Order ID');
  
  try {
    // Get order details to get the order ID
    const orderDetails = await api.get(`/api/delivery/orders/${testOrderId}`);
    const orderId = orderDetails.data?.data?.order?.orderId || 'TEST-ORDER-ID';
    
    logInfo(`Confirming order ID: ${orderId}`);
    
    const response = await api.patch(`/api/delivery/orders/${testOrderId}/confirm-order-id`, {
      orderId: orderId,
      currentLat: restaurantLocation?.lat || deliveryBoyLocation.lat,
      currentLng: restaurantLocation?.lng || deliveryBoyLocation.lng
    });
    
    if (response.data?.success) {
      logSuccess('Order ID confirmed successfully');
      logInfo(`Current phase: ${response.data.data?.order?.deliveryState?.currentPhase}`);
      logInfo(`Order status: ${response.data.data?.order?.status}`);
      return true;
    } else {
      logError('Order ID confirmation failed');
      logError(`Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    logError(`Error confirming order ID: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

/**
 * Step 4: Reached Drop
 */
async function testReachedDrop() {
  logStep(4, 'Reached Drop');
  
  try {
    logInfo(`Confirming reached drop for order: ${testOrderId}`);
    
    const response = await api.patch(`/api/delivery/orders/${testOrderId}/reached-drop`, {
      currentLat: customerLocation?.lat || deliveryBoyLocation.lat,
      currentLng: customerLocation?.lng || deliveryBoyLocation.lng
    });
    
    if (response.data?.success) {
      logSuccess('Reached drop confirmed successfully');
      logInfo(`Current phase: ${response.data.data?.order?.deliveryState?.currentPhase}`);
      logInfo(`Order status: ${response.data.data?.order?.status}`);
      return true;
    } else {
      logError('Reached drop confirmation failed');
      logError(`Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    logError(`Error confirming reached drop: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

/**
 * Step 5: Complete Delivery
 */
async function testCompleteDelivery() {
  logStep(5, 'Complete Delivery');
  
  try {
    logInfo(`Completing delivery for order: ${testOrderId}`);
    
    const response = await api.patch(`/api/delivery/orders/${testOrderId}/complete`, {
      currentLat: customerLocation?.lat || deliveryBoyLocation.lat,
      currentLng: customerLocation?.lng || deliveryBoyLocation.lng,
      paymentMethod: 'cash', // or 'razorpay'
      paymentReceived: true,
      customerRating: 5,
      customerReview: 'Great delivery service!'
    });
    
    if (response.data?.success) {
      logSuccess('Delivery completed successfully');
      logInfo(`Order status: ${response.data.data?.order?.status}`);
      logInfo(`Final earnings: ₹${response.data.data?.finalEarnings || 'N/A'}`);
      return true;
    } else {
      logError('Delivery completion failed');
      logError(`Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    logError(`Error completing delivery: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

/**
 * Get Order Status
 */
async function getOrderStatus() {
  try {
    const response = await api.get(`/api/delivery/orders/${testOrderId}`);
    if (response.data?.success) {
      const order = response.data.data?.order || response.data.data;
      logInfo(`\n📋 Current Order Status:`);
      logInfo(`   Order ID: ${order.orderId}`);
      logInfo(`   Status: ${order.status}`);
      logInfo(`   Delivery Phase: ${order.deliveryState?.currentPhase || 'N/A'}`);
      logInfo(`   Delivery State: ${order.deliveryState?.status || 'N/A'}`);
      return order;
    }
  } catch (error) {
    logWarning(`Could not fetch order status: ${error.message}`);
  }
  return null;
}

/**
 * Main test function
 */
async function runTests() {
  log('\n🚀 Starting Delivery Order Flow Test', 'bright');
  log(`Base URL: ${BASE_URL}`, 'cyan');
  log(`Order ID: ${testOrderId || 'Will be found automatically'}`, 'cyan');
  
  try {
    // Setup
    await setup();
    
    // Get initial order status
    await getOrderStatus();
    
    // Run tests
    const results = {
      acceptOrder: false,
      reachedPickup: false,
      confirmOrderId: false,
      reachedDrop: false,
      completeDelivery: false
    };
    
    // Step 1: Accept Order
    results.acceptOrder = await testAcceptOrder();
    if (!results.acceptOrder) {
      logError('Cannot proceed - order acceptance failed');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    
    // Step 2: Reached Pickup
    results.reachedPickup = await testReachedPickup();
    if (!results.reachedPickup) {
      logWarning('Reached pickup failed, but continuing...');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 3: Confirm Order ID
    results.confirmOrderId = await testConfirmOrderId();
    if (!results.confirmOrderId) {
      logWarning('Order ID confirmation failed, but continuing...');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 4: Reached Drop
    results.reachedDrop = await testReachedDrop();
    if (!results.reachedDrop) {
      logWarning('Reached drop failed, but continuing...');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 5: Complete Delivery
    results.completeDelivery = await testCompleteDelivery();
    
    // Final status
    await getOrderStatus();
    
    // Summary
    logStep('SUMMARY', 'Test Results');
    log(`Accept Order: ${results.acceptOrder ? '✅ PASS' : '❌ FAIL'}`, results.acceptOrder ? 'green' : 'red');
    log(`Reached Pickup: ${results.reachedPickup ? '✅ PASS' : '❌ FAIL'}`, results.reachedPickup ? 'green' : 'red');
    log(`Confirm Order ID: ${results.confirmOrderId ? '✅ PASS' : '❌ FAIL'}`, results.confirmOrderId ? 'green' : 'red');
    log(`Reached Drop: ${results.reachedDrop ? '✅ PASS' : '❌ FAIL'}`, results.reachedDrop ? 'green' : 'red');
    log(`Complete Delivery: ${results.completeDelivery ? '✅ PASS' : '❌ FAIL'}`, results.completeDelivery ? 'green' : 'red');
    
    const passed = Object.values(results).filter(r => r).length;
    const total = Object.keys(results).length;
    log(`\n📊 Results: ${passed}/${total} tests passed`, passed === total ? 'green' : 'yellow');
    
  } catch (error) {
    logError(`Test failed with error: ${error.message}`);
    logError(`Stack: ${error.stack}`);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    logInfo('MongoDB connection closed');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
});

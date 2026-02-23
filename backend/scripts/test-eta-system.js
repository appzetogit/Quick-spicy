/**
 * End-to-End ETA System Test Script
 * 
 * This script tests the complete ETA calculation system:
 * 1. Order creation with initial ETA
 * 2. Restaurant accepts order (ETA update)
 * 3. Rider assignment (ETA update)
 * 4. Rider reaches restaurant (ETA update)
 * 5. Rider starts delivery (ETA update)
 * 6. Live ETA retrieval
 * 
 * Usage: node scripts/test-eta-system.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../config/database.js';
import Order from '../modules/order/models/Order.js';
import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Delivery from '../modules/delivery/models/Delivery.js';
import User from '../modules/auth/models/User.js';
import etaCalculationService from '../modules/order/services/etaCalculationService.js';
import etaEventService from '../modules/order/services/etaEventService.js';
import OrderEvent from '../modules/order/models/OrderEvent.js';
import ETALog from '../modules/order/models/ETALog.js';

dotenv.config();

// Test configuration
const TEST_CONFIG = {
  restaurantId: null, // Will be set from first restaurant
  userId: null, // Will be set from first user
  deliveryPartnerId: null, // Will be set from first delivery partner
  orderId: null // Will be set after order creation
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
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
  log(`\n[STEP ${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'yellow');
}

/**
 * Test 1: Setup - Get test data
 */
async function setupTestData() {
  logStep(1, 'Setting up test data...');

  try {
    // Get first restaurant
    const restaurant = await Restaurant.findOne({ isActive: true, isAcceptingOrders: true });
    if (!restaurant) {
      throw new Error('No active restaurant found. Please create a restaurant first.');
    }
    TEST_CONFIG.restaurantId = restaurant._id.toString();
    logSuccess(`Found restaurant: ${restaurant.name} (${restaurant.restaurantId})`);

    // Check restaurant location
    if (!restaurant.location || !restaurant.location.latitude || !restaurant.location.longitude) {
      throw new Error('Restaurant location not set. Please set restaurant location first.');
    }
    logInfo(`Restaurant location: ${restaurant.location.latitude}, ${restaurant.location.longitude}`);

    // Get first user
    const user = await User.findOne();
    if (!user) {
      throw new Error('No user found. Please create a user first.');
    }
    TEST_CONFIG.userId = user._id.toString();
    logSuccess(`Found user: ${user.name || user.email || user.phone}`);

    // Get first delivery partner
    const deliveryPartner = await Delivery.findOne({
      'availability.isOnline': true,
      status: { $in: ['approved', 'active'] },
      isActive: true
    });
    if (deliveryPartner) {
      TEST_CONFIG.deliveryPartnerId = deliveryPartner._id.toString();
      logSuccess(`Found delivery partner: ${deliveryPartner.name}`);
    } else {
      logInfo('No online delivery partner found. Some tests will be skipped.');
    }

    return true;
  } catch (error) {
    logError(`Setup failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 2: Calculate Initial ETA
 */
async function testInitialETA() {
  logStep(2, 'Testing initial ETA calculation...');

  try {
    const restaurant = await Restaurant.findById(TEST_CONFIG.restaurantId);
    if (!restaurant) {
      throw new Error('Restaurant not found');
    }

    const restaurantLocation = {
      latitude: restaurant.location.latitude,
      longitude: restaurant.location.longitude
    };

    // User location (slightly different from restaurant)
    const userLocation = {
      latitude: restaurant.location.latitude + 0.01, // ~1km away
      longitude: restaurant.location.longitude + 0.01
    };

    logInfo(`Calculating ETA from restaurant to user location...`);
    logInfo(`Restaurant: ${restaurantLocation.latitude}, ${restaurantLocation.longitude}`);
    logInfo(`User: ${userLocation.latitude}, ${userLocation.longitude}`);

    const etaResult = await etaCalculationService.calculateInitialETA({
      restaurantId: restaurant.restaurantId || TEST_CONFIG.restaurantId,
      restaurantLocation,
      userLocation
    });

    logSuccess(`Initial ETA calculated: ${etaResult.minETA}-${etaResult.maxETA} mins`);
    logInfo(`Breakdown:`, 'yellow');
    console.log(JSON.stringify(etaResult.breakdown, null, 2));

    return etaResult;
  } catch (error) {
    logError(`Initial ETA calculation failed: ${error.message}`);
    console.error(error);
    return null;
  }
}

/**
 * Test 3: Create Order with ETA
 */
async function testCreateOrder() {
  logStep(3, 'Testing order creation with ETA...');

  try {
    const restaurant = await Restaurant.findById(TEST_CONFIG.restaurantId);
    if (!restaurant) {
      throw new Error('Restaurant not found');
    }

    const order = new Order({
      orderId: `TEST-${Date.now()}`,
      userId: TEST_CONFIG.userId,
      restaurantId: TEST_CONFIG.restaurantId,
      restaurantName: restaurant.name,
      items: [{
        itemId: 'test-item-1',
        name: 'Test Item',
        price: 100,
        quantity: 1,
        isVeg: true
      }],
      address: {
        label: 'Home',
        street: 'Test Street',
        city: restaurant.location.city || 'Test City',
        state: restaurant.location.state || 'Test State',
        zipCode: '123456',
        formattedAddress: 'Test Address, Test City, Test State 123456',
        location: {
          type: 'Point',
          coordinates: [
            restaurant.location.longitude + 0.01,
            restaurant.location.latitude + 0.01
          ]
        }
      },
      pricing: {
        subtotal: 100,
        deliveryFee: 20,
        tax: 18,
        total: 138
      },
      payment: {
        method: 'cash',
        status: 'completed'
      },
      status: 'confirmed'
    });

    // Calculate and set ETA
    const restaurantLocation = {
      latitude: restaurant.location.latitude,
      longitude: restaurant.location.longitude
    };

    const userLocation = {
      latitude: restaurant.location.latitude + 0.01,
      longitude: restaurant.location.longitude + 0.01
    };

    const etaResult = await etaCalculationService.calculateInitialETA({
      restaurantId: restaurant.restaurantId || TEST_CONFIG.restaurantId,
      restaurantLocation,
      userLocation
    });

    order.eta = {
      min: etaResult.minETA,
      max: etaResult.maxETA,
      lastUpdated: new Date()
    };
    order.estimatedDeliveryTime = Math.ceil((etaResult.minETA + etaResult.maxETA) / 2);

    // Create order event
    await OrderEvent.create({
      orderId: order._id,
      eventType: 'ORDER_CREATED',
      data: {
        initialETA: {
          min: etaResult.minETA,
          max: etaResult.maxETA
        }
      },
      timestamp: new Date()
    });

    await order.save();
    TEST_CONFIG.orderId = order._id.toString();

    logSuccess(`Order created: ${order.orderId}`);
    logInfo(`Initial ETA: ${order.eta.min}-${order.eta.max} mins`);
    logInfo(`Estimated delivery time: ${order.estimatedDeliveryTime} mins`);

    return order;
  } catch (error) {
    logError(`Order creation failed: ${error.message}`);
    console.error(error);
    return null;
  }
}

/**
 * Test 4: Restaurant Accepts Order
 */
async function testRestaurantAccepts() {
  logStep(4, 'Testing restaurant accept (ETA update)...');

  try {
    const order = await Order.findById(TEST_CONFIG.orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const beforeETA = {
      min: order.eta.min,
      max: order.eta.max
    };

    // Simulate restaurant accepting after 3 minutes
    const acceptedAt = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago

    await etaEventService.handleRestaurantAccepted(TEST_CONFIG.orderId, acceptedAt);

    // Reload order
    await order.reload();
    const afterETA = {
      min: order.eta.min,
      max: order.eta.max
    };

    logSuccess(`Restaurant accepted order`);
    logInfo(`ETA before: ${beforeETA.min}-${beforeETA.max} mins`);
    logInfo(`ETA after: ${afterETA.min}-${afterETA.max} mins`);

    // Check if ETA was updated
    const etaLog = await ETALog.findOne({ orderId: order._id })
      .sort({ calculatedAt: -1 });

    if (etaLog) {
      logSuccess(`ETA log created: ${etaLog.reason}`);
    }

    return true;
  } catch (error) {
    logError(`Restaurant accept test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 5: Rider Assignment
 */
async function testRiderAssignment() {
  logStep(5, 'Testing rider assignment (ETA update)...');

  if (!TEST_CONFIG.deliveryPartnerId) {
    logInfo('Skipping rider assignment test - no delivery partner available');
    return false;
  }

  try {
    const order = await Order.findById(TEST_CONFIG.orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const beforeETA = {
      min: order.eta.min,
      max: order.eta.max
    };

    await etaEventService.handleRiderAssigned(TEST_CONFIG.orderId, TEST_CONFIG.deliveryPartnerId);

    // Reload order
    await order.reload();
    const afterETA = {
      min: order.eta.min,
      max: order.eta.max
    };

    logSuccess(`Rider assigned to order`);
    logInfo(`ETA before: ${beforeETA.min}-${beforeETA.max} mins`);
    logInfo(`ETA after: ${afterETA.min}-${afterETA.max} mins`);

    return true;
  } catch (error) {
    logError(`Rider assignment test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 6: Rider Reaches Restaurant
 */
async function testRiderReachesRestaurant() {
  logStep(6, 'Testing rider reaches restaurant (ETA update)...');

  try {
    const order = await Order.findById(TEST_CONFIG.orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const beforeETA = {
      min: order.eta.min,
      max: order.eta.max
    };

    await etaEventService.handleRiderReachedRestaurant(TEST_CONFIG.orderId);

    // Reload order
    await order.reload();
    const afterETA = {
      min: order.eta.min,
      max: order.eta.max
    };

    logSuccess(`Rider reached restaurant`);
    logInfo(`ETA before: ${beforeETA.min}-${beforeETA.max} mins`);
    logInfo(`ETA after: ${afterETA.min}-${afterETA.max} mins`);

    return true;
  } catch (error) {
    logError(`Rider reaches restaurant test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 7: Rider Starts Delivery
 */
async function testRiderStartsDelivery() {
  logStep(7, 'Testing rider starts delivery (ETA update)...');

  try {
    const order = await Order.findById(TEST_CONFIG.orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const beforeETA = {
      min: order.eta.min,
      max: order.eta.max
    };

    await etaEventService.handleRiderStartedDelivery(TEST_CONFIG.orderId);

    // Reload order
    await order.reload();
    const afterETA = {
      min: order.eta.min,
      max: order.eta.max
    };

    logSuccess(`Rider started delivery`);
    logInfo(`ETA before: ${beforeETA.min}-${beforeETA.max} mins`);
    logInfo(`ETA after: ${afterETA.min}-${afterETA.max} mins`);

    return true;
  } catch (error) {
    logError(`Rider starts delivery test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 8: Get Live ETA
 */
async function testGetLiveETA() {
  logStep(8, 'Testing live ETA retrieval...');

  try {
    const liveETA = await etaCalculationService.getLiveETA(TEST_CONFIG.orderId);

    logSuccess(`Live ETA retrieved`);
    logInfo(`Remaining ETA: ${liveETA.minETA}-${liveETA.maxETA} mins`);
    logInfo(`Elapsed: ${liveETA.elapsedMinutes} mins`);
    logInfo(`Status: ${liveETA.status}`);
    logInfo(`Formatted: ${liveETA.formatted}`);

    return true;
  } catch (error) {
    logError(`Live ETA retrieval failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 9: Get ETA History
 */
async function testGetETAHistory() {
  logStep(9, 'Testing ETA history retrieval...');

  try {
    const order = await Order.findById(TEST_CONFIG.orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const etaLogs = await ETALog.find({ orderId: order._id })
      .sort({ calculatedAt: -1 })
      .limit(10);

    logSuccess(`Found ${etaLogs.length} ETA log entries`);

    if (etaLogs.length > 0) {
      logInfo('Recent ETA changes:');
      etaLogs.forEach((log, index) => {
        console.log(`  ${index + 1}. ${log.reason}: ${log.previousETA.min}-${log.previousETA.max} → ${log.newETA.min}-${log.newETA.max} mins`);
      });
    }

    return true;
  } catch (error) {
    logError(`ETA history retrieval failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Test 10: Get Order Events
 */
async function testGetOrderEvents() {
  logStep(10, 'Testing order events retrieval...');

  try {
    const order = await Order.findById(TEST_CONFIG.orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const events = await OrderEvent.find({ orderId: order._id })
      .sort({ timestamp: -1 })
      .limit(10);

    logSuccess(`Found ${events.length} order events`);

    if (events.length > 0) {
      logInfo('Recent events:');
      events.forEach((event, index) => {
        console.log(`  ${index + 1}. ${event.eventType} at ${event.timestamp.toISOString()}`);
      });
    }

    return true;
  } catch (error) {
    logError(`Order events retrieval failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * Cleanup test data
 */
async function cleanup() {
  logStep('CLEANUP', 'Cleaning up test data...');

  try {
    if (TEST_CONFIG.orderId) {
      const order = await Order.findById(TEST_CONFIG.orderId);
      if (order) {
        // Delete related data
        await OrderEvent.deleteMany({ orderId: order._id });
        await ETALog.deleteMany({ orderId: order._id });
        await Order.deleteOne({ _id: order._id });
        logSuccess(`Test order ${order.orderId} deleted`);
      }
    }
  } catch (error) {
    logError(`Cleanup failed: ${error.message}`);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  log('\n' + '='.repeat(60), 'blue');
  log('ETA SYSTEM END-TO-END TEST', 'blue');
  log('='.repeat(60) + '\n', 'blue');

  try {
    // Connect to database
    await connectDB();
    logSuccess('Connected to database');

    // Run tests
    const results = {
      setup: await setupTestData(),
      initialETA: await testInitialETA(),
      createOrder: await testCreateOrder(),
      restaurantAccepts: await testRestaurantAccepts(),
      riderAssignment: await testRiderAssignment(),
      riderReachesRestaurant: await testRiderReachesRestaurant(),
      riderStartsDelivery: await testRiderStartsDelivery(),
      getLiveETA: await testGetLiveETA(),
      getETAHistory: await testGetETAHistory(),
      getOrderEvents: await testGetOrderEvents()
    };

    // Summary
    log('\n' + '='.repeat(60), 'blue');
    log('TEST SUMMARY', 'blue');
    log('='.repeat(60), 'blue');

    const passed = Object.values(results).filter(r => r !== null && r !== false).length;
    const total = Object.keys(results).length;

    Object.entries(results).forEach(([test, result]) => {
      if (result === null || result === false) {
        logError(`${test}: FAILED`);
      } else {
        logSuccess(`${test}: PASSED`);
      }
    });

    log(`\nTotal: ${passed}/${total} tests passed`, passed === total ? 'green' : 'yellow');

    // Cleanup
    const cleanupChoice = process.argv.includes('--keep-data') ? false : true;
    if (cleanupChoice) {
      await cleanup();
    } else {
      logInfo('Test data kept (use --keep-data flag to keep data)');
    }

    // Close database connection
    await mongoose.connection.close();
    logSuccess('Database connection closed');

    process.exit(passed === total ? 0 : 1);
  } catch (error) {
    logError(`Test suite failed: ${error.message}`);
    console.error(error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run tests
runTests();


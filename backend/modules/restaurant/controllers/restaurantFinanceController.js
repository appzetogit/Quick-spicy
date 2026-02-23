import Order from '../../order/models/Order.js';
import RestaurantCommission from '../../admin/models/RestaurantCommission.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import RestaurantWallet from '../models/RestaurantWallet.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import mongoose from 'mongoose';

/**
 * Get restaurant finance/payout data
 * GET /api/restaurant/finance
 * Query params: startDate, endDate (for past cycles)
 */
export const getRestaurantFinance = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    const { startDate, endDate } = req.query;

    // Get restaurant ID
    const restaurantId = restaurant._id?.toString() || restaurant.restaurantId || restaurant.id;

    if (!restaurantId) {
      return errorResponse(res, 500, 'Restaurant ID not found');
    }

    // Calculate current cycle dates (default: Monday to Sunday of current week)
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1; // Convert Sunday (0) to 6
    
    // Start of current cycle (Monday)
    const currentCycleStart = new Date(now);
    currentCycleStart.setDate(now.getDate() - daysFromMonday);
    currentCycleStart.setHours(0, 0, 0, 0);
    
    // End of current cycle (Sunday)
    const currentCycleEnd = new Date(currentCycleStart);
    currentCycleEnd.setDate(currentCycleStart.getDate() + 6);
    currentCycleEnd.setHours(23, 59, 59, 999);

    // Query for restaurant orders - handle multiple restaurantId formats
    const restaurantIdVariations = [restaurantId];
    if (mongoose.Types.ObjectId.isValid(restaurantId)) {
      const objectIdString = new mongoose.Types.ObjectId(restaurantId).toString();
      if (!restaurantIdVariations.includes(objectIdString)) {
        restaurantIdVariations.push(objectIdString);
      }
    }

    const restaurantIdQuery = {
      $or: [
        { restaurantId: { $in: restaurantIdVariations } },
        { restaurantId: restaurantId }
      ]
    };

    // Get commission setup for restaurant
    let restaurantCommission = null;
    try {
      restaurantCommission = await RestaurantCommission.findOne({
        restaurant: restaurantId,
        status: true
      }).lean();
    } catch (commissionError) {
      console.warn('⚠️ Could not fetch commission setup:', commissionError.message);
    }

    // Helper function to calculate commission for an order
    const calculateCommissionForOrder = (orderAmount) => {
      if (!restaurantCommission || !restaurantCommission.status) {
        // Default 10% if no commission setup
        return {
          commission: (orderAmount * 10) / 100,
          type: 'percentage',
          value: 10
        };
      }

      // Find matching commission rule
      const sortedRules = [...(restaurantCommission.commissionRules || [])]
        .filter(rule => rule.isActive)
        .sort((a, b) => {
          if (b.priority !== a.priority) {
            return b.priority - a.priority;
          }
          return a.minOrderAmount - b.minOrderAmount;
        });

      let matchingRule = null;
      for (const rule of sortedRules) {
        if (orderAmount >= rule.minOrderAmount) {
          if (rule.maxOrderAmount === null || orderAmount <= rule.maxOrderAmount) {
            matchingRule = rule;
            break;
          }
        }
      }

      let commission = 0;
      let commissionType = 'percentage';
      let commissionValue = 10;

      if (matchingRule) {
        commissionType = matchingRule.type;
        commissionValue = matchingRule.value;
        if (matchingRule.type === 'percentage') {
          commission = (orderAmount * matchingRule.value) / 100;
        } else {
          commission = matchingRule.value;
        }
      } else if (restaurantCommission.defaultCommission) {
        commissionType = restaurantCommission.defaultCommission.type || 'percentage';
        commissionValue = restaurantCommission.defaultCommission.value || 10;
        if (commissionType === 'percentage') {
          commission = (orderAmount * commissionValue) / 100;
        } else {
          commission = commissionValue;
        }
      } else {
        // Default 10%
        commission = (orderAmount * 10) / 100;
      }

      return {
        commission: Math.round(commission * 100) / 100,
        type: commissionType,
        value: commissionValue
      };
    };

    // Get current cycle orders (delivered orders in current week)
    // Query orders that were delivered in the current cycle
    // First try with deliveredAt, if not found, use tracking.delivered.timestamp as fallback
    let currentCycleOrders = await Order.find({
      ...restaurantIdQuery,
      status: 'delivered',
      $or: [
        { deliveredAt: { $gte: currentCycleStart, $lte: currentCycleEnd } },
        { 'tracking.delivered.timestamp': { $gte: currentCycleStart, $lte: currentCycleEnd } }
      ]
    })
    .populate('userId', 'name phone email')
    .select('orderId userId items pricing payment status address createdAt deliveredAt tracking')
    .lean();

    // If no orders found with deliveredAt/tracking, check by createdAt as last resort
    if (currentCycleOrders.length === 0) {
      currentCycleOrders = await Order.find({
        ...restaurantIdQuery,
        status: 'delivered',
        createdAt: { $gte: currentCycleStart, $lte: currentCycleEnd }
      })
      .populate('userId', 'name phone email')
      .select('orderId userId items pricing payment status address createdAt deliveredAt tracking')
      .lean();
    }

    console.log(`📊 Finance API - Current cycle orders found: ${currentCycleOrders.length} for restaurant ${restaurantId}`);
    console.log(`📅 Date range: ${currentCycleStart.toISOString()} to ${currentCycleEnd.toISOString()}`);

    // Get all unique user IDs from orders
    const userIds = [...new Set(currentCycleOrders.map(order => {
      if (!order.userId) return null;
      // If populated, use _id, otherwise use the value directly
      if (typeof order.userId === 'object' && order.userId._id) {
        return order.userId._id.toString();
      } else if (typeof order.userId === 'object' && mongoose.Types.ObjectId.isValid(order.userId)) {
        return order.userId.toString();
      } else {
        return order.userId.toString();
      }
    }).filter(Boolean))];
    
    console.log(`📋 Found ${userIds.length} unique user IDs:`, userIds);
    
    // Fetch user data in bulk
    let usersMap = {};
    if (userIds.length > 0) {
      try {
        const UserModel = (await import('../../auth/models/User.js')).default;
        // Convert string IDs to ObjectIds for query
        const objectIds = userIds.map(id => {
          try {
            return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
          } catch (e) {
            return id;
          }
        });
        const users = await UserModel.find({ _id: { $in: objectIds } })
          .select('name phone email')
          .lean();
        console.log(`👥 Fetched ${users.length} users from database`);
        users.forEach(user => {
          usersMap[user._id.toString()] = user;
        });
        console.log(`📝 Users map created with ${Object.keys(usersMap).length} entries`);
      } catch (error) {
        console.error('❌ Error fetching users:', error);
      }
    }

    // Calculate current cycle payout
    // IMPORTANT: Commission is calculated on FOOD PRICE (subtotal - discount), NOT on total (which includes platform fee, GST, delivery fee)
    let currentCycleTotal = 0;
    let currentCycleCommission = 0;
    const currentCycleOrdersData = await Promise.all(currentCycleOrders.map(async (order) => {
      // Food price = subtotal - discount (this is what commission is calculated on)
      const foodPrice = (order.pricing?.subtotal || 0) - (order.pricing?.discount || 0);
      const commissionData = calculateCommissionForOrder(foodPrice);
      const payout = foodPrice - commissionData.commission;
      
      currentCycleTotal += foodPrice; // Use food price, not total
      currentCycleCommission += commissionData.commission;

      // Get food names from order items
      const foodNames = (order.items || []).map(item => item.name).join(', ') || 'N/A';
      
      // Handle userId - can be ObjectId or populated object
      let customerName = 'N/A';
      let customerPhone = 'N/A';
      let customerEmail = 'N/A';
      
      if (order.userId) {
        let userIdStr = null;
        
        // Check if populated (has _id property or name property)
        if (typeof order.userId === 'object' && (order.userId.name || order.userId._id)) {
          // Populated user object
          userIdStr = order.userId._id?.toString() || order.userId.toString();
          customerName = order.userId.name || 'N/A';
          customerPhone = order.userId.phone || 'N/A';
          customerEmail = order.userId.email || 'N/A';
        } else {
          // Just ObjectId, need to look up in usersMap
          userIdStr = order.userId.toString();
          if (usersMap[userIdStr]) {
            const user = usersMap[userIdStr];
            customerName = user.name || 'N/A';
            customerPhone = user.phone || 'N/A';
            customerEmail = user.email || 'N/A';
          } else {
            // Debug: log if user not found
            console.log(`⚠️ User not found in map for userId: ${userIdStr}, orderId: ${order.orderId}`);
          }
        }
      } else {
        console.log(`⚠️ No userId found for order: ${order.orderId}`);
      }
      
      // Format payment method - fetch full order if payment not available
      let paymentMethod = 'N/A';
      if (order.payment && order.payment.method) {
        const method = order.payment.method;
        paymentMethod = method.charAt(0).toUpperCase() + method.slice(1);
      } else {
        // Fetch full order to get payment method
        try {
          const fullOrder = await Order.findOne({ orderId: order.orderId })
            .select('payment status')
            .lean();
          if (fullOrder && fullOrder.payment && fullOrder.payment.method) {
            const method = fullOrder.payment.method;
            paymentMethod = method.charAt(0).toUpperCase() + method.slice(1);
          }
        } catch (err) {
          console.log(`⚠️ Could not fetch payment for order ${order.orderId}:`, err.message);
        }
      }
      
      // Format order status - use from order or fetch if missing
      let orderStatus = 'N/A';
      if (order.status) {
        const status = order.status;
        orderStatus = status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
      } else {
        // Fetch full order to get status
        try {
          const fullOrder = await Order.findOne({ orderId: order.orderId })
            .select('status')
            .lean();
          if (fullOrder && fullOrder.status) {
            const status = fullOrder.status;
            orderStatus = status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
          }
        } catch (err) {
          console.log(`⚠️ Could not fetch status for order ${order.orderId}:`, err.message);
        }
      }
      
      return {
        orderId: order.orderId || order._id?.toString() || 'N/A',
        orderTotal: foodPrice, // Food price (subtotal - discount) for display
        totalAmount: order.pricing?.total || 0, // Total order amount paid by customer
        commission: commissionData.commission,
        payout,
        deliveredAt: order.deliveredAt || order.createdAt,
        createdAt: order.createdAt,
        items: order.items || [], // Include full items array
        foodNames: foodNames, // Include food names as comma-separated string
        customerName: customerName,
        customerPhone: customerPhone,
        customerEmail: customerEmail,
        paymentMethod: paymentMethod,
        orderStatus: orderStatus,
        address: order.address || {}
      };
    }));

    // Format current cycle dates
    const formatCycleDate = (date) => {
      const day = date.getDate();
      const month = date.toLocaleString('en-US', { month: 'short' });
      const year = date.getFullYear().toString().slice(-2);
      return { day: day.toString(), month, year };
    };

    const currentCycleStartFormatted = formatCycleDate(currentCycleStart);
    const currentCycleEndFormatted = formatCycleDate(currentCycleEnd);

    // Get past cycles orders if date range provided
    let pastCyclesData = null;
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      // Query orders that were delivered in the past cycle
      // First try with deliveredAt, if not found, use tracking.delivered.timestamp as fallback
      let pastCycleOrders = await Order.find({
        ...restaurantIdQuery,
        status: 'delivered',
        $or: [
          { deliveredAt: { $gte: start, $lte: end } },
          { 'tracking.delivered.timestamp': { $gte: start, $lte: end } }
        ]
      })
      .populate('userId', 'name phone email')
      .lean();

      // If no orders found with deliveredAt/tracking, check by createdAt as last resort
      if (pastCycleOrders.length === 0) {
        pastCycleOrders = await Order.find({
          ...restaurantIdQuery,
          status: 'delivered',
          createdAt: { $gte: start, $lte: end }
        })
        .populate('userId', 'name phone email')
        .select('orderId userId items pricing payment status address createdAt deliveredAt tracking')
        .lean();
      }

      console.log(`📊 Finance API - Past cycle orders found: ${pastCycleOrders.length} for date range ${startDate} to ${endDate}`);

      // Get all unique user IDs from past cycle orders
      const pastUserIds = [...new Set(pastCycleOrders.map(order => {
        if (!order.userId) return null;
        // Handle both populated and non-populated userId
        if (typeof order.userId === 'object' && order.userId._id) {
          return order.userId._id.toString();
        } else if (typeof order.userId === 'object' && mongoose.Types.ObjectId.isValid(order.userId)) {
          return order.userId.toString();
        } else {
          return order.userId.toString();
        }
      }).filter(Boolean))];
      
      console.log(`📋 Found ${pastUserIds.length} unique user IDs for past cycle:`, pastUserIds);
      
      // Fetch user data in bulk for past cycle
      let pastUsersMap = {};
      if (pastUserIds.length > 0) {
        try {
          const UserModel = (await import('../../auth/models/User.js')).default;
          const users = await UserModel.find({ _id: { $in: pastUserIds.map(id => new mongoose.Types.ObjectId(id)) } })
            .select('name phone email')
            .lean();
          console.log(`👥 Fetched ${users.length} users for past cycle from database`);
          users.forEach(user => {
            pastUsersMap[user._id.toString()] = user;
          });
          console.log(`📝 Past users map keys:`, Object.keys(pastUsersMap));
        } catch (error) {
          console.error('❌ Error fetching users for past cycle:', error);
        }
      }

      let pastCycleTotal = 0;
      let pastCycleCommission = 0;
      const pastCycleOrdersData = await Promise.all(pastCycleOrders.map(async (order) => {
        // Food price = subtotal - discount (this is what commission is calculated on)
        const foodPrice = (order.pricing?.subtotal || 0) - (order.pricing?.discount || 0);
        const commissionData = calculateCommissionForOrder(foodPrice);
        const payout = foodPrice - commissionData.commission;
        
        pastCycleTotal += foodPrice; // Use food price, not total
        pastCycleCommission += commissionData.commission;

        // Get food names from order items
        const foodNames = (order.items || []).map(item => item.name).join(', ') || 'N/A';
        
        // Handle userId - can be ObjectId or populated object
        let customerName = 'N/A';
        let customerPhone = 'N/A';
        let customerEmail = 'N/A';
        
        if (order.userId) {
          let userIdStr = null;
          
          // Check if populated (has _id property or name property)
          if (typeof order.userId === 'object' && (order.userId.name || order.userId._id)) {
            // Populated user object
            userIdStr = order.userId._id?.toString() || order.userId.toString();
            customerName = order.userId.name || 'N/A';
            customerPhone = order.userId.phone || 'N/A';
            customerEmail = order.userId.email || 'N/A';
          } else {
            // Just ObjectId, need to look up in pastUsersMap
            userIdStr = order.userId.toString();
            if (pastUsersMap[userIdStr]) {
              const user = pastUsersMap[userIdStr];
              customerName = user.name || 'N/A';
              customerPhone = user.phone || 'N/A';
              customerEmail = user.email || 'N/A';
            } else {
              // Debug: log if user not found
              console.log(`⚠️ User not found in pastUsersMap for userId: ${userIdStr}, orderId: ${order.orderId}`);
            }
          }
        } else {
          console.log(`⚠️ No userId found for order: ${order.orderId}`);
        }
        
        // Format payment method
        let paymentMethod = 'N/A';
        if (order.payment && order.payment.method) {
          const method = order.payment.method;
          paymentMethod = method.charAt(0).toUpperCase() + method.slice(1);
        } else {
          console.log(`⚠️ No payment method found for past order: ${order.orderId}, payment object:`, order.payment);
        }
        
        // Format order status
        let orderStatus = 'N/A';
        if (order.status) {
          const status = order.status;
          orderStatus = status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
        } else {
          console.log(`⚠️ No status found for past order: ${order.orderId}`);
        }
        
        return {
          orderId: order.orderId || order._id?.toString() || 'N/A',
          orderTotal: foodPrice, // Food price (subtotal - discount) for display
          totalAmount: order.pricing?.total || 0, // Total order amount paid by customer
          commission: commissionData.commission,
          payout,
          deliveredAt: order.deliveredAt || order.createdAt,
          createdAt: order.createdAt,
          items: order.items || [], // Include full items array
          foodNames: foodNames, // Include food names as comma-separated string
          customerName: customerName,
          customerPhone: customerPhone,
          customerEmail: customerEmail,
          paymentMethod: paymentMethod,
          orderStatus: orderStatus,
        address: order.address || {}
      };
    }));

      pastCyclesData = {
        dateRange: {
          start: formatCycleDate(start),
          end: formatCycleDate(end)
        },
        totalOrders: pastCycleOrders.length,
        totalOrderValue: Math.round(pastCycleTotal * 100) / 100,
        totalCommission: Math.round(pastCycleCommission * 100) / 100,
        estimatedPayout: Math.round((pastCycleTotal - pastCycleCommission) * 100) / 100,
        orders: pastCycleOrdersData
      };
    }

    // Calculate current cycle payout (total - commission)
    const currentCyclePayout = Math.round((currentCycleTotal - currentCycleCommission) * 100) / 100;

    // Get all withdrawal requests (pending + approved) to subtract from estimatedPayout
    // This ensures that once a withdrawal is made, it's immediately reflected in the available balance
    const allWithdrawals = await WithdrawalRequest.find({
      restaurantId: restaurant._id,
      status: { $in: ['Pending', 'Approved'] }
    }).lean();

    const totalWithdrawals = allWithdrawals.reduce((sum, req) => sum + (req.amount || 0), 0);
    
    // Subtract all withdrawals (pending + approved) from estimatedPayout to show available balance
    // This ensures end-to-end withdrawal calculation works correctly
    const availablePayout = Math.max(0, Math.round((currentCyclePayout - totalWithdrawals) * 100) / 100);
    
    console.log('💰 Finance Calculation:', {
      currentCyclePayout,
      totalWithdrawals,
      availablePayout,
      withdrawalsCount: allWithdrawals.length,
      withdrawals: allWithdrawals.map(w => ({ id: w._id, amount: w.amount, status: w.status }))
    });

    return successResponse(res, 200, 'Finance data retrieved successfully', {
      currentCycle: {
        start: currentCycleStartFormatted,
        end: currentCycleEndFormatted,
        totalOrders: currentCycleOrders.length,
        totalOrderValue: Math.round(currentCycleTotal * 100) / 100,
        totalCommission: Math.round(currentCycleCommission * 100) / 100,
        estimatedPayout: availablePayout, // Show available balance after pending withdrawals
        payoutDate: null, // Will be set when payout is processed
        orders: currentCycleOrdersData // Include orders array in response
      },
      pastCycles: pastCyclesData,
      restaurant: {
        name: restaurant.name || 'Restaurant',
        restaurantId: restaurant.restaurantId || restaurantId,
        address: restaurant.location?.address || restaurant.location?.formattedAddress || ''
      }
    });
  } catch (error) {
    console.error('Error fetching restaurant finance:', error);
    return errorResponse(res, 500, 'Failed to fetch finance data');
  }
});

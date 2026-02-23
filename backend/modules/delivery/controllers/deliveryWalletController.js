import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import DeliveryWallet from '../models/DeliveryWallet.js';
import DeliveryWithdrawalRequest from '../models/DeliveryWithdrawalRequest.js';
import Order from '../../order/models/Order.js';
import BusinessSettings from '../../admin/models/BusinessSettings.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';
import winston from 'winston';
import { createOrder as createRazorpayOrder } from '../../payment/services/razorpayService.js';
import { verifyPayment } from '../../payment/services/razorpayService.js';
import { getRazorpayCredentials } from '../../../shared/utils/envService.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Get Wallet Balance
 * GET /api/delivery/wallet
 * Returns detailed wallet information including balances and recent transactions
 */
export const getWallet = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;

    // Find or create wallet for this delivery partner
    let wallet = await DeliveryWallet.findOne({ deliveryId: delivery._id });

    if (!wallet) {
      // Create wallet if doesn't exist
      wallet = await DeliveryWallet.create({
        deliveryId: delivery._id,
        totalBalance: 0,
        cashInHand: 0,
        totalWithdrawn: 0,
        totalEarned: 0
      });
    }

    // Calculate pending withdrawals
    const pendingWithdrawals = wallet.transactions
      .filter(t => t.type === 'withdrawal' && t.status === 'Pending')
      .reduce((sum, t) => sum + t.amount, 0);

    // Global cash limit and withdrawal limit (same for all delivery partners)
    let totalCashLimit = 0;
    let withdrawalLimit = 100;
    try {
      const settings = await BusinessSettings.getSettings();
      const configured = Number(settings?.deliveryCashLimit);
      if (Number.isFinite(configured) && configured >= 0) {
        totalCashLimit = configured;
      }
      const wl = Number(settings?.deliveryWithdrawalLimit);
      if (Number.isFinite(wl) && wl >= 0) {
        withdrawalLimit = wl;
      }
    } catch (e) {
      totalCashLimit = 0;
    }

    // ANYHOW FIX (end-to-end): compute COD cash collected from Orders so "Cash in hand" shows real amount.
    // Robust against legacy data (ObjectId vs string IDs, method casing, status stored in deliveryState).
    let codCollectedTotal = 0;
    try {
      const deliveryIdStr = delivery._id?.toString?.() || String(delivery._id);
      const codAgg = await Order.aggregate([
        {
          $match: {
            $expr: {
              $and: [
                // deliveryPartnerId matches current delivery (handles ObjectId or string)
                {
                  $eq: [
                    { $toString: { $ifNull: ['$deliveryPartnerId', ''] } },
                    deliveryIdStr
                  ]
                },
                // COD / Cash payment method (handles casing + some legacy values)
                {
                  $in: [
                    {
                      $toLower: {
                        $ifNull: ['$payment.method', '']
                      }
                    },
                    ['cash', 'cod', 'cash on delivery']
                  ]
                },
                // Delivered status can be in status or deliveryState fields
                {
                  $or: [
                    {
                      $eq: [
                        { $toLower: { $ifNull: ['$status', ''] } },
                        'delivered'
                      ]
                    },
                    {
                      $eq: [
                        { $toLower: { $ifNull: ['$deliveryState.status', ''] } },
                        'delivered'
                      ]
                    },
                    {
                      $eq: [
                        { $toLower: { $ifNull: ['$deliveryState.currentPhase', ''] } },
                        'completed'
                      ]
                    }
                  ]
                }
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ['$pricing.total', 0] } }
          }
        }
      ]);
      codCollectedTotal = Number(codAgg?.[0]?.total) || 0;
    } catch (e) {
      console.warn('⚠️ Failed to compute COD cash in hand from orders:', e?.message || e);
      codCollectedTotal = 0;
    }

    // Use wallet.cashInHand for cash-in-hand and available limit so deposit correctly
    // reduces cash in hand and increases available limit. Do not override with COD.
    const cashInHandForLimit = Math.max(0, Number(wallet.cashInHand) || 0);

    // Get all transactions (sorted by date, newest first)
    // Frontend needs all transactions to calculate weekly earnings and orders
    const allTransactions = wallet.transactions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Get recent transactions (last 10) for display purposes
    const recentTransactions = allTransactions.slice(0, 10);

    // Map all transactions for frontend calculations
    const transactions = allTransactions.map(t => ({
      id: t._id,
      _id: t._id,
      amount: t.amount,
      type: t.type,
      status: t.status,
      description: t.description,
      date: t.createdAt || t.date,
      createdAt: t.createdAt,
      orderId: t.orderId,
      paymentMethod: t.paymentMethod,
      paymentCollected: t.paymentCollected
    }));

    // Calculate bonus amount from transactions for logging
    const bonusTransactions = transactions.filter(t => t.type === 'bonus' && t.status === 'Completed');
    const totalBonus = bonusTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const walletData = {
      totalBalance: wallet.totalBalance || 0,
      cashInHand: cashInHandForLimit,
      totalWithdrawn: wallet.totalWithdrawn || 0,
      totalEarned: wallet.totalEarned || 0,
      totalCashLimit: totalCashLimit,
      availableCashLimit: Math.max(0, totalCashLimit - cashInHandForLimit),
      deliveryWithdrawalLimit: withdrawalLimit,
      // Pocket balance = total balance (includes bonus, earnings, etc.)
      pocketBalance: wallet.totalBalance || 0,
      pendingWithdrawals: pendingWithdrawals,
      joiningBonusClaimed: wallet.joiningBonusClaimed || false,
      joiningBonusAmount: wallet.joiningBonusAmount || 0,
      // Return all transactions for frontend calculations (weekly earnings, orders count, etc.)
      transactions: transactions,
      // Also include recentTransactions for backward compatibility
      recentTransactions: transactions.slice(0, 10),
      totalTransactions: wallet.transactions.length
    };

    // Log wallet data for debugging
    console.log('💰 Wallet API Response:', {
      deliveryId: delivery._id,
      totalBalance: walletData.totalBalance,
      pocketBalance: walletData.pocketBalance,
      cashInHand: walletData.cashInHand,
      availableCashLimit: walletData.availableCashLimit,
      codCollectedTotal,
      totalBonus: totalBonus,
      bonusTransactionsCount: bonusTransactions.length,
      totalTransactions: walletData.totalTransactions
    });

    return successResponse(res, 200, 'Wallet balance retrieved successfully', {
      wallet: walletData
    });
  } catch (error) {
    logger.error('Error fetching wallet:', error);
    return errorResponse(res, 500, 'Failed to fetch wallet balance');
  }
});

/**
 * Get Transaction History
 * GET /api/delivery/wallet/transactions
 * Query params: type, status, page, limit
 */
export const getTransactions = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { type, status, page = 1, limit = 20 } = req.query;

    let wallet = await DeliveryWallet.findOne({ deliveryId: delivery._id });

    if (!wallet) {
      return successResponse(res, 200, 'No transactions found', {
        transactions: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0
        }
      });
    }

    // Filter transactions
    let transactions = wallet.transactions || [];

    if (type) {
      transactions = transactions.filter(t => t.type === type);
    }

    if (status) {
      transactions = transactions.filter(t => t.status === status);
    }

    // Sort by date (newest first)
    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const total = transactions.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedTransactions = transactions.slice(skip, skip + parseInt(limit));

    return successResponse(res, 200, 'Transactions retrieved successfully', {
      transactions: paginatedTransactions.map(t => ({
        id: t._id,
        amount: t.amount,
        type: t.type,
        status: t.status,
        description: t.description,
        date: t.createdAt,
        orderId: t.orderId,
        paymentMethod: t.paymentMethod,
        paymentCollected: t.paymentCollected,
        processedAt: t.processedAt,
        failureReason: t.failureReason
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    return errorResponse(res, 500, 'Failed to fetch transactions');
  }
});

/**
 * Create Withdrawal Request
 * POST /api/delivery/wallet/withdraw
 */
const createWithdrawalSchema = Joi.object({
  amount: Joi.number().positive().required(),
  paymentMethod: Joi.string().valid('bank_transfer', 'upi', 'card').required(),
  bankDetails: Joi.object({
    accountNumber: Joi.string().when('paymentMethod', {
      is: 'bank_transfer',
      then: Joi.required()
    }),
    ifscCode: Joi.string().when('paymentMethod', {
      is: 'bank_transfer',
      then: Joi.required()
    }),
    accountHolderName: Joi.string().when('paymentMethod', {
      is: 'bank_transfer',
      then: Joi.required()
    }),
    bankName: Joi.string().when('paymentMethod', {
      is: 'bank_transfer',
      then: Joi.required()
    })
  }).optional(),
  upiId: Joi.string().when('paymentMethod', {
    is: 'upi',
    then: Joi.required()
  }).optional()
});

export const createWithdrawalRequest = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { amount, paymentMethod, bankDetails, upiId } = req.body;

    // Validation
    const { error: validationError } = createWithdrawalSchema.validate(req.body);
    if (validationError) {
      return errorResponse(res, 400, validationError.details[0].message);
    }

    // Find or create wallet
    let wallet = await DeliveryWallet.findOrCreateByDeliveryId(delivery._id);

    // Check minimum withdrawal amount (from BusinessSettings)
    let minWithdrawalAmount = 100;
    try {
      const settings = await BusinessSettings.getSettings();
      const wl = Number(settings?.deliveryWithdrawalLimit);
      if (Number.isFinite(wl) && wl >= 0) minWithdrawalAmount = wl;
    } catch (e) { /* keep default */ }
    if (amount < minWithdrawalAmount) {
      return errorResponse(res, 400, `Minimum withdrawal amount is ₹${minWithdrawalAmount}`);
    }

    // Withdrawal is based on totalBalance only. No connection to cash-in-hand (COD collected).
    const availableForWithdrawal = Number(wallet.totalBalance) || 0;
    if (amount > availableForWithdrawal) {
      return errorResponse(res, 400, `Insufficient balance. Available balance: ₹${availableForWithdrawal.toFixed(2)}`);
    }
    // Withdrawal allowed only when withdrawable >= limit (enforced via min amount check above)

    // Create withdrawal transaction (Pending)
    wallet.addTransaction({
      amount: amount,
      type: 'withdrawal',
      status: 'Pending',
      description: `Withdrawal request via ${paymentMethod}`,
      paymentMethod: paymentMethod,
      metadata: {
        bankDetails: bankDetails || null,
        upiId: upiId || null
      }
    });

    // Deduct balance on request create (refund on reject)
    wallet.totalBalance = Math.max(0, (wallet.totalBalance || 0) - amount);
    await wallet.save();

    // Use the last transaction (the one we just added). Plain-object push has no _id; Mongoose assigns _id to the array element.
    const lastTx = wallet.transactions[wallet.transactions.length - 1];
    const transactionId = lastTx?._id;
    if (!transactionId) {
      return errorResponse(res, 500, 'Failed to create withdrawal: transaction id missing');
    }

    const deliveryName = delivery.name || 'Delivery Partner';
    const deliveryIdString = delivery.deliveryId || delivery._id?.toString?.() || 'N/A';

    const withdrawalRequest = await DeliveryWithdrawalRequest.create({
      deliveryId: delivery._id,
      amount,
      status: 'Pending',
      paymentMethod,
      bankDetails: paymentMethod === 'bank_transfer' ? bankDetails : undefined,
      upiId: paymentMethod === 'upi' ? upiId : undefined,
      transactionId,
      walletId: wallet._id,
      deliveryName,
      deliveryIdString
    });

    logger.info(`Withdrawal request created for delivery: ${delivery._id}`, {
      deliveryId: delivery.deliveryId,
      amount,
      paymentMethod,
      transactionId,
      requestId: withdrawalRequest._id
    });

    return successResponse(res, 201, 'Withdrawal request created successfully', {
      request: {
        id: withdrawalRequest._id,
        amount: withdrawalRequest.amount,
        status: withdrawalRequest.status,
        requestedAt: withdrawalRequest.requestedAt
      },
      transaction: {
        id: lastTx._id,
        amount: lastTx.amount,
        type: lastTx.type,
        status: lastTx.status,
        description: lastTx.description,
        date: lastTx.createdAt
      },
      wallet: {
        totalBalance: wallet.totalBalance,
        cashInHand: wallet.cashInHand,
        pocketBalance: wallet.totalBalance - wallet.cashInHand
      }
    });
  } catch (error) {
    logger.error('Error creating withdrawal request:', error);
    return errorResponse(res, 500, 'Failed to create withdrawal request');
  }
});

/**
 * Add Delivery Earnings
 * POST /api/delivery/wallet/earnings
 * Internal endpoint - called when order is completed
 */
const addEarningSchema = Joi.object({
  amount: Joi.number().positive().required(),
  orderId: Joi.string().required(),
  description: Joi.string().optional(),
  paymentCollected: Joi.boolean().default(false)
});

export const addEarning = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { amount, orderId, description, paymentCollected = false } = req.body;

    // Validation
    const { error: validationError } = addEarningSchema.validate(req.body);
    if (validationError) {
      return errorResponse(res, 400, validationError.details[0].message);
    }

    // Verify order exists and belongs to this delivery partner
    const order = await Order.findOne({
      _id: orderId,
      deliveryPartnerId: delivery._id,
      status: 'delivered'
    });

    if (!order) {
      return errorResponse(res, 404, 'Order not found or not delivered');
    }

    // Find or create wallet
    let wallet = await DeliveryWallet.findOrCreateByDeliveryId(delivery._id);

    // Check if transaction already exists for this order
    const existingTransaction = wallet.transactions.find(
      t => t.orderId && t.orderId.toString() === orderId.toString() && t.type === 'payment'
    );

    if (existingTransaction) {
      return errorResponse(res, 400, 'Earning already added for this order');
    }

    // Add payment transaction
    const transaction = wallet.addTransaction({
      amount: amount,
      type: 'payment',
      status: 'Completed',
      description: description || `Delivery earnings for Order #${order.orderId || orderId}`,
      orderId: orderId,
      paymentCollected: paymentCollected
    });

    await wallet.save();

    logger.info(`Earning added for delivery: ${delivery._id}`, {
      deliveryId: delivery.deliveryId,
      orderId,
      amount,
      transactionId: transaction._id
    });

    return successResponse(res, 201, 'Earning added successfully', {
      transaction: {
        id: transaction._id,
        amount: transaction.amount,
        type: transaction.type,
        status: transaction.status,
        description: transaction.description,
        date: transaction.createdAt
      },
      wallet: {
        totalBalance: wallet.totalBalance,
        cashInHand: wallet.cashInHand,
        totalEarned: wallet.totalEarned
      }
    });
  } catch (error) {
    logger.error('Error adding earning:', error);
    return errorResponse(res, 500, 'Failed to add earning');
  }
});

/**
 * Collect Payment (Mark COD payment as collected)
 * POST /api/delivery/wallet/collect-payment
 */
const collectPaymentSchema = Joi.object({
  orderId: Joi.string().required(),
  amount: Joi.number().positive().optional()
});

export const collectPayment = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { orderId, amount } = req.body;

    // Validation
    const { error: validationError } = collectPaymentSchema.validate(req.body);
    if (validationError) {
      return errorResponse(res, 400, validationError.details[0].message);
    }

    // Verify order exists and belongs to this delivery partner
    const order = await Order.findOne({
      _id: orderId,
      deliveryPartnerId: delivery._id
    });

    if (!order) {
      return errorResponse(res, 404, 'Order not found');
    }

    // Find wallet
    const wallet = await DeliveryWallet.findOne({ deliveryId: delivery._id });

    if (!wallet) {
      return errorResponse(res, 404, 'Wallet not found');
    }

    // Collect payment
    try {
      const transaction = wallet.collectPayment(orderId, amount);
      await wallet.save();

      logger.info(`Payment collected for delivery: ${delivery._id}`, {
        deliveryId: delivery.deliveryId,
        orderId,
        amount: amount || transaction.amount
      });

      return successResponse(res, 200, 'Payment collected successfully', {
        transaction: {
          id: transaction._id,
          amount: transaction.amount,
          paymentCollected: transaction.paymentCollected
        },
        wallet: {
          totalBalance: wallet.totalBalance,
          cashInHand: wallet.cashInHand
        }
      });
    } catch (error) {
      return errorResponse(res, 400, error.message);
    }
  } catch (error) {
    logger.error('Error collecting payment:', error);
    return errorResponse(res, 500, 'Failed to collect payment');
  }
});

/**
 * Claim Joining Bonus
 * POST /api/delivery/wallet/claim-joining-bonus
 */
export const claimJoiningBonus = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;

    // Find or create wallet
    let wallet = await DeliveryWallet.findOrCreateByDeliveryId(delivery._id);

    // Check if already claimed
    if (wallet.joiningBonusClaimed) {
      return errorResponse(res, 400, 'Joining bonus already claimed');
    }

    // Check if bonus is unlocked (completed at least 1 order)
    const completedOrders = await Order.countDocuments({
      deliveryPartnerId: delivery._id,
      status: 'delivered'
    });

    if (completedOrders < 1) {
      return errorResponse(res, 400, 'Complete at least 1 order to unlock joining bonus');
    }

    // Check if bonus is still valid
    const joiningBonusValidTill = new Date('2025-12-10');
    if (new Date() > joiningBonusValidTill) {
      return errorResponse(res, 400, 'Joining bonus has expired');
    }

    // Add bonus amount
    const bonusAmount = 100;

    // Add bonus transaction
    const transaction = wallet.addTransaction({
      amount: bonusAmount,
      type: 'bonus',
      status: 'Completed',
      description: 'Joining bonus - Complete first order reward'
    });

    // Update wallet
    wallet.joiningBonusClaimed = true;
    wallet.joiningBonusAmount = bonusAmount;
    await wallet.save();

    logger.info(`Joining bonus claimed for delivery: ${delivery._id}`, {
      deliveryId: delivery.deliveryId,
      bonusAmount,
      transactionId: transaction._id
    });

    return successResponse(res, 200, 'Joining bonus claimed successfully', {
      bonusAmount,
      transaction: {
        id: transaction._id,
        amount: transaction.amount,
        type: transaction.type,
        status: transaction.status,
        description: transaction.description,
        date: transaction.createdAt
      },
      wallet: {
        totalBalance: wallet.totalBalance,
        totalEarned: wallet.totalEarned,
        joiningBonusClaimed: wallet.joiningBonusClaimed
      }
    });
  } catch (error) {
    logger.error('Error claiming joining bonus:', error);
    return errorResponse(res, 500, 'Failed to claim joining bonus');
  }
});

/**
 * Get Wallet Statistics
 * GET /api/delivery/wallet/stats
 * Returns wallet statistics for a time period
 */
export const getWalletStats = asyncHandler(async (req, res) => {
  try {
    const delivery = req.delivery;
    const { period = 'week' } = req.query; // today, week, month, year

    const wallet = await DeliveryWallet.findOne({ deliveryId: delivery._id });

    if (!wallet) {
      return successResponse(res, 200, 'No wallet statistics available', {
        earnings: 0,
        withdrawals: 0,
        transactions: 0,
        period
      });
    }

    // Calculate date range
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - now.getDay()); // Start of week
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate.setDate(1); // First day of month
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'year':
        startDate.setMonth(0, 1); // January 1st
        startDate.setHours(0, 0, 0, 0);
        break;
      default:
        startDate.setDate(now.getDate() - now.getDay());
        startDate.setHours(0, 0, 0, 0);
    }

    // Filter transactions by date range
    const periodTransactions = wallet.transactions.filter(t => {
      const transactionDate = new Date(t.createdAt);
      return transactionDate >= startDate && transactionDate <= now;
    });

    // Calculate statistics
    const earnings = periodTransactions
      .filter(t => (t.type === 'payment' || t.type === 'bonus') && t.status === 'Completed')
      .reduce((sum, t) => sum + t.amount, 0);

    const withdrawals = periodTransactions
      .filter(t => t.type === 'withdrawal' && t.status === 'Completed')
      .reduce((sum, t) => sum + t.amount, 0);

    const transactions = periodTransactions.length;

    return successResponse(res, 200, 'Wallet statistics retrieved successfully', {
      earnings,
      withdrawals,
      transactions,
      period,
      startDate,
      endDate: now
    });
  } catch (error) {
    logger.error('Error fetching wallet statistics:', error);
    return errorResponse(res, 500, 'Failed to fetch wallet statistics');
  }
});

const createDepositOrderSchema = Joi.object({
  amount: Joi.number().positive().required()
});

/**
 * Create Razorpay order for cash limit deposit
 * POST /api/delivery/wallet/deposit/create-order
 * Body: { amount } (INR)
 */
export const createDepositOrder = asyncHandler(async (req, res) => {
  const delivery = req.delivery;
  if (!delivery?._id) {
    return errorResponse(res, 401, 'Delivery authentication required');
  }
  const { error: ve } = createDepositOrderSchema.validate(req.body || {});
  if (ve) {
    return errorResponse(res, 400, ve.details[0].message || 'Amount is required');
  }
  const amount = Number(req.body.amount);
  if (amount < 1) {
    return errorResponse(res, 400, 'Minimum deposit amount is ₹1');
  }
  if (amount > 500000) {
    return errorResponse(res, 400, 'Maximum deposit amount is ₹5,00,000');
  }

  let credentials;
  try {
    credentials = await getRazorpayCredentials();
  } catch (e) {
    logger.error('Razorpay credentials error:', e);
    return errorResponse(res, 500, 'Payment gateway is not configured. Please contact support.');
  }
  if (!credentials?.keyId || !credentials?.keySecret || !credentials.keyId.trim() || !credentials.keySecret.trim()) {
    return errorResponse(res, 500, 'Payment gateway credentials are missing. Please configure Razorpay in admin.');
  }

  const receipt = `dl_dep_${delivery._id.toString().slice(-8)}_${Date.now().toString().slice(-8)}`;
  let razorpayOrder;
  try {
    razorpayOrder = await createRazorpayOrder({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt,
      notes: { deliveryId: delivery._id.toString(), type: 'cash_limit_deposit', amount: String(amount) }
    });
  } catch (e) {
    logger.error('Razorpay create order error:', e);
    return errorResponse(res, 500, e.message || 'Failed to create payment order');
  }
  if (!razorpayOrder?.id) {
    return errorResponse(res, 500, 'Failed to create payment order');
  }

  return successResponse(res, 201, 'Order created', {
    razorpay: {
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency || 'INR',
      key: credentials.keyId
    },
    amount
  });
});

const verifyDepositSchema = Joi.object({
  razorpay_order_id: Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature: Joi.string().required(),
  amount: Joi.number().positive().required()
});

/**
 * Verify Razorpay payment and apply deposit (reduce cash in hand, add to available limit)
 * POST /api/delivery/wallet/deposit/verify
 */
export const verifyDepositPayment = asyncHandler(async (req, res) => {
  const delivery = req.delivery;
  if (!delivery?._id) {
    return errorResponse(res, 401, 'Delivery authentication required');
  }
  const { error: ve } = verifyDepositSchema.validate(req.body || {});
  if (ve) {
    return errorResponse(res, 400, ve.details[0].message || 'Invalid payload');
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
  const amt = Number(amount);

  const isValid = await verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) {
    return errorResponse(res, 400, 'Invalid payment signature');
  }

  const wallet = await DeliveryWallet.findOrCreateByDeliveryId(delivery._id);
  const cashInHand = Number(wallet.cashInHand) || 0;
  if (cashInHand < amt) {
    return errorResponse(res, 400, `Insufficient cash in hand (₹${cashInHand.toFixed(2)}). Deposit amount cannot exceed cash in hand.`);
  }

  const pid = (t) => (t.metadata?.get ? t.metadata.get('razorpayPaymentId') : t.metadata?.razorpayPaymentId);
  const existing = (wallet.transactions || []).find(
    t => t.type === 'deposit' && pid(t) === razorpay_payment_id
  );
  if (existing) {
    return errorResponse(res, 400, 'Payment already processed');
  }

  const meta = new Map();
  meta.set('razorpayOrderId', razorpay_order_id);
  meta.set('razorpayPaymentId', razorpay_payment_id);

  wallet.addTransaction({
    amount: amt,
    type: 'deposit',
    status: 'Completed',
    description: `Cash limit deposit via Razorpay`,
    paymentMethod: 'other',
    metadata: Object.fromEntries(meta),
    processedAt: new Date()
  });
  wallet.markModified('transactions');
  await wallet.save();

  let limit = 0;
  try {
    const settings = await BusinessSettings.getSettings();
    limit = Number(settings?.deliveryCashLimit) || 0;
  } catch (_) {}
  const cashInHandNow = Math.max(0, Number(wallet.cashInHand) || 0);
  const availableCashLimit = Math.max(0, limit - cashInHandNow);

  return successResponse(res, 200, 'Deposit successful', {
    amount: amt,
    cashInHand: cashInHandNow,
    availableCashLimit
  });
});


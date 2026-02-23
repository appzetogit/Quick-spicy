import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import UserWallet from '../models/UserWallet.js';
import User from '../../auth/models/User.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';
import winston from 'winston';
import { createOrder as createRazorpayOrder, verifyPayment } from '../../payment/services/razorpayService.js';
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
 * GET /api/user/wallet
 * Returns wallet information including balance and recent transactions
 */
export const getWallet = asyncHandler(async (req, res) => {
  try {
    const user = req.user;

    // Find or create wallet for this user
    let wallet = await UserWallet.findOne({ userId: user._id });

    if (!wallet) {
      // Create wallet if doesn't exist
      wallet = await UserWallet.create({
        userId: user._id,
        balance: 0,
        totalAdded: 0,
        totalSpent: 0,
        totalRefunded: 0
      });
    }

    // Get all transactions (sorted by date, newest first)
    const allTransactions = wallet.transactions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const mapMetadata = (metadata) => {
      if (!metadata) return null;
      if (metadata instanceof Map) return Object.fromEntries(metadata.entries());
      if (typeof metadata.toObject === 'function') return metadata.toObject();
      return metadata;
    };

    // Map transactions for frontend
    const transactions = allTransactions.map(t => ({
      id: t._id,
      _id: t._id,
      amount: t.amount,
      type: t.type,
      status: t.status,
      description: t.description,
      date: t.createdAt,
      createdAt: t.createdAt,
      orderId: t.orderId,
      paymentMethod: t.paymentMethod,
      paymentGateway: t.paymentGateway,
      paymentId: t.paymentId,
      metadata: mapMetadata(t.metadata)
    }));

    const referralEarnings = transactions
      .filter(
        (t) =>
          t.type === 'addition' &&
          t.status === 'Completed' &&
          (t?.metadata?.source === 'referral_signup' ||
            String(t.description || '').toLowerCase().startsWith('referral reward'))
      )
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const walletData = {
      balance: wallet.balance || 0,
      currency: wallet.currency || 'INR',
      totalAdded: wallet.totalAdded || 0,
      totalSpent: wallet.totalSpent || 0,
      totalRefunded: wallet.totalRefunded || 0,
      referralEarnings,
      transactions: transactions,
      totalTransactions: wallet.transactions.length
    };

    logger.info(`Wallet retrieved for user: ${user._id}`, {
      balance: walletData.balance,
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
 * GET /api/user/wallet/transactions
 * Query params: type, status, page, limit
 */
export const getTransactions = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    const { type, status, page = 1, limit = 50 } = req.query;

    let wallet = await UserWallet.findOne({ userId: user._id });

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
      // Map frontend filter types to backend types
      const typeMap = {
        'all': null,
        'additions': 'addition',
        'deductions': 'deduction',
        'refunds': 'refund'
      };
      const backendType = typeMap[type];
      if (backendType) {
        transactions = transactions.filter(t => t.type === backendType);
      }
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

    const mapMetadata = (metadata) => {
      if (!metadata) return null;
      if (metadata instanceof Map) return Object.fromEntries(metadata.entries());
      if (typeof metadata.toObject === 'function') return metadata.toObject();
      return metadata;
    };

    return successResponse(res, 200, 'Transactions retrieved successfully', {
      transactions: paginatedTransactions.map(t => ({
        id: t._id,
        _id: t._id,
        amount: t.amount,
        type: t.type,
        status: t.status,
        description: t.description,
        date: t.createdAt,
        createdAt: t.createdAt,
        orderId: t.orderId,
        paymentMethod: t.paymentMethod,
        paymentGateway: t.paymentGateway,
        paymentId: t.paymentId,
        metadata: mapMetadata(t.metadata),
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
 * Create Razorpay Order for Wallet Top-up
 * POST /api/user/wallet/create-topup-order
 */
const createTopupOrderSchema = Joi.object({
  amount: Joi.number().positive().required()
});

export const createTopupOrder = asyncHandler(async (req, res) => {
  try {
    // Validate user exists
    if (!req.user || !req.user._id) {
      logger.error('User not found in request');
      return errorResponse(res, 401, 'User not authenticated');
    }

    const user = req.user;
    const { amount } = req.body;

    logger.info(`Creating wallet top-up order request:`, {
      userId: user._id,
      amount: amount
    });

    // Validate amount exists
    if (amount === undefined || amount === null) {
      logger.error('Amount is missing in request body');
      return errorResponse(res, 400, 'Amount is required');
    }

    // Validation
    const { error: validationError } = createTopupOrderSchema.validate(req.body);
    if (validationError) {
      logger.warn(`Validation error: ${validationError.details[0].message}`);
      return errorResponse(res, 400, validationError.details[0].message);
    }

    // Check minimum amount
    const minAmount = 1;
    if (amount < minAmount) {
      return errorResponse(res, 400, `Minimum amount to add is ₹${minAmount}`);
    }

    // Check maximum amount
    const maxAmount = 50000;
    if (amount > maxAmount) {
      return errorResponse(res, 400, `Maximum amount to add is ₹${maxAmount}`);
    }

    // Check Razorpay credentials first
    let credentials = null;
    try {
      logger.info('Fetching Razorpay credentials from database...');
      credentials = await getRazorpayCredentials();
      
      logger.info('Razorpay credentials check:', {
        hasKeyId: !!credentials.keyId,
        hasKeySecret: !!credentials.keySecret,
        keyIdLength: credentials.keyId?.length || 0,
        keySecretLength: credentials.keySecret?.length || 0
      });
      
      if (!credentials || !credentials.keyId || !credentials.keySecret) {
        logger.error('Razorpay credentials are missing or empty in database');
        return errorResponse(res, 500, 'Payment gateway is not configured. Please configure Razorpay API Key and Secret Key in admin panel → System Settings.');
      }

      // Check if credentials are not just empty strings
      if (credentials.keyId.trim() === '' || credentials.keySecret.trim() === '') {
        logger.error('Razorpay credentials are empty strings');
        return errorResponse(res, 500, 'Payment gateway credentials are empty. Please set valid Razorpay API Key and Secret Key in admin panel.');
      }
    } catch (credError) {
      logger.error('Error fetching Razorpay credentials:', {
        message: credError.message,
        stack: credError.stack,
        errorType: credError.constructor.name
      });
      return errorResponse(res, 500, 'Failed to fetch payment gateway configuration. Please contact support.');
    }

    // Create Razorpay order
    // Receipt ID must be max 40 characters (Razorpay requirement)
    // Format: wt_{userId_short}_{timestamp_short}
    const userIdShort = user._id.toString().slice(-8); // Last 8 chars of ObjectId
    const timestampShort = Date.now().toString().slice(-10); // Last 10 digits
    const receiptId = `wt_${userIdShort}_${timestampShort}`; // Max ~20 chars
    let razorpayOrder = null;
    
    try {
      logger.info(`Attempting to create Razorpay order for amount: ${amount}`);
      razorpayOrder = await createRazorpayOrder({
        amount: Math.round(amount * 100), // Convert to paise
        currency: 'INR',
        receipt: receiptId,
        notes: {
          userId: user._id.toString(),
          type: 'wallet_topup',
          amount: amount.toString()
        }
      });
      logger.info(`Razorpay order created successfully: ${razorpayOrder?.id}`);
    } catch (razorpayError) {
      logger.error(`Error creating Razorpay order:`, {
        message: razorpayError.message,
        stack: razorpayError.stack,
        userId: user._id,
        amount: amount,
        errorType: razorpayError.constructor.name
      });
      
      // Check if it's a credentials issue
      if (razorpayError.message && (
        razorpayError.message.includes('not initialized') || 
        razorpayError.message.includes('credentials') ||
        razorpayError.message.includes('key_id') ||
        razorpayError.message.includes('key_secret') ||
        razorpayError.message.includes('Invalid')
      )) {
        return errorResponse(res, 500, 'Payment gateway configuration error. Please check Razorpay credentials in admin panel.');
      }
      
      // Return the error message to frontend
      return errorResponse(res, 500, razorpayError.message || 'Failed to create payment order. Please try again.');
    }

    if (!razorpayOrder || !razorpayOrder.id) {
      logger.error('Razorpay order is null or missing ID');
      return errorResponse(res, 500, 'Failed to create payment order. Please try again.');
    }

    // Get Razorpay key ID
    let razorpayKeyId = null;
    try {
      const credentials = await getRazorpayCredentials();
      razorpayKeyId = credentials.keyId || process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_API_KEY;
      logger.info(`Razorpay key ID retrieved: ${razorpayKeyId ? 'Yes' : 'No'}`);
    } catch (error) {
      logger.warn(`Failed to get Razorpay key ID: ${error.message}`);
      razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_API_KEY;
    }

    if (!razorpayKeyId) {
      logger.error('Razorpay key ID not found');
      return errorResponse(res, 500, 'Payment gateway configuration error. Please contact support.');
    }

    logger.info(`Razorpay order created for wallet top-up: ${user._id}`, {
      userId: user._id,
      amount,
      razorpayOrderId: razorpayOrder.id
    });

    return successResponse(res, 201, 'Razorpay order created successfully', {
      razorpay: {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: razorpayKeyId
      },
      amount: amount
    });
  } catch (error) {
    logger.error('Unexpected error creating Razorpay order for wallet top-up:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
      amount: req.body?.amount,
      errorType: error.constructor.name
    });
    
    // Return more specific error message
    const errorMessage = error.message || 'Failed to create payment order. Please try again.';
    return errorResponse(res, 500, errorMessage);
  }
});

/**
 * Verify Payment and Add Money to Wallet
 * POST /api/user/wallet/verify-topup-payment
 */
const verifyTopupPaymentSchema = Joi.object({
  razorpayOrderId: Joi.string().required(),
  razorpayPaymentId: Joi.string().required(),
  razorpaySignature: Joi.string().required(),
  amount: Joi.number().positive().required()
});

export const verifyTopupPayment = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, amount } = req.body;

    // Validation
    const { error: validationError } = verifyTopupPaymentSchema.validate(req.body);
    if (validationError) {
      return errorResponse(res, 400, validationError.details[0].message);
    }

    // Verify payment signature
    const isValid = await verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    
    if (!isValid) {
      logger.warn(`Invalid payment signature for wallet top-up: ${user._id}`, {
        razorpayOrderId,
        razorpayPaymentId
      });
      return errorResponse(res, 400, 'Invalid payment signature');
    }

    // Find or create wallet
    let wallet = await UserWallet.findOrCreateByUserId(user._id);

    // Check if transaction already exists for this payment
    const existingTransaction = wallet.transactions.find(
      t => t.paymentId && t.paymentId === razorpayPaymentId
    );

    if (existingTransaction) {
      return errorResponse(res, 400, 'Payment already processed');
    }

    // Add money transaction
    const transaction = wallet.addTransaction({
      amount: amount,
      type: 'addition',
      status: 'Completed',
      description: `Added money via Razorpay`,
      paymentMethod: 'card', // Default, actual method will be in Razorpay
      paymentGateway: 'razorpay',
      paymentId: razorpayPaymentId
    });

    await wallet.save();

    // Update user's wallet balance in User model (for backward compatibility)
    await User.findByIdAndUpdate(user._id, {
      'wallet.balance': wallet.balance,
      'wallet.currency': wallet.currency
    });

    logger.info(`Money added to wallet after payment verification: ${user._id}`, {
      userId: user._id,
      amount,
      razorpayPaymentId,
      transactionId: transaction._id,
      newBalance: wallet.balance
    });

    return successResponse(res, 200, 'Money added to wallet successfully', {
      transaction: {
        id: transaction._id,
        amount: transaction.amount,
        type: transaction.type,
        status: transaction.status,
        description: transaction.description,
        date: transaction.createdAt
      },
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency,
        totalAdded: wallet.totalAdded
      }
    });
  } catch (error) {
    logger.error('Error verifying payment and adding money to wallet:', error);
    return errorResponse(res, 500, 'Failed to verify payment');
  }
});

/**
 * Add Money to Wallet (Direct - for internal use)
 * POST /api/user/wallet/add-money
 */
const addMoneySchema = Joi.object({
  amount: Joi.number().positive().required(),
  paymentMethod: Joi.string().valid('upi', 'card', 'netbanking', 'wallet').required(),
  paymentGateway: Joi.string().optional(),
  paymentId: Joi.string().optional(),
  description: Joi.string().optional()
});

export const addMoney = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    const { amount, paymentMethod, paymentGateway, paymentId, description } = req.body;

    // Validation
    const { error: validationError } = addMoneySchema.validate(req.body);
    if (validationError) {
      return errorResponse(res, 400, validationError.details[0].message);
    }

    // Check minimum amount
    const minAmount = 1;
    if (amount < minAmount) {
      return errorResponse(res, 400, `Minimum amount to add is ₹${minAmount}`);
    }

    // Find or create wallet
    let wallet = await UserWallet.findOrCreateByUserId(user._id);

    // Add money transaction
    const transaction = wallet.addTransaction({
      amount: amount,
      type: 'addition',
      status: 'Completed',
      description: description || `Added money via ${paymentMethod}`,
      paymentMethod: paymentMethod,
      paymentGateway: paymentGateway || null,
      paymentId: paymentId || null
    });

    await wallet.save();

    // Update user's wallet balance in User model (for backward compatibility)
    await User.findByIdAndUpdate(user._id, {
      'wallet.balance': wallet.balance,
      'wallet.currency': wallet.currency
    });

    logger.info(`Money added to wallet for user: ${user._id}`, {
      userId: user._id,
      amount,
      paymentMethod,
      transactionId: transaction._id,
      newBalance: wallet.balance
    });

    return successResponse(res, 201, 'Money added to wallet successfully', {
      transaction: {
        id: transaction._id,
        amount: transaction.amount,
        type: transaction.type,
        status: transaction.status,
        description: transaction.description,
        date: transaction.createdAt
      },
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency,
        totalAdded: wallet.totalAdded
      }
    });
  } catch (error) {
    logger.error('Error adding money to wallet:', error);
    return errorResponse(res, 500, 'Failed to add money to wallet');
  }
});

/**
 * Deduct Money from Wallet (for order payment)
 * POST /api/user/wallet/deduct
 * Internal endpoint - called when order is paid using wallet
 */
const deductMoneySchema = Joi.object({
  amount: Joi.number().positive().required(),
  orderId: Joi.string().required(),
  description: Joi.string().optional()
});

export const deductMoney = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    const { amount, orderId, description } = req.body;

    // Validation
    const { error: validationError } = deductMoneySchema.validate(req.body);
    if (validationError) {
      return errorResponse(res, 400, validationError.details[0].message);
    }

    // Find wallet
    let wallet = await UserWallet.findOrCreateByUserId(user._id);

    // Check if sufficient balance
    if (amount > wallet.balance) {
      return errorResponse(res, 400, 'Insufficient wallet balance');
    }

    // Check if transaction already exists for this order
    const existingTransaction = wallet.transactions.find(
      t => t.orderId && t.orderId.toString() === orderId.toString() && t.type === 'deduction'
    );

    if (existingTransaction) {
      return errorResponse(res, 400, 'Payment already processed for this order');
    }

    // Deduct money transaction
    const transaction = wallet.addTransaction({
      amount: amount,
      type: 'deduction',
      status: 'Completed',
      description: description || `Order payment - Order #${orderId}`,
      orderId: orderId
    });

    await wallet.save();

    // Update user's wallet balance in User model (for backward compatibility)
    await User.findByIdAndUpdate(user._id, {
      'wallet.balance': wallet.balance,
      'wallet.currency': wallet.currency
    });

    logger.info(`Money deducted from wallet for user: ${user._id}`, {
      userId: user._id,
      orderId,
      amount,
      transactionId: transaction._id,
      newBalance: wallet.balance
    });

    return successResponse(res, 200, 'Payment processed successfully', {
      transaction: {
        id: transaction._id,
        amount: transaction.amount,
        type: transaction.type,
        status: transaction.status,
        description: transaction.description,
        date: transaction.createdAt
      },
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency,
        totalSpent: wallet.totalSpent
      }
    });
  } catch (error) {
    logger.error('Error deducting money from wallet:', error);
    if (error.message === 'Insufficient wallet balance') {
      return errorResponse(res, 400, error.message);
    }
    return errorResponse(res, 500, 'Failed to process payment');
  }
});

/**
 * Add Refund to Wallet
 * POST /api/user/wallet/refund
 * Internal endpoint - called when order is refunded
 */
const addRefundSchema = Joi.object({
  amount: Joi.number().positive().required(),
  orderId: Joi.string().required(),
  description: Joi.string().optional()
});

export const addRefund = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    const { amount, orderId, description } = req.body;

    // Validation
    const { error: validationError } = addRefundSchema.validate(req.body);
    if (validationError) {
      return errorResponse(res, 400, validationError.details[0].message);
    }

    // Find or create wallet
    let wallet = await UserWallet.findOrCreateByUserId(user._id);

    // Check if refund already exists for this order
    const existingTransaction = wallet.transactions.find(
      t => t.orderId && t.orderId.toString() === orderId.toString() && t.type === 'refund'
    );

    if (existingTransaction) {
      return errorResponse(res, 400, 'Refund already processed for this order');
    }

    // Add refund transaction
    const transaction = wallet.addTransaction({
      amount: amount,
      type: 'refund',
      status: 'Completed',
      description: description || `Refund - Order #${orderId}`,
      orderId: orderId
    });

    await wallet.save();

    // Update user's wallet balance in User model (for backward compatibility)
    await User.findByIdAndUpdate(user._id, {
      'wallet.balance': wallet.balance,
      'wallet.currency': wallet.currency
    });

    logger.info(`Refund added to wallet for user: ${user._id}`, {
      userId: user._id,
      orderId,
      amount,
      transactionId: transaction._id,
      newBalance: wallet.balance
    });

    return successResponse(res, 201, 'Refund added to wallet successfully', {
      transaction: {
        id: transaction._id,
        amount: transaction.amount,
        type: transaction.type,
        status: transaction.status,
        description: transaction.description,
        date: transaction.createdAt
      },
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency,
        totalRefunded: wallet.totalRefunded
      }
    });
  } catch (error) {
    logger.error('Error adding refund to wallet:', error);
    return errorResponse(res, 500, 'Failed to add refund to wallet');
  }
});


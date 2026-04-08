import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import UserWallet from '../models/UserWallet.js';
import User from '../../auth/models/User.js';
import Joi from 'joi';
import winston from 'winston';
import { createCashfreeOrder, verifyCashfreeOrderPayment, mapCashfreePaymentMethod } from '../../payment/services/cashfreeService.js';
import { getCashfreeCredentials } from '../../../shared/utils/envService.js';

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

    let wallet = await UserWallet.findOne({ userId: user._id });

    if (!wallet) {
      wallet = await UserWallet.create({
        userId: user._id,
        balance: 0,
        totalAdded: 0,
        totalSpent: 0,
        totalRefunded: 0
      });
    }

    const allTransactions = wallet.transactions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const mapMetadata = (metadata) => {
      if (!metadata) return null;
      if (metadata instanceof Map) return Object.fromEntries(metadata.entries());
      if (typeof metadata.toObject === 'function') return metadata.toObject();
      return metadata;
    };

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
      transactions,
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

    const wallet = await UserWallet.findOne({ userId: user._id });

    if (!wallet) {
      return successResponse(res, 200, 'No transactions found', {
        transactions: [],
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: 0,
          pages: 0
        }
      });
    }

    let transactions = wallet.transactions || [];

    if (type) {
      const typeMap = {
        all: null,
        additions: 'addition',
        deductions: 'deduction',
        refunds: 'refund'
      };
      const backendType = typeMap[type];
      if (backendType) {
        transactions = transactions.filter(t => t.type === backendType);
      }
    }

    if (status) {
      transactions = transactions.filter(t => t.status === status);
    }

    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = transactions.length;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const paginatedTransactions = transactions.slice(skip, skip + parseInt(limit, 10));

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
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    return errorResponse(res, 500, 'Failed to fetch transactions');
  }
});

/**
 * Create Cashfree Order for Wallet Top-up
 * POST /api/user/wallet/create-topup-order
 */
const createTopupOrderSchema = Joi.object({
  amount: Joi.number().positive().required()
});

export const createTopupOrder = asyncHandler(async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      logger.error('User not found in request');
      return errorResponse(res, 401, 'User not authenticated');
    }

    const user = req.user;
    const { amount } = req.body;

    if (amount === undefined || amount === null) {
      return errorResponse(res, 400, 'Amount is required');
    }

    const { error: validationError } = createTopupOrderSchema.validate(req.body);
    if (validationError) {
      return errorResponse(res, 400, validationError.details[0].message);
    }

    if (amount < 1) {
      return errorResponse(res, 400, 'Minimum amount to add is INR 1');
    }

    if (amount > 50000) {
      return errorResponse(res, 400, 'Maximum amount to add is INR 50,000');
    }

    const credentials = await getCashfreeCredentials();
    if (!credentials?.appId || !credentials?.secretKey) {
      return errorResponse(res, 500, 'Payment gateway is not configured. Please configure Cashfree App ID and Secret Key.');
    }

    const orderId = `WT_${user._id.toString().slice(-8)}_${Date.now().toString().slice(-10)}`;
    const cashfreeOrder = await createCashfreeOrder({
      orderId,
      orderAmount: Number(amount.toFixed(2)),
      customerDetails: {
        customerId: user._id.toString(),
        customerName: user.name || 'Wallet User',
        customerEmail: user.email || 'wallet@example.com',
        customerPhone: user.phone || ''
      },
      orderNote: `Wallet top-up of INR ${amount}`,
      orderTags: {
        type: 'wallet_topup',
        userId: user._id.toString()
      }
    });

    logger.info('Cashfree order created for wallet top-up', {
      userId: user._id,
      amount,
      cashfreeOrderId: cashfreeOrder.order_id
    });

    return successResponse(res, 201, 'Cashfree order created successfully', {
      cashfree: {
        orderId: cashfreeOrder.order_id,
        paymentSessionId: cashfreeOrder.payment_session_id,
        amount: cashfreeOrder.order_amount,
        currency: cashfreeOrder.order_currency || 'INR',
        environment: credentials.environment || 'sandbox'
      },
      amount
    });
  } catch (error) {
    logger.error('Unexpected error creating Cashfree order for wallet top-up', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
      amount: req.body?.amount
    });
    return errorResponse(res, 500, error.message || 'Failed to create payment order. Please try again.');
  }
});

/**
 * Verify Payment and Add Money to Wallet
 * POST /api/user/wallet/verify-topup-payment
 */
const verifyTopupPaymentSchema = Joi.object({
  cashfreeOrderId: Joi.string().required(),
  amount: Joi.number().positive().required()
});

export const verifyTopupPayment = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    const { cashfreeOrderId, amount } = req.body;

    const { error: validationError } = verifyTopupPaymentSchema.validate(req.body);
    if (validationError) {
      return errorResponse(res, 400, validationError.details[0].message);
    }

    const verification = await verifyCashfreeOrderPayment(cashfreeOrderId);
    if (!verification?.isPaid || !verification?.payment) {
      logger.warn('Cashfree payment verification failed for wallet top-up', {
        userId: user._id,
        cashfreeOrderId
      });
      return errorResponse(res, 400, 'Payment verification failed');
    }

    const cashfreePaymentId = verification.payment.cf_payment_id;
    const wallet = await UserWallet.findOrCreateByUserId(user._id);

    const existingTransaction = wallet.transactions.find(
      t => t.paymentId && t.paymentId === cashfreePaymentId
    );

    if (existingTransaction) {
      return errorResponse(res, 400, 'Payment already processed');
    }

    const transaction = wallet.addTransaction({
      amount,
      type: 'addition',
      status: 'Completed',
      description: 'Added money via Cashfree',
      paymentMethod: mapCashfreePaymentMethod(verification.payment),
      paymentGateway: 'cashfree',
      paymentId: cashfreePaymentId,
      orderId: cashfreeOrderId,
      metadata: {
        cashfreeOrderId,
        cashfreePaymentId,
        cashfreeOrderStatus: verification.order?.order_status || null,
        cashfreePaymentStatus: verification.payment?.payment_status || null
      }
    });

    await wallet.save();

    await User.findByIdAndUpdate(user._id, {
      'wallet.balance': wallet.balance,
      'wallet.currency': wallet.currency
    });

    logger.info('Money added to wallet after Cashfree payment verification', {
      userId: user._id,
      amount,
      cashfreePaymentId,
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
    logger.error('Error verifying Cashfree payment and adding money to wallet:', error);
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

    const { error: validationError } = addMoneySchema.validate(req.body);
    if (validationError) {
      return errorResponse(res, 400, validationError.details[0].message);
    }

    if (amount < 1) {
      return errorResponse(res, 400, 'Minimum amount to add is INR 1');
    }

    const wallet = await UserWallet.findOrCreateByUserId(user._id);

    const transaction = wallet.addTransaction({
      amount,
      type: 'addition',
      status: 'Completed',
      description: description || `Added money via ${paymentMethod}`,
      paymentMethod,
      paymentGateway: paymentGateway || null,
      paymentId: paymentId || null
    });

    await wallet.save();

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

    const { error: validationError } = deductMoneySchema.validate(req.body);
    if (validationError) {
      return errorResponse(res, 400, validationError.details[0].message);
    }

    const wallet = await UserWallet.findOrCreateByUserId(user._id);

    if (amount > wallet.balance) {
      return errorResponse(res, 400, 'Insufficient wallet balance');
    }

    const existingTransaction = wallet.transactions.find(
      t => t.orderId && t.orderId.toString() === orderId.toString() && t.type === 'deduction'
    );

    if (existingTransaction) {
      return errorResponse(res, 400, 'Payment already processed for this order');
    }

    const transaction = wallet.addTransaction({
      amount,
      type: 'deduction',
      status: 'Completed',
      description: description || `Order payment - Order #${orderId}`,
      orderId
    });

    await wallet.save();

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

    const { error: validationError } = addRefundSchema.validate(req.body);
    if (validationError) {
      return errorResponse(res, 400, validationError.details[0].message);
    }

    const wallet = await UserWallet.findOrCreateByUserId(user._id);

    const existingTransaction = wallet.transactions.find(
      t => t.orderId && t.orderId.toString() === orderId.toString() && t.type === 'refund'
    );

    if (existingTransaction) {
      return errorResponse(res, 400, 'Refund already processed for this order');
    }

    const transaction = wallet.addTransaction({
      amount,
      type: 'refund',
      status: 'Completed',
      description: description || `Refund - Order #${orderId}`,
      orderId
    });

    await wallet.save();

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

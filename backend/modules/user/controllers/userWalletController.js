import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import UserWallet from '../models/UserWallet.js';
import User from '../../auth/models/User.js';
import Joi from 'joi';
import winston from 'winston';
import { createCashfreeOrder, verifyCashfreeOrderPayment, mapCashfreePaymentMethod } from '../../payment/services/cashfreeService.js';
import { getCashfreeCredentials, getEnvVar } from '../../../shared/utils/envService.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
const isValidReturnUrl = (value) => {
  if (!value) return true;

  // Cashfree placeholders like {order_id} are valid for the gateway, but
  // Joi's standard URI validator rejects them.
  const normalizedValue = String(value).replace(/\{[^}]+\}/g, 'placeholder');

  try {
    const parsed = new URL(normalizedValue);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const shouldSendReturnUrlToCashfree = (value) => {
  if (!value || !isValidReturnUrl(value)) return false;

  const normalizedValue = String(value).replace(/\{[^}]+\}/g, 'placeholder');

  try {
    const parsed = new URL(normalizedValue);
    const hostname = String(parsed.hostname || '').toLowerCase();
    return !['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return false;
  }
};

const createTopupOrderSchema = Joi.object({
  amount: Joi.number().positive().required(),
  returnUrl: Joi.string().custom((value, helpers) => {
    if (!isValidReturnUrl(value)) {
      return helpers.error('string.uri');
    }
    return value;
  }).optional()
});

export const createTopupOrder = asyncHandler(async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      logger.error('User not found in request');
      return errorResponse(res, 401, 'User not authenticated');
    }

    const user = req.user;
    const { amount, returnUrl } = req.body;

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
    const orderMeta = {};
    if (shouldSendReturnUrlToCashfree(returnUrl)) {
      orderMeta.return_url = returnUrl;
    }

    // Set the notify_url so Cashfree sends webhook events to our backend
    // This is the critical piece that enables server-side wallet crediting
    const backendUrl = await getEnvVar('BACKEND_URL', '');
    if (backendUrl) {
      orderMeta.notify_url = `${backendUrl.replace(/\/+$/, '')}/api/payment/cashfree/webhook`;
    } else {
      logger.warn('BACKEND_URL not configured — Cashfree webhooks will rely on dashboard-level webhook URL', {
        orderId
      });
    }

    const cashfreeOrder = await createCashfreeOrder({
      orderId,
      orderAmount: Number(amount.toFixed(2)),
      customerDetails: {
        customerId: user._id.toString(),
        customerName: user.name || 'Wallet User',
        customerEmail: user.email || 'wallet@example.com',
        customerPhone: user.phone || ''
      },
      orderMeta,
      orderNote: `Wallet top-up of INR ${amount}`,
      orderTags: {
        type: 'wallet_topup',
        userId: user._id.toString()
      }
    });

    const wallet = await UserWallet.findOrCreateByUserId(user._id);
    wallet.pendingTopups = (wallet.pendingTopups || []).filter(
      (entry) => entry?.status === 'pending' || entry?.status === 'completed'
    );
    wallet.pendingTopups.push({
      cashfreeOrderId: cashfreeOrder.order_id,
      paymentSessionId: cashfreeOrder.payment_session_id,
      amount: Number(cashfreeOrder.order_amount),
      currency: cashfreeOrder.order_currency || 'INR',
      status: 'pending'
    });
    await wallet.save();

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
  amount: Joi.number().positive().optional()
});

export const verifyTopupPayment = asyncHandler(async (req, res) => {
  try {
    const user = req.user;
    const { cashfreeOrderId, amount } = req.body;

    const { error: validationError } = verifyTopupPaymentSchema.validate(req.body);
    if (validationError) {
      return errorResponse(res, 400, validationError.details[0].message);
    }

    const wallet = await UserWallet.findOrCreateByUserId(user._id);
    const pendingTopup = (wallet.pendingTopups || []).find(
      (entry) => entry?.cashfreeOrderId === cashfreeOrderId && entry?.status === 'pending'
    );
    if (!pendingTopup) {
      return errorResponse(res, 400, 'Unknown or expired wallet top-up session');
    }

    let verification = null;
    const verificationAttempts = 5;

    for (let attempt = 1; attempt <= verificationAttempts; attempt += 1) {
      verification = await verifyCashfreeOrderPayment(cashfreeOrderId);
      if (verification?.isPaid && verification?.payment) {
        break;
      }

      if (attempt < verificationAttempts) {
        await wait(1500);
      }
    }

    if (!verification?.isPaid || !verification?.payment) {
      const cashfreeOrderStatus = verification?.order?.order_status || null;
      const latestPaymentStatus = verification?.payment?.payment_status || null;
      const normalizedOrderStatus = String(cashfreeOrderStatus || '').toUpperCase();
      const normalizedPaymentStatus = String(latestPaymentStatus || '').toUpperCase();
      const isDefinitelyFailed =
        normalizedOrderStatus === 'FAILED' ||
        normalizedPaymentStatus === 'FAILED' ||
        normalizedPaymentStatus === 'USER_DROPPED' ||
        normalizedPaymentStatus === 'CANCELLED';

      logger.warn('Cashfree payment verification failed for wallet top-up', {
        userId: user._id,
        cashfreeOrderId,
        cashfreeOrderStatus,
        latestPaymentStatus
      });

      if (isDefinitelyFailed) {
        pendingTopup.status = 'failed';
        pendingTopup.verifiedAt = new Date();
        await wallet.save();
      }

      return res.status(isDefinitelyFailed ? 400 : 202).json({
        success: false,
        pending: !isDefinitelyFailed,
        message: isDefinitelyFailed
          ? 'Online payment failed or was cancelled'
          : 'Payment confirmation is still pending. Please wait a moment and try again.',
        data: {
          cashfree: {
            orderId: cashfreeOrderId,
            orderStatus: cashfreeOrderStatus,
            paymentStatus: latestPaymentStatus
          }
        }
      });
    }

    const cashfreePaymentId = verification.payment.cf_payment_id;
    const verificationUserId = String(
      verification.order?.order_tags?.userId ||
      verification.order?.customer_details?.customer_id ||
      ''
    );
    if (verificationUserId !== String(user._id)) {
      return errorResponse(res, 400, 'Payment session does not belong to this wallet');
    }

    const verifiedOrderId = String(verification.order?.order_id || '');
    if (verifiedOrderId !== pendingTopup.cashfreeOrderId) {
      return errorResponse(res, 400, 'Payment session mismatch detected');
    }

    const resolvedAmount = Number(verification.order?.order_amount || amount);
    if (!resolvedAmount || isNaN(resolvedAmount) || resolvedAmount <= 0) {
      return errorResponse(res, 400, 'Invalid payment amount');
    }

    if (Math.abs(resolvedAmount - Number(pendingTopup.amount || 0)) > 0.01) {
      return errorResponse(res, 400, 'Payment amount mismatch detected');
    }

    // Use atomic credit operation — prevents race conditions and double-crediting
    const creditResult = await UserWallet.atomicCreditWallet(user._id, {
      amount: resolvedAmount,
      paymentId: String(cashfreePaymentId),
      cashfreeOrderId,
      cashfreePaymentId: String(cashfreePaymentId),
      paymentMethod: mapCashfreePaymentMethod(verification.payment),
      description: `Added ₹${resolvedAmount} via Cashfree`,
      source: 'verify-topup'
    });

    // Handle duplicate (already credited by webhook or previous verify call)
    if (creditResult.isDuplicate) {
      pendingTopup.status = 'completed';
      pendingTopup.verifiedAt = new Date();
      await wallet.save();

      const existingTx = creditResult.wallet?.transactions?.find(
        t => t.paymentId === String(cashfreePaymentId)
      );

      logger.info('Wallet top-up already processed (duplicate verify call)', {
        userId: user._id,
        cashfreePaymentId,
        cashfreeOrderId,
        currentBalance: creditResult.wallet?.balance
      });

      return successResponse(res, 200, 'Money already added to wallet', {
        transaction: existingTx ? {
          id: existingTx._id,
          amount: existingTx.amount,
          type: existingTx.type,
          status: existingTx.status,
          description: existingTx.description,
          date: existingTx.createdAt
        } : null,
        wallet: {
          balance: creditResult.wallet?.balance || 0,
          currency: creditResult.wallet?.currency || 'INR',
          totalAdded: creditResult.wallet?.totalAdded || 0
        }
      });
    }

    if (!creditResult.updated) {
      logger.error('Wallet credit failed during verify-topup', {
        userId: user._id,
        cashfreePaymentId,
        cashfreeOrderId,
        resolvedAmount
      });
      return errorResponse(res, 500, 'Failed to credit wallet. Please contact support.');
    }

    pendingTopup.status = 'completed';
    pendingTopup.verifiedAt = new Date();
    await wallet.save();

    // Sync balance to User model (best-effort, authoritative balance is in UserWallet)
    try {
      await User.findByIdAndUpdate(user._id, {
        'wallet.balance': creditResult.wallet.balance,
        'wallet.currency': creditResult.wallet.currency || 'INR'
      });
    } catch (userSyncError) {
      logger.error('Failed to sync wallet balance to User model', {
        userId: user._id,
        error: userSyncError.message,
        walletBalance: creditResult.wallet.balance
      });
    }

    // Find the newly added transaction for the response
    const newTransaction = creditResult.wallet.transactions?.find(
      t => t.paymentId === String(cashfreePaymentId)
    );

    logger.info('Money added to wallet after Cashfree payment verification', {
      userId: user._id,
      amount: resolvedAmount,
      cashfreePaymentId,
      cashfreeOrderId,
      transactionId: newTransaction?._id,
      previousBalance: creditResult.previousBalance,
      newBalance: creditResult.wallet.balance,
      source: 'verify-topup'
    });

    return successResponse(res, 200, 'Money added to wallet successfully', {
      transaction: newTransaction ? {
        id: newTransaction._id,
        amount: newTransaction.amount,
        type: newTransaction.type,
        status: newTransaction.status,
        description: newTransaction.description,
        date: newTransaction.createdAt
      } : { amount: resolvedAmount, type: 'addition', status: 'Completed' },
      wallet: {
        balance: creditResult.wallet.balance,
        currency: creditResult.wallet.currency || 'INR',
        totalAdded: creditResult.wallet.totalAdded
      }
    });
  } catch (error) {
    logger.error('Error verifying Cashfree payment and adding money to wallet:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
      cashfreeOrderId: req.body?.cashfreeOrderId
    });
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

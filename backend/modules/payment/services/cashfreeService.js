import axios from 'axios';
import crypto from 'crypto';
import winston from 'winston';
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

const CASHFREE_API_VERSION = '2025-01-01';

const sanitizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '9999999999';
  return digits.slice(-10).padStart(10, '9');
};

const resolveBaseUrl = (environment = 'sandbox') => {
  return String(environment).toLowerCase() === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
};

const getClientConfig = async () => {
  const credentials = await getCashfreeCredentials();
  const appId = String(credentials.appId || '').trim();
  const secretKey = String(credentials.secretKey || '').trim();
  const environment = String(credentials.environment || 'sandbox').trim().toLowerCase();

  if (!appId || !secretKey) {
    throw new Error('Cashfree credentials are missing. Please configure Cashfree App ID and Secret Key.');
  }

  return {
    appId,
    secretKey,
    environment,
    baseURL: resolveBaseUrl(environment),
    headers: {
      'Content-Type': 'application/json',
      'x-api-version': CASHFREE_API_VERSION,
      'x-client-id': appId,
      'x-client-secret': secretKey
    }
  };
};

const createCashfreeOrder = async ({
  orderId,
  orderAmount,
  orderCurrency = 'INR',
  customerDetails = {},
  orderMeta = {},
  orderNote = '',
  orderTags = {}
}) => {
  const clientConfig = await getClientConfig();

  const payload = {
    order_id: orderId,
    order_amount: Number(orderAmount),
    order_currency: orderCurrency,
    customer_details: {
      customer_id: String(customerDetails.customerId || `cust_${Date.now()}`).slice(0, 45),
      customer_name: String(customerDetails.customerName || 'Customer').slice(0, 100),
      customer_email: String(customerDetails.customerEmail || 'customer@example.com').slice(0, 100),
      customer_phone: sanitizePhone(customerDetails.customerPhone)
    }
  };

  if (orderMeta && Object.keys(orderMeta).length > 0) {
    payload.order_meta = orderMeta;
  }

  if (orderNote) {
    payload.order_note = String(orderNote).slice(0, 200);
  }

  if (orderTags && Object.keys(orderTags).length > 0) {
    payload.order_tags = orderTags;
  }

  logger.info('Creating Cashfree order', {
    orderId,
    orderAmount,
    environment: clientConfig.environment
  });

  const response = await axios.post('/orders', payload, clientConfig);
  return response.data;
};

const fetchCashfreeOrder = async (orderId) => {
  const clientConfig = await getClientConfig();
  const response = await axios.get(`/orders/${encodeURIComponent(orderId)}`, clientConfig);
  return response.data;
};

const fetchCashfreePaymentsForOrder = async (orderId) => {
  const clientConfig = await getClientConfig();
  const response = await axios.get(`/orders/${encodeURIComponent(orderId)}/payments`, clientConfig);
  return Array.isArray(response.data) ? response.data : [];
};

const createCashfreeRefund = async ({
  orderId,
  refundAmount,
  refundId,
  refundNote = '',
  refundSpeed = 'STANDARD'
}) => {
  const clientConfig = await getClientConfig();
  const response = await axios.post(
    `/orders/${encodeURIComponent(orderId)}/refunds`,
    {
      refund_amount: Number(refundAmount),
      refund_id: refundId,
      refund_note: refundNote,
      refund_speed: refundSpeed
    },
    clientConfig
  );
  return response.data;
};

const mapCashfreePaymentMethod = (payment = {}) => {
  const group = String(payment.payment_group || '').toLowerCase();

  if (group.includes('upi')) return 'upi';
  if (group.includes('card')) return 'card';
  if (group.includes('net')) return 'netbanking';
  if (group.includes('wallet') || group === 'app') return 'wallet';
  return 'other';
};

const verifyCashfreeOrderPayment = async (orderId) => {
  const order = await fetchCashfreeOrder(orderId);
  const payments = await fetchCashfreePaymentsForOrder(orderId);

  const successfulPayments = payments
    .filter((payment) => String(payment?.payment_status || '').toUpperCase() === 'SUCCESS')
    .sort((a, b) => {
      const aTime = new Date(a?.payment_completion_time || a?.payment_time || 0).getTime();
      const bTime = new Date(b?.payment_completion_time || b?.payment_time || 0).getTime();
      return bTime - aTime;
    });

  const payment = successfulPayments[0] || null;
  const isPaid = String(order?.order_status || '').toUpperCase() === 'PAID' && !!payment;

  return {
    isPaid,
    order,
    payment,
    paymentMethod: mapCashfreePaymentMethod(payment)
  };
};

/**
 * Verify Cashfree webhook signature (HMAC-SHA256).
 * Cashfree sends x-webhook-signature (base64) and x-webhook-timestamp.
 * The signed string is: timestamp + rawBody
 * @param {string} rawBody - The raw request body string (NOT parsed JSON)
 * @param {string} timestamp - The x-webhook-timestamp header value
 * @param {string} signature - The x-webhook-signature header value
 * @param {string} secretKey - Your Cashfree Secret Key
 * @returns {boolean} True if signature is valid
 */
const verifyCashfreeWebhookSignature = (rawBody, timestamp, signature, secretKey) => {
  if (!rawBody || !timestamp || !signature || !secretKey) {
    logger.warn('Webhook signature verification: missing required parameters');
    return false;
  }

  try {
    const payload = timestamp + rawBody;
    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(payload)
      .digest('base64');

    // Use timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature, 'base64');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (error) {
    logger.error('Error verifying Cashfree webhook signature', {
      error: error.message
    });
    return false;
  }
};

/**
 * Get Cashfree secret key for webhook signature verification.
 * @returns {Promise<string>} The Cashfree secret key
 */
const getCashfreeSecretKey = async () => {
  const credentials = await getCashfreeCredentials();
  return String(credentials.secretKey || '').trim();
};

export {
  CASHFREE_API_VERSION,
  createCashfreeOrder,
  fetchCashfreeOrder,
  fetchCashfreePaymentsForOrder,
  createCashfreeRefund,
  verifyCashfreeOrderPayment,
  verifyCashfreeWebhookSignature,
  getCashfreeSecretKey,
  mapCashfreePaymentMethod
};

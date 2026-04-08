import axios from 'axios';
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

export {
  CASHFREE_API_VERSION,
  createCashfreeOrder,
  fetchCashfreeOrder,
  fetchCashfreePaymentsForOrder,
  createCashfreeRefund,
  verifyCashfreeOrderPayment,
  mapCashfreePaymentMethod
};

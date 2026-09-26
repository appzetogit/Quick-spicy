// Order/payment lifecycle scenarios, run against the real server code.
//
//   SCENARIO_MONGO_URI=mongodb://127.0.0.1:27099 node scripts/scenario-payments.mjs
//
// Safety:
// - Uses a disposable MongoDB given in SCENARIO_MONGO_URI (database qs_scenario_test) and
//   drops it at the end. Production data is never read or written, and the live server's timers never see
//   these orders.
// - Every outbound HTTP request goes through a fake adapter. Cashfree is simulated; anything
//   else (SMS, maps) is refused, so nothing leaves this process.
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { register } from 'node:module';
dotenv.config();

// server.js -> stub (see scenario-loader.mjs). Must be registered before any app import.
register('./scenario-loader.mjs', import.meta.url);
// No shared infrastructure: no Redis, no Firebase.
process.env.REDIS_ENABLED = 'false';
for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_SERVICE_ACCOUNT_PATH', 'FIREBASE_DATABASE_URL']) delete process.env[key];

const TEST_DB = 'qs_scenario_test';
// Some app modules open their own database connection on import. Point every database
// setting at the disposable instance BEFORE importing any app code, so none can reach
// production.
const productionUris = [process.env.MONGODB_URI, process.env.MONGO_URI].filter(Boolean);
const scenarioUri = process.env.SCENARIO_MONGO_URI;
if (!scenarioUri || productionUris.includes(scenarioUri)) {
  throw new Error('Set SCENARIO_MONGO_URI to a disposable MongoDB (not the production one).');
}
process.env.MONGODB_URI = `${scenarioUri.replace(/\/+$/, '')}/${TEST_DB}`;
process.env.MONGO_URI = process.env.MONGODB_URI;
process.env.CASHFREE_APP_ID = 'scenario-app';
process.env.CASHFREE_SECRET_KEY = 'scenario-secret';
process.env.CASHFREE_ENVIRONMENT = 'sandbox';

// ---------------------------------------------------------------- fake Cashfree
const axios = (await import('axios')).default;
const cf = new Map(); // cashfree order id -> { order_status, order_amount, userId, payments, refunds }
const blocked = [];
const reply = (config, status, data) => {
  if (status >= 400) {
    const e = new Error(`Request failed with status code ${status}`);
    e.response = { status, data };
    throw e;
  }
  return { status, statusText: 'OK', data, headers: {}, config, request: {} };
};
axios.defaults.adapter = async (config) => {
  const url = `${config.baseURL || ''}${config.url || ''}`;
  if (!/cashfree\.com/.test(url)) {
    blocked.push(url);
    throw new Error(`scenario: outbound request blocked (${url})`);
  }
  const method = String(config.method).toLowerCase();
  if (method === 'post' && /\/orders$/.test(url)) {
    const body = JSON.parse(config.data);
    cf.set(body.order_id, { order_status: 'ACTIVE', order_amount: body.order_amount, userId: body.order_tags?.userId, payments: [], refunds: [], expiry: body.order_expiry_time });
    return reply(config, 200, { order_id: body.order_id, payment_session_id: 'sess_' + body.order_id, order_status: 'ACTIVE', order_expiry_time: body.order_expiry_time });
  }
  const m = url.match(/\/orders\/([^/]+?)(\/payments|\/refunds)?$/);
  const st = m && cf.get(decodeURIComponent(m[1]));
  if (!st) return reply(config, 404, { message: 'order not found' });
  if (m[2] === '/payments') return reply(config, 200, st.payments);
  if (m[2] === '/refunds' && method === 'post') {
    const body = JSON.parse(config.data);
    st.refunds.push(body);
    return reply(config, 200, { refund_id: body.refund_id, cf_refund_id: 'cfr_' + st.refunds.length, refund_status: 'PENDING', refund_amount: body.refund_amount });
  }
  if (m[2] === '/refunds') return reply(config, 200, st.refunds);
  return reply(config, 200, {
    order_id: decodeURIComponent(m[1]), order_status: st.order_status, order_amount: st.order_amount,
    order_tags: { userId: st.userId }, customer_details: { customer_id: st.userId },
  });
};
const paid = (id, when = new Date()) => {
  const st = cf.get(id);
  st.order_status = 'PAID';
  st.payments.push({ cf_payment_id: 'pay_' + id, payment_status: 'SUCCESS', payment_group: 'upi', payment_time: when.toISOString(), payment_completion_time: when.toISOString() });
};
const attempt = (id, status) => cf.get(id).payments.push({ cf_payment_id: 'att_' + Math.random(), payment_status: status, payment_group: 'upi', payment_time: new Date().toISOString() });

// ---------------------------------------------------------------- database
const mongoose = (await import('mongoose')).default;
await mongoose.connect(process.env.MONGODB_URI);
assert.equal(mongoose.connection.name, TEST_DB, 'refusing to run outside the scenario database');
assert.equal(String(mongoose.connection.port), new URL(scenarioUri).port, 'refusing: not connected to the disposable instance');
await mongoose.connection.dropDatabase();

// Quiet the app's own logging so the report is readable.
const realLog = console.log, realWarn = console.warn, realError = console.error;
const quiet = () => { console.log = console.warn = console.error = () => {}; };
const loud = () => { console.log = realLog; console.warn = realWarn; console.error = realError; };
quiet();

const Order = (await import('../modules/order/models/Order.js')).default;
const OrderSettlement = (await import('../modules/order/models/OrderSettlement.js')).default;
const Payment = (await import('../modules/payment/models/Payment.js')).default;
const { verifyOrderPayment, cancelOrder, verifyOrderTipPayment } = await import('../modules/order/controllers/orderController.js');
const { processAutoRejectOrders } = await import('../modules/order/services/autoRejectService.js');
const restaurantCtl = await import('../modules/restaurant/controllers/restaurantOrderController.js');
const adminCtl = await import('../modules/admin/controllers/orderController.js');

const db = mongoose.connection;
const userId = new mongoose.Types.ObjectId();
const restaurantObjectId = new mongoose.Types.ObjectId();
await db.collection('users').insertOne({ _id: userId, name: 'Scenario Customer', phone: '+91 9000000001', role: 'user', isActive: true });
await db.collection('restaurants').insertOne({ _id: restaurantObjectId, restaurantId: 'REST-SCENARIO', name: 'Scenario Kitchen', isActive: true, isAcceptingOrders: true, location: { latitude: 15.58, longitude: 79.11, coordinates: [79.11, 15.58] } });
const restaurantReq = { _id: restaurantObjectId, restaurantId: 'REST-SCENARIO', name: 'Scenario Kitchen' };
const riderId = new mongoose.Types.ObjectId();
await db.collection('deliveries').insertOne({ _id: riderId, name: 'Scenario Rider', phone: '+91 9000000002', status: 'approved', isActive: true });
const AdminWallet = (await import('../modules/admin/models/AdminWallet.js')).default;
const adminBalance = async () => (await AdminWallet.findOne({}).lean())?.totalBalance || 0;

const call = (fn, req) => new Promise((resolve) => {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { resolve({ code: this.statusCode, body }); },
    send(body) { resolve({ code: this.statusCode, body }); },
  };
  const full = { params: {}, body: {}, query: {}, headers: {}, ip: 'scenario', get: () => 'scenario', user: { id: String(userId) }, ...req };
  Promise.resolve(fn(full, res, (err) => resolve({ code: 'next', body: { message: err?.message } })))
    .catch((err) => resolve({ code: 'threw', body: { message: err.message } }));
});

let seq = 0;
const TOTAL = 236;
const mkOrder = async ({ method = 'cashfree', payStatus = 'pending', status = 'pending', ageMin = 0, confirmedAgoMin = null, tracking = {}, cancelledBy, extra = {} } = {}) => {
  const orderId = `SCN-${Date.now()}-${++seq}`;
  const created = new Date(Date.now() - ageMin * 60000);
  const t = { ...tracking };
  if (confirmedAgoMin !== null) t.confirmed = { status: true, timestamp: new Date(Date.now() - confirmedAgoMin * 60000) };
  const doc = await Order.create({
    orderId, userId, restaurantId: String(restaurantObjectId), restaurantName: 'Scenario Kitchen',
    items: [{ itemId: 'i1', name: 'Test dish', price: 200, quantity: 1 }],
    pricing: { subtotal: 200, deliveryFee: 20, platformFee: 6, tax: 10, total: TOTAL },
    payment: { method, status: payStatus, ...(method === 'cashfree' ? { cashfreeOrderId: orderId } : {}) },
    status, tracking: t, ...(cancelledBy ? { cancelledBy, cancelledAt: new Date(), cancellationReason: 'scenario' } : {}), ...extra,
  });
  await Order.collection.updateOne({ _id: doc._id }, { $set: { createdAt: created } });
  if (method === 'cashfree') cf.set(orderId, { order_status: 'ACTIVE', order_amount: TOTAL, userId: String(userId), payments: [], refunds: [] });
  return doc;
};
const reload = (o) => Order.findById(o._id).lean();
const refundsFor = (o) => cf.get(o.orderId)?.refunds || [];
const reset = async () => { await Order.deleteMany({}); await OrderSettlement.deleteMany({}); await Payment.deleteMany({}); };

const results = [];
const scenario = async (name, fn) => {
  await reset();
  try { await fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, why: e.message }); }
};

// ================================================================ scenarios
await scenario('Unpaid online order, 1 min old: stays pending, hidden, not cancelled', async () => {
  const o = await mkOrder({ ageMin: 1 });
  await processAutoRejectOrders();
  const r = await reload(o);
  assert.equal(r.status, 'pending'); assert.notEqual(r.payment.status, 'completed');
  assert.equal(refundsFor(o).length, 0);
});

await scenario('Unpaid online order after the 30 min window: closed as payment not completed, no refund', async () => {
  const o = await mkOrder({ ageMin: 31 });
  await processAutoRejectOrders();
  const r = await reload(o);
  assert.equal(r.status, 'cancelled'); assert.equal(r.cancelledBy, 'system');
  assert.match(r.cancellationReason, /payment was not completed/i);
  assert.equal(refundsFor(o).length, 0, 'nothing was paid, nothing refunded');
});

await scenario('Paid online order the app never confirmed: server confirms it and sends it to the restaurant', async () => {
  const o = await mkOrder({ ageMin: 2 });
  paid(o.orderId);
  await processAutoRejectOrders();
  const r = await reload(o);
  assert.equal(r.payment.status, 'completed'); assert.equal(r.status, 'confirmed');
  assert.ok(r.tracking?.confirmed?.timestamp, 'restaurant clock starts at payment');
  assert.equal(refundsFor(o).length, 0);
});

await scenario('Paid 10 min after placing: restaurant still gets its full 4 minutes from payment', async () => {
  const o = await mkOrder({ status: 'confirmed', payStatus: 'completed', ageMin: 10, confirmedAgoMin: 1 });
  await processAutoRejectOrders();
  assert.equal((await reload(o)).status, 'confirmed');
});

await scenario('Restaurant ignores a paid order for 4+ min: cancelled and the customer refunded in FULL', async () => {
  const o = await mkOrder({ status: 'confirmed', payStatus: 'completed', ageMin: 6, confirmedAgoMin: 5 });
  paid(o.orderId);
  await processAutoRejectOrders();
  const r = await reload(o);
  assert.equal(r.status, 'cancelled');
  const refunds = refundsFor(o);
  assert.equal(refunds.length, 1, 'exactly one refund');
  assert.equal(refunds[0].refund_amount, TOTAL, `full refund (got ${refunds[0].refund_amount})`);
});

await scenario('Restaurant taps Accept 1 min after a slow payment: accepted, not auto-cancelled', async () => {
  const o = await mkOrder({ status: 'confirmed', payStatus: 'completed', ageMin: 8, confirmedAgoMin: 1 });
  const res = await call(restaurantCtl.acceptOrder, { restaurant: restaurantReq, params: { id: String(o._id) }, body: { preparationTime: 20 } });
  const r = await reload(o);
  assert.notEqual(r.status, 'cancelled', `was cancelled: ${res.body?.message}`);
  assert.equal(r.tracking?.preparing?.status, true);
});

await scenario('Restaurant cannot accept an unpaid online order', async () => {
  const o = await mkOrder({ ageMin: 1 });
  const res = await call(restaurantCtl.acceptOrder, { restaurant: restaurantReq, params: { id: String(o._id) }, body: {} });
  assert.equal(res.code, 400);
  assert.equal((await reload(o)).status, 'pending');
});

await scenario('Payment fails (user dropped): reported as failed, not pending; order never reaches restaurant', async () => {
  const o = await mkOrder({ ageMin: 1 });
  attempt(o.orderId, 'USER_DROPPED');
  const res = await call(verifyOrderPayment, { body: { orderId: String(o._id), cashfreeOrderId: o.orderId } });
  assert.equal(res.code, 400, `expected failed, got ${res.code} ${res.body?.message}`);
  const r = await reload(o);
  assert.equal(r.payment.status, 'failed'); assert.equal(r.status, 'pending');
});

await scenario('Dropped, then paid on retry: confirmed', async () => {
  const o = await mkOrder({ ageMin: 2 });
  attempt(o.orderId, 'USER_DROPPED');
  paid(o.orderId);
  const res = await call(verifyOrderPayment, { body: { orderId: String(o._id), cashfreeOrderId: o.orderId } });
  assert.equal(res.body?.success, true, res.body?.message);
  assert.equal((await reload(o)).status, 'confirmed');
});

await scenario('Verify called twice (app + server): one payment record, still confirmed', async () => {
  const o = await mkOrder({ ageMin: 1 });
  paid(o.orderId);
  await call(verifyOrderPayment, { body: { orderId: String(o._id), cashfreeOrderId: o.orderId } });
  const second = await call(verifyOrderPayment, { body: { orderId: String(o._id), cashfreeOrderId: o.orderId } });
  assert.equal(second.body?.success, true);
  assert.equal(await Payment.countDocuments({ orderId: o._id }), 1);
});

await scenario('Cashfree amount differs from the order total: refused, not confirmed', async () => {
  const o = await mkOrder({ ageMin: 1 });
  paid(o.orderId); cf.get(o.orderId).order_amount = 1;
  const res = await call(verifyOrderPayment, { body: { orderId: String(o._id), cashfreeOrderId: o.orderId } });
  assert.equal(res.code, 400);
  assert.notEqual((await reload(o)).status, 'confirmed');
});

await scenario("Someone else's payment session: refused", async () => {
  const o = await mkOrder({ ageMin: 1 });
  paid(o.orderId); cf.get(o.orderId).userId = String(new mongoose.Types.ObjectId());
  const res = await call(verifyOrderPayment, { body: { orderId: String(o._id), cashfreeOrderId: o.orderId } });
  assert.equal(res.code, 400);
  assert.notEqual((await reload(o)).status, 'confirmed');
});

await scenario('Payment lands AFTER the order was closed: order stays cancelled, customer refunded in full', async () => {
  const o = await mkOrder({ status: 'cancelled', cancelledBy: 'system', ageMin: 35 });
  paid(o.orderId);
  await processAutoRejectOrders();
  const r = await reload(o);
  assert.equal(r.status, 'cancelled', 'not revived');
  assert.equal(refundsFor(o).length, 1, 'refund issued');
  assert.equal(refundsFor(o)[0].refund_amount, TOTAL);
});

await scenario('Customer cancels while on the payment page, then pays: refunded in full', async () => {
  const o = await mkOrder({ ageMin: 1 });
  const res = await call(cancelOrder, { params: { id: String(o._id) }, body: { reason: 'changed my mind' } });
  assert.equal((await reload(o)).status, 'cancelled', `cancel: ${res.body?.message}`);
  paid(o.orderId);
  const v = await call(verifyOrderPayment, { body: { orderId: String(o._id), cashfreeOrderId: o.orderId } });
  assert.equal(v.code, 409);
  assert.match(v.body?.message || '', /being refunded/, `customer told: ${v.body?.message}`);
  assert.equal((await reload(o)).status, 'cancelled');
  assert.equal(refundsFor(o)[0]?.refund_amount, TOTAL);
});

await scenario('Restaurant rejects a paid order before accepting: full refund', async () => {
  const o = await mkOrder({ status: 'confirmed', payStatus: 'completed', ageMin: 2, confirmedAgoMin: 1 });
  paid(o.orderId);
  await call(restaurantCtl.rejectOrder, { restaurant: restaurantReq, params: { id: String(o._id) }, body: { reason: 'Item not available' } });
  assert.equal((await reload(o)).status, 'cancelled');
  assert.equal(refundsFor(o)[0]?.refund_amount, TOTAL);
});

await scenario('Restaurant rejects AFTER accepting: still a full refund, restaurant not compensated', async () => {
  const o = await mkOrder({ status: 'preparing', payStatus: 'completed', ageMin: 5, confirmedAgoMin: 4, tracking: { preparing: { status: true, timestamp: new Date() } } });
  paid(o.orderId);
  await call(restaurantCtl.rejectOrder, { restaurant: restaurantReq, params: { id: String(o._id) }, body: { reason: 'Kitchen closing' } });
  assert.equal((await reload(o)).status, 'cancelled');
  assert.equal(refundsFor(o)[0]?.refund_amount, TOTAL);
  const s = await OrderSettlement.findOne({ orderId: o._id }).lean();
  assert.equal(s?.cancellationDetails?.restaurantCompensation || 0, 0);
});

await scenario('Admin rejects a paid online order: refund issued automatically', async () => {
  const o = await mkOrder({ status: 'confirmed', payStatus: 'completed', ageMin: 2, confirmedAgoMin: 1 });
  paid(o.orderId);
  await call(adminCtl.rejectOrder, { params: { id: String(o._id) }, body: { reason: 'Test' }, user: { id: String(new mongoose.Types.ObjectId()) } });
  assert.equal((await reload(o)).status, 'cancelled');
  assert.equal(refundsFor(o).length, 1, 'refund issued');
});

await scenario('No double refund when the auto-cancel runs twice', async () => {
  const o = await mkOrder({ status: 'confirmed', payStatus: 'completed', ageMin: 6, confirmedAgoMin: 5 });
  paid(o.orderId);
  await processAutoRejectOrders();
  await processAutoRejectOrders();
  assert.equal(refundsFor(o).length, 1);
});

await scenario('Cash order: never touched by the payment checks, normal 4-min accept timer', async () => {
  const fresh = await mkOrder({ method: 'cash', ageMin: 1, confirmedAgoMin: 1 });
  const old = await mkOrder({ method: 'cash', ageMin: 6, confirmedAgoMin: 6 });
  await processAutoRejectOrders();
  assert.equal((await reload(fresh)).status, 'pending');
  const r = await reload(old);
  assert.equal(r.status, 'cancelled');
  assert.equal(refundsFor(old).length, 0);
});

await scenario('Refund of a paid order takes the fees back out of the admin wallet (never adds)', async () => {
  const o = await mkOrder({ ageMin: 2 });
  paid(o.orderId);
  await processAutoRejectOrders(); // confirms it: settlement + admin earnings recorded
  await Order.updateOne({ _id: o._id }, { $set: { 'tracking.confirmed.timestamp': new Date(Date.now() - 5 * 60000) } });
  const before = await adminBalance();
  await processAutoRejectOrders(); // restaurant timeout -> full refund + reversal
  assert.equal(refundsFor(o)[0]?.refund_amount, TOTAL);
  assert.ok((await adminBalance()) <= before, `admin balance rose on a refund: ${before} -> ${await adminBalance()}`);
});

await scenario('Failed-payment order is hidden from the restaurant and cannot be accepted', async () => {
  const o = await mkOrder({ ageMin: 1 });
  attempt(o.orderId, 'FAILED');
  await call(verifyOrderPayment, { body: { orderId: String(o._id), cashfreeOrderId: o.orderId } });
  assert.equal((await reload(o)).payment.status, 'failed');
  const list = await call(restaurantCtl.getRestaurantOrders, { restaurant: restaurantReq, query: {} });
  const ids = JSON.stringify(list.body || {});
  assert.ok(!ids.includes(o.orderId), 'restaurant can see an unpaid order');
  const acc = await call(restaurantCtl.acceptOrder, { restaurant: restaurantReq, params: { id: String(o._id) }, body: {} });
  assert.equal(acc.code, 400, `accept allowed: ${acc.body?.message}`);
});

await scenario('Tip paid but Cashfree slow to report: not marked failed', async () => {
  const o = await mkOrder({ status: 'delivered', payStatus: 'completed', ageMin: 60, extra: { deliveryPartnerId: riderId, tipPayments: [{ amount: 30, status: 'pending', cashfreeOrderId: 'TIP-SCN-1' }] } });
  cf.set('TIP-SCN-1', { order_status: 'ACTIVE', order_amount: 30, userId: String(userId), payments: [], refunds: [] });
  const res = await call(verifyOrderTipPayment, { params: { id: String(o._id) }, body: { cashfreeOrderId: 'TIP-SCN-1' } });
  assert.equal(res.code, 202, `got ${res.code} ${res.body?.message}`);
  assert.equal((await reload(o)).tipPayments[0].status, 'pending');
});

// ---------------------------------------------------------------- report
loud();
await mongoose.connection.dropDatabase();
await mongoose.disconnect();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `\n        -> ${r.why}`}`);
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed. Outbound requests blocked: ${[...new Set(blocked.map((u) => u.split('?')[0]))].join(', ') || 'none'}`);
process.exit(failed.length ? 1 : 0);

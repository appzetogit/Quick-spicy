
import mongoose from 'mongoose';

const PHONE = '9848833196';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const rider = await db.collection('deliveries').findOne(
  { phone: { $regex: PHONE + '$' } },
  { projection: { name: 1, phone: 1, status: 1, isActive: 1, 'availability.isOnline': 1, fcmtokenweb: 1, fcmtokenmobile: 1, notificationDevices: 1 } }
);

if (!rider) {
  console.log('NO RIDER FOUND for', PHONE);
  const near = await db.collection('deliveries').find({}, { projection: { name: 1, phone: 1 } }).limit(5).toArray();
  console.log('sample phones:', near.map(r => r.phone));
} else {
  const mask = t => (t ? String(t).slice(0, 12) + '…(' + String(t).length + ')' : null);
  console.log('RIDER:', {
    _id: rider._id.toString(),
    name: rider.name,
    phone: rider.phone,
    status: rider.status,
    isActive: rider.isActive,
    isOnline: rider.availability?.isOnline,
    fcmtokenweb: mask(rider.fcmtokenweb),
    fcmtokenmobile: mask(rider.fcmtokenmobile),
    notificationDevices: (rider.notificationDevices || []).map(d => ({ platform: d.platform, channel: d.channel, token: mask(d.token) })),
  });

  const orders = await db.collection('orders').find(
    { deliveryPartnerId: rider._id },
    { projection: { orderId: 1, status: 1, restaurantName: 1, 'pricing.total': 1, createdAt: 1 } }
  ).sort({ createdAt: -1 }).limit(10).toArray();

  console.log('\nRECENT ORDERS (' + orders.length + '):');
  orders.forEach(o => console.log(' ', o.orderId, '|', o.status, '|', o.restaurantName, '| ₹' + (o.pricing?.total ?? '?'), '|', o.createdAt?.toISOString?.()));

  const active = orders.filter(o => !['delivered', 'cancelled'].includes(String(o.status).toLowerCase()));
  console.log('\nACTIVE:', active.map(o => o.orderId + ' (' + o.status + ')').join(', ') || 'none');
}

await mongoose.disconnect();

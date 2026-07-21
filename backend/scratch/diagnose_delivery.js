import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 1. Find stale "out_for_delivery" orders (older than 24h) — these were clearly delivered IRL
  console.log('=== STALE OUT_FOR_DELIVERY ORDERS (>24h old) ===');
  const staleOFD = await db.collection('orders').find({
    status: 'out_for_delivery',
    updatedAt: { $lt: twentyFourHoursAgo }
  }).project({ orderId: 1, status: 1, deliveryPartnerId: 1, updatedAt: 1, createdAt: 1 }).toArray();
  console.log(`Found: ${staleOFD.length}`);
  staleOFD.forEach(o => console.log(`  ${o.orderId} | updated: ${o.updatedAt} | partner: ${o.deliveryPartnerId}`));

  // 2. Find stale "ready" orders with a delivery partner assigned (>24h old)
  console.log('\n=== STALE READY ORDERS WITH PARTNER (>24h old) ===');
  const staleReadyAssigned = await db.collection('orders').find({
    status: 'ready',
    deliveryPartnerId: { $ne: null, $exists: true },
    updatedAt: { $lt: twentyFourHoursAgo }
  }).project({ orderId: 1, status: 1, deliveryPartnerId: 1, updatedAt: 1 }).toArray();
  console.log(`Found: ${staleReadyAssigned.length}`);
  staleReadyAssigned.forEach(o => console.log(`  ${o.orderId} | updated: ${o.updatedAt} | partner: ${o.deliveryPartnerId}`));

  // 3. Find stale "ready" orders WITHOUT a delivery partner (>24h old) — abandoned
  console.log('\n=== STALE READY ORDERS WITHOUT PARTNER (>24h old) ===');
  const staleReadyUnassigned = await db.collection('orders').find({
    status: 'ready',
    $or: [{ deliveryPartnerId: null }, { deliveryPartnerId: { $exists: false } }],
    updatedAt: { $lt: twentyFourHoursAgo }
  }).project({ orderId: 1, status: 1, updatedAt: 1 }).toArray();
  console.log(`Found: ${staleReadyUnassigned.length}`);
  staleReadyUnassigned.forEach(o => console.log(`  ${o.orderId} | updated: ${o.updatedAt}`));

  // 4. Find stale "preparing" orders (>24h old)
  console.log('\n=== STALE PREPARING ORDERS (>24h old) ===');
  const stalePreparing = await db.collection('orders').find({
    status: 'preparing',
    updatedAt: { $lt: twentyFourHoursAgo }
  }).project({ orderId: 1, status: 1, updatedAt: 1, deliveryPartnerId: 1 }).toArray();
  console.log(`Found: ${stalePreparing.length}`);
  stalePreparing.forEach(o => console.log(`  ${o.orderId} | updated: ${o.updatedAt}`));

  // ── CLEANUP ──
  console.log('\n========== PERFORMING CLEANUP ==========\n');

  // Mark stale out_for_delivery → delivered
  if (staleOFD.length > 0) {
    const ofdIds = staleOFD.map(o => o._id);
    const result = await db.collection('orders').updateMany(
      { _id: { $in: ofdIds } },
      {
        $set: {
          status: 'delivered',
          'tracking.delivered': { status: true, timestamp: now },
          'deliveryState.status': 'delivered',
          'deliveryState.currentPhase': 'completed',
          updatedAt: now
        }
      }
    );
    console.log(`✅ Marked ${result.modifiedCount} stale out_for_delivery orders as "delivered"`);
  }

  // Mark stale ready (with partner) → delivered
  if (staleReadyAssigned.length > 0) {
    const readyIds = staleReadyAssigned.map(o => o._id);
    const result = await db.collection('orders').updateMany(
      { _id: { $in: readyIds } },
      {
        $set: {
          status: 'delivered',
          'tracking.delivered': { status: true, timestamp: now },
          'deliveryState.status': 'delivered',
          'deliveryState.currentPhase': 'completed',
          updatedAt: now
        }
      }
    );
    console.log(`✅ Marked ${result.modifiedCount} stale ready+assigned orders as "delivered"`);
  }

  // Mark stale ready (no partner) → cancelled
  if (staleReadyUnassigned.length > 0) {
    const unassignedIds = staleReadyUnassigned.map(o => o._id);
    const result = await db.collection('orders').updateMany(
      { _id: { $in: unassignedIds } },
      {
        $set: {
          status: 'cancelled',
          cancellationReason: 'Auto-cancelled: stale order with no delivery partner for >24h',
          cancelledAt: now,
          updatedAt: now
        }
      }
    );
    console.log(`✅ Cancelled ${result.modifiedCount} stale ready orders (no delivery partner)`);
  }

  // Mark stale preparing → cancelled
  if (stalePreparing.length > 0) {
    const prepIds = stalePreparing.map(o => o._id);
    const result = await db.collection('orders').updateMany(
      { _id: { $in: prepIds } },
      {
        $set: {
          status: 'cancelled',
          cancellationReason: 'Auto-cancelled: stale preparing order for >24h',
          cancelledAt: now,
          updatedAt: now
        }
      }
    );
    console.log(`✅ Cancelled ${result.modifiedCount} stale preparing orders`);
  }

  // ── VERIFY ──
  console.log('\n========== VERIFICATION ==========\n');

  // Check remaining active orders held by approved partners
  const approvedPartners = await db.collection('deliveries').find({
    status: { $in: ['approved', 'active'] }
  }).project({ _id: 1, name: 1, 'availability.isOnline': 1 }).toArray();

  const approvedIds = approvedPartners.map(d => d._id);
  const remainingActive = await db.collection('orders').find({
    deliveryPartnerId: { $in: approvedIds },
    status: { $nin: ['delivered', 'cancelled'] }
  }).project({ orderId: 1, status: 1, deliveryPartnerId: 1 }).toArray();

  console.log('Remaining active orders held by approved partners:', remainingActive.length);
  remainingActive.forEach(o => {
    const p = approvedPartners.find(d => d._id.toString() === o.deliveryPartnerId?.toString());
    console.log(`  ${o.orderId} | ${o.status} | ${p?.name}`);
  });

  const busyIds = new Set(remainingActive.map(o => o.deliveryPartnerId?.toString()).filter(Boolean));
  const freeOnline = approvedPartners.filter(d => d.availability?.isOnline && !busyIds.has(d._id.toString()));
  console.log(`\n✅ FREE & ONLINE delivery partners ready for new orders: ${freeOnline.length}`);
  freeOnline.forEach(d => console.log(`  ✅ ${d.name}`));

  const busyOnline = approvedPartners.filter(d => d.availability?.isOnline && busyIds.has(d._id.toString()));
  if (busyOnline.length > 0) {
    console.log(`\n⚠️  Still busy (have a recent active order):`);
    busyOnline.forEach(d => console.log(`  ⚠️  ${d.name}`));
  }

  await mongoose.disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });

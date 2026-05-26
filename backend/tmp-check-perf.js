import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://quickspicyofficial_db_user:nfIgadyMRjHXZxeN@cluster0.qilrmoh.mongodb.net/quickspicy';

async function checkPerformance() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected!');

  const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
  const AdminCommission = mongoose.model('AdminCommission', new mongoose.Schema({}, { strict: false }));

  console.log('Counting collections...');
  const orderCount = await Order.countDocuments({});
  const commissionCount = await AdminCommission.countDocuments({});
  console.log(`Total Orders: ${orderCount}`);
  console.log(`Total AdminCommissions: ${commissionCount}`);

  // Test 1: Order.find with limit 1000
  console.time('Order.find 1000');
  const orders = await Order.find({})
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean();
  console.timeEnd('Order.find 1000');

  // Test 2: Order.aggregate for completedStats
  console.time('completedStats aggregate');
  const completedStats = await Order.aggregate([
    { $match: { status: 'delivered', 'payment.status': 'completed' } },
    {
      $group: {
        _id: null,
        completedTransaction: { $sum: { $ifNull: ['$pricing.total', 0] } },
        deliverymanEarning: { $sum: { $multiply: [{ $ifNull: ['$pricing.deliveryFee', 0] }, 0.8] } }
      }
    }
  ]);
  console.timeEnd('completedStats aggregate');
  console.log('completedStats:', completedStats);

  // Test 3: Order.aggregate for refundedStats
  console.time('refundedStats aggregate');
  const refundedStats = await Order.aggregate([
    {
      $match: {
        $or: [
          { 'payment.status': 'refunded' },
          { status: 'cancelled' }
        ]
      }
    },
    {
      $group: {
        _id: null,
        refundedTransaction: { $sum: { $ifNull: ['$pricing.total', 0] } }
      }
    }
  ]);
  console.timeEnd('refundedStats aggregate');
  console.log('refundedStats:', refundedStats);

  // Test 4: AdminCommission.aggregate
  console.time('AdminCommission aggregate');
  const commissionStats = await AdminCommission.aggregate([
    { $match: { status: 'completed' } },
    {
      $group: {
        _id: null,
        adminEarning: { $sum: { $ifNull: ['$commissionAmount', 0] } },
        restaurantEarning: { $sum: { $ifNull: ['$restaurantEarning', 0] } }
      }
    }
  ]);
  console.timeEnd('AdminCommission aggregate');
  console.log('commissionStats:', commissionStats);

  await mongoose.disconnect();
  console.log('Disconnected!');
}

checkPerformance().catch(err => {
  console.error(err);
  process.exit(1);
});

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('z:/projects/quick/backend/.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const { processWalletRefund } = await import('../modules/order/services/cancellationRefundService.js');
  const Order = (await import('../modules/order/models/Order.js')).default;
  const UserWallet = (await import('../modules/user/models/UserWallet.js')).default;

  const order = await Order.findOne({ orderId: 'ORD-1782805047054-202' });
  if (!order) {
    console.error('Order not found');
    await mongoose.disconnect();
    return;
  }

  // Get user wallet balance before refund
  const walletBefore = await UserWallet.findOne({ userId: order.userId });
  console.log('Wallet Balance Before Refund:', walletBefore?.balance);

  try {
    const result = await processWalletRefund(order._id, null, 125);
    console.log('✅ Refund processed successfully:', result);

    // Get user wallet balance after refund
    const walletAfter = await UserWallet.findOne({ userId: order.userId });
    console.log('Wallet Balance After Refund:', walletAfter?.balance);
    console.log('Latest Transactions:', JSON.stringify(walletAfter?.transactions?.slice(-2), null, 2));
  } catch (error) {
    console.error('❌ Error during refund processing:', error);
  }

  await mongoose.disconnect();
}

run().catch(console.error);

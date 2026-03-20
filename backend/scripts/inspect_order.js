import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function inspect() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const targetId = '69bd1b8239657e7a2bcfe3d7';
    console.log('Searching for target:', targetId);

    // Search in Order
    const Order = mongoose.model('Order', new mongoose.Schema({}), 'orders');
    const order = await Order.findById(targetId).lean();
    if (order) console.log('Found in orders collection');

    // Search in Delivery
    const Delivery = mongoose.model('Delivery', new mongoose.Schema({}), 'deliveries');
    const delivery = await Delivery.findById(targetId).lean();
    if (delivery) console.log('Found in deliveries collection');
    
    // Search in Restaurant
    const Restaurant = mongoose.model('Restaurant', new mongoose.Schema({}), 'restaurants');
    const restaurant = await Restaurant.findById(targetId).lean();
    if (restaurant) console.log('Found in restaurants collection');

    // If not found by _id, try looking for documents where this ID appears as a field
    const anyOrderWithThisField = await Order.findOne({ $or: [{ orderId: targetId }, { deliveryPartnerId: targetId }] }).lean();
    if (anyOrderWithThisField) {
        console.log('Found an order where this ID is a field:');
        console.log(JSON.stringify(anyOrderWithThisField, null, 2));
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

inspect();

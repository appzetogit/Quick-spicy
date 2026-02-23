/**
 * Quick script to check what indexes Mongoose is trying to create
 * Run: node scripts/check-indexes.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

// Import models to trigger schema registration
import '../modules/auth/models/User.js';
import '../modules/restaurant/models/Restaurant.js';
import '../modules/restaurant/models/RestaurantCategory.js';

const MONGODB_URI = process.env.MONGODB_URI;

async function checkIndexes() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.model('User');
    const Restaurant = mongoose.model('Restaurant');
    const RestaurantCategory = mongoose.model('RestaurantCategory');

    console.log('📋 User Schema Indexes:');
    console.log(JSON.stringify(User.schema.indexes(), null, 2));
    
    console.log('\n📋 Restaurant Schema Indexes:');
    console.log(JSON.stringify(Restaurant.schema.indexes(), null, 2));
    
    console.log('\n📋 RestaurantCategory Schema Indexes:');
    console.log(JSON.stringify(RestaurantCategory.schema.indexes(), null, 2));

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkIndexes();


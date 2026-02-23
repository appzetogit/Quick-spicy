import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/appzeto-food';

async function fixRestaurantEmailIndex() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('restaurants');

    console.log('\nChecking current indexes...');
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(idx => ({
      name: idx.name,
      key: idx.key,
      unique: idx.unique,
      sparse: idx.sparse
    })));

    console.log('\nFixing email index...');
    
    // Drop old email index if it exists (might not be sparse)
    try {
      await collection.dropIndex('email_1');
      console.log('✓ Dropped old email_1 index');
    } catch (err) {
      if (err.code === 27) {
        console.log('  email_1 index does not exist, skipping...');
      } else {
        console.log('  Error dropping email_1 index:', err.message);
      }
    }

    // Create new sparse unique index for email
    // Sparse index only indexes documents where email exists and is not null
    try {
      await collection.createIndex(
        { email: 1 },
        { 
          unique: true, 
          sparse: true,
          name: 'email_1'
        }
      );
      console.log('✓ Created new email_1 sparse unique index');
    } catch (err) {
      if (err.code === 85) {
        console.log('  email_1 index already exists with different options, dropping and recreating...');
        try {
          await collection.dropIndex('email_1');
          await collection.createIndex(
            { email: 1 },
            { 
              unique: true, 
              sparse: true,
              name: 'email_1'
            }
          );
          console.log('✓ Recreated email_1 sparse unique index');
        } catch (recreateErr) {
          console.log('  Error recreating email_1 index:', recreateErr.message);
        }
      } else {
        console.log('  Error creating email_1 index:', err.message);
      }
    }

    // Also ensure phone index is sparse
    try {
      await collection.dropIndex('phone_1');
      console.log('✓ Dropped old phone_1 index');
    } catch (err) {
      if (err.code === 27) {
        console.log('  phone_1 index does not exist, skipping...');
      } else {
        console.log('  Error dropping phone_1 index:', err.message);
      }
    }

    try {
      await collection.createIndex(
        { phone: 1 },
        { 
          unique: true, 
          sparse: true,
          name: 'phone_1'
        }
      );
      console.log('✓ Created new phone_1 sparse unique index');
    } catch (err) {
      if (err.code === 85) {
        console.log('  phone_1 index already exists, skipping...');
      } else {
        console.log('  Error creating phone_1 index:', err.message);
      }
    }

    console.log('\n✅ Restaurant email index migration completed successfully!');
    console.log('\nMultiple restaurants with null emails are now allowed.');
    console.log('The email index is now sparse, so it only indexes documents where email exists.');
    
  } catch (error) {
    console.error('❌ Error fixing restaurant email index:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

fixRestaurantEmailIndex();


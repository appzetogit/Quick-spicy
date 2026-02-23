/**
 * Migration script to fix User model indexes
 * Allows same email/phone for different roles by using compound unique indexes
 * Uses partial indexes to prevent duplicate key errors with null emails/phones
 * 
 * Run this once: node scripts/fix-user-indexes.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/appzeto-food';

async function fixIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('users');

    console.log('\nDropping old unique indexes...');
    
    // Drop old compound unique indexes if they exist (sparse ones causing issues)
    try {
      await collection.dropIndex('email_1_role_1');
      console.log('✓ Dropped old email_1_role_1 compound unique index');
    } catch (err) {
      if (err.code === 27) {
        console.log('  email_1_role_1 index does not exist, skipping...');
      } else {
        console.log('  Error dropping email_1_role_1 index:', err.message);
      }
    }

    try {
      await collection.dropIndex('phone_1_role_1');
      console.log('✓ Dropped old phone_1_role_1 compound unique index');
    } catch (err) {
      if (err.code === 27) {
        console.log('  phone_1_role_1 index does not exist, skipping...');
      } else {
        console.log('  Error dropping phone_1_role_1 index:', err.message);
      }
    }

    // Drop old unique email index if it exists
    try {
      await collection.dropIndex('email_1');
      console.log('✓ Dropped old email_1 unique index');
    } catch (err) {
      if (err.code === 27) {
        console.log('  email_1 index does not exist, skipping...');
      } else {
        console.log('  Error dropping email_1 index:', err.message);
      }
    }

    // Drop old unique phone index if it exists
    try {
      await collection.dropIndex('phone_1');
      console.log('✓ Dropped old phone_1 unique index');
    } catch (err) {
      if (err.code === 27) {
        console.log('  phone_1 index does not exist, skipping...');
      } else {
        console.log('  Error dropping phone_1 index:', err.message);
      }
    }

    console.log('\nCreating new compound unique indexes with partial filter...');
    
    // Create compound unique index for email + role using partial index
    // This only indexes documents where email is not null, preventing duplicate key errors
    try {
      await collection.createIndex(
        { email: 1, role: 1 },
        { 
          unique: true, 
          partialFilterExpression: { email: { $exists: true, $type: 'string' } },
          name: 'email_1_role_1' 
        }
      );
      console.log('✓ Created email_1_role_1 compound unique index (partial)');
    } catch (err) {
      if (err.code === 85) {
        console.log('  email_1_role_1 index already exists with different options, dropping and recreating...');
        try {
          await collection.dropIndex('email_1_role_1');
          await collection.createIndex(
            { email: 1, role: 1 },
            { 
              unique: true, 
              partialFilterExpression: { email: { $exists: true, $type: 'string' } },
              name: 'email_1_role_1' 
            }
          );
          console.log('✓ Recreated email_1_role_1 compound unique index (partial)');
        } catch (recreateErr) {
          console.log('  Error recreating email_1_role_1 index:', recreateErr.message);
        }
      } else {
        console.log('  Error creating email_1_role_1 index:', err.message);
      }
    }

    // Create compound unique index for phone + role using partial index
    // This only indexes documents where phone is not null, preventing duplicate key errors
    try {
      await collection.createIndex(
        { phone: 1, role: 1 },
        { 
          unique: true, 
          partialFilterExpression: { phone: { $exists: true, $type: 'string' } },
          name: 'phone_1_role_1' 
        }
      );
      console.log('✓ Created phone_1_role_1 compound unique index (partial)');
    } catch (err) {
      if (err.code === 85) {
        console.log('  phone_1_role_1 index already exists with different options, dropping and recreating...');
        try {
          await collection.dropIndex('phone_1_role_1');
          await collection.createIndex(
            { phone: 1, role: 1 },
            { 
              unique: true, 
              partialFilterExpression: { phone: { $exists: true, $type: 'string' } },
              name: 'phone_1_role_1' 
            }
          );
          console.log('✓ Recreated phone_1_role_1 compound unique index (partial)');
        } catch (recreateErr) {
          console.log('  Error recreating phone_1_role_1 index:', recreateErr.message);
        }
      } else {
        console.log('  Error creating phone_1_role_1 index:', err.message);
      }
    }

    // Create non-unique indexes for individual fields
    try {
      await collection.createIndex({ email: 1 }, { sparse: true, name: 'email_1_nonunique' });
      console.log('✓ Created email_1 non-unique index');
    } catch (err) {
      console.log('  Error creating email_1 non-unique index:', err.message);
    }

    try {
      await collection.createIndex({ phone: 1 }, { sparse: true, name: 'phone_1_nonunique' });
      console.log('✓ Created phone_1 non-unique index');
    } catch (err) {
      console.log('  Error creating phone_1 non-unique index:', err.message);
    }

    try {
      await collection.createIndex({ role: 1 }, { name: 'role_1' });
      console.log('✓ Created role_1 index');
    } catch (err) {
      console.log('  Error creating role_1 index:', err.message);
    }

    console.log('\n✅ Index migration completed successfully!');
    console.log('\nYou can now use the same email/phone for different roles.');
    console.log('Multiple users with null emails/phones are now allowed.');
    
  } catch (error) {
    console.error('❌ Error fixing indexes:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

fixIndexes();


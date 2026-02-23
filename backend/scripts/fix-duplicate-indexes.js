/**
 * Script to fix duplicate index warnings by dropping old duplicate indexes
 * Run this once: node scripts/fix-duplicate-indexes.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env file');
  process.exit(1);
}

async function fixDuplicateIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Collections to check
    const collections = ['users', 'restaurants', 'restaurantcategories'];

    for (const collectionName of collections) {
      console.log(`\n📋 Checking ${collectionName}...`);
      const collection = db.collection(collectionName);
      
      try {
        const indexes = await collection.indexes();
        console.log(`   Found ${indexes.length} indexes:`);
        
        // Group indexes by key pattern
        const indexMap = new Map();
        
        for (const index of indexes) {
          const keyStr = JSON.stringify(index.key);
          if (!indexMap.has(keyStr)) {
            indexMap.set(keyStr, []);
          }
          indexMap.get(keyStr).push(index);
        }
        
        // Find duplicates
        for (const [keyStr, indexList] of indexMap.entries()) {
          if (indexList.length > 1) {
            console.log(`   ⚠️  Duplicate indexes found for ${keyStr}:`);
            
            // Keep the one with more options (unique, sparse, etc.) and drop others
            indexList.sort((a, b) => {
              const aOptions = Object.keys(a).length;
              const bOptions = Object.keys(b).length;
              return bOptions - aOptions;
            });
            
            // Drop all except the first one
            for (let i = 1; i < indexList.length; i++) {
              const indexToDrop = indexList[i];
              const indexName = indexToDrop.name || Object.keys(indexToDrop.key).join('_') + '_' + Object.values(indexToDrop.key).join('_');
              
              try {
                await collection.dropIndex(indexName);
                console.log(`   ✅ Dropped duplicate index: ${indexName}`);
              } catch (err) {
                if (err.code === 27) {
                  console.log(`   ℹ️  Index ${indexName} does not exist (may have been auto-dropped)`);
                } else {
                  console.log(`   ⚠️  Error dropping ${indexName}: ${err.message}`);
                }
              }
            }
          }
        }
        
        // Check for specific problematic indexes
        const problematicIndexes = {
          'users': ['email_1', 'phone_1', 'googleId_1'],
          'restaurants': ['email_1', 'phone_1', 'googleId_1'],
          'restaurantcategories': ['name_1']
        };
        
        if (problematicIndexes[collectionName]) {
          for (const indexName of problematicIndexes[collectionName]) {
            try {
              const index = indexes.find(idx => idx.name === indexName);
              if (index) {
                // Check if there's a compound index that includes this field
                const hasCompound = indexes.some(idx => {
                  const keys = Object.keys(idx.key);
                  return keys.length > 1 && keys.includes(indexName.split('_')[0]);
                });
                
                if (hasCompound) {
                  console.log(`   🔍 Found single-field index ${indexName} that might conflict with compound index`);
                  console.log(`   💡 Consider: This index might be redundant if compound index exists`);
                }
              }
            } catch (err) {
              // Ignore
            }
          }
        }
        
      } catch (err) {
        console.log(`   ⚠️  Error checking ${collectionName}: ${err.message}`);
      }
    }

    console.log('\n✅ Index check completed!');
    console.log('\n💡 If warnings persist, they may be from Mongoose detecting schema-level duplicates.');
    console.log('   The code has been fixed - restart your server to see if warnings clear.');
    
  } catch (error) {
    console.error('❌ Error fixing indexes:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

fixDuplicateIndexes();


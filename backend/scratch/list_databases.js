import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const adminDb = mongoose.connection.client.db().admin();
  const dbs = await adminDb.listDatabases();
  console.log('--- DATABASES ON CLUSTER ---');
  console.log(JSON.stringify(dbs, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);

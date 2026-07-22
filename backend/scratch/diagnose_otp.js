import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function diagnose() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. Check admin accounts
    const Admin = mongoose.model('Admin', new mongoose.Schema({}, { strict: false, collection: 'admins' }));
    const admins = await Admin.find({}).lean();
    console.log('\n=== ADMIN ACCOUNTS ===');
    admins.forEach(a => {
      console.log(`  Name: ${a.name}, Email: ${a.email}, Phone: ${a.phone || 'NOT SET'}, PhoneVerified: ${a.phoneVerified || false}, IsActive: ${a.isActive}`);
    });

    // 2. Check SMS credentials in EnvironmentVariable
    const EnvVar = mongoose.model('EnvVar', new mongoose.Schema({}, { strict: false, collection: 'environmentvariables' }));
    const envDoc = await EnvVar.findOne({}).lean();
    if (envDoc) {
      console.log('\n=== SMS CREDENTIALS IN DB ===');
      console.log(`  SMSINDIAHUB_API_KEY: ${envDoc.SMSINDIAHUB_API_KEY ? '✓ SET (' + envDoc.SMSINDIAHUB_API_KEY.substring(0, 8) + '...)' : '✗ EMPTY'}`);
      console.log(`  SMSINDIAHUB_SENDER_ID: ${envDoc.SMSINDIAHUB_SENDER_ID ? '✓ SET (' + envDoc.SMSINDIAHUB_SENDER_ID + ')' : '✗ EMPTY'}`);
    } else {
      console.log('\n=== SMS CREDENTIALS IN DB ===');
      console.log('  ✗ No EnvironmentVariable document found in database!');
    }

    // 3. Check .env fallback
    console.log('\n=== SMS CREDENTIALS IN .env ===');
    console.log(`  SMSINDIAHUB_API_KEY: ${process.env.SMSINDIAHUB_API_KEY ? '✓ SET' : '✗ NOT SET'}`);
    console.log(`  SMSINDIAHUB_SENDER_ID: ${process.env.SMSINDIAHUB_SENDER_ID ? '✓ SET' : '✗ NOT SET'}`);

    // 4. Check recent OTP records
    const OtpModel = mongoose.model('Otp', new mongoose.Schema({}, { strict: false, collection: 'otps' }));
    const recentOtps = await OtpModel.find({ purpose: 'admin-login' }).sort({ createdAt: -1 }).limit(5).lean();
    console.log('\n=== RECENT ADMIN-LOGIN OTP RECORDS ===');
    if (recentOtps.length === 0) {
      console.log('  No admin-login OTP records found');
    } else {
      recentOtps.forEach(o => {
        console.log(`  Phone: ${o.phone || 'N/A'}, Email: ${o.email || 'N/A'}, OTP: ${o.otp}, Verified: ${o.verified}, Created: ${o.createdAt}, Expires: ${o.expiresAt}`);
      });
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

diagnose();

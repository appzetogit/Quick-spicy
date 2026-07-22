import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function disableAdminOtp() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const col = mongoose.connection.db.collection('businesssettings');
    const doc = await col.findOne({});

    if (!doc) {
      console.log('Creating initial businesssettings document with adminOtpRequired = false...');
      await col.insertOne({
        companyName: 'Appzeto Food',
        region: 'India',
        email: 'info@appzetofood.com',
        adminOtpRequired: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } else {
      console.log('Updating businesssettings document to set adminOtpRequired = false...');
      await col.updateOne(
        { _id: doc._id },
        { $set: { adminOtpRequired: false, updatedAt: new Date() } }
      );
    }

    const updated = await col.findOne({});
    console.log('=== UPDATED BUSINESS SETTINGS ===');
    console.log('adminOtpRequired:', updated.adminOtpRequired);
    console.log('Company:', updated.companyName);

    await mongoose.disconnect();
    console.log('✅ Admin OTP has been turned OFF. Admins can now log in directly using email & password!');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

disableAdminOtp();

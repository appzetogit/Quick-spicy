import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Admin from '../modules/admin/models/Admin.js';
import BusinessSettings from '../modules/admin/models/BusinessSettings.js';

async function testLogic() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const admin = await Admin.findOne({ email: 'appzeto@gmail.com' });
    console.log('Admin found:', admin.email);

    const settings = await BusinessSettings.getSettings();
    console.log('BusinessSettings adminOtpRequired:', settings.adminOtpRequired);
    console.log('isOtpRequired (Boolean(settings?.adminOtpRequired)):', Boolean(settings?.adminOtpRequired));

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

testLogic();

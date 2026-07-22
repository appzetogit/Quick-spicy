import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import smsIndiaHubService from '../modules/auth/services/smsIndiaHubService.js';

async function testSms() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('Sending test OTP to 7223077890 with Sender ID MSGSMS...');
    const result = await smsIndiaHubService.sendOTP('7223077890', '123456', 'admin-login');
    console.log('Result:', JSON.stringify(result, null, 2));

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ SMS Test Failed:', err.message);
    process.exit(1);
  }
}

testSms();

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';
import EnvironmentVariable from '../modules/admin/models/EnvironmentVariable.js';

dotenv.config();

async function testSMS() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/quickservice';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // 1. Update EnvironmentVariable in DB
    let envVars = await EnvironmentVariable.findOne();
    if (!envVars) {
      envVars = new EnvironmentVariable();
    }
    envVars.SMSINDIAHUB_SENDER_ID = 'BGADEC';
    envVars.SMSINDIAHUB_ENTITY_ID = '1001164203633432409';
    await envVars.save();
    console.log('✅ Updated DB env variables: SMSINDIAHUB_SENDER_ID=BGADEC, SMSINDIAHUB_ENTITY_ID=1001164203633432409');

    // 2. Resolve credentials
    const apiKey = (envVars.SMSINDIAHUB_API_KEY || process.env.SMSINDIAHUB_API_KEY || 'JRN2PydPJEeqS8YxUIu7eQ').trim();
    const senderId = 'BGADEC';
    const entityId = '1001164203633432409';
    const phone = '917223077890';
    const otp = '123456';

    // Test variations of message text matching the DLT template:
    // DLT Template: Welcome to the ##var## powered by Appzeto.Your OTP for registration is ##var##.BGADEC
    const messageVariations = [
      `Welcome to the Appzeto powered by Appzeto.Your OTP for registration is ${otp}.BGADEC`,
      `Welcome to the Appzeto Food powered by Appzeto.Your OTP for registration is ${otp}.BGADEC`,
      `Welcome to the Quick powered by Appzeto.Your OTP for registration is ${otp}.BGADEC`,
    ];

    for (const msg of messageVariations) {
      console.log('\n----------------------------------------');
      console.log('Testing message template:', msg);

      const params = new URLSearchParams({
        APIKey: apiKey,
        msisdn: phone,
        sid: senderId,
        msg: msg,
        fl: '0',
        dc: '0',
        gwid: '2',
        entityid: entityId,
      });

      const apiUrl = `https://cloud.smsindiahub.in/vendorsms/pushsms.aspx?${params.toString()}`;
      console.log('URL:', apiUrl);

      const response = await axios.get(apiUrl, { timeout: 10000 });
      console.log('Response Status:', response.status);
      console.log('Response Data:', response.data);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error in test:', err.message, err.response?.data || '');
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

testSMS();

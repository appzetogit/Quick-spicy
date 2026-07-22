import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';
dotenv.config();

import smsIndiaHubService from '../modules/auth/services/smsIndiaHubService.js';

async function testSmsDetails() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const { apiKey, senderId } = await smsIndiaHubService.resolveCredentials();
    console.log('Using APIKey:', apiKey);
    console.log('Using Sender ID:', senderId);

    const phone = '917223077890';
    const message = `Welcome to the Appzeto Food powered by SMSINDIAHUB. Your OTP for registration is 123456`;

    // 1. Test Gateway 2 (Transactional)
    console.log('\n--- Testing Gateway 2 (Transactional) ---');
    const urlGw2 = `https://cloud.smsindiahub.in/vendorsms/pushsms.aspx?APIKey=${apiKey}&msisdn=${phone}&sid=${senderId}&msg=${encodeURIComponent(message)}&fl=0&dc=0&gwid=2`;
    const resGw2 = await axios.get(urlGw2);
    console.log('GW2 Response:', resGw2.data);

    // 2. Test Gateway 1 (Promotional)
    console.log('\n--- Testing Gateway 1 (Promotional) ---');
    const urlGw1 = `https://cloud.smsindiahub.in/vendorsms/pushsms.aspx?APIKey=${apiKey}&msisdn=${phone}&sid=${senderId}&msg=${encodeURIComponent(message)}&fl=0&dc=0&gwid=1`;
    const resGw1 = await axios.get(urlGw1);
    console.log('GW1 Response:', resGw1.data);

    // 3. Test Check Balance
    console.log('\n--- Testing Check Balance ---');
    const urlBal = `http://cloud.smsindiahub.in/vendorsms/checkbalance.aspx?APIKey=${apiKey}`;
    const resBal = await axios.get(urlBal);
    console.log('Balance Response:', resBal.data);

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Test error:', err.message);
  }
}

testSmsDetails();

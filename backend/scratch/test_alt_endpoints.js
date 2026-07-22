import axios from 'axios';

const apiKey = 'JRN2PydPJEeqS8YxUIu7eQ';
const phone = '917223077890';
const senderId = 'SMSHUB';
const message = 'Welcome to the Appzeto Food powered by SMSINDIAHUB. Your OTP for registration is 123456';

async function testEndpoints() {
  console.log('Testing alternative SMSIndiaHub endpoints...\n');

  // Endpoint 1: pushsms.aspx (Standard HTTP GET)
  try {
    const url1 = `https://cloud.smsindiahub.in/vendorsms/pushsms.aspx?APIKey=${apiKey}&msisdn=${phone}&sid=${senderId}&msg=${encodeURIComponent(message)}&fl=0&dc=0&gwid=2`;
    const res1 = await axios.get(url1);
    console.log(`[pushsms.aspx GET] => Response: ${JSON.stringify(res1.data)}`);
  } catch (e) {
    console.log(`[pushsms.aspx GET] => Error: ${e.message}`);
  }

  // Endpoint 2: /api/mt/SendSMS (JSON POST)
  try {
    const url2 = `https://cloud.smsindiahub.in/api/mt/SendSMS?APIKey=${apiKey}&senderid=${senderId}&channel=Trans&DCS=0&flashSms=0&number=${phone}&text=${encodeURIComponent(message)}&route=2`;
    const res2 = await axios.get(url2);
    console.log(`[/api/mt/SendSMS GET] => Response: ${JSON.stringify(res2.data)}`);
  } catch (e) {
    console.log(`[/api/mt/SendSMS GET] => Error: ${e.message}`);
  }
  
  // Endpoint 3: Check Sender ID status if there's any API
  try {
    const url3 = `https://cloud.smsindiahub.in/vendorsms/getsenderid.aspx?APIKey=${apiKey}`;
    const res3 = await axios.get(url3);
    console.log(`[getsenderid.aspx GET] => Response: ${JSON.stringify(res3.data)}`);
  } catch (e) {
    console.log(`[getsenderid.aspx GET] => Error: ${e.message}`);
  }
}

testEndpoints();

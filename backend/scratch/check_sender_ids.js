import axios from 'axios';

const apiKey = 'JRN2PydPJEeqS8YxUIu7eQ';
const phone = '917223077890';
const message = `Welcome to the Appzeto Food powered by SMSINDIAHUB. Your OTP for registration is 123456`;

const candidates = [
  'MSGSMS', 'APZETO', 'DRIVON', 'QKSPCY', 'QUICKS', 'TASTIZ', 'DRIVE', 'FOOD', 'APPZET', 'QUICK'
];

async function checkCandidates() {
  console.log('Testing Sender ID candidates against SMSIndiaHub API...\n');

  for (const sid of candidates) {
    try {
      const url = `https://cloud.smsindiahub.in/vendorsms/pushsms.aspx?APIKey=${apiKey}&msisdn=${phone}&sid=${sid}&msg=${encodeURIComponent(message)}&fl=0&dc=0&gwid=2`;
      const res = await axios.get(url, { timeout: 5000 });
      console.log(`SID: "${sid}" => Response: ${res.data}`);
    } catch (err) {
      console.log(`SID: "${sid}" => Error: ${err.message}`);
    }
  }
}

checkCandidates();

import axios from 'axios';

const apiKey = 'JRN2PydPJEeqS8YxUIu7eQ';
const phone = '917223077890';
const senderId = 'SMSHUB';
const message = 'Welcome to the Appzeto Food powered by SMSINDIAHUB. Your OTP for registration is 123456';

const tests = [
  // 1. Parameter name variations for Sender ID
  { name: 'Standard sid=SMSHUB', params: { APIKey: apiKey, msisdn: phone, sid: senderId, msg: message, fl: '0', dc: '0', gwid: '2' } },
  { name: 'senderid=SMSHUB', params: { APIKey: apiKey, msisdn: phone, senderid: senderId, msg: message, fl: '0', dc: '0', gwid: '2' } },
  { name: 'sender=SMSHUB', params: { APIKey: apiKey, msisdn: phone, sender: senderId, msg: message, fl: '0', dc: '0', gwid: '2' } },
  { name: 'SenderID=SMSHUB', params: { APIKey: apiKey, msisdn: phone, SenderID: senderId, msg: message, fl: '0', dc: '0', gwid: '2' } },
  { name: 'header=SMSHUB', params: { APIKey: apiKey, msisdn: phone, header: senderId, msg: message, fl: '0', dc: '0', gwid: '2' } },
  
  // 2. DLT Entity ID and Template ID variations
  { name: 'sid=SMSHUB with EntityID and TemplateID', params: { APIKey: apiKey, msisdn: phone, sid: senderId, msg: message, fl: '0', dc: '0', gwid: '2', entityid: '1201159000000000000', templateid: '1207160000000000000' } },
  { name: 'sid=SMSHUB with peid and tid', params: { APIKey: apiKey, msisdn: phone, sid: senderId, msg: message, fl: '0', dc: '0', gwid: '2', peid: '1201159000000000000', tid: '1207160000000000000' } },
  { name: 'sid=SMSHUB with Entity_Id and Template_Id', params: { APIKey: apiKey, msisdn: phone, sid: senderId, msg: message, fl: '0', dc: '0', gwid: '2', Entity_Id: '1201159000000000000', Template_Id: '1207160000000000000' } },
];

async function runTests() {
  console.log('Testing SMSIndiaHub API parameter variations...\n');
  for (const t of tests) {
    const baseUrl = 'https://cloud.smsindiahub.in/vendorsms/pushsms.aspx';
    const searchParams = new URLSearchParams(t.params);
    const fullUrl = `${baseUrl}?${searchParams.toString()}`;
    try {
      const res = await axios.get(fullUrl, { timeout: 8000 });
      const respStr = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data);
      console.log(`[${t.name}] => Response: ${respStr.substring(0, 100)}`);
    } catch (err) {
      console.log(`[${t.name}] => Error: ${err.message}`);
    }
  }
}

runTests();

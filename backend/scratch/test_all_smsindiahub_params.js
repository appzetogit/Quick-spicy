import axios from 'axios';

async function testParams() {
  const apiKey = 'JRN2PydPJEeqS8YxUIu7eQ';
  const phone = '917223077890';
  const senderId = 'BGADEC';
  const peId = '1001164203633432409';
  const msg = 'Welcome to the Appzeto powered by Appzeto.Your OTP for registration is 123456.BGADEC';

  const tests = [
    // Standard params
    { sid: senderId, entityid: peId, gwid: '2' },
    { sid: senderId, entityid: peId, gwid: '1' },
    // Alternate parameter names for sender
    { senderid: senderId, entityid: peId, gwid: '2' },
    { sender: senderId, entityid: peId, gwid: '2' },
    { Header: senderId, entityid: peId, gwid: '2' },
    // Alternate parameter names for PE ID
    { sid: senderId, peid: peId, gwid: '2' },
    { sid: senderId, PEID: peId, gwid: '2' },
    { sid: senderId, EntityID: peId, gwid: '2' },
    // With uppercase/lowercase sender
    { sid: 'bgadec', entityid: peId, gwid: '2' },
    { sid: 'BGADEC ', entityid: peId, gwid: '2' },
  ];

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const params = new URLSearchParams({
      APIKey: apiKey,
      msisdn: phone,
      msg: msg,
      fl: '0',
      dc: '0',
      ...t
    });

    const url = `https://cloud.smsindiahub.in/vendorsms/pushsms.aspx?${params.toString()}`;
    try {
      const res = await axios.get(url, { timeout: 8000 });
      console.log(`Test ${i + 1} (${JSON.stringify(t)}) => Status: ${res.status}, Data: ${res.data}`);
    } catch (e) {
      console.log(`Test ${i + 1} Error: ${e.message}`);
    }
  }
}

testParams();

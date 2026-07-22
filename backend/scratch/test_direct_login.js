import axios from 'axios';

async function testDirectLogin() {
  try {
    console.log('Testing Admin Login API with email and password...');
    const response = await axios.post('http://localhost:5000/api/admin/auth/login', {
      email: 'appzeto@gmail.com',
      password: 'password'
    });

    console.log('Status Code:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));

    if (response.data?.data?.requiresOtp === false) {
      console.log('\n🎉 SUCCESS! Admin login completed directly WITHOUT OTP!');
    } else {
      console.log('\n⚠️ OTP still requested!');
    }
  } catch (err) {
    console.error('❌ Login Test Error:', err.response?.data || err.message);
  }
}

testDirectLogin();

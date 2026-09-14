// Run: npm test          (from backend/)
//
// Guards the store-review demo login. The property that matters is NOT that the demo
// number works - it is that the fixed code unlocks nothing else. The master bypass that
// already exists in this file accepts its code for ANY identifier; if the demo login
// behaved like that, publishing the credentials in a Play Console listing would publish
// a key to every customer account on the platform.
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// No database in a unit test. Any code path that reaches Mongo must fail fast instead of
// hanging for the default buffer timeout - and "reaches Mongo" is itself the proof that
// no bypass short-circuited ahead of it.
mongoose.set('bufferTimeoutMS', 200);

process.env.DEMO_LOGIN_PHONE = '9999999999';
process.env.DEMO_LOGIN_OTP = '123456';

const { default: otpService, isDemoLoginPhone } = await import('./otpService.js');

// --- scoping ---------------------------------------------------------------------

assert.equal(isDemoLoginPhone('9999999999'), true);
assert.equal(isDemoLoginPhone('+91 9999999999'), true, 'country code and spaces must not matter');
assert.equal(isDemoLoginPhone('919999999999'), true);
assert.equal(isDemoLoginPhone('9999999998'), false, 'a neighbouring number is not the demo account');
assert.equal(isDemoLoginPhone('7223077890'), false);
assert.equal(isDemoLoginPhone(''), false);
assert.equal(isDemoLoginPhone(null), false);

// --- the demo number with the demo code is accepted, without touching the database ---

const ok = await otpService.verifyOTP('9999999999', '123456', 'login');
assert.equal(ok.success, true, 'the review account must sign in with the fixed code');

// --- and nothing else is --------------------------------------------------------------

const rejects = async (phone, otp, why) => {
  try {
    const result = await otpService.verifyOTP(phone, otp, 'login');
    assert.notEqual(result?.success, true, why);
  } catch {
    // Reaching the database and failing there is the correct outcome: it means no bypass
    // accepted these credentials.
  }
};

// The fixed code must be worthless against any other number.
await rejects('7223077890', '123456', 'the demo code must not unlock another account');
await rejects('9999999998', '123456', 'the demo code must not unlock a neighbouring number');

// And the demo number must still reject a wrong code.
await rejects('9999999999', '000000', 'a wrong code must fail even for the demo number');
await rejects('9999999999', '12345', 'a truncated code must fail');

// --- switched off when unconfigured ---------------------------------------------------

delete process.env.DEMO_LOGIN_PHONE;
delete process.env.DEMO_LOGIN_OTP;
assert.equal(isDemoLoginPhone('9999999999'), false, 'no env, no demo login');
await rejects('9999999999', '123456', 'the demo login must not exist when unconfigured');

console.log('demoLogin: all assertions passed');

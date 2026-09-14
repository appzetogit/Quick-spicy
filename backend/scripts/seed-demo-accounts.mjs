/**
 * Creates (or refreshes) the store-review demo accounts for all three apps.
 *
 * Run: node scripts/seed-demo-accounts.mjs          (from backend/)
 *
 * Google Play and the App Store both require working credentials for an app behind a
 * login. All three sign in with DEMO_LOGIN_PHONE and DEMO_LOGIN_OTP.
 *
 * Approved is not enough on its own - each app decides for itself whether to show the
 * real screens or send the account back to sign-up:
 *   - the restaurant panel calls isRestaurantOnboardingComplete(), which passes as soon
 *     as onboarding.completedSteps is 4, and otherwise checks all four steps field by
 *     field. A freshly created restaurant has completedSteps 0, so the reviewer lands in
 *     onboarding. Every step is filled in below as well as the counter, so the panel's
 *     own screens have something to render.
 *   - the rider app clears its "signup required" flag once the server reports a status
 *     other than pending or blocked, so 'approved' is what matters there. Documents and
 *     vehicle details are filled in anyway, so no screen shows an empty profile.
 *
 * Every identifier here is a deliberately fake placeholder. Nothing is copied from a real
 * restaurant or rider.
 *
 * Each record is flagged isDemo, which keeps them out of the real business: dispatch
 * skips demo riders, and customer-facing listings skip demo restaurants. On top of that
 * the rider has no zone and starts offline, and the demo kitchen is not accepting orders.
 *
 * Idempotent: run it as often as you like.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const DIGITS = process.env.DEMO_LOGIN_PHONE || '9999999999';

// The format the apps actually store.
//
// All three sign-in screens build the phone as `${countryCode} ${phone}`, and the auth
// controllers look an account up by that raw string rather than by digits. Seeding the
// bare ten digits therefore produced records no app could reach: each app created its own
// empty pending account instead, which is why the reviewer kept being asked for
// documents. OTP verification normalises to digits, so the sign-in itself worked - only
// the account lookup did not.
const PHONE = process.env.DEMO_LOGIN_PHONE_STORED || '+91 ' + DIGITS;
const IMG = 'https://placehold.co/600x400/EB590E/white?text=Quick+Spicy+Demo';

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const { default: User } = await import('../modules/auth/models/User.js');
const { default: Delivery } = await import('../modules/delivery/models/Delivery.js');
const { default: Restaurant } = await import('../modules/restaurant/models/Restaurant.js');

console.log(`Seeding demo accounts for ${PHONE}\n`);

// Clear up the bare-digit records an earlier version of this script created: no app can
// reach them, and they only add confusion to the admin lists. Deliberately narrow - demo
// flagged, this script's own names, and only under the unreachable digits-only phone.
for (const [label, Model, name] of [
  ['rider', Delivery, 'Play Store Demo Rider'],
  ['restaurant', Restaurant, 'Play Store Demo Kitchen'],
]) {
  const stale = await Model.deleteMany({ phone: DIGITS, isDemo: true, name });
  if (stale.deletedCount) console.log(`  removed ${stale.deletedCount} unreachable ${label} record(s) stored as "${DIGITS}"`);
}


// --- customer ---------------------------------------------------------------------
const existingUser = await User.findOne({ phone: PHONE });
const user = await User.findOneAndUpdate(
  { phone: PHONE },
  {
    $set: {
      phone: PHONE,
      isActive: true,
      isDemo: true,
      isPhoneVerified: true,
      // An account may already exist under this number from the owner's own testing.
      // Flag it and keep it able to sign in, but never rename data that is not ours.
      ...(existingUser ? {} : { name: 'Play Store Demo' }),
    },
  },
  { new: true, upsert: true, setDefaultsOnInsert: true },
);
console.log(`  customer   ${user._id}  ${user.name} | active=${user.isActive} | demo=${user.isDemo}`);

// --- delivery partner -------------------------------------------------------------
const rider = await Delivery.findOneAndUpdate(
  { phone: PHONE },
  {
    $set: {
      name: 'Play Store Demo Rider',
      phone: PHONE,
      email: 'demo.rider@quickspicy.in',
      status: 'approved',
      isActive: true,
      isDemo: true,
      phoneVerified: true,
      'availability.isOnline': false,
      'vehicle.type': 'bike',
      'vehicle.number': 'AP00AA0000',
      'vehicle.model': 'Demo Model',
      'vehicle.brand': 'Demo Brand',
      'location.addressLine1': 'Demo address',
      'location.city': 'Cumbum',
      'location.state': 'Andhra Pradesh',
      'profileImage.url': IMG,
      'documents.aadhar': { number: '000000000000', document: IMG, verified: true },
      'documents.pan': { number: 'AAAAA0000A', document: IMG, verified: true },
      'documents.drivingLicense': { number: 'DEMO-DL-0000', document: IMG, verified: true },
      'documents.vehicleRC': { number: 'DEMO-RC-0000', document: IMG, verified: true },
      'documents.photo': IMG,
      verifiedAt: new Date(),
    },
    $unset: { zoneId: '', 'availability.zones': '' },
  },
  { new: true, upsert: true, setDefaultsOnInsert: true },
);
console.log(`  rider      ${rider._id}  ${rider.name} | status=${rider.status} | demo=${rider.isDemo} | zone=${rider.zoneId || 'none'} | docs=${Object.keys(rider.documents || {}).length}`);

// --- restaurant -------------------------------------------------------------------
const OPEN_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIMINGS = { openingTime: '9:00 AM', closingTime: '11:00 PM' };
const LOCATION = {
  addressLine1: 'Demo address',
  area: 'Demo Area',
  city: 'Cumbum',
  state: 'Andhra Pradesh',
  pincode: '523333',
};

const restaurant = await Restaurant.findOneAndUpdate(
  { phone: PHONE },
  {
    $set: {
      name: 'Play Store Demo Kitchen',
      slug: 'play-store-demo-kitchen',
      email: 'demo@quickspicy.in',
      phone: PHONE,
      ownerName: 'Play Store Demo',
      ownerPhone: PHONE,
      primaryContactNumber: PHONE,
      phoneVerified: true,
      isActive: true,
      isDemo: true,
      isAcceptingOrders: false,
      approvedAt: new Date(),
      location: LOCATION,
      cuisines: ['South Indian'],
      openDays: OPEN_DAYS,
      deliveryTimings: TIMINGS,
      estimatedDeliveryTime: '25-30 mins',
      'profileImage.url': IMG,

      // What the panel actually checks. completedSteps === 4 short-circuits
      // isRestaurantOnboardingComplete, and the steps are filled so its screens render.
      'onboarding.completedSteps': 4,
      'onboarding.step1': {
        restaurantName: 'Play Store Demo Kitchen',
        ownerName: 'Play Store Demo',
        ownerEmail: 'demo@quickspicy.in',
        ownerPhone: PHONE,
        primaryContactNumber: PHONE,
        location: LOCATION,
      },
      'onboarding.step2': {
        cuisines: ['South Indian'],
        deliveryTimings: TIMINGS,
        openDays: OPEN_DAYS,
        foodPreference: 'both',
        menuImageUrls: [{ url: IMG }],
        profileImageUrl: { url: IMG },
      },
      'onboarding.step3': {
        pan: { panNumber: 'AAAAA0000A', nameOnPan: 'Play Store Demo', image: { url: IMG } },
        gst: { isRegistered: false, image: null, gstNumber: '', legalName: '', address: '' },
        fssai: {
          registrationNumber: '10000000000000',
          image: { url: IMG },
          expiryDate: new Date('2030-01-01'),
        },
        bank: {
          accountNumber: '000000000000',
          ifscCode: 'DEMO0000000',
          accountHolderName: 'Play Store Demo',
          accountType: 'Savings',
        },
      },
      'onboarding.step4': {
        estimatedDeliveryTime: '25-30 mins',
        featuredDish: 'Demo Biryani',
        featuredPrice: 199,
        offer: 'Demo offer',
        specialDishes: [],
      },
    },
    $unset: { zoneId: '' },
  },
  { new: true, upsert: true, setDefaultsOnInsert: true },
);
console.log(`  restaurant ${restaurant._id}  ${restaurant.name} | active=${restaurant.isActive} | demo=${restaurant.isDemo} | accepting=${restaurant.isAcceptingOrders} | completedSteps=${restaurant.onboarding?.completedSteps}`);

console.log('\nAll three demo accounts are approved, active and past onboarding.');
await mongoose.disconnect();

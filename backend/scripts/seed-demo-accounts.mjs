/**
 * Creates (or refreshes) the store-review demo accounts for all three apps.
 *
 * Run: node scripts/seed-demo-accounts.mjs          (from backend/)
 *
 * Google Play and the App Store both require working credentials for an app behind a
 * login. All three sign in with DEMO_LOGIN_PHONE and DEMO_LOGIN_OTP, and all three are
 * left approved and active so a reviewer sees working screens rather than a "pending
 * verification" notice.
 *
 * Each record is flagged isDemo, which is what keeps them out of the real business:
 *   - delivery dispatch skips demo riders, so a reviewer toggling themselves online can
 *     never be handed a real customer's order;
 *   - customer-facing restaurant listings skip demo restaurants, so the demo kitchen is
 *     never shown to a real customer.
 * The demo rider is also left with no zone and offline, and the demo restaurant is left
 * not accepting orders, so the flag is not the only thing standing between a reviewer and
 * live operations.
 *
 * Idempotent: run it as often as you like.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const PHONE = process.env.DEMO_LOGIN_PHONE || '9999999999';

const summarise = (label, doc, extra = '') =>
  console.log(`  ${label.padEnd(10)} ${doc ? doc._id : '-'}  ${extra}`);

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const { default: User } = await import('../modules/auth/models/User.js');
const { default: Delivery } = await import('../modules/delivery/models/Delivery.js');
const { default: Restaurant } = await import('../modules/restaurant/models/Restaurant.js');

console.log(`Seeding demo accounts for ${PHONE}\n`);

// --- customer ---------------------------------------------------------------------
const user = await User.findOneAndUpdate(
  { phone: PHONE },
  {
    $set: {
      name: 'Play Store Demo',
      phone: PHONE,
      isActive: true,
      isDemo: true,
      isPhoneVerified: true,
    },
  },
  { new: true, upsert: true, setDefaultsOnInsert: true },
);
summarise('customer', user, `${user.name} | active=${user.isActive} | demo=${user.isDemo}`);

// --- delivery partner -------------------------------------------------------------
// No zone and offline on purpose: dispatch matches riders by zone, and demo riders are
// excluded from those queries outright.
const rider = await Delivery.findOneAndUpdate(
  { phone: PHONE },
  {
    $set: {
      name: 'Play Store Demo Rider',
      phone: PHONE,
      status: 'approved',
      isActive: true,
      isDemo: true,
      'availability.isOnline': false,
    },
    $unset: { zoneId: '', 'availability.zones': '' },
  },
  { new: true, upsert: true, setDefaultsOnInsert: true },
);
summarise('rider', rider, `${rider.name} | status=${rider.status} | demo=${rider.isDemo} | zone=${rider.zoneId || 'none'}`);

// --- restaurant -------------------------------------------------------------------
// Active so the partner panel works for a reviewer; isDemo keeps it out of every
// customer-facing listing, and it is not accepting orders.
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
      isActive: true,
      isDemo: true,
      isAcceptingOrders: false,
    },
    $unset: { zoneId: '' },
  },
  { new: true, upsert: true, setDefaultsOnInsert: true },
);
summarise('restaurant', restaurant, `${restaurant.name} | active=${restaurant.isActive} | demo=${restaurant.isDemo} | accepting=${restaurant.isAcceptingOrders}`);

console.log('\nAll three demo accounts are approved and active.');
await mongoose.disconnect();

/**
 * Restore delivery partners who were wrongly demoted to "pending".
 *
 * submitDocuments used to reset every rider to status="pending" on document
 * resubmit, including riders an admin had already approved. That bug is fixed,
 * but riders demoted before the fix still carry "pending" in the database and
 * keep seeing the "Verification Done in 24 Hours" banner.
 *
 * A rider is treated as previously-approved when they carry verifiedBy/verifiedAt,
 * which only approveDeliveryPartner ever sets. A genuinely new signup never has it,
 * so real pending applicants are left untouched.
 *
 * Dry run (default, changes nothing):  node scripts/restore-demoted-riders.js
 * Apply the fix:                       node scripts/restore-demoted-riders.js --apply
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import Delivery from '../modules/delivery/models/Delivery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');

// Previously approved by an admin, but sitting at "pending" today.
const DEMOTED_QUERY = {
  status: 'pending',
  $or: [{ verifiedBy: { $ne: null } }, { verifiedAt: { $ne: null } }]
};

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Run this from the backend directory so .env is picked up.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const affected = await Delivery.find(DEMOTED_QUERY)
    .select('deliveryId name phone status verifiedAt')
    .lean();

  if (affected.length === 0) {
    console.log('No demoted riders found. Nothing to restore.');
    console.log('If riders still report the verification banner, they were demoted by a path');
    console.log('that never set verifiedBy/verifiedAt - report that back before forcing anything.');
    return;
  }

  console.log(`Found ${affected.length} rider(s) previously approved but currently "pending":\n`);
  for (const rider of affected) {
    const approvedOn = rider.verifiedAt ? new Date(rider.verifiedAt).toISOString().slice(0, 10) : 'unknown';
    console.log(`  ${rider.deliveryId || rider._id}  ${rider.name || '(no name)'}  ${rider.phone || ''}  approved: ${approvedOn}`);
  }

  if (!APPLY) {
    console.log('\nDry run - nothing was changed.');
    console.log('Re-run with --apply to restore these riders to "approved".');
    return;
  }

  const result = await Delivery.updateMany(DEMOTED_QUERY, {
    $set: { status: 'approved', isActive: true }
  });

  console.log(`\nRestored ${result.modifiedCount} rider(s) to "approved".`);
  console.log('They can go online immediately; no app reinstall or re-login is needed.');
}

main()
  .catch((error) => {
    console.error(`Failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());

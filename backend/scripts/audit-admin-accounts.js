/**
 * Audit admin accounts for known-weak passwords committed to this repo.
 *
 * Three scripts historically created admins with passwords hardcoded in source:
 * injectAdminAditi.js ("123456", since deleted), createAdmin.js ("quick@#123") and
 * upsertAdminUser.js ("admin@#123"). Anyone with repo access has those passwords, so
 * any account still using one is effectively public.
 *
 * This tests every admin's password hash against that known list and reports matches.
 * It never prints a password hash and never touches accounts that pass.
 *
 * Audit (default, changes nothing):   node scripts/audit-admin-accounts.js
 * Deactivate the compromised ones:    node scripts/audit-admin-accounts.js --disable
 *
 * --disable sets isActive=false and bumps tokenVersion, which kills existing sessions
 * immediately. It deliberately does NOT delete: you may need the row to see what the
 * account touched. Create a replacement with a strong password first:
 *   ADMIN_PASSWORD='<strong>' node scripts/createAdmin.js
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import Admin from '../modules/admin/models/Admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

// Passwords that appeared in committed source. Add any others you find in history.
const LEAKED_PASSWORDS = ['123456', 'quick@#123', 'admin@#123'];

const DISABLE = process.argv.includes('--disable');

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Run this from the backend directory so .env is picked up.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const admins = await Admin.find({}).select('+password name email role isActive').lean();
  console.log(`Checking ${admins.length} admin account(s) against ${LEAKED_PASSWORDS.length} known-leaked password(s).\n`);

  const compromised = [];
  for (const admin of admins) {
    if (!admin.password) continue;
    for (const candidate of LEAKED_PASSWORDS) {
      if (await bcrypt.compare(candidate, admin.password)) {
        compromised.push(admin);
        console.log(`  COMPROMISED  ${admin.email}  role=${admin.role}  active=${admin.isActive !== false}`);
        break;
      }
    }
  }

  if (compromised.length === 0) {
    console.log('No admin is using a known-leaked password. Nothing to do.');
    return;
  }

  console.log(`\n${compromised.length} account(s) are using a password that is public in this repo.`);

  if (!DISABLE) {
    console.log('Audit only - nothing was changed.');
    console.log('Re-run with --disable to deactivate them and revoke their sessions.');
    return;
  }

  const result = await Admin.updateMany(
    { _id: { $in: compromised.map((a) => a._id) } },
    { $set: { isActive: false }, $inc: { tokenVersion: 1 } }
  );

  console.log(`\nDeactivated ${result.modifiedCount} account(s) and revoked their sessions.`);
  console.log('Make sure you still have a working super_admin before logging out.');
}

main()
  .catch((error) => {
    console.error(`Failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());

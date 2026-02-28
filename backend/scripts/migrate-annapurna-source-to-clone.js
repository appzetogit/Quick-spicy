import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import dotenv from 'dotenv';

import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';
import RestaurantCategory from '../modules/restaurant/models/RestaurantCategory.js';
import RestaurantWallet from '../modules/restaurant/models/RestaurantWallet.js';
import OutletTimings from '../modules/restaurant/models/OutletTimings.js';

dotenv.config();

const SOURCE_SLUG = 'annapurna-family-garden-restaurant';
const CLONE_SLUG = 'annapurna-family-garden-restaurant-clone-10069';

const backupDir = path.join(process.cwd(), 'scripts', 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const toObject = (doc) => JSON.parse(JSON.stringify(doc));

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing in environment');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const source = await Restaurant.findOne({ slug: SOURCE_SLUG }).session(session);
      const clone = await Restaurant.findOne({ slug: CLONE_SLUG }).session(session);

      if (!source) throw new Error(`Source restaurant not found: ${SOURCE_SLUG}`);
      if (!clone) throw new Error(`Clone restaurant not found: ${CLONE_SLUG}`);

      const sourceId = source._id;
      const cloneId = clone._id;

      const [sourceMenu, sourceCategories, sourceWallet, sourceTimings] = await Promise.all([
        Menu.findOne({ restaurant: sourceId }).session(session),
        RestaurantCategory.find({ restaurant: sourceId }).session(session),
        RestaurantWallet.findOne({ restaurantId: sourceId }).session(session),
        OutletTimings.findOne({ restaurant: sourceId }).session(session)
      ]);

      const backupPayload = {
        createdAt: new Date().toISOString(),
        source: toObject(source),
        clone: toObject(clone),
        refs: {
          menu: sourceMenu ? toObject(sourceMenu) : null,
          categories: sourceCategories.map(toObject),
          wallet: sourceWallet ? toObject(sourceWallet) : null,
          timings: sourceTimings ? toObject(sourceTimings) : null
        }
      };

      const backupPath = path.join(
        backupDir,
        `annapurna-source-to-clone-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.ejson`
      );
      fs.writeFileSync(backupPath, EJSON.stringify(backupPayload, null, 2));

      const sourceObj = source.toObject();
      const fieldsToCarry = {
        ...sourceObj,
        _id: cloneId,
        name: 'Annapurna Family Garden Restaurant Clone',
        slug: source.slug,
        restaurantId: source.restaurantId,
        email: source.email,
        phone: source.phone,
        ownerEmail: source.ownerEmail,
        ownerPhone: source.ownerPhone,
        primaryContactNumber: source.primaryContactNumber,
        createdAt: clone.createdAt,
        updatedAt: new Date(),
        __v: clone.__v
      };

      delete fieldsToCarry._id;
      delete fieldsToCarry.createdAt;
      delete fieldsToCarry.updatedAt;
      delete fieldsToCarry.__v;

      // Free unique identifiers from source before assigning them to clone.
      await Restaurant.deleteOne({ _id: sourceId }, { session });

      await Restaurant.findByIdAndUpdate(
        cloneId,
        {
          $set: {
            ...fieldsToCarry,
            name: 'Annapurna Family Garden Restaurant Clone',
            slug: source.slug,
            restaurantId: source.restaurantId,
            email: source.email,
            phone: source.phone,
            ownerEmail: source.ownerEmail,
            ownerPhone: source.ownerPhone,
            primaryContactNumber: source.primaryContactNumber
          }
        },
        { session }
      );

      await Menu.updateMany(
        { restaurant: sourceId },
        { $set: { restaurant: cloneId } },
        { session }
      );

      await RestaurantCategory.updateMany(
        { restaurant: sourceId },
        { $set: { restaurant: cloneId } },
        { session }
      );

      await RestaurantWallet.updateMany(
        { restaurantId: sourceId },
        { $set: { restaurantId: cloneId } },
        { session }
      );

      await OutletTimings.updateMany(
        { restaurant: sourceId },
        { $set: { restaurant: cloneId } },
        { session }
      );

      const verify = await Restaurant.findById(cloneId).session(session);
      if (!verify) {
        throw new Error('Clone restaurant missing after migration');
      }
      if (verify.slug !== SOURCE_SLUG || verify.phone !== source.phone) {
        throw new Error('Verification failed: clone did not receive source identifiers');
      }

      console.log(JSON.stringify({
        ok: true,
        backupPath,
        cloneId: String(cloneId),
        finalSlug: verify.slug,
        finalPhone: verify.phone,
        finalRestaurantId: verify.restaurantId,
        message: 'Migration completed: source removed, clone now owns source login and references.'
      }, null, 2));
    });
  } finally {
    await session.endSession();
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

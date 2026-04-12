import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

import Zone from "../modules/admin/models/Zone.js";
import Restaurant from "../modules/restaurant/models/Restaurant.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const mongoUri =
  process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

if (!mongoUri) {
  console.error("Missing MongoDB connection string in backend/.env");
  process.exit(1);
}

try {
  await mongoose.connect(mongoUri);

  const zones = await Zone.find({
    restaurantId: { $exists: true, $ne: null },
    isActive: true,
  })
    .select("_id name zoneName restaurantId")
    .lean();

  let updated = 0;
  let skipped = 0;

  for (const zone of zones) {
    const restaurantId = zone.restaurantId;
    if (!restaurantId) {
      skipped += 1;
      continue;
    }

    const result = await Restaurant.updateOne(
      { _id: restaurantId },
      {
        $set: {
          zoneId: zone._id,
          zoneName: zone.name || zone.zoneName || "",
        },
      },
    );

    if (result.matchedCount > 0) {
      updated += result.modifiedCount;
    } else {
      skipped += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        checkedZoneMappings: zones.length,
        updatedRestaurants: updated,
        skippedMappings: skipped,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

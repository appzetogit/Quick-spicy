import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { EJSON } from "bson";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, "..");

dotenv.config({ path: path.join(backendRoot, ".env") });

const { default: Restaurant } = await import("../modules/restaurant/models/Restaurant.js");
const { default: AuditLog } = await import("../modules/admin/models/AuditLog.js");

function getLatestBackupRestaurants() {
  const backupsRoot = path.join(__dirname, "backups");
  if (!fs.existsSync(backupsRoot)) {
    return null;
  }

  const backupDirs = fs
    .readdirSync(backupsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("mongodb-full-backup-"))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  for (const dirName of backupDirs) {
    const restaurantsPath = path.join(backupsRoot, dirName, "restaurants.ndjson");
    if (!fs.existsSync(restaurantsPath)) {
      continue;
    }

    const raw = fs.readFileSync(restaurantsPath, "utf8");
    const rows = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => EJSON.parse(line));

    return {
      backupDir: dirName,
      rows,
    };
  }

  return null;
}

function simplifyRestaurant(doc) {
  return {
    id: doc._id?.toString?.() || String(doc._id),
    restaurantId: doc.restaurantId || "",
    name: doc.name || "",
    slug: doc.slug || "",
    status: doc.status || "",
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing.");
  }

  await mongoose.connect(mongoUri);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    currentCount,
    latestUpdated,
    latestCreated,
    deleteAuditLogs,
    recentRestaurantAuditLogs,
    currentRestaurants,
  ] = await Promise.all([
    Restaurant.countDocuments(),
    Restaurant.find({})
      .sort({ updatedAt: -1 })
      .limit(15)
      .select("_id restaurantId name slug status isActive createdAt updatedAt")
      .lean(),
    Restaurant.find({})
      .sort({ createdAt: -1 })
      .limit(15)
      .select("_id restaurantId name slug status isActive createdAt updatedAt")
      .lean(),
    AuditLog.find({
      entityType: "restaurant",
      actionType: "delete",
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    AuditLog.find({
      entityType: "restaurant",
      createdAt: { $gte: sevenDaysAgo },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    Restaurant.find({})
      .select("_id restaurantId name slug status isActive createdAt updatedAt")
      .lean(),
  ]);

  const latestBackup = getLatestBackupRestaurants();

  let backupSummary = null;
  if (latestBackup) {
    const backupIds = new Set(
      latestBackup.rows.map((row) => row._id?.$oid || row._id?.toString?.() || String(row._id))
    );
    const liveIds = new Set(currentRestaurants.map((row) => row._id.toString()));

    const missingFromLive = latestBackup.rows
      .filter((row) => {
        const id = row._id?.$oid || row._id?.toString?.() || String(row._id);
        return !liveIds.has(id);
      })
      .map((row) => ({
        id: row._id?.$oid || String(row._id),
        restaurantId: row.restaurantId || "",
        name: row.name || "",
        slug: row.slug || "",
        status: row.status || "",
        isActive: row.isActive,
        createdAt: row.createdAt?.$date || row.createdAt || null,
        updatedAt: row.updatedAt?.$date || row.updatedAt || null,
      }));

    const newSinceBackup = currentRestaurants
      .filter((row) => !backupIds.has(row._id.toString()))
      .map(simplifyRestaurant);

    backupSummary = {
      backupDir: latestBackup.backupDir,
      backupRestaurantCount: latestBackup.rows.length,
      missingFromLive,
      newSinceBackup,
    };
  }

  const report = {
    checkedAt: now.toISOString(),
    currentRestaurantCount: currentCount,
    latestUpdatedRestaurants: latestUpdated.map(simplifyRestaurant),
    latestCreatedRestaurants: latestCreated.map(simplifyRestaurant),
    deleteAuditLogs,
    recentRestaurantAuditLogs,
    backupSummary,
  };

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[checkRestaurantDeletionTrail] Failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

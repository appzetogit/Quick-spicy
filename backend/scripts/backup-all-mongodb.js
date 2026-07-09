import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { EJSON } from "bson";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, "..");
const BACKUP_DIR_PREFIX = "mongodb-full-backup-";

dotenv.config({ path: path.join(backendRoot, ".env") });

function getBackupsRoot() {
  return path.join(__dirname, "backups");
}

function pruneOldBackups(backupsRoot, keepLatest) {
  if (!Number.isFinite(keepLatest) || keepLatest <= 0 || !fs.existsSync(backupsRoot)) {
    return [];
  }

  const backupDirs = fs
    .readdirSync(backupsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(BACKUP_DIR_PREFIX))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));

  const removed = [];
  for (const dirName of backupDirs.slice(keepLatest)) {
    const fullPath = path.join(backupsRoot, dirName);
    fs.rmSync(fullPath, { recursive: true, force: true });
    removed.push(fullPath);
  }

  return removed;
}

export async function runMongoBackup(options = {}) {
  const mongoUri = options.mongoUri || process.env.MONGODB_URI;
  const keepLatest = Number.parseInt(
    options.keepLatest ?? process.env.MONGODB_BACKUP_KEEP_LATEST ?? "0",
    10
  );
  const verbose = options.verbose === true || process.env.MONGODB_BACKUP_VERBOSE === "true";

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined in the backend .env file.");
  }

  const backupsRoot = getBackupsRoot();
  fs.mkdirSync(backupsRoot, { recursive: true });

  let connectedHere = false;

  try {
    if (mongoose.connection.readyState !== 1) {
      console.log("[Mongo Backup] Connecting to MongoDB...");
      await mongoose.connect(mongoUri);
      connectedHere = true;
      console.log("[Mongo Backup] Connected successfully.");
    } else {
      console.log("[Mongo Backup] Reusing existing MongoDB connection.");
    }

    const db = mongoose.connection.db;
    const dbName = mongoose.connection.name;
    const collections = await db.listCollections().toArray();
    collections.sort((a, b) => a.name.localeCompare(b.name));

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDirName = `${BACKUP_DIR_PREFIX}${timestamp}`;
    const backupDir = path.join(backupsRoot, backupDirName);
    fs.mkdirSync(backupDir, { recursive: true });

    console.log(`[Mongo Backup] Creating backup in: ${backupDir}`);

    const summary = {
      createdAt: new Date().toISOString(),
      databaseName: dbName,
      backupDir,
      collections: [],
    };

    for (const colInfo of collections) {
      const colName = colInfo.name;
      if (colName.startsWith("system.")) {
        continue;
      }

      if (verbose) {
        console.log(`[Mongo Backup] Exporting collection: ${colName}`);
      }
      const cursor = db.collection(colName).find({});
      const fileName = `${colName}.ndjson`;
      const filePath = path.join(backupDir, fileName);
      const writeStream = fs.createWriteStream(filePath, { encoding: "utf8" });
      let count = 0;

      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        writeStream.write(`${EJSON.stringify(doc)}\n`);
        count += 1;
      }

      await new Promise((resolve, reject) => {
        writeStream.end((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      summary.collections.push({
        name: colName,
        count,
        file: fileName,
      });

      if (verbose) {
        console.log(`[Mongo Backup] Saved ${count} documents to ${fileName}`);
      }
    }

    const removedBackups = pruneOldBackups(backupsRoot, keepLatest);
    summary.removedOldBackups = removedBackups;

    const summaryFilePath = path.join(backupDir, "backup-summary.json");
    fs.writeFileSync(summaryFilePath, JSON.stringify(summary, null, 2), "utf8");

    console.log("[Mongo Backup] Backup completed successfully.");
    console.log(`[Mongo Backup] Summary written to: ${summaryFilePath}`);
    if (removedBackups.length > 0) {
      console.log(`[Mongo Backup] Pruned ${removedBackups.length} old backup(s).`);
    }

    return {
      backupDir,
      summaryFilePath,
      collections: summary.collections.length,
      removedBackups,
    };
  } finally {
    if (connectedHere) {
      await mongoose.disconnect();
      console.log("[Mongo Backup] Disconnected from MongoDB.");
    }
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (invokedDirectly) {
  runMongoBackup().catch((error) => {
    console.error("[Mongo Backup] Backup failed:", error);
    process.exit(1);
  });
}

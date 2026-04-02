import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

import Restaurant from "../modules/restaurant/models/Restaurant.js";
import Menu from "../modules/restaurant/models/Menu.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const exportsDir = path.join(__dirname, "../exports");
const uploadsRoot = path.join(__dirname, "../uploads", "menu-images");
const backupFile = path.join(exportsDir, "menu-image-url-backup-before-local-migration.json");
const summaryFile = path.join(exportsDir, "menu-image-local-migration-summary.json");

const backendBaseUrl =
  (process.env.BACKEND_URL && process.env.BACKEND_URL.trim()) ||
  `http://localhost:${process.env.PORT || "5000"}`;

const toPosix = (value) => value.replace(/\\/g, "/");

const publicUrlFor = (restaurantSlug, fileName) =>
  `${backendBaseUrl.replace(/\/$/, "")}/uploads/menu-images/${restaurantSlug}/${encodeURIComponent(fileName)}`;

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const copyIfNeeded = (sourcePath, destPath) => {
  ensureDir(path.dirname(destPath));
  if (!fs.existsSync(destPath)) {
    fs.copyFileSync(sourcePath, destPath);
  }
};

const normalizeItemMedia = (item, nextUrl) => {
  item.image = nextUrl;
  item.images = nextUrl ? [nextUrl] : [];
  item.photoCount = nextUrl ? 1 : 0;
};

const snapshotMenu = (restaurant, menu) => {
  const snapshot = [];

  const capture = (sectionName, subsectionName, item) => {
    snapshot.push({
      restaurantId: String(restaurant._id),
      restaurantName: restaurant.name || "",
      restaurantSlug: restaurant.slug || "",
      section: sectionName || "",
      subsection: subsectionName || "",
      itemId: item.id || "",
      itemName: item.name || "",
      oldImage: item.image || "",
      oldImages: Array.isArray(item.images) ? item.images : [],
    });
  };

  for (const section of menu.sections || []) {
    for (const item of section.items || []) {
      capture(section.name, "", item);
    }
    for (const subsection of section.subsections || []) {
      for (const item of subsection.items || []) {
        capture(section.name, subsection.name, item);
      }
    }
  }

  return snapshot;
};

async function run() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing in backend/.env");
    }

    ensureDir(exportsDir);
    ensureDir(uploadsRoot);
    await mongoose.connect(process.env.MONGODB_URI);

    const restaurants = await Restaurant.find({}, "name slug").sort({ name: 1 }).lean();
    const backup = {
      generatedAt: new Date().toISOString(),
      backendBaseUrl,
      items: [],
    };
    const summary = {
      generatedAt: new Date().toISOString(),
      backendBaseUrl,
      processedRestaurants: 0,
      skippedRestaurants: 0,
      updatedItems: 0,
      unchangedItems: 0,
      failedCopies: 0,
      restaurants: [],
    };

    for (const restaurant of restaurants) {
      const slug = String(restaurant.slug || "").trim();
      if (!slug) {
        summary.skippedRestaurants += 1;
        summary.restaurants.push({
          restaurantId: String(restaurant._id),
          restaurantName: restaurant.name || "",
          slug: "",
          status: "skipped-missing-slug",
        });
        continue;
      }

      const manifestPath = path.join(exportsDir, `${slug}-menu-image-map.local.json`);
      if (!fs.existsSync(manifestPath)) {
        summary.skippedRestaurants += 1;
        summary.restaurants.push({
          restaurantId: String(restaurant._id),
          restaurantName: restaurant.name || "",
          slug,
          status: "skipped-missing-local-manifest",
        });
        continue;
      }

      const menu = await Menu.findOne({ restaurant: restaurant._id });
      if (!menu) {
        summary.skippedRestaurants += 1;
        summary.restaurants.push({
          restaurantId: String(restaurant._id),
          restaurantName: restaurant.name || "",
          slug,
          status: "skipped-no-menu",
        });
        continue;
      }

      backup.items.push(...snapshotMenu(restaurant, menu));

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const manifestItems = Array.isArray(manifest.items) ? manifest.items : [];
      const manifestByItemId = new Map(manifestItems.map((item) => [String(item.itemId || ""), item]));
      const restaurantUploadDir = path.join(uploadsRoot, slug);

      let restaurantUpdatedItems = 0;
      let restaurantUnchangedItems = 0;
      let restaurantFailedCopies = 0;

      const migrateItem = (item) => {
        const mapped = manifestByItemId.get(String(item.id || ""));
        if (!mapped || !mapped.localImage || !/^downloaded|reused$/i.test(String(mapped.downloadStatus || ""))) {
          restaurantUnchangedItems += 1;
          return;
        }

        const sourcePath = path.join(__dirname, "..", mapped.localImage);
        if (!fs.existsSync(sourcePath)) {
          restaurantFailedCopies += 1;
          restaurantUnchangedItems += 1;
          return;
        }

        const fileName = path.basename(sourcePath);
        const destPath = path.join(restaurantUploadDir, fileName);

        try {
          copyIfNeeded(sourcePath, destPath);
          const nextUrl = publicUrlFor(slug, fileName);
          if (item.image !== nextUrl || !Array.isArray(item.images) || item.images[0] !== nextUrl || item.images.length !== 1) {
            normalizeItemMedia(item, nextUrl);
            restaurantUpdatedItems += 1;
          } else {
            restaurantUnchangedItems += 1;
          }
        } catch {
          restaurantFailedCopies += 1;
          restaurantUnchangedItems += 1;
        }
      };

      for (const section of menu.sections || []) {
        for (const item of section.items || []) {
          migrateItem(item);
        }
        for (const subsection of section.subsections || []) {
          for (const item of subsection.items || []) {
            migrateItem(item);
          }
        }
      }

      menu.markModified("sections");
      await menu.save();

      summary.processedRestaurants += 1;
      summary.updatedItems += restaurantUpdatedItems;
      summary.unchangedItems += restaurantUnchangedItems;
      summary.failedCopies += restaurantFailedCopies;
      summary.restaurants.push({
        restaurantId: String(restaurant._id),
        restaurantName: restaurant.name || "",
        slug,
        status: "processed",
        updatedItems: restaurantUpdatedItems,
        unchangedItems: restaurantUnchangedItems,
        failedCopies: restaurantFailedCopies,
        uploadFolder: toPosix(path.relative(path.join(__dirname, ".."), restaurantUploadDir)),
      });

      console.log(`Migrated ${slug}: updated ${restaurantUpdatedItems}, unchanged ${restaurantUnchangedItems}, failed copies ${restaurantFailedCopies}`);
    }

    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), "utf8");
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), "utf8");

    console.log(`Wrote backup to ${backupFile}`);
    console.log(`Wrote migration summary to ${summaryFile}`);
  } catch (error) {
    console.error("Failed to migrate menu images to local storage:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
}

run();

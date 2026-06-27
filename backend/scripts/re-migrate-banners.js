import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

import HeroBanner from "../modules/heroBanner/models/HeroBanner.js";
import LandingPageCategory from "../modules/heroBanner/models/LandingPageCategory.js";
import LandingPageExploreMore from "../modules/heroBanner/models/LandingPageExploreMore.js";
import Under250Banner from "../modules/heroBanner/models/Under250Banner.js";
import LandingPageSettings from "../modules/heroBanner/models/LandingPageSettings.js";
import { storeImageFromFile } from "../shared/utils/imageStorage.js";

const backendRoot = path.join(__dirname, "..");
const manifestPath = path.join(backendRoot, "assets/cloudinary-export/manifest.json");

function extractCloudinaryPath(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const cleanUrl = value.split(/[?#]/)[0];
    const match = cleanUrl.match(/\/image\/upload\/(?:v\d+\/)?(.+)$/i);
    return match ? match[1].trim().toLowerCase() : "";
  } catch {
    return "";
  }
}

// Read Manifest
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const assetByPath = {};
for (const asset of manifest.assets || []) {
  if (asset.local_path) {
    const path1 = extractCloudinaryPath(asset.secure_url || asset.secureUrl);
    const path2 = extractCloudinaryPath(asset.url);
    const localPath = path.join(backendRoot, asset.local_path);

    if (path1) {
      assetByPath[path1] = localPath;
      const noExt = path1.substring(0, path1.lastIndexOf('.')) || path1;
      assetByPath[noExt] = localPath;
    }
    if (path2) {
      assetByPath[path2] = localPath;
      const noExt = path2.substring(0, path2.lastIndexOf('.')) || path2;
      assetByPath[noExt] = localPath;
    }
  }
}

function getCloudinaryPath(publicId) {
  if (!publicId) return "";
  // Cloudinary publicIds are like "appzeto/banners/..." or "foods/..."
  return publicId.toLowerCase().trim();
}

async function migrateDocument(doc, urlField, publicIdField, category) {
  const publicId = doc[publicIdField];
  if (!publicId) {
    console.log(`⚠️ Document ${doc._id} has no public ID field (${publicIdField}). Skipping.`);
    return;
  }

  const cleanPath = getCloudinaryPath(publicId);
  const localSourcePath = assetByPath[cleanPath];

  if (!localSourcePath || !fs.existsSync(localSourcePath)) {
    // Try without extension or with common sub-paths
    console.log(`⚠️ Manifest asset not found for public ID: ${publicId}. Checking backup lookup...`);
    return;
  }

  console.log(`Migrating public ID ${publicId} from local source ${localSourcePath}...`);
  const stored = await storeImageFromFile(localSourcePath, { category });
  doc[urlField] = stored.url;
  await doc.save();
  console.log(`✅ Updated ${doc._id} to ${stored.url}`);
}

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  console.log("Connecting to MongoDB:", mongoUri);
  await mongoose.connect(mongoUri);
  console.log("Connected!");

  // 1. HeroBanner
  console.log("Migrating HeroBanners...");
  const heroBanners = await HeroBanner.find({});
  for (const b of heroBanners) {
    await migrateDocument(b, "imageUrl", "cloudinaryPublicId", "banners");
  }

  // 2. LandingPageCategory
  console.log("Migrating LandingPageCategory...");
  const cats = await LandingPageCategory.find({});
  for (const c of cats) {
    await migrateDocument(c, "imageUrl", "cloudinaryPublicId", "banners");
  }

  // 3. LandingPageExploreMore
  console.log("Migrating LandingPageExploreMore...");
  const explores = await LandingPageExploreMore.find({});
  for (const e of explores) {
    await migrateDocument(e, "imageUrl", "cloudinaryPublicId", "banners");
  }

  // 4. Under250Banner
  console.log("Migrating Under250Banner...");
  const under250s = await Under250Banner.find({});
  for (const u of under250s) {
    await migrateDocument(u, "imageUrl", "cloudinaryPublicId", "banners");
  }

  // 5. LandingPageSettings
  console.log("Migrating LandingPageSettings...");
  const settings = await LandingPageSettings.getSettings();
  if (settings?.homePopup?.cloudinaryPublicId) {
    const publicId = settings.homePopup.cloudinaryPublicId;
    const cleanPath = getCloudinaryPath(publicId);
    const localSourcePath = assetByPath[cleanPath];
    if (localSourcePath && fs.existsSync(localSourcePath)) {
      const stored = await storeImageFromFile(localSourcePath, { category: "banners" });
      settings.homePopup.imageUrl = stored.url;
      settings.markModified("homePopup");
      await settings.save();
      console.log(`✅ Updated Home Popup to ${stored.url}`);
    }
  }

  console.log("All banner collections re-migrated successfully!");
  await mongoose.disconnect();
}

run().catch(console.error);

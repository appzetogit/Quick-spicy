import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

import Menu from "../modules/restaurant/models/Menu.js";
import Restaurant from "../modules/restaurant/models/Restaurant.js";
import User from "../modules/auth/models/User.js";
import HeroBanner from "../modules/heroBanner/models/HeroBanner.js";
import LandingPageCategory from "../modules/heroBanner/models/LandingPageCategory.js";
import LandingPageExploreMore from "../modules/heroBanner/models/LandingPageExploreMore.js";
import Under250Banner from "../modules/heroBanner/models/Under250Banner.js";
import LandingPageSettings from "../modules/heroBanner/models/LandingPageSettings.js";
import BusinessSettings from "../modules/admin/models/BusinessSettings.js";
import AdminCategoryManagement from "../modules/admin/models/AdminCategoryManagement.js";
import { storeImageFromFile } from "../shared/utils/imageStorage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const backendRoot = path.join(__dirname, "..");
const manifestPath =
  process.env.CLOUDINARY_EXPORT_MANIFEST ||
  path.join(backendRoot, "assets/cloudinary-export/manifest.json");
const summaryOutputPath =
  process.env.LOCAL_IMAGE_MIGRATION_SUMMARY ||
  path.join(backendRoot, "exports/cloudinary-to-local-storage-summary.json");

function isCloudinaryUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return /(^|\.)cloudinary\.com$/i.test(parsed.hostname) || /(^|\.)res\.cloudinary\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeUrl(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return String(value).trim();
  }
}

function cloneImageObjectWithUrl(value, url) {
  if (typeof value === "string") return url;
  if (value && typeof value === "object") {
    return {
      ...value,
      url,
      ...(Object.prototype.hasOwnProperty.call(value, "publicId")
        ? { publicId: `local:${new URL(url).pathname.replace(/^\/images\//, "")}` }
        : {}),
    };
  }
  return value;
}

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

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing");
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const assetByPath = new Map();
  for (const asset of Array.isArray(manifest.assets) ? manifest.assets : []) {
    const path1 = extractCloudinaryPath(asset.secureUrl);
    const path2 = extractCloudinaryPath(asset.url);
    if (path1) assetByPath.set(path1, asset);
    if (path2) assetByPath.set(path2, asset);
  }

  const migratedUrlCache = new Map();
  const summary = {
    startedAt: new Date().toISOString(),
    manifestPath,
    collections: {},
    totalUpdatedDocuments: 0,
    totalMigratedUrls: 0,
    totalMissingAssets: 0,
    missingAssets: [],
  };

  async function migrateSingleUrl(urlValue, category) {
    const normalized = normalizeUrl(urlValue);
    if (!isCloudinaryUrl(normalized)) return { url: urlValue, changed: false };
    if (migratedUrlCache.has(normalized)) {
      return { url: migratedUrlCache.get(normalized), changed: true };
    }

    const pathKey = extractCloudinaryPath(normalized);
    const asset = assetByPath.get(pathKey);
    if (!asset) {
      summary.totalMissingAssets += 1;
      summary.missingAssets.push(normalized);
      return { url: urlValue, changed: false, missing: true };
    }

    const sourcePath = path.resolve(backendRoot, asset.localPath);
    if (!fs.existsSync(sourcePath)) {
      summary.totalMissingAssets += 1;
      summary.missingAssets.push(normalized);
      return { url: urlValue, changed: false, missing: true };
    }

    const stored = await storeImageFromFile(sourcePath, { category });
    migratedUrlCache.set(normalized, stored.secure_url);
    summary.totalMigratedUrls += 1;
    return { url: stored.secure_url, publicId: stored.public_id, changed: true };
  }

  async function migrateStringField(doc, fieldName, category) {
    const current = doc[fieldName];
    if (typeof current !== "string" || !current.trim()) return false;
    const migrated = await migrateSingleUrl(current, category);
    if (migrated.changed) {
      doc[fieldName] = migrated.url;
      return true;
    }
    return false;
  }

  async function migrateImageObjectField(doc, fieldName, category) {
    const current = doc[fieldName];
    if (!current) return false;
    if (typeof current === "string") {
      const migrated = await migrateSingleUrl(current, category);
      if (migrated.changed) {
        doc[fieldName] = migrated.url;
        return true;
      }
      return false;
    }
    if (typeof current === "object") {
      const currentUrl = current.url || current.secure_url || "";
      const migrated = await migrateSingleUrl(currentUrl, category);
      if (migrated.changed) {
        current.url = migrated.url;
        if (Object.prototype.hasOwnProperty.call(current, "publicId")) {
          current.publicId = migrated.publicId;
        }
        return true;
      }
    }
    return false;
  }

  async function migrateImageArray(arrayValue, category) {
    if (!Array.isArray(arrayValue)) return { value: arrayValue, changed: false };
    let changed = false;
    const next = [];
    for (const item of arrayValue) {
      if (typeof item === "string") {
        const migrated = await migrateSingleUrl(item, category);
        next.push(migrated.url);
        if (migrated.changed) changed = true;
      } else if (item && typeof item === "object") {
        const currentUrl = item.url || item.secure_url || "";
        const migrated = await migrateSingleUrl(currentUrl, category);
        next.push(migrated.changed ? cloneImageObjectWithUrl(item, migrated.url) : item);
        if (migrated.changed) changed = true;
      } else {
        next.push(item);
      }
    }
    return { value: next, changed };
  }

  async function saveCollectionSummary(name, processed, updated) {
    summary.collections[name] = { processed, updated };
    summary.totalUpdatedDocuments += updated;
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const menus = await Menu.find({});
    let updatedMenus = 0;
    for (const menu of menus) {
      let changed = false;
      for (const section of menu.sections || []) {
        for (const item of section.items || []) {
          const migratedImage = await migrateSingleUrl(item.image, "menu");
          if (migratedImage.changed) {
            item.image = migratedImage.url;
            changed = true;
          }
          const migratedImages = await migrateImageArray(item.images, "menu");
          if (migratedImages.changed) {
            item.images = migratedImages.value;
            changed = true;
          }
        }
        for (const subsection of section.subsections || []) {
          for (const item of subsection.items || []) {
            const migratedImage = await migrateSingleUrl(item.image, "menu");
            if (migratedImage.changed) {
              item.image = migratedImage.url;
              changed = true;
            }
            const migratedImages = await migrateImageArray(item.images, "menu");
            if (migratedImages.changed) {
              item.images = migratedImages.value;
              changed = true;
            }
          }
        }
      }
      if (changed) {
        menu.markModified("sections");
        await menu.save();
        updatedMenus += 1;
      }
    }
    await saveCollectionSummary("Menu", menus.length, updatedMenus);

    const restaurants = await Restaurant.find({});
    let updatedRestaurants = 0;
    for (const restaurant of restaurants) {
      let changed = false;
      changed = (await migrateImageObjectField(restaurant, "profileImage", "restaurants")) || changed;
      const migratedMenuImages = await migrateImageArray(restaurant.menuImages, "restaurants");
      if (migratedMenuImages.changed) {
        restaurant.menuImages = migratedMenuImages.value;
        changed = true;
      }
      if (restaurant.onboarding?.step2) {
        const step2 = restaurant.onboarding.step2;
        if (typeof step2.profileImageUrl === "string") {
          const migrated = await migrateSingleUrl(step2.profileImageUrl, "restaurants");
          if (migrated.changed) {
            step2.profileImageUrl = migrated.url;
            changed = true;
          }
        } else if (step2.profileImageUrl && typeof step2.profileImageUrl === "object") {
          const currentUrl = step2.profileImageUrl.url || "";
          const migrated = await migrateSingleUrl(currentUrl, "restaurants");
          if (migrated.changed) {
            step2.profileImageUrl.url = migrated.url;
            if (Object.prototype.hasOwnProperty.call(step2.profileImageUrl, "publicId")) {
              step2.profileImageUrl.publicId = migrated.publicId;
            }
            changed = true;
          }
        }
        const migratedOnboardingMenuImages = await migrateImageArray(step2.menuImageUrls, "restaurants");
        if (migratedOnboardingMenuImages.changed) {
          step2.menuImageUrls = migratedOnboardingMenuImages.value;
          changed = true;
        }
      }
      if (changed) {
        restaurant.markModified("profileImage");
        restaurant.markModified("menuImages");
        restaurant.markModified("onboarding");
        await restaurant.save();
        updatedRestaurants += 1;
      }
    }
    await saveCollectionSummary("Restaurant", restaurants.length, updatedRestaurants);

    const users = await User.find({});
    let updatedUsers = 0;
    for (const user of users) {
      const changed = await migrateStringField(user, "profileImage", "users");
      if (changed) {
        await user.save();
        updatedUsers += 1;
      }
    }
    await saveCollectionSummary("User", users.length, updatedUsers);

    async function migrateSimpleImageCollection(name, Model, urlField, publicIdField, category) {
      const docs = await Model.find({});
      let updated = 0;
      for (const doc of docs) {
        const migrated = await migrateSingleUrl(doc[urlField], category);
        if (migrated.changed) {
          doc[urlField] = migrated.url;
          if (publicIdField && Object.prototype.hasOwnProperty.call(doc, publicIdField)) {
            doc[publicIdField] = migrated.publicId;
          }
          await doc.save();
          updated += 1;
        }
      }
      await saveCollectionSummary(name, docs.length, updated);
    }

    await migrateSimpleImageCollection("HeroBanner", HeroBanner, "imageUrl", "cloudinaryPublicId", "banners");
    await migrateSimpleImageCollection("LandingPageCategory", LandingPageCategory, "imageUrl", "cloudinaryPublicId", "banners");
    await migrateSimpleImageCollection("LandingPageExploreMore", LandingPageExploreMore, "imageUrl", "cloudinaryPublicId", "banners");
    await migrateSimpleImageCollection("Under250Banner", Under250Banner, "imageUrl", "cloudinaryPublicId", "banners");

    const landingSettings = await LandingPageSettings.getSettings();
    let landingSettingsUpdated = 0;
    if (landingSettings?.homePopup?.imageUrl) {
      const migrated = await migrateSingleUrl(landingSettings.homePopup.imageUrl, "banners");
      if (migrated.changed) {
        landingSettings.homePopup.imageUrl = migrated.url;
        landingSettings.homePopup.cloudinaryPublicId = migrated.publicId;
        landingSettings.markModified("homePopup");
        await landingSettings.save();
        landingSettingsUpdated = 1;
      }
    }
    await saveCollectionSummary("LandingPageSettings", 1, landingSettingsUpdated);

    const businessSettings = await BusinessSettings.getSettings();
    let businessUpdated = 0;
    let businessChanged = false;
    businessChanged = (await migrateImageObjectField(businessSettings, "logo", "logos")) || businessChanged;
    businessChanged = (await migrateImageObjectField(businessSettings, "favicon", "logos")) || businessChanged;
    if (businessChanged) {
      businessSettings.markModified("logo");
      businessSettings.markModified("favicon");
      await businessSettings.save();
      businessUpdated = 1;
    }
    await saveCollectionSummary("BusinessSettings", 1, businessUpdated);

    const categories = await AdminCategoryManagement.find({});
    let updatedCategories = 0;
    for (const category of categories) {
      const changed = await migrateStringField(category, "image", "banners");
      if (changed) {
        await category.save();
        updatedCategories += 1;
      }
    }
    await saveCollectionSummary("AdminCategoryManagement", categories.length, updatedCategories);

    summary.completedAt = new Date().toISOString();
    ensureDir(path.dirname(summaryOutputPath));
    fs.writeFileSync(summaryOutputPath, JSON.stringify(summary, null, 2), "utf8");
    console.log(`Migration summary written to ${summaryOutputPath}`);
    console.log(JSON.stringify(summary.collections, null, 2));
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`Cloudinary to local storage migration failed: ${error.message}`);
  process.exit(1);
});

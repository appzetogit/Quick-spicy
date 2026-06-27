import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, "..");

// Ensure dotenv is loaded immediately to avoid ES Module hoisting order-of-import issues
dotenv.config({ path: path.join(backendRoot, ".env") });

const provider = String(process.env.MEDIA_STORAGE_PROVIDER || "local")
  .trim()
  .toLowerCase();

const defaultStorageRoot = path.join(backendRoot, "images");

export const MEDIA_STORAGE_PROVIDER = provider;
export const MEDIA_STORAGE_ROOT = path.resolve(
  process.env.IMAGE_STORAGE_ROOT || defaultStorageRoot
);
export const MEDIA_BASE_URL = String(
  process.env.BASE_URL ||
    process.env.IMAGE_BASE_URL ||
    process.env.BACKEND_URL ||
    `http://localhost:${process.env.PORT || 5000}`
).replace(/\/$/, "");

export const IMAGE_CATEGORIES = {
  menu: { directory: "menu", width: 800, height: 800, fit: "cover", quality: 75 },
  restaurants: { directory: "restaurants", width: 1600, height: 900, fit: "cover", quality: 78 },
  users: { directory: "users", width: 500, height: 500, fit: "cover", quality: 78 },
  banners: { directory: "banners", width: 1600, height: 900, fit: "cover", quality: 76 },
  logos: { directory: "logos", width: 500, height: 500, fit: "inside", quality: 82 },
};

export function ensureMediaStorageDirs() {
  fs.mkdirSync(MEDIA_STORAGE_ROOT, { recursive: true });
  for (const config of Object.values(IMAGE_CATEGORIES)) {
    fs.mkdirSync(path.join(MEDIA_STORAGE_ROOT, config.directory), {
      recursive: true,
    });
  }
}

export function getCategoryConfig(category) {
  return IMAGE_CATEGORIES[category] || IMAGE_CATEGORIES.banners;
}

export function getImageUrlFromRelativePath(relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  return `${MEDIA_BASE_URL}/images/${normalized}`;
}

export function getRelativeImagePath(categoryDirectory, dateParts, fileName) {
  return path.posix.join(categoryDirectory, dateParts.year, dateParts.month, fileName);
}

export function getAbsoluteImagePath(relativePath) {
  return path.join(MEDIA_STORAGE_ROOT, String(relativePath || "").replace(/\//g, path.sep));
}

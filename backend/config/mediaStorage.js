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

function extractRequestBaseUrl(req) {
  if (!req || typeof req !== "object") return "";

  const forwardedProtoHeader = req.headers?.["x-forwarded-proto"];
  const forwardedHostHeader = req.headers?.["x-forwarded-host"];
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : String(forwardedProtoHeader || "")
        .split(",")[0]
        .trim();
  const forwardedHost = Array.isArray(forwardedHostHeader)
    ? forwardedHostHeader[0]
    : String(forwardedHostHeader || "")
        .split(",")[0]
        .trim();
  const host = forwardedHost || req.get?.("host") || req.headers?.host || "";
  const protocol = forwardedProto || req.protocol || "http";

  if (!host) return "";
  return `${protocol}://${host}`.replace(/\/$/, "");
}

function isLocalhostUrl(value) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(value || "").trim());
}

export function resolveMediaBaseUrl(req) {
  const requestBaseUrl = extractRequestBaseUrl(req);
  if (!requestBaseUrl) {
    return MEDIA_BASE_URL;
  }

  if (isLocalhostUrl(MEDIA_BASE_URL) && !isLocalhostUrl(requestBaseUrl)) {
    return requestBaseUrl;
  }

  return MEDIA_BASE_URL || requestBaseUrl;
}

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

export function getImageUrlFromRelativePath(relativePath, req) {
  const normalized = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  return `${resolveMediaBaseUrl(req)}/images/${normalized}`;
}

export function getRelativeImagePath(categoryDirectory, dateParts, fileName) {
  return path.posix.join(categoryDirectory, dateParts.year, dateParts.month, fileName);
}

export function getAbsoluteImagePath(relativePath) {
  return path.join(MEDIA_STORAGE_ROOT, String(relativePath || "").replace(/\//g, path.sep));
}

/**
 * Normalise a stored image URL so it always uses the current MEDIA_BASE_URL.
 *
 * Images saved to the DB may contain a stale host (e.g. http://localhost:5000)
 * if BASE_URL was misconfigured at upload time.  This helper extracts the
 * `/images/...` path portion and rebuilds the URL with the live base URL,
 * ensuring the image works regardless of what was stored.
 *
 * Non-local URLs (Cloudinary, S3, etc.) and falsy values are returned as-is.
 */
export function normalizeStoredImageUrl(storedUrl, req) {
  if (!storedUrl || typeof storedUrl !== "string") return storedUrl;

  const trimmed = storedUrl.trim();
  const baseUrl = resolveMediaBaseUrl(req);

  // Extract the /images/... path from any absolute URL that points to our images
  const match = trimmed.match(/\/images\/(.+)$/);
  if (match) {
    return `${baseUrl}/images/${match[1]}`;
  }

  // If it's already a relative path starting with images/
  if (/^images\//i.test(trimmed)) {
    return `${baseUrl}/${trimmed}`;
  }

  // Return as-is for external URLs (Cloudinary, S3, etc.)
  return trimmed;
}

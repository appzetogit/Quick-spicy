import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import sharp from "sharp";
import {
  ensureMediaStorageDirs,
  getAbsoluteImagePath,
  getCategoryConfig,
  getImageUrlFromRelativePath,
  getRelativeImagePath,
  MEDIA_BASE_URL,
  MEDIA_STORAGE_ROOT,
} from "../../config/mediaStorage.js";

const storage = multer.memoryStorage();
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

ensureMediaStorageDirs();

function sanitizeFolderSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/(^\/|\/$)/g, "");
}

export function resolveImageCategory(options = {}) {
  if (options.category && getCategoryConfig(options.category)) {
    return options.category;
  }

  const folder = sanitizeFolderSegment(options.folder || "");
  if (folder.includes("menu")) return "menu";
  if (folder.includes("logo") || folder.includes("favicon") || folder.includes("business")) return "logos";
  if (folder.includes("user")) return "users";
  if (folder.includes("banner") || folder.includes("landing") || folder.includes("category") || folder.includes("explore")) return "banners";
  if (folder.includes("restaurant") || folder.includes("staff")) return "restaurants";
  return "banners";
}

export function imageFileFilter(req, file, cb) {
  const mimeType = String(file?.mimetype || "").toLowerCase();
  if (ALLOWED_MIME_TYPES.has(mimeType)) {
    cb(null, true);
    return;
  }
  cb(new Error("Unsupported file type. Allowed types: jpg, jpeg, png, webp"));
}

export const uploadMiddleware = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

function getDateParts(now = new Date()) {
  return {
    year: String(now.getUTCFullYear()),
    month: String(now.getUTCMonth() + 1).padStart(2, "0"),
  };
}

async function ensureParentDir(filePath) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
}

async function transformToWebp(input, targetPath, config) {
  let pipeline = sharp(input, { failOn: "warning" }).rotate();

  if (config.width || config.height) {
    pipeline = pipeline.resize({
      width: config.width,
      height: config.height,
      fit: config.fit || "cover",
      withoutEnlargement: true,
      position: "centre",
    });
  }

  return pipeline
    .webp({ quality: config.quality || 78, effort: 4 })
    .toFile(targetPath);
}

export async function storeImageBuffer(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Invalid image buffer provided");
  }

  const category = resolveImageCategory(options);
  const config = getCategoryConfig(category);
  const dateParts = getDateParts();
  const fileName = `${crypto.randomUUID()}.webp`;
  const relativePath = getRelativeImagePath(config.directory, dateParts, fileName);
  const absolutePath = getAbsoluteImagePath(relativePath);

  await ensureParentDir(absolutePath);
  const result = await transformToWebp(buffer, absolutePath, config);
  const secureUrl = getImageUrlFromRelativePath(relativePath);

  return {
    public_id: `local:${relativePath}`,
    resource_type: "image",
    format: "webp",
    bytes: result.size,
    width: result.width,
    height: result.height,
    secure_url: secureUrl,
    url: secureUrl,
    version: Date.now(),
    provider: "local",
    localPath: absolutePath,
    relativePath,
    baseUrl: MEDIA_BASE_URL,
  };
}

export async function storeImageFromFile(sourcePath, options = {}) {
  const resolvedSourcePath = path.resolve(sourcePath);
  await fs.promises.access(resolvedSourcePath, fs.constants.R_OK);

  const category = resolveImageCategory(options);
  const config = getCategoryConfig(category);
  const dateParts = getDateParts(options.now instanceof Date ? options.now : new Date());

  let result;
  let relativePath;
  let absolutePath;
  let format = "webp";

  try {
    const fileName = `${crypto.randomUUID()}.webp`;
    relativePath = getRelativeImagePath(config.directory, dateParts, fileName);
    absolutePath = getAbsoluteImagePath(relativePath);
    await ensureParentDir(absolutePath);
    const trans = await transformToWebp(resolvedSourcePath, absolutePath, config);
    result = {
      size: trans.size,
      width: trans.width,
      height: trans.height,
    };
  } catch (error) {
    console.warn(`⚠️ Sharp transformation failed for ${sourcePath}, copying as-is. Error: ${error.message}`);
    const ext = path.extname(sourcePath).toLowerCase() || ".webp";
    format = ext.slice(1) || "webp";
    const fileName = `${crypto.randomUUID()}${ext}`;
    relativePath = getRelativeImagePath(config.directory, dateParts, fileName);
    absolutePath = getAbsoluteImagePath(relativePath);
    await ensureParentDir(absolutePath);
    await fs.promises.copyFile(resolvedSourcePath, absolutePath);
    const stats = await fs.promises.stat(absolutePath);
    result = {
      size: stats.size,
      width: config.width || 0,
      height: config.height || 0,
    };
  }

  const secureUrl = getImageUrlFromRelativePath(relativePath);

  return {
    public_id: `local:${relativePath}`,
    resource_type: "image",
    format,
    bytes: result.size,
    width: result.width,
    height: result.height,
    secure_url: secureUrl,
    url: secureUrl,
    version: Date.now(),
    provider: "local",
    localPath: absolutePath,
    relativePath,
    baseUrl: MEDIA_BASE_URL,
  };
}

function extractRelativePath(input) {
  if (!input) return "";
  if (String(input).startsWith("local:")) {
    return String(input).slice("local:".length).replace(/^\/+/, "");
  }
  try {
    const candidate = new URL(String(input));
    const match = candidate.pathname.match(/^\/images\/(.+)$/);
    return match ? match[1] : "";
  } catch {
    const match = String(input).match(/^\/images\/(.+)$/);
    return match ? match[1] : "";
  }
}

export async function deleteStoredImage(publicIdOrUrl) {
  const relativePath = extractRelativePath(publicIdOrUrl);
  if (!relativePath) {
    return { result: "not_found" };
  }

  const absolutePath = getAbsoluteImagePath(relativePath);
  const normalizedRoot = path.resolve(MEDIA_STORAGE_ROOT);
  const normalizedTarget = path.resolve(absolutePath);
  if (!normalizedTarget.startsWith(normalizedRoot)) {
    throw new Error("Refusing to delete image outside storage root");
  }

  try {
    await fs.promises.unlink(normalizedTarget);
    return { result: "ok" };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { result: "not_found" };
    }
    throw error;
  }
}

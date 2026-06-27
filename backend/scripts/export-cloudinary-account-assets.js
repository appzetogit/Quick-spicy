import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const EXPORT_ROOT = path.join(__dirname, "../assets/cloudinary-export");
const MANIFEST_FILE = path.join(EXPORT_ROOT, "manifest.json");
const SUMMARY_FILE = path.join(EXPORT_ROOT, "summary.json");

function clean(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function required(name) {
  const value = clean(process.env[name]);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeSegment(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\.+$/g, "")
    .trim() || "asset";
}

function getExtensionFromAsset(asset) {
  const publicIdExt = path.extname(String(asset.public_id || "")).toLowerCase();
  if (publicIdExt) {
    return publicIdExt;
  }

  const format = String(asset.format || "").trim().toLowerCase();
  if (format) {
    return `.${format}`;
  }

  try {
    const pathname = new URL(asset.secure_url || asset.url || "").pathname || "";
    const urlExt = path.extname(pathname).toLowerCase();
    if (urlExt) {
      return urlExt;
    }
  } catch {
    // Ignore URL parsing failures and fall back below.
  }

  return "";
}

function buildRelativeAssetPath(asset) {
  const ext = getExtensionFromAsset(asset);
  const publicId = String(asset.public_id || asset.asset_id || "asset");
  const resourceType = sanitizeSegment(asset.resource_type || "unknown");
  const deliveryType = sanitizeSegment(asset.type || "upload");
  const segments = publicId
    .split("/")
    .filter(Boolean)
    .map((segment, index, array) => {
      const isLeaf = index === array.length - 1;
      if (isLeaf && ext && segment.toLowerCase().endsWith(ext)) {
        return sanitizeSegment(segment.slice(0, -ext.length));
      }
      return sanitizeSegment(segment);
    });

  const fileName = `${segments.pop() || "asset"}${ext}`;
  return path.join(resourceType, deliveryType, ...segments, fileName);
}

function downloadToFile(urlValue, destinationPath, expectedBytes, redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = String(urlValue || "").startsWith("https:") ? https : http;

    client
      .get(urlValue, (response) => {
        const statusCode = response.statusCode || 0;

        if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
          response.resume();
          if (redirects >= 5) {
            reject(new Error(`Too many redirects for ${urlValue}`));
            return;
          }
          const nextUrl = new URL(response.headers.location, urlValue).toString();
          downloadToFile(nextUrl, destinationPath, expectedBytes, redirects + 1).then(resolve).catch(reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`HTTP ${statusCode} for ${urlValue}`));
          return;
        }

        ensureDir(path.dirname(destinationPath));
        const fileStream = fs.createWriteStream(destinationPath);

        response.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close(() => {
            try {
              const stats = fs.statSync(destinationPath);
              const headerLength = Number.parseInt(String(response.headers["content-length"] || ""), 10);

              if (Number.isFinite(headerLength) && headerLength > 0 && stats.size !== headerLength) {
                reject(
                  new Error(
                    `Downloaded size mismatch for ${urlValue}: expected header ${headerLength} bytes, got ${stats.size}`
                  )
                );
                return;
              }

              if (Number.isFinite(expectedBytes) && expectedBytes > 0 && stats.size !== expectedBytes) {
                reject(
                  new Error(
                    `Cloudinary byte mismatch for ${urlValue}: expected ${expectedBytes} bytes, got ${stats.size}`
                  )
                );
                return;
              }

              resolve({
                bytes: stats.size,
                contentType: response.headers["content-type"] || "",
              });
            } catch (error) {
              reject(error);
            }
          });
        });

        fileStream.on("error", (error) => {
          fs.unlink(destinationPath, () => reject(error));
        });
      })
      .on("error", reject);
  });
}

async function listResources(resourceType) {
  const resources = [];
  let nextCursor;

  do {
    const response = await cloudinary.api.resources({
      type: "upload",
      resource_type: resourceType,
      max_results: 500,
      next_cursor: nextCursor,
      direction: "asc",
      tags: true,
      context: true,
      metadata: true,
    });

    resources.push(...(response.resources || []));
    nextCursor = response.next_cursor;
  } while (nextCursor);

  return resources;
}

async function run() {
  const startedAt = new Date().toISOString();
  const cloudName = required("CLOUDINARY_CLOUD_NAME");
  const apiKey = required("CLOUDINARY_API_KEY");
  const apiSecret = required("CLOUDINARY_API_SECRET");

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  ensureDir(EXPORT_ROOT);

  console.log(`Exporting Cloudinary assets from "${cloudName}" into ${EXPORT_ROOT}`);

  const resourceTypes = ["image", "video", "raw"];
  const allResources = [];

  for (const resourceType of resourceTypes) {
    const resources = await listResources(resourceType);
    console.log(`Found ${resources.length} ${resourceType} assets`);
    allResources.push(...resources);
  }

  const manifest = {
    exportedAt: startedAt,
    cloudinary: {
      cloudName,
      resourceCount: allResources.length,
      resourceTypes,
    },
    outputRoot: path.relative(path.join(__dirname, ".."), EXPORT_ROOT).replace(/\\/g, "/"),
    assets: [],
  };

  const summary = {
    exportedAt: startedAt,
    completedAt: "",
    cloudName,
    totalResources: allResources.length,
    downloaded: 0,
    failed: 0,
    skippedExistingVerified: 0,
    byResourceType: {
      image: 0,
      video: 0,
      raw: 0,
    },
    failures: [],
  };

  for (const asset of allResources) {
    const relativeAssetPath = buildRelativeAssetPath(asset);
    const absoluteAssetPath = path.join(EXPORT_ROOT, relativeAssetPath);
    const relativePathForManifest = path
      .relative(path.join(__dirname, ".."), absoluteAssetPath)
      .replace(/\\/g, "/");

    const entry = {
      assetId: asset.asset_id || "",
      publicId: asset.public_id || "",
      displayName: asset.display_name || "",
      folder: asset.folder || "",
      filename: asset.filename || "",
      format: asset.format || "",
      version: asset.version || null,
      resourceType: asset.resource_type || "",
      deliveryType: asset.type || "",
      bytes: asset.bytes || 0,
      width: asset.width || null,
      height: asset.height || null,
      duration: asset.duration || null,
      pages: asset.pages || null,
      createdAt: asset.created_at || "",
      uploadedAt: asset.uploaded_at || "",
      tags: Array.isArray(asset.tags) ? asset.tags : [],
      context: asset.context || null,
      metadata: asset.metadata || null,
      accessMode: asset.access_mode || "",
      url: asset.url || "",
      secureUrl: asset.secure_url || "",
      localPath: relativePathForManifest,
      localBytes: 0,
      downloadStatus: "",
      contentType: "",
      cloudinaryResource: asset,
    };

    try {
      let verifiedExisting = false;

      if (fs.existsSync(absoluteAssetPath)) {
        const stats = fs.statSync(absoluteAssetPath);
        if (!asset.bytes || stats.size === asset.bytes) {
          verifiedExisting = true;
        }
      }

      if (verifiedExisting) {
        const stats = fs.statSync(absoluteAssetPath);
        entry.localBytes = stats.size;
        entry.downloadStatus = "verified-existing";
        summary.skippedExistingVerified += 1;
      } else {
        const downloaded = await downloadToFile(entry.secureUrl || entry.url, absoluteAssetPath, asset.bytes);
        entry.localBytes = downloaded.bytes;
        entry.contentType = downloaded.contentType;
        entry.downloadStatus = "downloaded";
        summary.downloaded += 1;
      }

      if (!entry.contentType && fs.existsSync(absoluteAssetPath)) {
        entry.contentType = "";
      }

      const typeKey = entry.resourceType || "raw";
      if (Object.prototype.hasOwnProperty.call(summary.byResourceType, typeKey)) {
        summary.byResourceType[typeKey] += 1;
      }
    } catch (error) {
      entry.downloadStatus = `failed: ${error.message}`;
      summary.failed += 1;
      summary.failures.push({
        assetId: entry.assetId,
        publicId: entry.publicId,
        resourceType: entry.resourceType,
        localPath: entry.localPath,
        message: error.message,
      });
      console.error(`Failed ${entry.publicId || entry.assetId}: ${error.message}`);
    }

    manifest.assets.push(entry);
  }

  summary.completedAt = new Date().toISOString();

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf8");
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), "utf8");

  console.log(`Wrote manifest to ${MANIFEST_FILE}`);
  console.log(`Wrote summary to ${SUMMARY_FILE}`);
  console.log(`Downloaded: ${summary.downloaded}`);
  console.log(`Verified existing: ${summary.skippedExistingVerified}`);
  console.log(`Failed: ${summary.failed}`);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(`Cloudinary account export failed: ${error.message}`);
  process.exit(1);
});

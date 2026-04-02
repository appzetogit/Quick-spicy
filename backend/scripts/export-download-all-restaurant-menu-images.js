import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

import Restaurant from "../modules/restaurant/models/Restaurant.js";
import Menu from "../modules/restaurant/models/Menu.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const exportsDir = path.join(__dirname, "../exports");
const summaryFile = path.join(exportsDir, "all-restaurants-menu-image-summary.json");

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const normalizeImages = (item = {}) => {
  const imageList = Array.isArray(item.images)
    ? item.images.filter((image) => typeof image === "string" && image.trim() !== "")
    : [];
  const primaryImage =
    (typeof item.image === "string" && item.image.trim() !== "" ? item.image.trim() : "") ||
    imageList[0] ||
    "";

  return {
    image: primaryImage,
    images: primaryImage
      ? [primaryImage, ...imageList.filter((image) => image !== primaryImage)]
      : imageList,
  };
};

const flattenMenuItems = (menu) => {
  const rows = [];

  for (const section of menu.sections || []) {
    for (const item of section.items || []) {
      const media = normalizeImages(item);
      rows.push({
        section: section.name || "",
        subsection: "",
        itemId: item.id || "",
        itemName: item.name || "",
        category: item.category || section.name || "",
        image: media.image,
        images: media.images,
      });
    }

    for (const subsection of section.subsections || []) {
      for (const item of subsection.items || []) {
        const media = normalizeImages(item);
        rows.push({
          section: section.name || "",
          subsection: subsection.name || "",
          itemId: item.id || "",
          itemName: item.name || "",
          category: item.category || subsection.name || section.name || "",
          image: media.image,
          images: media.images,
        });
      }
    }
  }

  return rows;
};

const getExtensionFromUrl = (urlValue) => {
  try {
    const pathname = new URL(urlValue).pathname || "";
    const ext = path.extname(pathname).toLowerCase();
    return ext || ".jpg";
  } catch {
    return ".jpg";
  }
};

const fetchToFile = (urlValue, filePath, redirects = 0) =>
  new Promise((resolve, reject) => {
    const client = urlValue.startsWith("https:") ? https : http;

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
          fetchToFile(nextUrl, filePath, redirects + 1).then(resolve).catch(reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`HTTP ${statusCode} for ${urlValue}`));
          return;
        }

        const fileStream = fs.createWriteStream(filePath);
        response.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close(() => resolve(filePath));
        });

        fileStream.on("error", (error) => {
          fs.unlink(filePath, () => reject(error));
        });
      })
      .on("error", reject);
  });

const downloadImagesForItems = async (slug, items) => {
  const downloadRoot = path.join(exportsDir, `${slug}-images`);
  const manifestFile = path.join(exportsDir, `${slug}-menu-image-map.local.json`);
  const downloadedByUrl = new Map();
  let successCount = 0;
  let failedCount = 0;

  ensureDir(downloadRoot);

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const imageUrl = String(item.image || "").trim();

    if (!imageUrl) {
      item.localImage = "";
      item.downloadStatus = "missing-url";
      failedCount += 1;
      continue;
    }

    if (downloadedByUrl.has(imageUrl)) {
      item.localImage = downloadedByUrl.get(imageUrl);
      item.downloadStatus = "reused";
      continue;
    }

    const ext = getExtensionFromUrl(imageUrl);
    const fileName = `${String(index + 1).padStart(3, "0")}-${slugify(item.itemName || item.itemId || "item")}${ext}`;
    const filePath = path.join(downloadRoot, fileName);

    try {
      await fetchToFile(imageUrl, filePath);
      const relativePath = path.relative(path.join(__dirname, ".."), filePath).replace(/\\/g, "/");
      downloadedByUrl.set(imageUrl, relativePath);
      item.localImage = relativePath;
      item.downloadStatus = "downloaded";
      successCount += 1;
    } catch (error) {
      item.localImage = "";
      item.downloadStatus = `failed: ${error.message}`;
      failedCount += 1;
    }
  }

  return {
    downloadRoot,
    manifestFile,
    uniqueRemoteImages: downloadedByUrl.size,
    downloadedCount: successCount,
    failedCount,
    items,
  };
};

async function run() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing in backend/.env");
    }

    ensureDir(exportsDir);
    await mongoose.connect(process.env.MONGODB_URI);

    const restaurants = await Restaurant.find({}, "name slug").sort({ name: 1 }).lean();
    const summary = {
      generatedAt: new Date().toISOString(),
      totalRestaurants: restaurants.length,
      processedRestaurants: 0,
      skippedRestaurants: 0,
      restaurantSummaries: [],
    };

    for (const restaurant of restaurants) {
      const slug = String(restaurant.slug || "").trim();
      if (!slug) {
        summary.skippedRestaurants += 1;
        summary.restaurantSummaries.push({
          restaurantId: String(restaurant._id),
          restaurantName: restaurant.name || "",
          slug: "",
          status: "skipped-missing-slug",
        });
        continue;
      }

      const menu = await Menu.findOne({ restaurant: restaurant._id }).lean();
      if (!menu) {
        summary.skippedRestaurants += 1;
        summary.restaurantSummaries.push({
          restaurantId: String(restaurant._id),
          restaurantName: restaurant.name || "",
          slug,
          status: "skipped-no-menu",
        });
        continue;
      }

      const items = flattenMenuItems(menu);
      const exportFile = path.join(exportsDir, `${slug}-menu-image-map.json`);

      const exported = {
        restaurant: {
          id: String(restaurant._id),
          slug,
          name: restaurant.name || "",
        },
        exportedAt: new Date().toISOString(),
        totalItems: items.length,
        items,
      };

      fs.writeFileSync(exportFile, JSON.stringify(exported, null, 2), "utf8");

      const downloadResult = await downloadImagesForItems(slug, items);
      const localManifest = {
        ...exported,
        downloadedAt: new Date().toISOString(),
        downloadFolder: path.relative(path.join(__dirname, ".."), downloadResult.downloadRoot).replace(/\\/g, "/"),
        uniqueRemoteImages: downloadResult.uniqueRemoteImages,
        downloadedCount: downloadResult.downloadedCount,
        failedCount: downloadResult.failedCount,
        items: downloadResult.items,
      };

      fs.writeFileSync(downloadResult.manifestFile, JSON.stringify(localManifest, null, 2), "utf8");

      summary.processedRestaurants += 1;
      summary.restaurantSummaries.push({
        restaurantId: String(restaurant._id),
        restaurantName: restaurant.name || "",
        slug,
        status: "processed",
        totalItems: items.length,
        exportFile: path.relative(path.join(__dirname, ".."), exportFile).replace(/\\/g, "/"),
        localManifestFile: path.relative(path.join(__dirname, ".."), downloadResult.manifestFile).replace(/\\/g, "/"),
        downloadFolder: path.relative(path.join(__dirname, ".."), downloadResult.downloadRoot).replace(/\\/g, "/"),
        uniqueRemoteImages: downloadResult.uniqueRemoteImages,
        downloadedCount: downloadResult.downloadedCount,
        failedCount: downloadResult.failedCount,
      });

      console.log(`Processed ${slug}: ${items.length} items, ${downloadResult.downloadedCount} downloads, ${downloadResult.failedCount} failures`);
    }

    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), "utf8");
    console.log(`Wrote summary to ${summaryFile}`);
  } catch (error) {
    console.error("Bulk export failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
}

run();

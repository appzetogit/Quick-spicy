import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const slug = process.argv[2] || "poojitha-family-restaurant";
const exportFile = path.join(__dirname, "../exports", `${slug}-menu-image-map.json`);
const downloadRoot = path.join(__dirname, "../exports", `${slug}-images`);
const manifestFile = path.join(__dirname, "../exports", `${slug}-menu-image-map.local.json`);

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
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

async function run() {
  try {
    if (!fs.existsSync(exportFile)) {
      throw new Error(`Export file not found: ${exportFile}`);
    }

    const exported = JSON.parse(fs.readFileSync(exportFile, "utf8"));
    const items = Array.isArray(exported.items) ? exported.items : [];

    ensureDir(downloadRoot);

    const downloadedByUrl = new Map();
    let successCount = 0;
    let failedCount = 0;

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

    const output = {
      ...exported,
      downloadedAt: new Date().toISOString(),
      downloadFolder: path.relative(path.join(__dirname, ".."), downloadRoot).replace(/\\/g, "/"),
      uniqueRemoteImages: downloadedByUrl.size,
      downloadedCount: successCount,
      failedCount,
      items,
    };

    fs.writeFileSync(manifestFile, JSON.stringify(output, null, 2), "utf8");

    console.log(`Downloaded ${successCount} unique images to ${downloadRoot}`);
    console.log(`Wrote local manifest to ${manifestFile}`);
    if (failedCount > 0) {
      console.log(`Failed entries: ${failedCount}`);
    }
  } catch (error) {
    console.error("Failed to download menu images:", error.message);
    process.exitCode = 1;
  }
}

run();

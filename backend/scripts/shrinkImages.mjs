// Run from backend/: node scripts/shrinkImages.mjs
//
// Resizes existing restaurant and banner images in place to the same ceilings new uploads
// now get (config/mediaStorage.js). Files were stored at up to 1600x900 while the largest
// surface rendering them is a ~400px card - on rural 4G that gap is the difference between
// cards appearing and blank white boxes.
//
// Every file is backed up to images_originals/<same path> before being touched, and files
// already within the ceiling are skipped, so re-running is safe and cheap.
import fs from "fs";
import path from "path";
import sharp from "sharp";

const JOBS = [
  { dir: "images/restaurants", width: 960, quality: 75 },
  { dir: "images/banners", width: 1280, quality: 74 },
];
const BACKUP_ROOT = "images_originals";

const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(webp|jpe?g|png)$/i.test(entry.name) ? [full] : [];
  });
};

let shrunk = 0, skipped = 0, failed = 0, bytesBefore = 0, bytesAfter = 0;

for (const job of JOBS) {
  for (const file of walk(job.dir)) {
    try {
      const meta = await sharp(file).metadata();
      if (!meta.width || meta.width <= job.width) { skipped++; continue; }

      const backupPath = path.join(BACKUP_ROOT, file);
      if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        fs.copyFileSync(file, backupPath);
      }

      const before = fs.statSync(file).size;
      const tmp = file + ".tmp";
      await sharp(file)
        .resize({ width: job.width, withoutEnlargement: true })
        .webp({ quality: job.quality, effort: 4 })
        .toFile(tmp);
      fs.renameSync(tmp, file);
      const after = fs.statSync(file).size;
      bytesBefore += before; bytesAfter += after; shrunk++;
    } catch (error) {
      failed++;
      console.error(`failed: ${file}: ${error.message}`);
    }
  }
}

console.log(`shrunk ${shrunk}, skipped ${skipped} (already small), failed ${failed}`);
if (shrunk) {
  console.log(`bytes: ${(bytesBefore / 1048576).toFixed(1)}MB -> ${(bytesAfter / 1048576).toFixed(1)}MB (${Math.round((1 - bytesAfter / bytesBefore) * 100)}% saved)`);
  console.log(`originals preserved under ${BACKUP_ROOT}/`);
}

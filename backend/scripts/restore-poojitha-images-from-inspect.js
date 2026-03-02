import fs from "fs";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import Restaurant from "../modules/restaurant/models/Restaurant.js";
import Menu from "../modules/restaurant/models/Menu.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const RESTAURANT_SLUG = "poojitha-family-restaurant";
const INSPECT_FILE = path.join(__dirname, "../menu_inspect.txt");

function buildImageMapFromInspect(filePath) {
  const raw = fs.readFileSync(filePath);
  const isUtf16LeBom = raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe;
  const content = isUtf16LeBom ? raw.toString("utf16le") : raw.toString("utf8");
  const lines = content.split(/\r?\n/);
  const map = new Map();

  for (const line of lines) {
    const match = line.match(/- Item:\s*(.+?)\s*\|\s*Current Image:\s*(.+)\s*$/);
    if (!match) continue;
    const name = match[1]?.trim();
    const image = match[2]?.trim();
    if (name && image) map.set(name, image);
  }

  return map;
}

async function run() {
  try {
    const imageMap = buildImageMapFromInspect(INSPECT_FILE);
    if (!imageMap.size) {
      throw new Error("No image mappings parsed from menu_inspect.txt");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const restaurant = await Restaurant.findOne({ slug: RESTAURANT_SLUG }).lean();
    if (!restaurant?._id) {
      console.log("Restaurant not found");
      process.exit(0);
    }

    const menu = await Menu.findOne({ restaurant: restaurant._id });
    if (!menu) {
      console.log("Menu not found");
      process.exit(0);
    }

    let total = 0;
    let updated = 0;
    let missing = 0;
    let removedBadUnsplash = 0;

    const patchItem = (item) => {
      total += 1;
      const mapped = imageMap.get(item.name);
      const oldImage = String(item.image || "");

      if (mapped) {
        if (oldImage !== mapped) {
          item.image = mapped;
          item.images = [mapped];
          updated += 1;
        } else if (!Array.isArray(item.images) || item.images[0] !== mapped) {
          item.images = [mapped];
          updated += 1;
        }
      } else {
        missing += 1;
      }

      if (oldImage.includes("source.unsplash.com")) {
        removedBadUnsplash += 1;
      }
    };

    menu.sections.forEach((section) => {
      section.items.forEach((item) => patchItem(item));
      section.subsections.forEach((subsection) => {
        subsection.items.forEach((item) => patchItem(item));
      });
    });

    menu.markModified("sections");
    await menu.save();

    console.log(`Items scanned: ${total}`);
    console.log(`Items updated: ${updated}`);
    console.log(`Mapped image missing count: ${missing}`);
    console.log(`Bad source.unsplash URLs replaced: ${removedBadUnsplash}`);
    process.exit(0);
  } catch (error) {
    console.error("Restore failed:", error);
    process.exit(1);
  }
}

run();

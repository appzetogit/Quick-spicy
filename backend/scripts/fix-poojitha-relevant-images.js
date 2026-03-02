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

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const buildRelevantImageUrl = (name, section, uniqueSeed) => {
  const query = [name, section, "indian food", "restaurant"]
    .filter(Boolean)
    .join(",");
  return `https://source.unsplash.com/800x600/?${encodeURIComponent(query)}&sig=${uniqueSeed}`;
};

async function run() {
  try {
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

    const allItems = [];
    menu.sections.forEach((section, sectionIndex) => {
      section.items.forEach((item, itemIndex) => {
        allItems.push({
          section,
          item,
          sectionName: section.name || "Menu",
          key: `${sectionIndex}-root-${itemIndex}`,
        });
      });
      section.subsections.forEach((subsection, subsectionIndex) => {
        subsection.items.forEach((item, itemIndex) => {
          allItems.push({
            section,
            item,
            sectionName: section.name || subsection.name || "Menu",
            key: `${sectionIndex}-${subsectionIndex}-${itemIndex}`,
          });
        });
      });
    });

    const seenImageUrls = new Set();
    let updated = 0;
    let replacedStatic = 0;
    let replacedDuplicate = 0;

    allItems.forEach(({ item, sectionName, key }, idx) => {
      const currentUrl = String(item.image || "").trim();
      const isStaticPath = currentUrl.startsWith("/food/");
      const isDuplicate = currentUrl && seenImageUrls.has(currentUrl);
      const shouldReplace = isStaticPath || isDuplicate || !currentUrl;

      if (shouldReplace) {
        const base = `${slugify(item.name)}-${slugify(sectionName)}-${key}`;
        const uniqueSeed = `${idx + 1}-${base}`;
        const nextUrl = buildRelevantImageUrl(item.name, sectionName, uniqueSeed);

        item.image = nextUrl;
        item.images = [nextUrl];
        updated += 1;
        if (isStaticPath) replacedStatic += 1;
        if (isDuplicate) replacedDuplicate += 1;
        seenImageUrls.add(nextUrl);
      } else {
        item.images = [currentUrl];
        seenImageUrls.add(currentUrl);
      }
    });

    menu.markModified("sections");
    await menu.save();

    console.log(`Updated items: ${updated}`);
    console.log(`Replaced static /food paths: ${replacedStatic}`);
    console.log(`Replaced duplicate URLs: ${replacedDuplicate}`);
    console.log(`Total menu items processed: ${allItems.length}`);
    process.exit(0);
  } catch (error) {
    console.error("Error fixing images:", error);
    process.exit(1);
  }
}

run();

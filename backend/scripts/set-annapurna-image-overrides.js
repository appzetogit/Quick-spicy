import mongoose from "mongoose";
import dotenv from "dotenv";

import Restaurant from "../modules/restaurant/models/Restaurant.js";
import Menu from "../modules/restaurant/models/Menu.js";

dotenv.config({ path: "./.env" });

const TARGET_SLUG = "annapurna-family-garden-restaurant";

const IMAGE_MAP = new Map([
  [
    "Chicken Lollipop (Special)",
    "https://upload.wikimedia.org/wikipedia/commons/a/a0/Chicken_lollipop_in_Goa.jpg",
  ],
  [
    "Chicken Manchuria",
    "https://upload.wikimedia.org/wikipedia/commons/9/9c/Chicken_Manchurian.JPG",
  ],
  [
    "Chicken Patel",
    "https://upload.wikimedia.org/wikipedia/commons/5/5d/Chicken_65_%28Dish%29.jpg",
  ],
  [
    "Tangdi Kebab (Half)",
    "https://upload.wikimedia.org/wikipedia/commons/d/d5/Chicken_Tangdi_Kebab.jpg",
  ],
  [
    "Murgh Malai Kebab",
    "https://upload.wikimedia.org/wikipedia/commons/3/31/Malai_chicken_tikka.JPG",
  ],
  [
    "Konaseema Kodi Vepudu",
    "https://upload.wikimedia.org/wikipedia/commons/a/a6/Fried_chicken_legs_in_the_display.jpg",
  ],
  [
    "Kottimeera Chicken",
    "https://upload.wikimedia.org/wikipedia/commons/e/e4/Indian_Curry_Chicken.jpg",
  ],
  [
    "Amalapuram Chicken Roast",
    "https://upload.wikimedia.org/wikipedia/commons/a/a5/Roast_chicken.jpg",
  ],
  [
    "Palnati Kodi Vepudu",
    "https://upload.wikimedia.org/wikipedia/commons/6/60/Fried_Chicken_%28Unsplash%29.jpg",
  ],
  [
    "Malabar Pepper Chicken",
    "https://upload.wikimedia.org/wikipedia/commons/4/4e/0015Garlic_Pepper_Marinated_Chicken_01.jpg",
  ],
]);

function applyToItems(items) {
  let count = 0;
  for (const item of items || []) {
    const next = IMAGE_MAP.get(String(item.name || ""));
    if (!next) continue;
    if (item.image === next) continue;

    item.image = next;
    item.images = [next];
    count += 1;
    console.log(`Updated: ${item.name}`);
  }
  return count;
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const restaurant = await Restaurant.findOne({ slug: TARGET_SLUG }).lean();
    if (!restaurant?._id) {
      console.log(`Restaurant not found: ${TARGET_SLUG}`);
      process.exit(0);
    }

    const menu = await Menu.findOne({ restaurant: restaurant._id });
    if (!menu) {
      console.log("Menu not found");
      process.exit(0);
    }

    let updated = 0;
    for (const section of menu.sections || []) {
      updated += applyToItems(section.items);
      for (const subsection of section.subsections || []) {
        updated += applyToItems(subsection.items);
      }
    }

    menu.markModified("sections");
    await menu.save();

    console.log(`Done. Total updated: ${updated}`);
    process.exit(0);
  } catch (error) {
    console.error("Override update failed:", error);
    process.exit(1);
  }
}

run();

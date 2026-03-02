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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeName = (value) =>
  String(value || "")
    .replace(/\bpoojitha\b/gi, "")
    .replace(/\bs\/p\b/gi, "")
    .replace(/\bsp\b/gi, "")
    .replace(/\bpanner\b/gi, "paneer")
    .replace(/\bfryd\b/gi, "fried")
    .replace(/\s+/g, " ")
    .trim();

const sectionFallbackQuery = (sectionName = "") => {
  const s = sectionName.toLowerCase();
  if (s.includes("chicken biryani")) return "chicken biryani indian food";
  if (s.includes("mutton biryani")) return "mutton biryani indian food";
  if (s.includes("fish biryani")) return "fish biryani indian food";
  if (s.includes("egg biryani")) return "egg biryani indian food";
  if (s.includes("prawns")) return "prawns fry indian food";
  if (s.includes("fish")) return "fish fry indian food";
  if (s.includes("mutton")) return "mutton curry indian food";
  if (s.includes("mushroom")) return "mushroom manchurian";
  if (s.includes("veg curr")) return "paneer curry indian food";
  if (s.includes("vegetable snacks")) return "gobi manchurian";
  if (s.includes("chicken snacks")) return "chicken starter indian food";
  if (s.includes("chicken non-veg curr")) return "chicken curry indian food";
  if (s.includes("tandoori") || s.includes("roti")) return "naan roti indian bread";
  return `${sectionName} indian food`;
};

async function fetchWikimediaImageUrl(query, avoid = new Set()) {
  const encoded = encodeURIComponent(query);
  const url =
    `https://commons.wikimedia.org/w/api.php` +
    `?action=query&format=json&origin=*` +
    `&generator=search&gsrnamespace=6&gsrsearch=${encoded}` +
    `&gsrlimit=10&prop=imageinfo&iiprop=url`;

  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  const pages = Object.values(data?.query?.pages || {});
  if (!pages.length) return null;

  for (const page of pages) {
    const candidate = page?.imageinfo?.[0]?.url;
    if (!candidate) continue;
    if (avoid.has(candidate)) continue;
    const lower = candidate.toLowerCase();
    if (!/\.(jpg|jpeg|png|webp)$/.test(lower)) continue;
    return candidate;
  }
  return null;
}

function getAllSectionItems(section) {
  const items = [];
  section.items.forEach((item) => items.push(item));
  section.subsections.forEach((subsection) => {
    subsection.items.forEach((item) => items.push(item));
  });
  return items;
}

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

    let updated = 0;
    let noMatch = 0;

    for (const section of menu.sections) {
      const sectionName = section.name || "Menu";
      const sectionItems = getAllSectionItems(section);

      const usedInSection = new Set();
      for (const item of sectionItems) {
        const current = String(item.image || "").trim();
        if (!current) continue;

        if (!usedInSection.has(current)) {
          usedInSection.add(current);
          continue;
        }

        const cleanName = normalizeName(item.name);
        const queries = [
          `${cleanName} indian food`,
          cleanName,
          sectionFallbackQuery(sectionName),
        ].filter(Boolean);

        let replacement = null;
        for (const q of queries) {
          replacement = await fetchWikimediaImageUrl(q, usedInSection);
          if (replacement) break;
          await sleep(150);
        }

        if (replacement) {
          item.image = replacement;
          item.images = [replacement];
          usedInSection.add(replacement);
          updated += 1;
        } else {
          noMatch += 1;
        }
      }
    }

    menu.markModified("sections");
    await menu.save();

    console.log(`Updated duplicate-in-category items: ${updated}`);
    console.log(`Could not find replacement for: ${noMatch}`);
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

run();

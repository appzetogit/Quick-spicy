import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import Restaurant from "../modules/restaurant/models/Restaurant.js";
import Menu from "../modules/restaurant/models/Menu.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const TARGET_SLUG = process.argv[2] || "kondapalli-r-f-c";

const POSITIVE_TERMS = [
  "food",
  "dish",
  "curry",
  "fried",
  "momo",
  "samosa",
  "spring roll",
  "roll",
  "frankie",
  "pizza",
  "burger",
  "sandwich",
  "shake",
  "ice cream",
  "brownie",
  "omelet",
  "omlet",
  "chicken",
  "paneer",
  "veg",
  "mutton",
  "fish",
  "mocktail",
  "manchuria",
  "noodles",
  "fries",
  "tikka",
  "paratha",
  "roti",
  "kulcha",
  "naan",
];

const NEGATIVE_TERMS = [
  "pdf",
  "building",
  "house",
  "street",
  "bridge",
  "temple",
  "church",
  "mosque",
  "airport",
  "stadium",
  "football",
  "cricket",
  "player",
  "portrait",
  "people",
  "person",
  "flower",
  "plant",
  "tree",
  "mountain",
  "lake",
  "river",
  "flag",
  "logo",
  "map",
  "diagram",
  "drawing",
  "painting",
  "wallpaper",
  "car",
  "bike",
  "train",
  "bus",
  "shop",
  "storefront",
  "cockpit",
  "actor",
  "movie",
  "idol",
  "temple",
  "snow",
  "beach",
  "city",
  "road",
  "school",
  "university",
  "history",
  "museum",
  "book",
  "magazine",
  "festival",
  "building",
];

const ITEM_OVERRIDES = {
  "Panner Momos":
    "https://upload.wikimedia.org/wikipedia/commons/2/2f/Paneer_momos.jpg",
  "Chicken Momos":
    "https://upload.wikimedia.org/wikipedia/commons/6/6f/Chicken_momos.jpg",
  "Mixed Veg Momos":
    "https://upload.wikimedia.org/wikipedia/commons/8/85/Vegetable_momos.jpg",
};

const STOP_TOKENS = new Set([
  "and",
  "with",
  "from",
  "the",
  "of",
  "special",
  "combo",
  "loaded",
  "premium",
  "double",
  "extra",
  "do",
  "pyaza",
  "n",
]);

const toSlugTokens = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const unique = (arr) => [...new Set(arr)];

function isLikelyFoodTitle(title, mustTerms = []) {
  const t = title.toLowerCase();
  if (NEGATIVE_TERMS.some((x) => t.includes(x))) return false;

  const hasPositive = POSITIVE_TERMS.some((x) => t.includes(x));
  const hasMust = mustTerms.length === 0 || mustTerms.some((x) => t.includes(x));
  return hasPositive || hasMust;
}

function isSuspiciousUrl(url) {
  const lower = decodeURIComponent(String(url || "").toLowerCase());
  if (!/\.(jpg|jpeg|png|webp)$/.test(lower)) return true;
  return NEGATIVE_TERMS.some((x) => lower.includes(x));
}

async function searchWikimediaImage(query, usedInSection, mustTerms = []) {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
    "&generator=search&gsrnamespace=6&gsrlimit=20&prop=imageinfo|info&iiprop=url" +
    `&gsrsearch=${encodeURIComponent(query)}`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = Object.values(data?.query?.pages || {});

  for (const page of pages) {
    const title = String(page?.title || "");
    const imageUrl = page?.imageinfo?.[0]?.url;
    if (!imageUrl) continue;
    const lower = imageUrl.toLowerCase();
    if (!/\.(jpg|jpeg|png|webp)$/.test(lower)) continue;
    if (usedInSection.has(imageUrl)) continue;
    if (!isLikelyFoodTitle(title, mustTerms)) continue;
    return imageUrl;
  }

  return null;
}

function flattenSectionItems(section) {
  return [
    ...section.items.map((item) => ({ item, sectionName: section.name || "" })),
    ...section.subsections.flatMap((sub) =>
      sub.items.map((item) => ({ item, sectionName: section.name || sub.name || "" }))
    ),
  ];
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const restaurant = await Restaurant.findOne({ slug: TARGET_SLUG }).lean();
    if (!restaurant?._id) {
      console.log(`Restaurant not found for slug: ${TARGET_SLUG}`);
      process.exit(0);
    }

    const menu = await Menu.findOne({ restaurant: restaurant._id });
    if (!menu) {
      console.log("Menu not found");
      process.exit(0);
    }

    let updated = 0;
    let unresolved = 0;

    for (const section of menu.sections) {
      const pairs = flattenSectionItems(section);
      if (pairs.length < 2) continue;

      const counts = new Map();
      for (const { item } of pairs) {
        const img = String(item.image || "");
        counts.set(img, (counts.get(img) || 0) + 1);
      }

      const duplicateUrls = [...counts.entries()]
        .filter(([url, count]) => url && count > 1)
        .map(([url]) => url);

      if (duplicateUrls.length === 0) continue;

      const usedInSection = new Set(pairs.map(({ item }) => String(item.image || "")));

      const sectionSeen = new Set();
      const replacementsQueue = [];

      for (const { item, sectionName } of pairs) {
        const currentUrl = String(item.image || "");
        const isDuplicateBeyondFirst = currentUrl && sectionSeen.has(currentUrl);
        const shouldReplace = isDuplicateBeyondFirst || isSuspiciousUrl(currentUrl);
        sectionSeen.add(currentUrl);
        if (shouldReplace) {
          replacementsQueue.push({ item, sectionName });
        }
      }

      for (const { item, sectionName } of replacementsQueue) {
          const itemName = String(item.name || "");

          if (ITEM_OVERRIDES[itemName] && !usedInSection.has(ITEM_OVERRIDES[itemName])) {
            const next = ITEM_OVERRIDES[itemName];
            item.image = next;
            item.images = [next];
            usedInSection.add(next);
            updated += 1;
            continue;
          }

          const itemTokens = toSlugTokens(itemName).filter(
            (x) => x.length > 2 && !STOP_TOKENS.has(x)
          );
          const sectionTokens = toSlugTokens(sectionName).filter(
            (x) => x.length > 2 && !STOP_TOKENS.has(x)
          );
          const mustTerms = unique([...itemTokens.slice(0, 3), ...sectionTokens.slice(0, 2)]);

          const queries = [
            `${itemName} food`,
            `${itemName} indian food`,
            `${itemName} dish`,
            `${sectionName} food`,
            `${sectionName} indian`,
          ].filter(Boolean);

          let replacement = null;
          for (const q of queries) {
            replacement = await searchWikimediaImage(q, usedInSection, mustTerms);
            if (replacement) break;
          }

          if (replacement) {
            item.image = replacement;
            item.images = [replacement];
            usedInSection.add(replacement);
            updated += 1;
        } else {
          unresolved += 1;
        }
      }
    }

    menu.markModified("sections");
    await menu.save();

    console.log(`Slug: ${TARGET_SLUG}`);
    console.log(`Updated duplicate items: ${updated}`);
    console.log(`Unresolved duplicate items: ${unresolved}`);
    process.exit(0);
  } catch (error) {
    console.error("Error fixing duplicate images:", error);
    process.exit(1);
  }
}

run();

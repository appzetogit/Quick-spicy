import mongoose from "mongoose";
import dotenv from "dotenv";

import Restaurant from "../modules/restaurant/models/Restaurant.js";
import Menu from "../modules/restaurant/models/Menu.js";

dotenv.config({ path: "./.env" });

const TARGET_SLUG = "annapurna-family-garden-restaurant";

const POSITIVE_TERMS = [
  "food",
  "dish",
  "chicken",
  "kebab",
  "tandoori",
  "fry",
  "roast",
  "pepper",
  "manchuria",
  "manchurian",
  "lollipop",
  "vepudu",
];

const NEGATIVE_TERMS = ["logo", "building", "restaurant", "poster", "person"];

const STOP_TOKENS = new Set([
  "special",
  "half",
  "full",
  "and",
  "with",
  "the",
  "of",
  "in",
]);

const toTokens = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((x) => !STOP_TOKENS.has(x));

const isImageUrl = (url) => /\.(jpg|jpeg|png|webp)$/i.test(String(url || ""));

function scoreCandidate(title, url, itemTokens) {
  const blob = `${String(title || "").toLowerCase()} ${String(url || "").toLowerCase()}`;
  let score = 0;

  for (const t of itemTokens) {
    if (blob.includes(t)) score += 3;
  }
  for (const t of POSITIVE_TERMS) {
    if (blob.includes(t)) score += 1;
  }
  for (const t of NEGATIVE_TERMS) {
    if (blob.includes(t)) score -= 4;
  }

  return score;
}

async function searchWikimediaImage(itemName, usedInSection) {
  const queries = [
    `${itemName} food`,
    `Indian ${itemName}`,
    `${itemName} dish`,
    `${itemName} recipe`,
  ];

  const itemTokens = toTokens(itemName).slice(0, 4);
  let best = null;

  for (const query of queries) {
    const apiUrl =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
      "&generator=search&gsrnamespace=6&gsrlimit=30&prop=imageinfo|info&iiprop=url" +
      `&gsrsearch=${encodeURIComponent(query)}`;

    const res = await fetch(apiUrl);
    if (!res.ok) continue;

    const data = await res.json();
    const pages = Object.values(data?.query?.pages || {});
    for (const page of pages) {
      const url = page?.imageinfo?.[0]?.url;
      if (!url || !isImageUrl(url)) continue;
      if (usedInSection.has(url)) continue;

      const score = scoreCandidate(page?.title || "", url, itemTokens);
      if (score < 2) continue;

      if (!best || score > best.score) {
        best = { url, score };
      }
    }

    if (best?.score >= 6) break;
  }

  return best?.url || null;
}

function getSectionItems(section) {
  return [
    ...(section.items || []),
    ...((section.subsections || []).flatMap((sub) => sub.items || [])),
  ];
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

    let updates = 0;

    for (const section of menu.sections) {
      const items = getSectionItems(section);
      if (items.length < 2) continue;

      const usedInSection = new Set(items.map((x) => String(x.image || "")).filter(Boolean));
      const seen = new Set();

      for (const item of items) {
        const current = String(item.image || "");
        if (!current) continue;

        if (!seen.has(current)) {
          seen.add(current);
          continue;
        }

        const replacement = await searchWikimediaImage(item.name, usedInSection);
        if (!replacement) continue;

        item.image = replacement;
        item.images = [replacement];
        usedInSection.add(replacement);
        updates += 1;
        console.log(`Updated ${section.name} -> ${item.name}`);
      }
    }

    menu.markModified("sections");
    await menu.save();

    console.log(`Done. Updated items: ${updates}`);
    process.exit(0);
  } catch (error) {
    console.error("Fix failed:", error);
    process.exit(1);
  }
}

run();

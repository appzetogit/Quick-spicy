import mongoose from "mongoose";
import dotenv from "dotenv";

import Restaurant from "../modules/restaurant/models/Restaurant.js";
import Menu from "../modules/restaurant/models/Menu.js";

dotenv.config({ path: "./.env" });

const slug = process.argv[2];

if (!slug) {
  console.error("Usage: node scripts/report-section-duplicates.js <restaurant-slug>");
  process.exit(1);
}

function flatten(section) {
  return [
    ...(section.items || []).map((item) => ({ item, container: section.name })),
    ...((section.subsections || []).flatMap((sub) =>
      (sub.items || []).map((item) => ({ item, container: sub.name || section.name }))
    )),
  ];
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const restaurant = await Restaurant.findOne({ slug }).lean();
  if (!restaurant?._id) {
    console.log(`Restaurant not found: ${slug}`);
    process.exit(0);
  }

  const menu = await Menu.findOne({ restaurant: restaurant._id }).lean();
  if (!menu) {
    console.log("Menu not found");
    process.exit(0);
  }

  let overage = 0;
  for (const section of menu.sections || []) {
    const rows = flatten(section);
    const map = new Map();
    for (const { item } of rows) {
      const url = String(item.image || "");
      if (!url) continue;
      if (!map.has(url)) map.set(url, []);
      map.get(url).push(item.name);
    }

    const duplicates = [...map.entries()].filter(([, names]) => names.length > 1);
    if (!duplicates.length) continue;

    console.log(`\nSECTION: ${section.name}`);
    for (const [url, names] of duplicates) {
      overage += names.length - 1;
      console.log(`- ${names.length}x ${url}`);
      console.log(`  items: ${names.join(" | ")}`);
    }
  }

  console.log(`\nRemaining duplicate-overage count: ${overage}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

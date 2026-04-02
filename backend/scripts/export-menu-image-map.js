import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

import Restaurant from "../modules/restaurant/models/Restaurant.js";
import Menu from "../modules/restaurant/models/Menu.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const slug = process.argv[2] || "poojitha-family-restaurant";
const outputDir = path.join(__dirname, "../exports");
const outputFile = path.join(outputDir, `${slug}-menu-image-map.json`);

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

async function run() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing in backend/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const restaurant = await Restaurant.findOne({ slug }).lean();
    if (!restaurant?._id) {
      throw new Error(`Restaurant not found for slug: ${slug}`);
    }

    const menu = await Menu.findOne({ restaurant: restaurant._id }).lean();
    if (!menu) {
      throw new Error(`Menu not found for restaurant slug: ${slug}`);
    }

    const items = flattenMenuItems(menu);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      outputFile,
      JSON.stringify(
        {
          restaurant: {
            id: String(restaurant._id),
            slug: restaurant.slug || "",
            name: restaurant.name || "",
          },
          exportedAt: new Date().toISOString(),
          totalItems: items.length,
          items,
        },
        null,
        2
      ),
      "utf8"
    );

    console.log(`Exported ${items.length} menu items to ${outputFile}`);
  } catch (error) {
    console.error("Failed to export menu image map:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
}

run();

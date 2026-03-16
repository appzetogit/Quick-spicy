import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const PRICE_INCREMENT = 20;

const TARGET_PATTERNS = [
  ['jvr'],
  ['anna', 'purna'],
  ['poojitha'],
  ['rams', 'pizza'],
  ['rma', 'pizza'],
  ['abhinaya'],
  ['best', 'bakes']
];

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesTarget(restaurant) {
  const haystack = `${normalize(restaurant?.name)} ${normalize(restaurant?.slug)}`;
  return TARGET_PATTERNS.some((tokens) => tokens.every((token) => haystack.includes(token)));
}

function updateItems(items) {
  let updated = 0;

  for (const item of items || []) {
    if (!item || typeof item.price !== 'number' || Number.isNaN(item.price)) {
      continue;
    }

    item.price += PRICE_INCREMENT;
    updated += 1;
  }

  return updated;
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const restaurants = await Restaurant.find({}, { name: 1, slug: 1 }).lean();
    const matchedRestaurants = restaurants.filter(matchesTarget);

    if (matchedRestaurants.length === 0) {
      console.log('No restaurants matched the provided names.');
      process.exit(0);
    }

    console.log('Matched restaurants:');
    matchedRestaurants.forEach((r) => console.log(`- ${r.name} (${r.slug})`));

    let totalUpdatedItems = 0;
    let updatedRestaurantCount = 0;

    for (const restaurant of matchedRestaurants) {
      const menu = await Menu.findOne({ restaurant: restaurant._id });

      if (!menu) {
        console.log(`No menu found for: ${restaurant.name}`);
        continue;
      }

      let restaurantUpdatedItems = 0;

      for (const section of menu.sections || []) {
        restaurantUpdatedItems += updateItems(section.items);

        for (const subsection of section.subsections || []) {
          restaurantUpdatedItems += updateItems(subsection.items);
        }
      }

      if (restaurantUpdatedItems > 0) {
        menu.markModified('sections');
        await menu.save();
        updatedRestaurantCount += 1;
        totalUpdatedItems += restaurantUpdatedItems;
      }

      console.log(`Updated ${restaurantUpdatedItems} item prices for: ${restaurant.name}`);
    }

    console.log('');
    console.log(`Done. Updated ${totalUpdatedItems} items across ${updatedRestaurantCount} restaurants by +${PRICE_INCREMENT}.`);
    process.exit(0);
  } catch (error) {
    console.error('Error updating prices:', error);
    process.exit(1);
  }
}

run();

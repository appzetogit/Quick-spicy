import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';

const EXTREME_UNIQUE_MAP = {
  'RR Chicken': 'https://images.pexels.com/photos/3926124/pexels-photo-3926124.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Hongkong Chicken': 'https://images.pexels.com/photos/616353/pexels-photo-616353.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Garlic Chicken': 'https://images.pexels.com/photos/1435895/pexels-photo-1435895.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Chilly Fish': 'https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg?auto=compress&cs=tinysrgb&w=800' // Separate from Ginger Fish
};

async function update() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const slug = 'poojitha-family-restaurant';
    const restaurant = await Restaurant.findOne({ slug });

    if (!restaurant) {
      console.log('Restaurant not found');
      process.exit(0);
    }

    const menu = await Menu.findOne({ restaurant: restaurant._id });
    if (!menu) {
      console.log('Menu not found');
      process.exit(0);
    }

    let updatedCount = 0;

    menu.sections.forEach(section => {
      section.items.forEach(item => {
        if (EXTREME_UNIQUE_MAP[item.name]) {
          item.image = EXTREME_UNIQUE_MAP[item.name];
          item.images = [EXTREME_UNIQUE_MAP[item.name]];
          updatedCount++;
        }
      });
      section.subsections.forEach(subsection => {
        subsection.items.forEach(item => {
          if (EXTREME_UNIQUE_MAP[item.name]) {
            item.image = EXTREME_UNIQUE_MAP[item.name];
            item.images = [EXTREME_UNIQUE_MAP[item.name]];
            updatedCount++;
          }
        });
      });
    });

    menu.markModified('sections');
    await menu.save();
    console.log(`EXTREME FIX: Resolved ${updatedCount} overlapping items.`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

update();

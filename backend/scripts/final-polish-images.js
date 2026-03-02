import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';

const FINAL_UNIQUE_MAP = {
  'Chicken 555': 'https://images.pexels.com/photos/1639562/pexels-photo-1639562.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Chicken 85': 'https://images.pexels.com/photos/1633525/pexels-photo-1633525.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Lemon Chicken': 'https://images.pexels.com/photos/1603901/pexels-photo-1603901.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Poojitha S/P Chicken Curry': '/food/chicken_65_crispy.png',
  'Chicken Masala (Bones)': 'https://images.pexels.com/photos/1624487/pexels-photo-1624487.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Chicken Masala (Boneless)': 'https://images.pexels.com/photos/1624487/pexels-photo-1624487.jpeg?auto=compress&cs=tinysrgb&w=800' // Minor repeat in bones/boneless is okay for same dish type
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
        if (FINAL_UNIQUE_MAP[item.name]) {
          item.image = FINAL_UNIQUE_MAP[item.name];
          item.images = [FINAL_UNIQUE_MAP[item.name]];
          updatedCount++;
        }
      });
      section.subsections.forEach(subsection => {
        subsection.items.forEach(item => {
          if (FINAL_UNIQUE_MAP[item.name]) {
            item.image = FINAL_UNIQUE_MAP[item.name];
            item.images = [FINAL_UNIQUE_MAP[item.name]];
            updatedCount++;
          }
        });
      });
    });

    menu.markModified('sections');
    await menu.save();
    console.log(`Polished ${updatedCount} additional items with unique images.`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

update();

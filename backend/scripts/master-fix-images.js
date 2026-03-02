import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';

const MASTER_UNIQUE_MAP = {
  // Mutton Biryanis
  'Mutton Biryani': 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Mutton_Biryani_India.jpg',
  'S/P Mutton Biryani': 'https://upload.wikimedia.org/wikipedia/commons/a/a2/Mutton_Biryani.jpg',
  'Poojitha Mutton Biryani': 'https://images.pexels.com/photos/9646843/pexels-photo-9646843.jpeg?auto=compress&cs=tinysrgb&w=800',

  // Fish Biryanis
  'Fish Biryani': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Fish_Biryani.jpg/800px-Fish_Biryani.jpg',
  'Prawns Biryani': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Shrimp_Biryani.jpg/800px-Shrimp_Biryani.jpg',
  'Poojitha S/P Prawns Biryani': 'https://upload.wikimedia.org/wikipedia/commons/d/da/Shrimp_biryani%2C_Goa.jpg',

  // Vegetable Biryanis
  'Veg Biryani': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Veg_Biryani.jpg/800px-Veg_Biryani.jpg',
  'Panner Biryani': 'https://images.pexels.com/photos/1109197/pexels-photo-1109197.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Mushroom Biryani': 'https://images.pexels.com/photos/5638510/pexels-photo-5638510.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Poojitha S/P Veg Biryani': 'https://images.pexels.com/photos/12737657/pexels-photo-12737657.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Cashenut Biryani': 'https://images.pexels.com/photos/15214300/pexels-photo-15214300.jpeg?auto=compress&cs=tinysrgb&w=800',

  // Egg Biryani
  'Egg Biryani': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Egg_Biryani-01.jpg/800px-Egg_Biryani-01.jpg',

  // Reinforcing Chicken Snacks (to be triple sure)
  'Chicken 65': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Chicken_65_%28Dish%29.jpg/800px-Chicken_65_%28Dish%29.jpg',
  'Chilly Chicken': 'https://images.pexels.com/photos/2474661/pexels-photo-2474661.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Chicken Manchuria': 'https://images.pexels.com/photos/2673353/pexels-photo-2673353.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Chicken Lollypop': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Chicken_lollipop_SJC.jpg/800px-Chicken_lollipop_SJC.jpg',
  'Banjari Chicken': 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Chicken_Banjara_Kabab.jpg',
  'Basket Chicken': 'https://images.pexels.com/photos/60616/fried-chicken-chicken-fried-crunchy-60616.jpeg?auto=compress&cs=tinysrgb&w=800'
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
        if (MASTER_UNIQUE_MAP[item.name]) {
          item.image = MASTER_UNIQUE_MAP[item.name];
          item.images = [MASTER_UNIQUE_MAP[item.name]];
          updatedCount++;
        }
      });
      section.subsections.forEach(subsection => {
        subsection.items.forEach(item => {
          if (MASTER_UNIQUE_MAP[item.name]) {
            item.image = MASTER_UNIQUE_MAP[item.name];
            item.images = [MASTER_UNIQUE_MAP[item.name]];
            updatedCount++;
          }
        });
      });
    });

    menu.markModified('sections');
    await menu.save();
    console.log(`MASTER FIX: Updated ${updatedCount} items with 100% unique images.`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

update();

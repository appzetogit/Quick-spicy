import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';

const UNIQUE_IMAGE_MAP = {
  // Chicken Biryanis (Already mostly unique, reinforcing)
  'Chicken Biryani': '/food/chicken_biryani_deluxe.png',
  'S/P Chicken Biryani': '/food/chicken_biryani_sp_1.png',
  'Poojitha S/P Biryani': '/food/chicken_biryani_sp_2.png',
  'Wings Biryani': '/food/wings_biryani_1.png',
  'Rambo Biryani': '/food/rambo_biryani_1.png',
  'Natu Kodi Biryani': '/food/natu_kodi_biryani_1.png',
  'Kamju Biryani': '/food/kamju_biryani_1.png',

  // Chicken Snacks (The repeating ones)
  'Chicken 65': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Chicken_65_%28Dish%29.jpg/800px-Chicken_65_%28Dish%29.jpg',
  'Chilly Chicken': 'https://images.pexels.com/photos/2474661/pexels-photo-2474661.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Chicken Manchuria': 'https://images.pexels.com/photos/2673353/pexels-photo-2673353.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Banjari Chicken': 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Chicken_Banjara_Kabab.jpg',
  'Basket Chicken': 'https://images.pexels.com/photos/60616/fried-chicken-chicken-fried-crunchy-60616.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Chicken Lollypop': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Chicken_lollipop_SJC.jpg/800px-Chicken_lollipop_SJC.jpg',
  'Garlic Chicken': 'https://images.pexels.com/photos/1059943/pexels-photo-1059943.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Ginger Chicken': 'https://res.cloudinary.com/dbubwu3lf/image/upload/v1772173860/appzeto/restaurant/menu-items/d8rloatzbww0gckjj5mz.jpg',
  'Lemon Chicken': '/food/chicken_65_crispy.png', // Fallback to a generated one
  'RR Chicken': 'https://images.pexels.com/photos/2338407/pexels-photo-2338407.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Hongkong Chicken': 'https://images.pexels.com/photos/2232433/pexels-photo-2232433.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Chicken Majestic': 'https://res.cloudinary.com/dbubwu3lf/image/upload/v1772211629/appzeto/restaurant/menu-items/bh36nuaexqnptl6hfmnm.jpg',

  // Vegetable Snacks
  'Gobi Manchuria': 'https://upload.wikimedia.org/wikipedia/commons/e/e3/Gobi_Manchurian.jpg',
  'Veg Manchuria': 'https://upload.wikimedia.org/wikipedia/commons/e/e0/Delicious_Gobi_Manchurian.jpg',
  'Panner 65': 'https://images.pexels.com/photos/9609835/pexels-photo-9609835.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Panner Manchuria': '/food/paneer_tikka_masala.png',
  
  // Mushroom
  'Mushroom Manchuria': '/food/mushroom_manchurian.png',
  'Chilly Mushroom': 'https://images.pexels.com/photos/2725744/pexels-photo-2725744.jpeg?auto=compress&cs=tinysrgb&w=800'
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
        if (UNIQUE_IMAGE_MAP[item.name]) {
          item.image = UNIQUE_IMAGE_MAP[item.name];
          item.images = [UNIQUE_IMAGE_MAP[item.name]];
          updatedCount++;
        }
      });
      section.subsections.forEach(subsection => {
        subsection.items.forEach(item => {
          if (UNIQUE_IMAGE_MAP[item.name]) {
            item.image = UNIQUE_IMAGE_MAP[item.name];
            item.images = [UNIQUE_IMAGE_MAP[item.name]];
            updatedCount++;
          }
        });
      });
    });

    menu.markModified('sections');
    await menu.save();
    console.log(`Updated ${updatedCount} items with unique images (including external URLs).`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

update();

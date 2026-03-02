import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';

const NEW_IMAGES = {
  'Chicken Biryani': '/food/chicken_biryani_deluxe.png',
  'S/P Chicken Biryani': '/food/chicken_biryani_deluxe.png',
  'Poojitha S/P Biryani': '/food/chicken_biryani_deluxe.png',
  'Mutton Biryani': '/food/mutton_biryani_royal.png',
  'S/P Mutton Biryani': '/food/mutton_biryani_royal.png',
  'Prawns Biryani': '/food/prawns_biryani_spicy.png',
  'Fish Biryani': '/food/fish_curry_kerala.png',
  'Chicken 65': '/food/chicken_65_crispy.png',
  'Panner Butter Masala': '/food/paneer_tikka_masala.png',
  'Veg Biryani': '/food/veg_biryani_aromatic.png',
  'Mushroom Manchuria': '/food/mushroom_manchurian.png',
  'Fish Curry': '/food/fish_curry_kerala.png',
  'Masala Kulcha': '/food/masala_kulcha.png',
  'Chicken Fried Rice': '/food/chicken_fried_rice.png'
};

const CATEGORY_MAPPING = {
  'Chicken Biryanis': '/food/chicken_biryani_deluxe.png',
  'Mutton Biryanis': '/food/mutton_biryani_royal.png',
  'Fish Biryanis': '/food/prawns_biryani_spicy.png',
  'Chicken Snacks': '/food/chicken_65_crispy.png',
  'Vegetable Snacks': '/food/paneer_tikka_masala.png',
  'Mushroom Snacks': '/food/mushroom_manchurian.png',
  'Veg Curries': '/food/paneer_tikka_masala.png',
  'Chicken Non-Veg Curries': '/food/chicken_65_crispy.png'
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
    const usedImages = new Set();

    const updateItem = (item, sectionName) => {
      let newImage = null;
      
      // Try exact name match first
      if (NEW_IMAGES[item.name]) {
        newImage = NEW_IMAGES[item.name];
      } else if (CATEGORY_MAPPING[sectionName]) {
        newImage = CATEGORY_MAPPING[sectionName];
      }

      if (newImage && item.image !== newImage) {
        item.image = newImage;
        item.images = [newImage];
        updatedCount++;
      }
    };

    menu.sections.forEach(section => {
      section.items.forEach(item => updateItem(item, section.name));
      section.subsections.forEach(subsection => {
        subsection.items.forEach(item => updateItem(item, section.name));
      });
    });

    menu.markModified('sections');
    await menu.save();
    console.log(`Updated ${updatedCount} items for Poojitha Family Restaurant.`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

update();

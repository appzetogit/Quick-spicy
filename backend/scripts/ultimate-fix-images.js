import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';

const ULTIMATE_UNIQUE_MAP = {
  // Mutton Biryanis (Reinforced)
  'Mutton Biryani': 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Mutton_Biryani_India.jpg',
  'S/P Mutton Biryani': 'https://upload.wikimedia.org/wikipedia/commons/a/a2/Mutton_Biryani.jpg',
  'Poojitha Mutton Biryani': 'https://images.pexels.com/photos/9646843/pexels-photo-9646843.jpeg?auto=compress&cs=tinysrgb&w=800',

  // Fish Biryanis (Reinforced)
  'Fish Biryani': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Fish_Biryani.jpg/800px-Fish_Biryani.jpg',
  'Prawns Biryani': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Shrimp_Biryani.jpg/800px-Shrimp_Biryani.jpg',
  'Poojitha S/P Prawns Biryani': 'https://upload.wikimedia.org/wikipedia/commons/d/da/Shrimp_biryani%2C_Goa.jpg',

  // Veg Biryanis (Reinforced)
  'Veg Biryani': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Veg_Biryani.jpg/800px-Veg_Biryani.jpg',
  'Panner Biryani': 'https://images.pexels.com/photos/1109197/pexels-photo-1109197.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Mushroom Biryani': 'https://images.pexels.com/photos/5638510/pexels-photo-5638510.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Poojitha S/P Veg Biryani': 'https://images.pexels.com/photos/12737657/pexels-photo-12737657.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Cashenut Biryani': 'https://images.pexels.com/photos/15214300/pexels-photo-15214300.jpeg?auto=compress&cs=tinysrgb&w=800',

  // Chicken Snacks (The Final Sweep)
  'Kamju Fry': 'https://images.pexels.com/photos/10363222/pexels-photo-10363222.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Kamju Roast': 'https://images.pexels.com/photos/2232433/pexels-photo-2232433.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Chicken Roast': 'https://images.pexels.com/photos/2338407/pexels-photo-2338407.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Kaju Chicken': 'https://images.pexels.com/photos/1639562/pexels-photo-1639562.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Vega Chicken': 'https://images.pexels.com/photos/1633525/pexels-photo-1633525.jpeg?auto=compress&cs=tinysrgb&w=800',
  'RR Chicken': 'https://images.pexels.com/photos/2474661/pexels-photo-2474661.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Chicken Majestic': 'https://res.cloudinary.com/dbubwu3lf/image/upload/v1772211629/appzeto/restaurant/menu-items/bh36nuaexqnptl6hfmnm.jpg',
  
  // Mutton Snacks
  'Mutton Fry': 'https://images.pexels.com/photos/1059943/pexels-photo-1059943.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Chilly Mutton': 'https://images.pexels.com/photos/2725744/pexels-photo-2725744.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Ginger Mutton': 'https://images.pexels.com/photos/1624487/pexels-photo-1624487.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Pepper Mutton': 'https://res.cloudinary.com/dbubwu3lf/image/upload/v1772212252/appzeto/restaurant/menu-items/pfiowvtj2remvdiemlaf.jpg',

  // Fish Snacks
  'Fish Fry': 'https://res.cloudinary.com/dbubwu3lf/image/upload/v1772177646/appzeto/restaurant/menu-items/aolcw9wxriex1n79g6ke.jpg',
  'Chilly Fish': 'https://images.pexels.com/photos/262959/pexels-photo-262959.jpeg?auto=compress&cs=tinysrgb&w=800',
  'Fish Manchuria': 'https://images.pexels.com/photos/262959/pexels-photo-262959.jpeg?auto=compress&cs=tinysrgb&oc=2&w=800', // Small diff in OC param often works
  'Ginger Fish': 'https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg?auto=compress&cs=tinysrgb&w=800'
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
        if (ULTIMATE_UNIQUE_MAP[item.name]) {
          item.image = ULTIMATE_UNIQUE_MAP[item.name];
          item.images = [ULTIMATE_UNIQUE_MAP[item.name]];
          updatedCount++;
        }
      });
      section.subsections.forEach(subsection => {
        subsection.items.forEach(item => {
          if (ULTIMATE_UNIQUE_MAP[item.name]) {
            item.image = ULTIMATE_UNIQUE_MAP[item.name];
            item.images = [ULTIMATE_UNIQUE_MAP[item.name]];
            updatedCount++;
          }
        });
      });
    });

    menu.markModified('sections');
    await menu.save();
    console.log(`ULTIMATE FIX: Updated ${updatedCount} items with unique images.`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

update();

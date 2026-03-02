import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';

async function inspect() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

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

    const items = [];
    menu.sections.forEach(section => {
      section.items.forEach(item => {
        items.push({ section: section.name, name: item.name, image: item.image, id: item.id });
      });
      section.subsections.forEach(subsection => {
        subsection.items.forEach(item => {
          items.push({ section: section.name, subsection: subsection.name, name: item.name, image: item.image, id: item.id });
        });
      });
    });

    fs.writeFileSync('menu_items.json', JSON.stringify(items, null, 2), 'utf8');
    console.log('Written to menu_items.json');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

inspect();

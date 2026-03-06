import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';
import RestaurantCategory from '../modules/restaurant/models/RestaurantCategory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const now = new Date();

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const makeItem = (idPrefix, name, price, extra = {}) => ({
  id: `${idPrefix}-${slugify(name)}`,
  name,
  nameArabic: '',
  image: '',
  category: extra.category || '',
  rating: 0,
  reviews: 0,
  price: Number(price),
  stock: 'Unlimited',
  discount: null,
  originalPrice: null,
  foodType: extra.foodType || 'Non-Veg',
  availabilityTimeStart: '12:01 AM',
  availabilityTimeEnd: '11:57 PM',
  description: extra.description || '',
  discountType: 'Percent',
  discountAmount: 0,
  isAvailable: true,
  isRecommended: false,
  variations: Array.isArray(extra.variations) ? extra.variations : [],
  tags: [],
  nutrition: [],
  allergies: [],
  photoCount: 0,
  subCategory: '',
  servesInfo: '',
  itemSize: '',
  itemSizeQuantity: '',
  itemSizeUnit: 'piece',
  gst: 0,
  images: [],
  preparationTime: '',
  approvalStatus: 'approved',
  rejectionReason: '',
  requestedAt: now,
  approvedAt: now,
  approvedBy: null,
  rejectedAt: null,
});

const makeVariation = (idPrefix, name, price) => ({
  id: `${idPrefix}-${slugify(name)}`,
  name,
  price: Number(price),
  stock: 'Unlimited',
});

const SECTION_NAMES = [
  'Chicken',
  'Garlic Breads',
  'Momos',
  'Appetizers',
  'Wraps',
  'Veg Pizza',
  'Veg Burgers',
  'Sandwich (Veg)',
  'Drinks',
  'Mocktails',
  'Milk Shakes',
  'Combos',
];

const buildSections = () => [
  {
    id: 'section-chicken',
    name: 'Chicken',
    items: [],
    subsections: [
      {
        id: 'subsection-fried-chicken',
        name: 'Fried Chicken',
        items: [
          makeItem('chicken-fried-2', 'Fried Chicken 2 pcs', 170, { category: 'Chicken', foodType: 'Non-Veg' }),
          makeItem('chicken-fried-5', 'Fried Chicken 5 pcs', 390, { category: 'Chicken', foodType: 'Non-Veg' }),
          makeItem('chicken-fried-9', 'Fried Chicken 9 pcs', 720, { category: 'Chicken', foodType: 'Non-Veg' }),
        ],
      },
      {
        id: 'subsection-grilled-chicken',
        name: 'Grilled Chicken',
        items: [
          makeItem('chicken-grilled-2', 'Grilled Chicken 2 pcs', 170, { category: 'Chicken', foodType: 'Non-Veg' }),
          makeItem('chicken-grilled-5', 'Grilled Chicken 5 pcs', 390, { category: 'Chicken', foodType: 'Non-Veg' }),
          makeItem('chicken-grilled-9', 'Grilled Chicken 9 pcs', 720, { category: 'Chicken', foodType: 'Non-Veg' }),
        ],
      },
      {
        id: 'subsection-chicken-lollipop',
        name: 'Chicken Lollipop',
        items: [
          makeItem('chicken-lollipop-fried-4', 'Fried Chicken Lollipop 4 pcs', 240, { category: 'Chicken', foodType: 'Non-Veg' }),
          makeItem('chicken-lollipop-fried-6', 'Fried Chicken Lollipop 6 pcs', 360, { category: 'Chicken', foodType: 'Non-Veg' }),
        ],
      },
      {
        id: 'subsection-chicken-wings',
        name: 'Chicken Wings',
        items: [
          makeItem('chicken-wings-4', 'Chicken Wings 4 pcs', 150, { category: 'Chicken', foodType: 'Non-Veg' }),
          makeItem('chicken-wings-6', 'Chicken Wings 6 pcs', 220, { category: 'Chicken', foodType: 'Non-Veg' }),
        ],
      },
    ],
    isEnabled: true,
    order: 0,
  },
  {
    id: 'section-garlic-breads',
    name: 'Garlic Breads',
    items: [],
    subsections: [
      {
        id: 'subsection-veg-garlic-breads',
        name: 'Veg Garlic Breads',
        items: [
          makeItem('garlic-veg-cheese-2', 'Garlic Bread With Cheese 2 pcs', 80, { category: 'Garlic Breads', foodType: 'Veg' }),
          makeItem('garlic-veg-cheese-4', 'Garlic Bread With Cheese 4 pcs', 150, { category: 'Garlic Breads', foodType: 'Veg' }),
          makeItem('garlic-veg-supreme-2', 'Garlic Bread Supreme 2 pcs', 90, { category: 'Garlic Breads', foodType: 'Veg' }),
          makeItem('garlic-veg-supreme-4', 'Garlic Bread Supreme 4 pcs', 160, { category: 'Garlic Breads', foodType: 'Veg' }),
        ],
      },
      {
        id: 'subsection-nonveg-garlic-breads',
        name: 'Non-Veg Garlic Breads',
        items: [
          makeItem('garlic-chicken-cheese-2', 'Chicken Garlic Bread With Cheese 2 pcs', 90, { category: 'Garlic Breads', foodType: 'Non-Veg' }),
          makeItem('garlic-chicken-cheese-4', 'Chicken Garlic Bread With Cheese 4 pcs', 160, { category: 'Garlic Breads', foodType: 'Non-Veg' }),
          makeItem('garlic-chicken-supreme-2', 'Chicken Garlic Bread Supreme 2 pcs', 100, { category: 'Garlic Breads', foodType: 'Non-Veg' }),
          makeItem('garlic-chicken-supreme-4', 'Chicken Garlic Bread Supreme 4 pcs', 170, { category: 'Garlic Breads', foodType: 'Non-Veg' }),
        ],
      },
    ],
    isEnabled: true,
    order: 1,
  },
  {
    id: 'section-momos',
    name: 'Momos',
    items: [
      makeItem('momos-veg-4', 'Veg Momos 4 pcs', 120, { category: 'Momos', foodType: 'Veg' }),
      makeItem('momos-veg-6', 'Veg Momos 6 pcs', 180, { category: 'Momos', foodType: 'Veg' }),
      makeItem('momos-chicken-4', 'Chicken Momos 4 pcs', 140, { category: 'Momos', foodType: 'Non-Veg' }),
      makeItem('momos-chicken-6', 'Chicken Momos 6 pcs', 210, { category: 'Momos', foodType: 'Non-Veg' }),
      makeItem('spring-rolls-4', 'Spring Rolls 4 pcs', 100, { category: 'Momos', foodType: 'Veg' }),
      makeItem('spring-rolls-6', 'Spring Rolls 6 pcs', 150, { category: 'Momos', foodType: 'Veg' }),
    ],
    subsections: [],
    isEnabled: true,
    order: 2,
  },
  {
    id: 'section-appetizers',
    name: 'Appetizers',
    items: [
      makeItem('app-french-fries', 'French Fries', 100, { category: 'Appetizers', foodType: 'Veg' }),
      makeItem('app-masala-fries', 'Masala French Fries', 110, { category: 'Appetizers', foodType: 'Veg' }),
      makeItem('app-cheese-fries', 'Cheese French Fries', 140, { category: 'Appetizers', foodType: 'Veg' }),
      makeItem('app-chilli-potato-balls', 'Chilli Potato Balls (8 pcs)', 110, { category: 'Appetizers', foodType: 'Veg' }),
      makeItem('app-veg-nuggets', 'Veg Nuggets', 120, { category: 'Appetizers', foodType: 'Veg' }),
      makeItem('app-paneer-popcorn', 'Paneer Popcorn (8 pcs)', 150, { category: 'Appetizers', foodType: 'Veg' }),
      makeItem('app-chicken-popcorn', 'Chicken Popcorn (8 pcs)', 170, { category: 'Appetizers', foodType: 'Non-Veg' }),
      makeItem('app-chicken-nuggets', 'Chicken Nuggets', 185, { category: 'Appetizers', foodType: 'Non-Veg' }),
    ],
    subsections: [],
    isEnabled: true,
    order: 3,
  },
  {
    id: 'section-wraps',
    name: 'Wraps',
    items: [
      makeItem('wrap-potato', 'Potato Wraps', 120, { category: 'Wraps', foodType: 'Veg' }),
      makeItem('wrap-paneer', 'Paneer Wraps', 150, { category: 'Wraps', foodType: 'Veg' }),
      makeItem('wrap-chicken', 'Chicken Wraps', 160, { category: 'Wraps', foodType: 'Non-Veg' }),
      makeItem('wrap-rams-special-chicken', "Ram's Special Chicken Wraps", 170, { category: 'Wraps', foodType: 'Non-Veg' }),
    ],
    subsections: [],
    isEnabled: true,
    order: 4,
  },
  {
    id: 'section-veg-pizza',
    name: 'Veg Pizza',
    items: [
      makeItem('pizza-margherita-small', 'Margherita Pizza Small', 100, { category: 'Veg Pizza', foodType: 'Veg' }),
      makeItem('pizza-margherita-large', 'Margherita Pizza Large', 150, { category: 'Veg Pizza', foodType: 'Veg' }),
      makeItem('pizza-classic-small', 'Classic Pizza Small', 130, { category: 'Veg Pizza', foodType: 'Veg', description: 'onion, tomato, capsicum' }),
      makeItem('pizza-classic-large', 'Classic Pizza Large', 180, { category: 'Veg Pizza', foodType: 'Veg', description: 'onion, tomato, capsicum' }),
      makeItem('pizza-spicy-paneer-small', 'Spicy Paneer Pizza Small', 150, { category: 'Veg Pizza', foodType: 'Veg', description: 'green chilli, onion, tomato, capsicum' }),
      makeItem('pizza-spicy-paneer-large', 'Spicy Paneer Pizza Large', 210, { category: 'Veg Pizza', foodType: 'Veg', description: 'green chilli, onion, tomato, capsicum' }),
      makeItem('pizza-paneer-pepper-small', 'Paneer Pepper Pizza Small', 150, { category: 'Veg Pizza', foodType: 'Veg', description: 'paneer, onion, tomato, capsicum' }),
      makeItem('pizza-paneer-pepper-large', 'Paneer Pepper Pizza Large', 210, { category: 'Veg Pizza', foodType: 'Veg', description: 'paneer, onion, tomato, capsicum' }),
      makeItem('pizza-veg-corn-small', 'Veg Corn Pizza Small', 170, { category: 'Veg Pizza', foodType: 'Veg', description: 'corn, black olives, onion, tomato, capsicum' }),
      makeItem('pizza-veg-corn-large', 'Veg Corn Pizza Large', 230, { category: 'Veg Pizza', foodType: 'Veg', description: 'corn, black olives, onion, tomato, capsicum' }),
      makeItem('pizza-mushroom-corn-small', 'Mushroom Corn Pizza Small', 180, { category: 'Veg Pizza', foodType: 'Veg', description: 'mushroom, corn, onion, red paprika' }),
      makeItem('pizza-mushroom-corn-large', 'Mushroom Corn Pizza Large', 240, { category: 'Veg Pizza', foodType: 'Veg', description: 'mushroom, corn, onion, red paprika' }),
      makeItem('pizza-rams-special-small', "Ram's Special Pizza Small", 200, { category: 'Veg Pizza', foodType: 'Veg', description: 'onion, tomato, capsicum, jalapeno, mushroom, corn' }),
      makeItem('pizza-rams-special-large', "Ram's Special Pizza Large", 260, { category: 'Veg Pizza', foodType: 'Veg', description: 'onion, tomato, capsicum, jalapeno, mushroom, corn' }),
      makeItem('pizza-rams-double-cheese-burst-small', "Ram's Special Double Cheese Burst Pizza Small", 220, { category: 'Veg Pizza', foodType: 'Veg', description: 'cheese, corn, paprika, jalapeno' }),
      makeItem('pizza-rams-double-cheese-burst-large', "Ram's Special Double Cheese Burst Pizza Large", 280, { category: 'Veg Pizza', foodType: 'Veg', description: 'cheese, corn, paprika, jalapeno' }),
      makeItem('pizza-extra-cheese', 'Extra Cheese Topping', 30, {
        category: 'Veg Pizza',
        foodType: 'Veg',
      }),
    ],
    subsections: [],
    isEnabled: true,
    order: 5,
  },
  {
    id: 'section-veg-burgers',
    name: 'Veg Burgers',
    items: [
      makeItem('burger-veg-surprise', 'Veg Surprise Burger', 100, { category: 'Veg Burgers', foodType: 'Veg' }),
      makeItem('burger-cheese-veg', 'Cheese Veg Burger', 110, { category: 'Veg Burgers', foodType: 'Veg' }),
      makeItem('burger-crunchy-corn', 'Crunchy Corn Burger', 110, { category: 'Veg Burgers', foodType: 'Veg' }),
      makeItem('burger-chilli-lava', 'Chilli Lava Burger', 120, { category: 'Veg Burgers', foodType: 'Veg' }),
      makeItem('burger-rams-special', "Ram's Special Burger", 150, { category: 'Veg Burgers', foodType: 'Veg' }),
      makeItem('burger-premium-paneer', 'Premium Paneer Burger', 170, { category: 'Veg Burgers', foodType: 'Veg' }),
    ],
    subsections: [],
    isEnabled: true,
    order: 6,
  },
  {
    id: 'section-sandwich-veg',
    name: 'Sandwich (Veg)',
    items: [
      makeItem('sandwich-veg-grilled', 'Veg Grilled Sandwich', 100, { category: 'Sandwich (Veg)', foodType: 'Veg' }),
      makeItem('sandwich-paneer-tikka', 'Paneer Tikka Sandwich', 120, { category: 'Sandwich (Veg)', foodType: 'Veg' }),
      makeItem('sandwich-italian-veg', 'Italian Veg Sandwich', 140, { category: 'Sandwich (Veg)', foodType: 'Veg' }),
    ],
    subsections: [],
    isEnabled: true,
    order: 7,
  },
  {
    id: 'section-drinks',
    name: 'Drinks',
    items: [
      makeItem('drink-water-half-ltr', 'Water (1/2 Ltr)', 15, { category: 'Drinks', foodType: 'Veg' }),
      makeItem('drink-water-1-ltr', 'Water (1 Ltr)', 25, { category: 'Drinks', foodType: 'Veg' }),
      makeItem('drink-cool-drinks', 'Cool Drinks', 40, { category: 'Drinks', foodType: 'Veg' }),
    ],
    subsections: [],
    isEnabled: true,
    order: 8,
  },
  {
    id: 'section-mocktails',
    name: 'Mocktails',
    items: [
      makeItem('mocktail-mint-mojito', 'Mint Mojito', 100, { category: 'Mocktails', foodType: 'Veg' }),
      makeItem('mocktail-blue-curacao', 'Blue Curacao', 100, { category: 'Mocktails', foodType: 'Veg' }),
      makeItem('mocktail-green-apple', 'Green Apple', 100, { category: 'Mocktails', foodType: 'Veg' }),
      makeItem('mocktail-black-currant', 'Black Currant', 100, { category: 'Mocktails', foodType: 'Veg' }),
      makeItem('mocktail-blue-berry', 'Blue Berry', 100, { category: 'Mocktails', foodType: 'Veg' }),
      makeItem('mocktail-strawberry-blast', 'Strawberry Blast', 100, { category: 'Mocktails', foodType: 'Veg' }),
      makeItem('mocktail-mango', 'Mango', 100, { category: 'Mocktails', foodType: 'Veg' }),
      makeItem('mocktail-pine-apple', 'Pine Apple', 100, { category: 'Mocktails', foodType: 'Veg' }),
    ],
    subsections: [],
    isEnabled: true,
    order: 9,
  },
  {
    id: 'section-milk-shakes',
    name: 'Milk Shakes',
    items: [
      makeItem('shake-vanilla', 'Vanilla Milk Shake', 105, { category: 'Milk Shakes', foodType: 'Veg' }),
      makeItem('shake-chocolate', 'Chocolate Milk Shake', 120, { category: 'Milk Shakes', foodType: 'Veg' }),
      makeItem('shake-strawberry', 'Strawberry Milk Shake', 110, { category: 'Milk Shakes', foodType: 'Veg' }),
      makeItem('shake-oreo', 'Oreo Milk Shake', 130, { category: 'Milk Shakes', foodType: 'Veg' }),
      makeItem('shake-kitkat', 'Kitkat Milk Shake', 130, { category: 'Milk Shakes', foodType: 'Veg' }),
      makeItem('shake-butterscotch', 'Butterscotch Milk Shake', 120, { category: 'Milk Shakes', foodType: 'Veg' }),
      makeItem('shake-black-currant', 'Black Currant Milk Shake', 150, { category: 'Milk Shakes', foodType: 'Veg' }),
      makeItem('shake-american-nuts', 'American Nuts Milk Shake', 140, { category: 'Milk Shakes', foodType: 'Veg' }),
      makeItem('shake-cold-coffee', 'Cold Coffee', 110, { category: 'Milk Shakes', foodType: 'Veg' }),
    ],
    subsections: [],
    isEnabled: true,
    order: 10,
  },
  {
    id: 'section-combos',
    name: 'Combos',
    items: [
      makeItem('combo-veg-classic-fries-coke', 'Veg Classic Pizza (Small) + French Fries + Coke', 240, {
        category: 'Combos',
        foodType: 'Veg',
      }),
      makeItem('combo-chicken-classic-popcorn-coke', 'Chicken Classic Pizza (Small) + Chicken Popcorn + Coke', 330, {
        category: 'Combos',
        foodType: 'Non-Veg',
      }),
      makeItem('combo-veg-classic-nuggets-coke', 'Veg Classic Pizza (Small) + Veg Nuggets + Coke', 260, {
        category: 'Combos',
        foodType: 'Veg',
      }),
      makeItem('combo-chicken-classic-chicken-nuggets-coke', 'Chicken Classic Pizza (Small) + Chicken Nuggets + Coke', 350, {
        category: 'Combos',
        foodType: 'Non-Veg',
      }),
      makeItem('combo-veg-surprise-fries-coke', 'Veg Surprise Burger + French Fries + Coke', 210, {
        category: 'Combos',
        foodType: 'Veg',
      }),
      makeItem('combo-veg-surprise-veg-nuggets-coke', 'Veg Surprise Burger + Veg Nuggets + Coke', 240, {
        category: 'Combos',
        foodType: 'Veg',
      }),
      makeItem('combo-cheese-corn-paneer-balls-coke', 'Cheese Corn Burger + Paneer Balls + Coke', 280, {
        category: 'Combos',
        foodType: 'Veg',
      }),
      makeItem('combo-fried-chicken-burger-popcorn-coke', 'Fried Chicken Burger + Chicken Pop Corn + Coke', 270, {
        category: 'Combos',
        foodType: 'Non-Veg',
      }),
    ],
    subsections: [],
    isEnabled: true,
    order: 11,
  },
];

const countItemsInSection = (section) => {
  const direct = Array.isArray(section.items) ? section.items.length : 0;
  const nested = Array.isArray(section.subsections)
    ? section.subsections.reduce(
        (sum, subsection) => sum + (Array.isArray(subsection.items) ? subsection.items.length : 0),
        0
      )
    : 0;
  return direct + nested;
};

const upsertRestaurantCategories = async (restaurantMongoId, sections) => {
  await RestaurantCategory.deleteMany({
    restaurant: restaurantMongoId,
    name: { $in: SECTION_NAMES },
  });

  const categoryDocs = sections.map((section, index) => ({
    restaurant: restaurantMongoId,
    name: section.name,
    description: '',
    order: index,
    isActive: true,
    itemCount: countItemsInSection(section),
    icon: '',
    color: '#000000',
  }));

  await RestaurantCategory.insertMany(categoryDocs, { ordered: false });
};

async function run() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not set in backend/.env');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const restaurant = await Restaurant.findOne({
      $or: [
        { restaurantId: 'REST000063' },
        { restaurantId: /-63$/ },
        { name: "RMA'S PIZZA" },
      ],
    });
    if (!restaurant) {
      throw new Error("Restaurant not found (looked for REST000063 / suffix -63 / RMA'S PIZZA)");
    }

    const sections = buildSections();

    await Menu.findOneAndUpdate(
      { restaurant: restaurant._id },
      {
        $set: {
          restaurant: restaurant._id,
          sections,
          addons: [],
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await upsertRestaurantCategories(restaurant._id, sections);

    const totalItems = sections.reduce((sum, section) => sum + countItemsInSection(section), 0);
    console.log(`Seeded menu for ${restaurant.name} (${restaurant.restaurantId})`);
    console.log(`Sections: ${sections.length}`);
    console.log(`Items: ${totalItems}`);
    console.log('Images left empty as requested.');
  } catch (error) {
    console.error('Seeding failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();

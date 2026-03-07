import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import Restaurant from '../modules/restaurant/models/Restaurant.js';
import Menu from '../modules/restaurant/models/Menu.js';
import RestaurantCategory from '../modules/restaurant/models/RestaurantCategory.js';
import OutletTimings from '../modules/restaurant/models/OutletTimings.js';
import { normalizePhoneNumber } from '../shared/utils/phoneUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const now = new Date();
const rawPhone = '7223077890';
const phone = normalizePhoneNumber(rawPhone);
const restaurantName = 'Test Restaurant 7890';
const baseSlug = 'test-restaurant-7890';
const categoryName = 'Demo Food';
const sectionId = 'section-demo-food';
const itemId = 'item-demo-burger-7890';

const fullWeekTimings = [
  { day: 'Monday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
  { day: 'Tuesday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
  { day: 'Wednesday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
  { day: 'Thursday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
  { day: 'Friday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
  { day: 'Saturday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
  { day: 'Sunday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
];

const demoItem = {
  id: itemId,
  name: 'Demo Burger',
  nameArabic: '',
  image: '/food/chicken_fried_rice.png',
  category: categoryName,
  rating: 0,
  reviews: 0,
  price: 99,
  stock: 'Unlimited',
  discount: null,
  originalPrice: null,
  foodType: 'Veg',
  availabilityTimeStart: '12:01 AM',
  availabilityTimeEnd: '11:57 PM',
  description: 'Demo food item for test restaurant 7890',
  discountType: 'Percent',
  discountAmount: 0,
  isAvailable: true,
  isRecommended: true,
  variations: [],
  tags: ['demo', 'test'],
  nutrition: [],
  allergies: [],
  photoCount: 1,
  subCategory: '',
  servesInfo: 'Serves 1',
  itemSize: '',
  itemSizeQuantity: '',
  itemSizeUnit: 'piece',
  gst: 0,
  images: ['/food/chicken_fried_rice.png'],
  preparationTime: '10-15 min',
  approvalStatus: 'approved',
  rejectionReason: '',
  requestedAt: now,
  approvedAt: now,
  approvedBy: null,
  rejectedAt: null,
};

async function resolveSlug(existingRestaurantId = null) {
  const conflictingBase = await Restaurant.findOne({
    slug: baseSlug,
    ...(existingRestaurantId ? { _id: { $ne: existingRestaurantId } } : {}),
  }).lean();

  if (!conflictingBase) {
    return baseSlug;
  }

  return `${baseSlug}-${rawPhone.slice(-4)}`;
}

async function run() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not set in backend/.env');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const existingRestaurant = await Restaurant.findOne({
      $or: [
        { phone },
        { ownerPhone: phone },
        { primaryContactNumber: phone },
        { slug: baseSlug },
        { slug: `${baseSlug}-${rawPhone.slice(-4)}` },
      ],
    });

    const slug = await resolveSlug(existingRestaurant?._id || null);

    const restaurantPayload = {
      phone,
      phoneVerified: true,
      signupMethod: 'phone',
      ownerName: 'Test Owner 7890',
      ownerPhone: phone,
      name: restaurantName,
      slug,
      primaryContactNumber: phone,
      ownerEmail: `${rawPhone}@restaurant.appzeto.com`,
      cuisines: ['Fast Food', 'Demo'],
      location: {
        latitude: 16.5062,
        longitude: 80.648,
        coordinates: [80.648, 16.5062],
        formattedAddress: 'Test Address, Vijayawada',
        address: 'Test Address, Vijayawada',
        addressLine1: 'Test Address',
        area: 'Governorpet',
        city: 'Vijayawada',
        state: 'Andhra Pradesh',
        landmark: 'Demo Landmark',
        zipCode: '520002',
        pincode: '520002',
        postalCode: '520002',
        street: 'Test Street',
      },
      deliveryTimings: {
        openingTime: '09:00 AM',
        closingTime: '10:00 PM',
      },
      openDays: fullWeekTimings.map((entry) => entry.day),
      rating: 0,
      totalRatings: 0,
      isActive: true,
      isAcceptingOrders: true,
      estimatedDeliveryTime: '20-25 mins',
      distance: '1.0 km',
      priceRange: '$',
      featuredDish: demoItem.name,
      featuredPrice: demoItem.price,
      offer: 'Demo Offer',
      approvedAt: now,
      rejectedAt: null,
      rejectionReason: null,
      profileImage: {
        url: '',
        publicId: '',
      },
      menuImages: [],
      diningSettings: {
        isEnabled: false,
        maxGuests: 6,
        diningType: 'family-dining',
      },
      businessModel: 'Commission Base',
    };

    const restaurant = existingRestaurant
      ? await Restaurant.findByIdAndUpdate(existingRestaurant._id, { $set: restaurantPayload }, { new: true })
      : await Restaurant.create(restaurantPayload);

    const sections = [
      {
        id: sectionId,
        name: categoryName,
        items: [demoItem],
        subsections: [],
        isEnabled: true,
        order: 0,
      },
    ];

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

    await RestaurantCategory.findOneAndUpdate(
      { restaurant: restaurant._id, name: categoryName },
      {
        $set: {
          description: 'Demo category for test restaurant',
          order: 0,
          isActive: true,
          icon: '',
          color: '#000000',
          itemCount: 1,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await OutletTimings.findOneAndUpdate(
      { restaurantId: restaurant._id },
      {
        $set: {
          restaurantId: restaurant._id,
          outletType: 'Appzeto delivery',
          timings: fullWeekTimings,
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`Restaurant ready: ${restaurant.name}`);
    console.log(`Mongo ID: ${restaurant._id}`);
    console.log(`Restaurant ID: ${restaurant.restaurantId}`);
    console.log(`Slug: ${restaurant.slug}`);
    console.log(`Phone: ${restaurant.phone}`);
    console.log(`Demo item: ${demoItem.name} (${demoItem.price})`);
  } catch (error) {
    console.error('Failed to create test restaurant:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();

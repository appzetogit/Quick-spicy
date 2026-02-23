
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Models
import DiningRestaurant from '../modules/dining/models/DiningRestaurant.js';
import DiningCategory from '../modules/dining/models/DiningCategory.js';
import DiningLimelight from '../modules/dining/models/DiningLimelight.js';
import DiningBankOffer from '../modules/dining/models/DiningBankOffer.js';
import DiningMustTry from '../modules/dining/models/DiningMustTry.js';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected for Seeding');
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    }
};

const diningCategories = [
    { name: "Pure veg", image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop" },
    { name: "Drink & dine", image: "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400&h=300&fit=crop" },
    { name: "Rooftops", image: "https://images.unsplash.com/photo-1519671482538-3071a233d438?w=400&h=300&fit=crop" },
    { name: "Summer Spec..", image: "https://images.unsplash.com/photo-1563612116625-3012372fccce?w=400&h=300&fit=crop" },
    { name: "Family Dining", image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop" },
    { name: "Pocket Frien..", image: "https://images.unsplash.com/photo-1493770348161-369560ae357d?w=400&h=300&fit=crop" },
    { name: "Premium Dini..", image: "https://images.unsplash.com/photo-1579027989536-b7b1f875659b?w=400&h=300&fit=crop" },
    { name: "Buffets", image: "https://images.unsplash.com/photo-1544148103-0773bf10d330?w=400&h=300&fit=crop" },
    { name: "Street Food", image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&h=300&fit=crop" },
    { name: "Cafes", image: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&h=300&fit=crop" },
    { name: "Dessert", image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400&h=300&fit=crop" },
    { name: "Bakery", image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=300&fit=crop" },
];

const limelightRestaurants = [
    {
        name: "The Grand Bistro",
        subheading: "Fine Dining Experience",
        image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=600&fit=crop",
        discount: "25% OFF",
    },
    {
        name: "Midnight Lounge",
        subheading: "Cocktails & Cuisine",
        image: "https://images.unsplash.com/photo-1514362545857-3bc16549766b?w=1200&h=600&fit=crop",
        discount: "Flat 20% OFF",
    },
    {
        name: "Spice Garden",
        subheading: "Authentic Indian Flavors",
        image: "https://images.unsplash.com/photo-1585937421612-70a008356f36?w=1200&h=600&fit=crop",
        discount: "Buy 1 Get 1",
    },
];

const mustTries = [
    { name: "Luxury Dining", image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500&h=300&fit=crop" },
    { name: "Romantic Dining", image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=500&h=300&fit=crop" },
    { name: "Great Cafes", image: "https://images.unsplash.com/photo-1501339847302-ac426a4c7cfe?w=500&h=300&fit=crop" },
    { name: "Local Favorite Places", image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&h=300&fit=crop" },
    { name: "Pan Asian Restaurant", image: "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=500&h=300&fit=crop" },
    { name: "Sky High Sips", image: "https://images.unsplash.com/photo-1551218808-94e220e084d2?w=500&h=300&fit=crop" },
    { name: "Great Buffets", image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop" },
];

const bankOffers = [
    {
        name: "Axis Bank",
        cardType: "CORPORATE CARDS",
        discount: "15% OFF",
        maxDiscount: "up to ₹2000",
        logo: "https://logo.clearbit.com/axisbank.com",
        offerText: "Get 15% OFF for up to ₹2000 using Axis Bank Corporate Cards",
        minAmount: "₹5000",
        terms: ["Offer valid once per customer.", "Applicable only on cards with BIN- 512042"],
    },
    {
        name: "HDFC Bank",
        cardType: "PREMIER CREDIT CARD",
        discount: "10% OFF",
        maxDiscount: "up to ₹1000",
        logo: "https://logo.clearbit.com/hdfcbank.com",
        offerText: "Get 10% OFF for up to ₹1000 using HDFC Premier Credit Cards",
        minAmount: "₹5000",
        terms: ["Offer valid once per customer."],
    },
    {
        name: "ICICI Bank",
        cardType: "CREDIT CARD",
        discount: "15% OFF",
        maxDiscount: "up to ₹750",
        logo: "https://logo.clearbit.com/icicibank.com",
        offerText: "Get 15% OFF for up to ₹750 using ICICI Bank Credit Cards",
        minAmount: "₹4000",
        terms: ["Offer valid once per customer."],
    },
    {
        name: "SBI Bank",
        cardType: "CREDIT CARD",
        discount: "12% OFF",
        maxDiscount: "up to ₹1500",
        logo: "https://logo.clearbit.com/sbi.co.in",
        offerText: "Get 12% OFF for up to ₹1500 using SBI Bank Credit Cards",
        minAmount: "₹4500",
        terms: ["Offer valid once per customer."],
    },
];

const popularRestaurants = [
    {
        name: "IRIS",
        rating: 4.3,
        location: "Press Complex, Indore",
        distance: "2.9 km",
        cuisine: "Continental",
        price: "₹1500 for two",
        image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop",
        offer: "Flat 30% OFF + 3 more",
        deliveryTime: "30-35 mins",
        featuredDish: "Pasta",
        featuredPrice: 450,
        coordinates: { type: "Point", coordinates: [75.8577, 22.7196] }
    },
    {
        name: "Skyline Rooftop",
        rating: 4.5,
        location: "MG Road, Indore",
        distance: "3.2 km",
        cuisine: "Multi-cuisine",
        price: "₹2000 for two",
        image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=600&fit=crop",
        offer: "Flat 25% OFF + 2 more",
        deliveryTime: "35-40 mins",
        featuredDish: "Grilled Chicken",
        featuredPrice: 550,
        coordinates: { type: "Point", coordinates: [75.8600, 22.7200] }
    },
    {
        name: "The Grand Bistro",
        rating: 4.7,
        location: "Vijay Nagar, Indore",
        distance: "1.8 km",
        cuisine: "Continental",
        price: "₹1800 for two",
        image: "https://images.unsplash.com/photo-1551218808-94e220e084d2?w=800&h=600&fit=crop",
        offer: "Flat 35% OFF + 4 more",
        deliveryTime: "25-30 mins",
        featuredDish: "Risotto",
        featuredPrice: 650,
        coordinates: { type: "Point", coordinates: [75.8900, 22.7500] }
    },
    {
        name: "Coastal Kitchen",
        rating: 4.4,
        location: "Palasia, Indore",
        distance: "2.1 km",
        cuisine: "Seafood",
        price: "₹1600 for two",
        image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&h=600&fit=crop",
        offer: "Flat 20% OFF + 2 more",
        deliveryTime: "28-33 mins",
        featuredDish: "Fish Curry",
        featuredPrice: 480,
        coordinates: { type: "Point", coordinates: [75.8800, 22.7300] }
    },
    {
        name: "Garden Terrace",
        rating: 4.6,
        location: "Scheme 54, Indore",
        distance: "4.5 km",
        cuisine: "North Indian",
        price: "₹1200 for two",
        image: "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=800&h=600&fit=crop",
        offer: "Flat 30% OFF + 3 more",
        deliveryTime: "40-45 mins",
        featuredDish: "Butter Chicken",
        featuredPrice: 380,
        coordinates: { type: "Point", coordinates: [75.9000, 22.7600] }
    },
    {
        name: "Midnight Lounge",
        rating: 4.2,
        location: "Bhawarkua, Indore",
        distance: "3.8 km",
        cuisine: "Continental",
        price: "₹2200 for two",
        image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop",
        offer: "Flat 25% OFF + 2 more",
        deliveryTime: "35-40 mins",
        featuredDish: "Steak",
        featuredPrice: 750,
        coordinates: { type: "Point", coordinates: [75.8450, 22.6900] }
    },
];

const seedData = async () => {
    try {
        console.log('Seeding Dining Data...');

        // Clear existing data
        await DiningCategory.deleteMany({});
        await DiningLimelight.deleteMany({});
        await DiningBankOffer.deleteMany({});
        await DiningMustTry.deleteMany({});
        await DiningRestaurant.deleteMany({});

        console.log('Cleared existing dining data.');

        // Insert new data
        await DiningCategory.insertMany(diningCategories.map((c, i) => ({ ...c, order: i })));
        await DiningLimelight.insertMany(limelightRestaurants.map((l, i) => ({ ...l, order: i })));
        await DiningMustTry.insertMany(mustTries.map((m, i) => ({ ...m, order: i })));
        await DiningBankOffer.insertMany(bankOffers);
        await DiningRestaurant.insertMany(popularRestaurants.map(r => ({
            ...r,
            slug: r.name.toLowerCase().replace(/\s+/g, '-')
        })));

        console.log('✅ Dining Data Seeded Successfully');
        process.exit();
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
};

connectDB();
seedData();

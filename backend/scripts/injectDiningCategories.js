import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Models
import DiningCategory from "../modules/dining/models/DiningCategory.js";

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB Connected for Seeding");
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);
  }
};

const diningCategories = [
  {
    name: "Cozy cafes",
    image:
      "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&h=300&fit=crop",
  },
  {
    name: "Family dining",
    image:
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop",
  },
  {
    name: "Pure veg",
    image:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop",
  },
  {
    name: "Drink & dine",
    image:
      "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400&h=300&fit=crop",
  },
  {
    name: "Buffet",
    image:
      "https://images.unsplash.com/photo-1544148103-0773bf10d330?w=400&h=300&fit=crop",
  },
  {
    name: "Premium dining",
    image:
      "https://images.unsplash.com/photo-1579027989536-b7b1f875659b?w=400&h=300&fit=crop",
  },
];

const seedData = async () => {
  try {
    console.log("Injecting Dining Categories...");

    // Clear existing categories to ensure we only have the requested ones
    await DiningCategory.deleteMany({});
    console.log("Cleared existing dining categories.");

    // Insert new data
    await DiningCategory.insertMany(
      diningCategories.map((c, i) => ({
        name: c.name,
        imageUrl: c.image,
        cloudinaryPublicId: `seed_dining_cat_${i}`,
        order: i,
      })),
    );

    console.log("✅ Dining Categories Injected Successfully");
    process.exit();
  } catch (error) {
    console.error("Error seeding data:", error);
    process.exit(1);
  }
};

connectDB();
seedData();

import mongoose from "mongoose";
import dotenv from "dotenv";
import EnvironmentVariable from "../modules/admin/models/EnvironmentVariable.js";

dotenv.config();

const updateCredentials = async () => {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!process.env.MONGODB_URI || !cloudName || !apiKey || !apiSecret) {
      throw new Error(
        "MONGODB_URI, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required"
      );
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    console.log("🔍 Fetching Environment Variables...");
    const envVars = await EnvironmentVariable.getOrCreate();

    console.log("📝 Updating Cloudinary Credentials...");
    envVars.CLOUDINARY_CLOUD_NAME = cloudName;
    envVars.CLOUDINARY_API_KEY = apiKey;
    envVars.CLOUDINARY_API_SECRET = apiSecret;

    await envVars.save();
    console.log("✅ Cloudinary Credentials updated successfully!");
  } catch (error) {
    console.error("❌ Error updating credentials:", error);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB");
    process.exit();
  }
};

updateCredentials();

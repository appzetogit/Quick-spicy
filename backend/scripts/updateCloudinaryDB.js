import mongoose from "mongoose";
import dotenv from "dotenv";
import EnvironmentVariable from "../modules/admin/models/EnvironmentVariable.js";

dotenv.config();

const updateCredentials = async () => {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    console.log("🔍 Fetching Environment Variables...");
    const envVars = await EnvironmentVariable.getOrCreate();

    console.log("📝 Updating Cloudinary Credentials...");
    // Values provided by user
    envVars.CLOUDINARY_CLOUD_NAME = "dciu4uawr";
    envVars.CLOUDINARY_API_KEY = "321367185532319";
    envVars.CLOUDINARY_API_SECRET = "YGxziMfOehQo2MCBfZsm2CPI5Uo";

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

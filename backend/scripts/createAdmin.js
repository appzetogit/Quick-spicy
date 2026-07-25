import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import Admin from "../modules/admin/models/Admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};

const createAdmin = async () => {
  try {
    console.log("Resetting admin users and creating a fresh admin account...");

    // No password fallback. A default here silently creates a super_admin with a
    // password that is public in this repo.
    if (!process.env.ADMIN_PASSWORD) {
      console.error("ADMIN_PASSWORD is required. Run: ADMIN_PASSWORD='<strong-password>' node scripts/createAdmin.js");
      process.exit(1);
    }

    const adminData = {
      name: "Quickspicy Official",
      email: process.env.ADMIN_EMAIL || "quickspicyofficial@gmail.com",
      phone: "7093129369",
      password: process.env.ADMIN_PASSWORD,
      role: "super_admin",
      isActive: true,
      phoneVerified: true,
      tokenVersion: 0,
    };

    const deleteResult = await Admin.deleteMany({});
    console.log(`Deleted ${deleteResult.deletedCount || 0} existing admin record(s).`);

    const admin = await Admin.create(adminData);

    console.log("Fresh admin seed completed.");
    console.log("Admin Details:");
    console.log("- ID:", admin._id);
    console.log("- Name:", admin.name);
    console.log("- Email:", admin.email);
    console.log("- Phone:", admin.phone);
    console.log("- Phone Verified:", admin.phoneVerified);
    console.log("- Role:", admin.role);
    console.log("- Active:", admin.isActive);

    process.exit(0);
  } catch (error) {
    console.error("Error creating admin:", error.message);
    process.exit(1);
  }
};

connectDB().then(() => {
  createAdmin();
});

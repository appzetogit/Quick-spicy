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
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

const upsertAdmin = async () => {
  const adminData = {
    name: "Appzeto Admin",
    email: process.env.SECOND_ADMIN_EMAIL || "appzeto@gmail.com",
    phone: "7223077890",
    password: process.env.SECOND_ADMIN_PASSWORD || "admin@#123",
    role: "admin",
    isActive: true,
    phoneVerified: true,
  };

  try {
    const existingAdmin = await Admin.findOne({
      email: adminData.email.toLowerCase(),
    }).select("+password");

    if (existingAdmin) {
      existingAdmin.name = adminData.name;
      existingAdmin.phone = adminData.phone;
      existingAdmin.password = adminData.password;
      existingAdmin.role = adminData.role;
      existingAdmin.isActive = adminData.isActive;
      existingAdmin.phoneVerified = adminData.phoneVerified;
      await existingAdmin.save();

      console.log("Existing admin updated.");
      console.log("- ID:", existingAdmin._id);
      console.log("- Email:", existingAdmin.email);
      console.log("- Phone:", existingAdmin.phone);
      console.log("- Role:", existingAdmin.role);
      process.exit(0);
    }

    const admin = await Admin.create({
      ...adminData,
      tokenVersion: 0,
    });

    console.log("New admin created.");
    console.log("- ID:", admin._id);
    console.log("- Email:", admin.email);
    console.log("- Phone:", admin.phone);
    console.log("- Role:", admin.role);
    process.exit(0);
  } catch (error) {
    console.error("Failed to upsert admin:", error.message);
    process.exit(1);
  }
};

connectDB().then(() => {
  upsertAdmin();
});

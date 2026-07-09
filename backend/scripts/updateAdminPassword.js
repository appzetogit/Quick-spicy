import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import Admin from "../modules/admin/models/Admin.js";
import { revokeAllAdminSessions } from "../modules/admin/services/adminSessionService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const ADMIN_EMAIL = "quickspicyofficial@gmail.com";
const NEW_PASSWORD = "#Quick#spicy*123";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

const updatePassword = async () => {
  try {
    const admin = await Admin.findOne({
      email: ADMIN_EMAIL.toLowerCase(),
    }).select("+password");

    if (!admin) {
      console.error(`Admin not found for email: ${ADMIN_EMAIL}`);
      process.exit(1);
    }

    admin.password = NEW_PASSWORD;
    admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    await admin.save();
    await revokeAllAdminSessions(admin._id, "password-updated-by-script");

    console.log("Admin password updated successfully.");
    console.log("- ID:", admin._id);
    console.log("- Email:", admin.email);
    console.log("- Token Version:", admin.tokenVersion);
    process.exit(0);
  } catch (error) {
    console.error("Failed to update admin password:", error.message);
    process.exit(1);
  }
};

connectDB().then(() => {
  updatePassword();
});

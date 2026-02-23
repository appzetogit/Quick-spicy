import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Import Admin model
import Admin from "../modules/admin/models/Admin.js";

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  }
};

const createAdmin = async () => {
  try {
    console.log("Creating admin user...");

    // Admin details
    const adminData = {
      name: "Quickspicy Admin",
      email: process.env.ADMIN_EMAIL || "quickspicyofficial@gmail.com",
      phone: "7610416911",
      password: process.env.ADMIN_PASSWORD || "Quickspicy16072003",
      role: "admin",
      isActive: true,
      phoneVerified: false,
    };

    // Check if admin already exists
    let admin = await Admin.findOne({
      email: adminData.email.toLowerCase(),
    });

    if (admin) {
      console.log("⚠️  Admin already exists with this email:", adminData.email);
      console.log("Updating password...");
      admin.password = adminData.password;
      admin.name = adminData.name;
      await admin.save();
      console.log("✅ Admin updated successfully!");
    } else {
      // Create new admin
      admin = await Admin.create(adminData);
      console.log("✅ Admin created successfully!");
    }

    // Remove password from response
    const adminResponse = admin.toObject();
    delete adminResponse.password;

    console.log("✅ Admin created successfully!");
    console.log("Admin Details:");
    console.log("- ID:", admin._id);
    console.log("- Name:", admin.name);
    console.log("- Email:", admin.email);
    console.log("- Phone:", admin.phone);
    console.log("- Role:", admin.role);
    console.log("- Active:", admin.isActive);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating admin:", error.message);

    if (error.code === 11000) {
      console.error("Admin with this email already exists");
    }

    process.exit(1);
  }
};

// Run the script
connectDB().then(() => {
  createAdmin();
});

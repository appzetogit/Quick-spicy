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
        console.log("Creating admin user for Aditi Parihar...");

        // Admin details
        const adminData = {
            name: "Aditi Parihar",
            email: "aditiparihar179@gmail.com",
            password: "123456", // Will be hashed by pre-save hook
            role: "super_admin", // Giving super_admin to ensure full access
            isActive: true,
            phoneVerified: true,
            permissions: [
                'dashboard_view',
                'admin_manage',
                'restaurant_manage',
                'delivery_manage',
                'order_manage',
                'user_manage',
                'report_view',
                'settings_manage',
                'payment_manage',
                'campaign_manage'
            ]
        };

        // Check if admin already exists
        const existingAdmin = await Admin.findOne({
            email: adminData.email.toLowerCase(),
        });

        if (existingAdmin) {
            console.log("⚠️  Admin already exists with this email:", adminData.email);
            console.log("Updating password and permissions...");

            existingAdmin.password = adminData.password;
            existingAdmin.name = adminData.name;
            existingAdmin.role = adminData.role;
            existingAdmin.permissions = adminData.permissions;
            existingAdmin.isActive = true;

            await existingAdmin.save();
            console.log("✅ Admin updated successfully!");
            process.exit(0);
        }

        // Create new admin
        const admin = await Admin.create(adminData);

        console.log("✅ Admin created successfully!");
        console.log("Admin Details:");
        console.log("- ID:", admin._id);
        console.log("- Name:", admin.name);
        console.log("- Email:", admin.email);
        console.log("- Role:", admin.role);

        process.exit(0);
    } catch (error) {
        console.error("❌ Error creating admin:", error.message);
        process.exit(1);
    }
};

// Run the script
connectDB().then(() => {
    createAdmin();
});

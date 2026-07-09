import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const args = process.argv.slice(2);

const getArgValue = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    return null;
  }
  return args[index + 1];
};

const ADMIN_EMAIL =
  getArgValue("--email") ||
  process.env.ADMIN_EMAIL ||
  process.env.SECOND_ADMIN_EMAIL ||
  "quickspicyofficial@gmail.com";

const PASSWORD_TO_CHECK =
  getArgValue("--password") ||
  process.env.CHECK_ADMIN_PASSWORD ||
  process.env.SECOND_ADMIN_PASSWORD ||
  process.env.ADMIN_PASSWORD;

if (!PASSWORD_TO_CHECK) {
  console.error(
    "Missing password. Provide --password <value> or set CHECK_ADMIN_PASSWORD in backend/.env",
  );
  process.exit(1);
}

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

const checkPassword = async () => {
  try {
    const admin = await mongoose.connection.db.collection("admins").findOne(
      { email: ADMIN_EMAIL.toLowerCase() },
      { projection: { email: 1, name: 1, password: 1, isActive: 1 } },
    );

    if (!admin) {
      console.error(`Admin not found for email: ${ADMIN_EMAIL}`);
      process.exit(1);
    }

    const matches = await bcrypt.compare(PASSWORD_TO_CHECK, admin.password);

    console.log("Admin password check complete.");
    console.log("- Name:", admin.name);
    console.log("- Email:", admin.email);
    console.log("- Active:", admin.isActive);
    console.log("- Password matches:", matches);
    process.exit(matches ? 0 : 2);
  } catch (error) {
    console.error("Failed to check admin password:", error.message);
    process.exit(1);
  }
};

connectDB().then(() => {
  checkPassword();
});

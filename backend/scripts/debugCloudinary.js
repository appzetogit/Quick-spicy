import dotenv from "dotenv";
import mongoose from "mongoose";
import { getCloudinaryCredentials } from "../shared/utils/envService.js";
import { initializeCloudinary } from "../config/cloudinary.js";
import { uploadToCloudinary } from "../shared/utils/cloudinaryService.js";
import fs from "fs";

dotenv.config();

async function debugCloudinary() {
  const logs = [];
  const log = (msg, data) => logs.push({ msg, data });
  const errorLog = (msg, err) =>
    logs.push({ msg, error: err.message, stack: err.stack, details: err });

  try {
    log("🔌 Connecting to MongoDB...", {});
    await mongoose.connect(process.env.MONGODB_URI);
    log("✅ Connected to MongoDB", {});

    log("🔍 Fetching Cloudinary credentials...", {});
    const credentials = await getCloudinaryCredentials();

    // Log credentials (be careful with secrets in production, but here we need to debug)
    // We will inspect the first few chars and length
    log("Credentials found:", {
      cloudName: credentials.cloudName,
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret
        ? credentials.apiSecret.substring(0, 5) + "..."
        : "MISSING",
      fullSecret: credentials.apiSecret, // We need to see if it has quotes or spaces
      cloudNameLength: credentials.cloudName ? credentials.cloudName.length : 0,
      apiKeyLength: credentials.apiKey ? credentials.apiKey.length : 0,
      apiSecretLength: credentials.apiSecret ? credentials.apiSecret.length : 0,
    });

    log("🔧 Initializing Cloudinary...", {});
    await initializeCloudinary();

    log("📤 Attempting test upload...", {});
    const buffer = Buffer.from("Test file content");

    const options = {
      folder: "appzeto/business/logo",
      resource_type: "image",
      transformation: [
        { width: 500, height: 500, crop: "limit" },
        { quality: "auto" },
      ],
    };

    const result = await uploadToCloudinary(buffer, options);
    log("✅ Upload successful:", result);
  } catch (error) {
    errorLog("❌ Error during debug:", error);
  } finally {
    fs.writeFileSync("debug_result.json", JSON.stringify(logs, null, 2));
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit();
  }
}

debugCloudinary();

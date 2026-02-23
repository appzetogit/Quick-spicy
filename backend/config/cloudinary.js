import { v2 as cloudinary } from 'cloudinary';
import { getCloudinaryCredentials } from '../shared/utils/envService.js';

// Normalize env values (trim quotes if present)
function cleanEnv(value) {
  if (!value || typeof value !== 'string') return value;
  let v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

// Initialize Cloudinary with database credentials
let cloudinaryInitialized = false;

async function initializeCloudinary() {
  if (cloudinaryInitialized) {
    return cloudinary;
  }

  try {
    const credentials = await getCloudinaryCredentials();
    const cloudName = cleanEnv(credentials.cloudName || process.env.CLOUDINARY_CLOUD_NAME);
    const apiKey = cleanEnv(credentials.apiKey || process.env.CLOUDINARY_API_KEY);
    const apiSecret = cleanEnv(credentials.apiSecret || process.env.CLOUDINARY_API_SECRET);

    console.log('🔧 Cloudinary initialization check:', {
      hasCloudName: !!cloudName,
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      cloudNameLength: cloudName?.length || 0,
      apiKeyLength: apiKey?.length || 0,
      apiSecretLength: apiSecret?.length || 0
    });

    if (!cloudName || !apiKey || !apiSecret) {
      const missing = [];
      if (!cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
      if (!apiKey) missing.push('CLOUDINARY_API_KEY');
      if (!apiSecret) missing.push('CLOUDINARY_API_SECRET');
      
      console.error(
        `❌ Cloudinary is not fully configured. Missing: ${missing.join(', ')}. Set these in ENV Setup or backend .env`
      );
      throw new Error(`Cloudinary configuration incomplete. Missing: ${missing.join(', ')}`);
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret
    });

    cloudinaryInitialized = true;
    console.log('✅ Cloudinary initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Cloudinary:', {
      message: error.message,
      stack: error.stack
    });
    cloudinaryInitialized = false;
    throw error; // Re-throw to let caller handle
  }

  return cloudinary;
}

// Initialize on module load (fallback to process.env)
const CLOUDINARY_CLOUD_NAME = cleanEnv(process.env.CLOUDINARY_CLOUD_NAME);
const CLOUDINARY_API_KEY = cleanEnv(process.env.CLOUDINARY_API_KEY);
const CLOUDINARY_API_SECRET = cleanEnv(process.env.CLOUDINARY_API_SECRET);

if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET
  });
  cloudinaryInitialized = true;
}

// Reinitialize function (call after updating env variables)
export async function reinitializeCloudinary() {
  cloudinaryInitialized = false;
  return await initializeCloudinary();
}

export { cloudinary, initializeCloudinary };



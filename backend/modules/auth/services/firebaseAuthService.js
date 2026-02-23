import admin from "firebase-admin";
import winston from "winston";
import fs from "fs";
import path from "path";
import { getFirebaseCredentials } from "../../../shared/utils/envService.js";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

class FirebaseAuthService {
  constructor() {
    this.initialized = false;
    // Initialize asynchronously (don't await in constructor)
    this.init().catch((err) => {
      logger.error(`Error initializing Firebase: ${err.message}`);
    });
  }

  async init() {
    if (this.initialized) return;

    try {
      let dbCredentials = {};
      try {
        dbCredentials = (await getFirebaseCredentials()) || {};
      } catch (error) {
        logger.warn(
          `Failed to load Firebase credentials from DB env service: ${error.message}`,
        );
      }

      let projectId = dbCredentials.projectId || process.env.FIREBASE_PROJECT_ID;
      let clientEmail = dbCredentials.clientEmail || process.env.FIREBASE_CLIENT_EMAIL;
      let privateKey = dbCredentials.privateKey || process.env.FIREBASE_PRIVATE_KEY;

      // Fallback: read from firebaseconfig.json in backend root or config folder if env vars are not set
      if (!projectId || !clientEmail || !privateKey) {
        try {
          // Try config folder first (if service account file is there)
          const configFolderPath = path.resolve(
            process.cwd(),
            "config",
            "zomato-607fa-firebase-adminsdk-fbsvc-f5f782c2cc.json",
          );
          const rootPath = path.resolve(process.cwd(), "firebaseconfig.json");

          let serviceAccountPath = null;
          if (fs.existsSync(configFolderPath)) {
            serviceAccountPath = configFolderPath;
          } else if (fs.existsSync(rootPath)) {
            serviceAccountPath = rootPath;
          }

          if (serviceAccountPath) {
            const raw = fs.readFileSync(serviceAccountPath, "utf-8");
            const json = JSON.parse(raw);
            projectId = projectId || json.project_id;
            clientEmail = clientEmail || json.client_email;
            privateKey = privateKey || json.private_key;
          }
        } catch (err) {
          logger.warn(`Failed to read firebaseconfig.json: ${err.message}`);
        }
      }

      if (!projectId || !clientEmail || !privateKey) {
        logger.warn(
          "Firebase Admin not fully configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in ENV Setup or .env or provide firebaseconfig.json in backend root to enable Firebase auth.",
        );
        return;
      }

      // Handle escaped newlines in private key
      if (privateKey.includes("\\n")) {
        privateKey = privateKey.replace(/\\n/g, "\n");
      }

      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });

        this.initialized = true;
        logger.info("Firebase Admin initialized for auth verification");
      } catch (error) {
        // If already initialized, ignore the "app exists" error
        if (error?.code === "app/duplicate-app") {
          this.initialized = true;
          logger.warn(
            "Firebase Admin already initialized, reusing existing instance",
          );
          return;
        }

        logger.error(`Failed to initialize Firebase Admin: ${error.message}`);
      }
    } catch (error) {
      logger.error(`Error in Firebase init: ${error.message}`);
    }
  }

  isEnabled() {
    return this.initialized;
  }

  /**
   * Verify a Firebase ID token and return decoded claims
   * @param {string} idToken
   * @returns {Promise<admin.auth.DecodedIdToken>}
   */
  async verifyIdToken(idToken) {
    if (!this.initialized) {
      await this.init();
      if (!this.initialized) {
        throw new Error(
          "Firebase Admin is not configured. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env",
        );
      }
    }

    if (!idToken) {
      throw new Error("ID token is required");
    }

    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      logger.info("Firebase ID token verified", {
        uid: decoded.uid,
        email: decoded.email,
      });
      return decoded;
    } catch (error) {
      logger.error(`Error verifying Firebase ID token: ${error.message}`);
      throw new Error("Invalid or expired Firebase ID token");
    }
  }
}

export default new FirebaseAuthService();

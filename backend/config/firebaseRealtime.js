import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { getFirebaseCredentials } from '../shared/utils/envService.js';

const REALTIME_APP_NAME = 'realtime-db-app';
let realtimeDb = null;
let initPromise = null;

function normalizePrivateKey(privateKey = '') {
  let key = String(privateKey || '').trim();

  // Remove wrapping quotes if present.
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }

  // Normalize escaped and real line breaks.
  key = key
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n');

  return key;
}

function sanitizeUrl(url = '') {
  const trimmed = String(url || '').trim();
  return trimmed.replace(/\/+$/, '');
}

function deriveDatabaseUrl(projectId, explicitUrl) {
  if (explicitUrl) return sanitizeUrl(explicitUrl);
  if (!projectId) return '';
  return `https://${projectId}-default-rtdb.firebaseio.com`;
}

function loadServiceAccountFromFile() {
  try {
    const projectRoot = process.cwd();
    const candidatePaths = [
      path.resolve(projectRoot, 'config', 'zomato-607fa-firebase-adminsdk-fbsvc-f5f782c2cc.json'),
      path.resolve(projectRoot, 'firebaseconfig.json'),
      path.resolve(projectRoot, 'serviceAccountKey.json')
    ];

    const serviceAccountPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath));
    if (!serviceAccountPath) return {};

    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
    return {
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
      databaseURL: serviceAccount.databaseURL || serviceAccount.database_url
    };
  } catch (error) {
    console.warn(`⚠️ Failed to read Firebase service account file: ${error.message}`);
    return {};
  }
}

async function loadRealtimeConfig() {
  let dbCredentials = {};
  try {
    dbCredentials = (await getFirebaseCredentials()) || {};
  } catch (error) {
    console.warn(`⚠️ Failed to load Firebase credentials from DB env service: ${error.message}`);
  }

  const fileCredentials = loadServiceAccountFromFile();

  const envProjectId = process.env.FIREBASE_PROJECT_ID || '';
  const envClientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
  const envPrivateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || '');
  const envDatabaseURL = process.env.FIREBASE_DATABASE_URL || '';

  const dbProjectId = dbCredentials.projectId || '';
  const dbClientEmail = dbCredentials.clientEmail || '';
  const dbPrivateKey = normalizePrivateKey(dbCredentials.privateKey || '');
  const dbDatabaseURL = dbCredentials.databaseURL || '';

  const fileProjectId = fileCredentials.projectId || '';
  const fileClientEmail = fileCredentials.clientEmail || '';
  const filePrivateKey = normalizePrivateKey(fileCredentials.privateKey || '');
  const fileDatabaseURL = fileCredentials.databaseURL || '';

  const isServiceEmail = (email) => String(email || '').includes('.iam.gserviceaccount.com');
  const isPemKey = (key) => String(key || '').includes('-----BEGIN PRIVATE KEY-----');

  const useDbCreds = Boolean(
    dbProjectId &&
    isServiceEmail(dbClientEmail) &&
    isPemKey(dbPrivateKey)
  );

  const useEnvCreds = Boolean(
    envProjectId &&
    isServiceEmail(envClientEmail) &&
    isPemKey(envPrivateKey)
  );

  const useFileCreds = Boolean(
    fileProjectId &&
    isServiceEmail(fileClientEmail) &&
    isPemKey(filePrivateKey)
  );

  const projectId = useDbCreds
    ? dbProjectId
    : (useEnvCreds ? envProjectId : fileProjectId);
  const clientEmail = useDbCreds
    ? dbClientEmail
    : (useEnvCreds ? envClientEmail : fileClientEmail);
  const privateKey = useDbCreds
    ? dbPrivateKey
    : (useEnvCreds ? envPrivateKey : filePrivateKey);
  const databaseURL = deriveDatabaseUrl(
    projectId,
    (useDbCreds ? dbDatabaseURL : '') || (useEnvCreds ? envDatabaseURL : '') || fileDatabaseURL
  );

  return { projectId, clientEmail, privateKey, databaseURL };
}

export async function initializeFirebaseRealtime() {
  if (realtimeDb) return realtimeDb;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { projectId, clientEmail, privateKey, databaseURL } = await loadRealtimeConfig();

      if (!projectId || !clientEmail || !privateKey) {
        console.warn('⚠️ Firebase Realtime Database credentials missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.');
        return null;
      }

      if (!databaseURL) {
        console.warn('⚠️ Firebase Realtime Database URL missing. Set FIREBASE_DATABASE_URL.');
        return null;
      }

      let realtimeApp;
      try {
        realtimeApp = admin.app(REALTIME_APP_NAME);
      } catch (error) {
        realtimeApp = admin.initializeApp(
          {
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey
            }),
            databaseURL
          },
          REALTIME_APP_NAME
        );
      }

      realtimeDb = admin.database(realtimeApp);
      console.log('✅ Firebase Realtime Database initialized');
      return realtimeDb;
    } catch (error) {
      console.warn(`⚠️ Failed to initialize Firebase Realtime Database: ${error.message}`);
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export function getFirebaseRealtimeDb() {
  if (!realtimeDb) {
    console.warn('⚠️ Firebase Realtime Database not initialized. Call initializeFirebaseRealtime() first.');
    return null;
  }
  return realtimeDb;
}

export function isFirebaseRealtimeReady() {
  return !!realtimeDb;
}

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFirebaseCredentials } from '../shared/utils/envService.js';

const REALTIME_APP_NAME = 'realtime-db-app';
const INIT_RETRY_COOLDOWN_MS = 30 * 1000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');

let realtimeDb = null;
let initPromise = null;
let hasLoggedMissingRealtimeWarning = false;
let lastInitFailureAt = 0;
let lastInitFailureReason = '';

function normalizePrivateKey(privateKey = '') {
  let key = String(privateKey || '').trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }

  return key
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n');
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

function getCandidateServiceAccountPaths() {
  const envConfiguredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ? path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
    : null;

  const fixedCandidates = [
    envConfiguredPath,
    path.resolve(process.cwd(), 'config', 'zomato-607fa-firebase-adminsdk-fbsvc-f5f782c2cc.json'),
    path.resolve(process.cwd(), 'firebaseconfig.json'),
    path.resolve(process.cwd(), 'serviceAccountKey.json'),
    path.resolve(backendRoot, 'config', 'zomato-607fa-firebase-adminsdk-fbsvc-f5f782c2cc.json'),
    path.resolve(backendRoot, 'firebaseconfig.json'),
    path.resolve(backendRoot, 'serviceAccountKey.json')
  ].filter(Boolean);

  const dynamicDirs = [
    path.resolve(process.cwd(), 'config'),
    process.cwd(),
    path.resolve(backendRoot, 'config'),
    backendRoot
  ];

  const dynamicCandidates = [];

  dynamicDirs.forEach((dirPath) => {
    if (!fs.existsSync(dirPath)) return;

    let stat;
    try {
      stat = fs.statSync(dirPath);
    } catch {
      return;
    }

    if (!stat.isDirectory()) return;

    let files = [];
    try {
      files = fs.readdirSync(dirPath);
      
    } catch {
      return;
    }

    files.forEach((fileName) => {
      const normalized = fileName.toLowerCase();
      const isJson = normalized.endsWith('.json');
      const looksLikeFirebaseKey =
        normalized.includes('firebase-adminsdk') ||
        normalized.includes('serviceaccount') ||
        normalized === 'firebaseconfig.json' ||
        normalized === 'serviceaccountkey.json';

      if (isJson && looksLikeFirebaseKey) {
        dynamicCandidates.push(path.resolve(dirPath, fileName));
      }
    });
  });

  return [...new Set([...fixedCandidates, ...dynamicCandidates])];
}

function loadServiceAccountFromFile() {
  try {
    const candidatePaths = getCandidateServiceAccountPaths();
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

  const source = useDbCreds ? 'db' : (useEnvCreds ? 'env' : (useFileCreds ? 'file' : 'none'));

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

  return { projectId, clientEmail, privateKey, databaseURL, source };
}

export async function initializeFirebaseRealtime() {
  if (realtimeDb) return realtimeDb;
  if (initPromise) return initPromise;

  if (lastInitFailureAt && (Date.now() - lastInitFailureAt) < INIT_RETRY_COOLDOWN_MS) {
    return null;
  }

  initPromise = (async () => {
    try {
      const { projectId, clientEmail, privateKey, databaseURL, source } = await loadRealtimeConfig();

      if (!projectId || !clientEmail || !privateKey) {
        lastInitFailureAt = Date.now();
        lastInitFailureReason = 'missing_credentials';
        console.warn('⚠️ Firebase Realtime Database credentials missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY or FIREBASE_SERVICE_ACCOUNT_PATH.');
        return null;
      }

      if (!databaseURL) {
        lastInitFailureAt = Date.now();
        lastInitFailureReason = 'missing_database_url';
        console.warn('⚠️ Firebase Realtime Database URL missing. Set FIREBASE_DATABASE_URL.');
        return null;
      }

      let realtimeApp;
      try {
        realtimeApp = admin.app(REALTIME_APP_NAME);
      } catch {
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
      hasLoggedMissingRealtimeWarning = false;
      lastInitFailureAt = 0;
      lastInitFailureReason = '';
      console.log(`✅ Firebase Realtime Database initialized (source=${source})`);
      return realtimeDb;
    } catch (error) {
      lastInitFailureAt = Date.now();
      lastInitFailureReason = error?.message || 'unknown_error';
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
    if (!hasLoggedMissingRealtimeWarning) {
      const failureHint = lastInitFailureReason ? ` Last init failure: ${lastInitFailureReason}.` : '';
      console.warn(`Firebase Realtime Database not initialized. Call initializeFirebaseRealtime() first.${failureHint}`);
      hasLoggedMissingRealtimeWarning = true;
    }
    return null;
  }
  return realtimeDb;
}

export function isFirebaseRealtimeReady() {
  return !!realtimeDb;
}

export async function getFirebaseRealtimeDbSafe() {
  if (realtimeDb) return realtimeDb;
  await initializeFirebaseRealtime();
  return getFirebaseRealtimeDb();
}

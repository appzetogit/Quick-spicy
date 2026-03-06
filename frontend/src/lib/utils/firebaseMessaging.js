import { toast } from "sonner";
import { userAPI, restaurantAPI, deliveryAPI, adminAPI } from "@/lib/api";
import { initializeApp, getApp, getApps } from "firebase/app";
import pushNotificationSound from "@/assets/audio/zomato_sms.mp3";

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: "",
  messagingSenderId: "",
};

const tokenCachePrefix = "fcm_web_registered_token_";
let publicEnvPromise = null;
let foregroundListenerAttached = false;
let registrationInFlight = null;
const MESSAGING_APP_NAME = "web-push-app";
const recentForegroundNotifications = new Map();
let pushSoundAudio = null;
let pushSoundUnlocked = false;

function normalizeModuleFromPath(pathname = window.location.pathname) {
  if (pathname.startsWith("/restaurant") && !pathname.startsWith("/restaurants")) return "restaurant";
  if (pathname.startsWith("/delivery")) return "delivery";
  if (pathname.startsWith("/admin")) return "admin";
  return "user";
}

function isSupportedBrowser() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function isSecureContextForPush() {
  return window.isSecureContext || window.location.hostname === "localhost";
}

function sanitize(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function getNotificationKey(payload = {}) {
  return (
    payload?.data?.notificationId ||
    payload?.data?.messageId ||
    payload?.messageId ||
    [
      payload?.notification?.title || "",
      payload?.notification?.body || "",
      payload?.data?.orderId || "",
      payload?.data?.targetUrl || "",
    ].join("::")
  );
}

function wasRecentlyHandled(notificationKey) {
  if (!notificationKey) return false;
  const now = Date.now();

  for (const [key, timestamp] of recentForegroundNotifications.entries()) {
    if (now - timestamp > 15000) {
      recentForegroundNotifications.delete(key);
    }
  }

  if (recentForegroundNotifications.has(notificationKey)) {
    return true;
  }

  recentForegroundNotifications.set(notificationKey, now);
  return false;
}

function ensurePushSoundAudio() {
  if (typeof window === "undefined") return null;
  if (!pushSoundAudio) {
    pushSoundAudio = new Audio(pushNotificationSound);
    pushSoundAudio.preload = "auto";
    pushSoundAudio.volume = 1;
  }
  return pushSoundAudio;
}

async function triggerWebViewNativeNotification(payload = {}) {
  if (typeof window === "undefined") return false;

  const bridgePayload = {
    title: payload?.notification?.title || payload?.data?.title || "New notification",
    body: payload?.notification?.body || payload?.data?.body || "",
    notificationId: payload?.data?.notificationId || payload?.messageId || "",
    targetUrl: payload?.data?.targetUrl || payload?.data?.link || "",
    imageUrl: payload?.notification?.image || payload?.data?.image || payload?.data?.imageUrl || "",
  };

  try {
    if (
      window.flutter_inappwebview &&
      typeof window.flutter_inappwebview.callHandler === "function"
    ) {
      const handlerNames = [
        "playNotificationSound",
        "triggerNotificationFeedback",
        "onPushNotification",
      ];

      for (const handlerName of handlerNames) {
        try {
          await window.flutter_inappwebview.callHandler(handlerName, bridgePayload);
          return true;
        } catch {
          // Try the next available handler name.
        }
      }
    }
  } catch {
    // Ignore bridge failures.
  }

  return false;
}

async function playPushSound(payload = {}) {
  try {
    const usedNativeBridge = await triggerWebViewNativeNotification(payload);

    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([200, 100, 200, 100, 300]);
    }

    if (usedNativeBridge) return;

    const audio = ensurePushSoundAudio();
    if (!audio || !pushSoundUnlocked) return;
    audio.currentTime = 0;
    await audio.play();
  } catch {
    // Ignore autoplay/playback failures.
  }
}

function setupPushSoundUnlock() {
  if (typeof window === "undefined" || pushSoundUnlocked) return;

  const unlock = async () => {
    try {
      const audio = ensurePushSoundAudio();
      if (!audio) return;
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      pushSoundUnlocked = true;
    } catch {
      // Will retry on next gesture.
    }

    if (pushSoundUnlocked) {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    }
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
}

async function getFirebasePublicEnv() {
  if (publicEnvPromise) return publicEnvPromise;

  publicEnvPromise = (async () => {
    try {
      const response = await adminAPI.getPublicEnvVariables();
      const data = response?.data?.data || {};
      return {
        apiKey: sanitize(data.FIREBASE_API_KEY) || sanitize(import.meta.env.VITE_FIREBASE_API_KEY) || DEFAULT_FIREBASE_CONFIG.apiKey,
        authDomain: sanitize(data.FIREBASE_AUTH_DOMAIN) || sanitize(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) || DEFAULT_FIREBASE_CONFIG.authDomain,
        projectId: sanitize(data.FIREBASE_PROJECT_ID) || sanitize(import.meta.env.VITE_FIREBASE_PROJECT_ID) || DEFAULT_FIREBASE_CONFIG.projectId,
        appId: sanitize(data.FIREBASE_APP_ID) || sanitize(import.meta.env.VITE_FIREBASE_APP_ID) || DEFAULT_FIREBASE_CONFIG.appId,
        messagingSenderId:
          sanitize(data.FIREBASE_MESSAGING_SENDER_ID) || sanitize(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
        storageBucket: sanitize(data.FIREBASE_STORAGE_BUCKET) || sanitize(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
        measurementId: sanitize(data.MEASUREMENT_ID) || sanitize(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID),
        vapidKey: sanitize(data.FIREBASE_VAPID_KEY) || sanitize(import.meta.env.VITE_FIREBASE_VAPID_KEY),
      };
    } catch {
      return {
        ...DEFAULT_FIREBASE_CONFIG,
        storageBucket: sanitize(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
        measurementId: sanitize(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID),
        vapidKey: sanitize(import.meta.env.VITE_FIREBASE_VAPID_KEY),
      };
    } finally {
      publicEnvPromise = null;
    }
  })();

  return publicEnvPromise;
}

function getMessagingFirebaseApp(config) {
  const appConfig = {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
    messagingSenderId: config.messagingSenderId,
    ...(config.storageBucket ? { storageBucket: config.storageBucket } : {}),
    ...(config.measurementId ? { measurementId: config.measurementId } : {}),
  };

  if (!appConfig.apiKey || !appConfig.projectId || !appConfig.appId || !appConfig.messagingSenderId) {
    return null;
  }

  const existing = getApps().find((a) => a.name === MESSAGING_APP_NAME);
  if (existing) return existing;

  try {
    return getApp(MESSAGING_APP_NAME);
  } catch {
    return initializeApp(appConfig, MESSAGING_APP_NAME);
  }
}

function getSavedToken(moduleName) {
  return localStorage.getItem(`${tokenCachePrefix}${moduleName}`) || "";
}

function setSavedToken(moduleName, token) {
  localStorage.setItem(`${tokenCachePrefix}${moduleName}`, token);
}

async function saveTokenByModule(moduleName, token) {
  if (moduleName === "restaurant") {
    await restaurantAPI.saveFcmToken(token, "web");
    return;
  }
  if (moduleName === "delivery") {
    await deliveryAPI.saveFcmToken(token, "web");
    return;
  }
  if (moduleName === "user") {
    await userAPI.saveFcmToken(token, { platform: "web", channel: "web" });
  }
}

async function attachForegroundListener(firebaseAppInstance) {
  if (foregroundListenerAttached) return;

  const { getMessaging, onMessage, isSupported } = await import("firebase/messaging");
  const supported = await isSupported().catch(() => false);
  if (!supported) return;

  const messaging = getMessaging(firebaseAppInstance);
  setupPushSoundUnlock();

  onMessage(messaging, (payload) => {
    const notificationKey = getNotificationKey(payload);
    if (wasRecentlyHandled(notificationKey)) {
      return;
    }

    const title = payload?.notification?.title || "New notification";
    const body = payload?.notification?.body || "";
    const image =
      payload?.notification?.image ||
      payload?.notification?.imageUrl ||
      payload?.data?.image ||
      payload?.data?.imageUrl ||
      undefined;

    playPushSound(payload);

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
          image,
          tag: notificationKey || undefined,
        });
      } catch {
        // Ignore Notification API errors and fallback to toast.
      }
    }

    if (body) {
      toast.success(`${title}: ${body}`);
    } else {
      toast.success(title);
    }
  });

  foregroundListenerAttached = true;
}

export async function registerWebPushForCurrentModule(pathname = window.location.pathname) {
  const moduleName = normalizeModuleFromPath(pathname);
  if (moduleName === "admin") return;

  const accessToken = localStorage.getItem(`${moduleName}_accessToken`);
  if (!accessToken) return;

  if (!isSupportedBrowser() || !isSecureContextForPush()) return;

  if (registrationInFlight) return registrationInFlight;

  registrationInFlight = (async () => {
    const firebasePublicEnv = await getFirebasePublicEnv();
    if (!firebasePublicEnv?.vapidKey) {
      console.warn("FCM web registration skipped: FIREBASE_VAPID_KEY is missing in env setup.");
      return;
    }

    const app = getMessagingFirebaseApp(firebasePublicEnv);
    if (!app) {
      console.warn("FCM web registration skipped: Firebase public web config is incomplete.");
      return;
    }

    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;

    if (permission !== "granted") return;

    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    const supported = await isSupported().catch(() => false);
    if (!supported) return;

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: firebasePublicEnv.vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) return;

    const lastSavedToken = getSavedToken(moduleName);
    if (lastSavedToken === token) {
      await attachForegroundListener(app);
      return;
    }

    await saveTokenByModule(moduleName, token);
    setSavedToken(moduleName, token);
    await attachForegroundListener(app);
  })()
    .catch((error) => {
      console.warn("FCM web token registration failed:", error?.message || error);
    })
    .finally(() => {
      registrationInFlight = null;
    });

  return registrationInFlight;
}

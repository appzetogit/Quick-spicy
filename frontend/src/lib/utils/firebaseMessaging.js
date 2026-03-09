import { toast } from "sonner";
import { userAPI, restaurantAPI, deliveryAPI, adminAPI } from "@/lib/api";
import { initializeApp, getApp, getApps } from "firebase/app";
import fallbackNotificationSound from "@/assets/audio/alert.mp3";

const pushNotificationSoundPath = "/zomato_sms.mp3";

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: "",
  messagingSenderId: "",
};

const tokenCachePrefix = "fcm_web_registered_token_";
const pushSoundEnabledStorageKey = "push_sound_enabled";
let publicEnvPromise = null;
let foregroundListenerAttached = false;
let registrationInFlight = null;
let serviceWorkerMessageListenerAttached = false;
let serviceWorkerBroadcastChannel = null;
const MESSAGING_APP_NAME = "web-push-app";
const recentForegroundNotifications = new Map();
let pushSoundAudio = null;
let pushSoundUnlocked = false;
let pushSoundContext = null;
const PUSH_DEBUG_PREFIX = "[push-debug]";
const notificationDedupWindowMs = 2000;

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
    if (now - timestamp > notificationDedupWindowMs) {
      recentForegroundNotifications.delete(key);
    }
  }

  if (recentForegroundNotifications.has(notificationKey)) {
    console.log(PUSH_DEBUG_PREFIX, "Duplicate notification skipped", { notificationKey });
    return true;
  }

  recentForegroundNotifications.set(notificationKey, now);
  return false;
}

function ensurePushSoundAudio() {
  if (typeof window === "undefined") return null;
  if (!pushSoundAudio) {
    const audioUrl = new URL(pushNotificationSoundPath, window.location.origin).toString();
    console.log(PUSH_DEBUG_PREFIX, "Creating primary push audio", { audioUrl });
    pushSoundAudio = new Audio(audioUrl);
    pushSoundAudio.preload = "auto";
    pushSoundAudio.volume = 1;
    pushSoundAudio.load();
  }
  return pushSoundAudio;
}

function createPushPlaybackAudio() {
  const primarySource =
    typeof window === "undefined"
      ? pushNotificationSoundPath
      : new URL(pushNotificationSoundPath, window.location.origin).toString();
  const audioSources = [primarySource, fallbackNotificationSound];
  console.log(PUSH_DEBUG_PREFIX, "Preparing push playback sources", { audioSources });
  return audioSources.map((source) => {
    const playbackAudio = new Audio(source);
    playbackAudio.preload = "auto";
    playbackAudio.volume = 1;
    playbackAudio.load();
    return playbackAudio;
  });
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!pushSoundContext) {
    pushSoundContext = new AudioContextClass();
  }

  return pushSoundContext;
}

async function playSynthNotificationBeep() {
  const ctx = getAudioContext();
  if (!ctx) return false;
  console.log(PUSH_DEBUG_PREFIX, "Playing synth notification beep");

  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const now = ctx.currentTime;
  const pulses = [
    { start: 0, duration: 0.11, frequency: 880 },
    { start: 0.16, duration: 0.11, frequency: 988 },
    { start: 0.34, duration: 0.18, frequency: 1046 },
  ];

  pulses.forEach(({ start, duration, frequency }) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + start);
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now + start);
    oscillator.stop(now + start + duration);
  });

  return true;
}

export function isPushSoundEnabled() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(pushSoundEnabledStorageKey) === "true";
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
          console.log(PUSH_DEBUG_PREFIX, "Trying native notification handler", { handlerName, bridgePayload });
          await window.flutter_inappwebview.callHandler(handlerName, bridgePayload);
          console.log(PUSH_DEBUG_PREFIX, "Native notification handler succeeded", { handlerName });
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
    console.log(PUSH_DEBUG_PREFIX, "playPushSound called", {
      notificationKey: getNotificationKey(payload),
      pushSoundUnlocked,
      notificationPermission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
      payload,
    });
    const usedNativeBridge = await triggerWebViewNativeNotification(payload);

    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      console.log(PUSH_DEBUG_PREFIX, "Triggering vibration");
      navigator.vibrate([200, 100, 200, 100, 300]);
    }

    if (usedNativeBridge) {
      console.log(PUSH_DEBUG_PREFIX, "Push sound handled by native bridge");
      return;
    }

    if (!pushSoundUnlocked) {
      console.warn(PUSH_DEBUG_PREFIX, "Push sound blocked because sound is not enabled/unlocked");
      return;
    }

    const players = createPushPlaybackAudio();
    for (const audio of players) {
      try {
        audio.currentTime = 0;
        await audio.play();
        console.log(PUSH_DEBUG_PREFIX, "Audio playback succeeded", { source: audio.src });
        return;
      } catch (error) {
        console.warn(PUSH_DEBUG_PREFIX, "Audio playback failed", {
          source: audio.src,
          error: error?.message || error,
        });
        // Try next fallback sound source.
      }
    }

    await playSynthNotificationBeep();
  } catch (error) {
    console.warn(PUSH_DEBUG_PREFIX, "playPushSound failed", { error: error?.message || error });
  }
}

function setupPushSoundUnlock() {
  if (typeof window === "undefined" || pushSoundUnlocked) return;

  const unlock = async () => {
    let audio = null;
    try {
      audio = ensurePushSoundAudio();
      if (!audio) return;
      console.log(PUSH_DEBUG_PREFIX, "Attempting passive push sound unlock");
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      pushSoundUnlocked = true;
      localStorage.setItem(pushSoundEnabledStorageKey, "true");
      console.log(PUSH_DEBUG_PREFIX, "Passive push sound unlock succeeded");
      window.dispatchEvent(new CustomEvent("push-sound-enabled"));
    } catch (error) {
      console.warn(PUSH_DEBUG_PREFIX, "Passive push sound unlock failed", {
        error: error?.message || error,
      });
    } finally {
      if (audio) {
        audio.muted = false;
      }
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

export async function enablePushNotificationSound() {
  if (typeof window === "undefined") return false;

  let audio = null;
  try {
    audio = ensurePushSoundAudio();
    if (!audio) return false;
    console.log(PUSH_DEBUG_PREFIX, "Manual push sound enable started");
    audio.muted = true;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    pushSoundUnlocked = true;
    localStorage.setItem(pushSoundEnabledStorageKey, "true");
    window.dispatchEvent(new CustomEvent("push-sound-enabled"));

    const players = createPushPlaybackAudio();
    for (const previewAudio of players) {
      try {
        previewAudio.currentTime = 0;
        await previewAudio.play();
        console.log(PUSH_DEBUG_PREFIX, "Manual sound preview succeeded", { source: previewAudio.src });
        return true;
      } catch (error) {
        console.warn(PUSH_DEBUG_PREFIX, "Manual sound preview failed", {
          source: previewAudio.src,
          error: error?.message || error,
        });
        // Try next preview source.
      }
    }

    await playSynthNotificationBeep();
    return true;
  } catch (error) {
    console.warn(PUSH_DEBUG_PREFIX, "Manual push sound enable failed, trying synth beep", {
      error: error?.message || error,
    });
    try {
      await playSynthNotificationBeep();
      pushSoundUnlocked = true;
      localStorage.setItem(pushSoundEnabledStorageKey, "true");
      window.dispatchEvent(new CustomEvent("push-sound-enabled"));
      }
    catch (beepError) {
      console.warn(PUSH_DEBUG_PREFIX, "Synth beep fallback failed", {
        error: beepError?.message || beepError,
      });
      return false;
    }
    return true;
  } finally {
    if (audio) {
      audio.muted = false;
    }
  }
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

function showForegroundNotification(payload = {}) {
  const notificationKey = getNotificationKey(payload);
  console.log(PUSH_DEBUG_PREFIX, "showForegroundNotification received", { notificationKey, payload });
  if (wasRecentlyHandled(notificationKey)) {
    return;
  }

  const title =
    payload?.notification?.title ||
    payload?.data?.title ||
    "New notification";
  const body =
    payload?.notification?.body ||
    payload?.data?.body ||
    "";
  const image =
    payload?.notification?.image ||
    payload?.notification?.imageUrl ||
    payload?.data?.image ||
    payload?.data?.imageUrl ||
    undefined;

  playPushSound(payload);

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      console.log(PUSH_DEBUG_PREFIX, "Showing browser notification from page", {
        title,
        body,
        image,
        notificationKey,
      });
      new Notification(title, {
        body,
        icon: "/favicon.ico",
        image,
        tag: notificationKey || undefined,
      });
    } catch (error) {
      console.warn(PUSH_DEBUG_PREFIX, "Browser notification creation failed", {
        error: error?.message || error,
      });
    }
  }

  if (body) {
    toast.success(`${title}: ${body}`);
  } else {
    toast.success(title);
  }
}

function attachServiceWorkerMessageListener() {
  if (serviceWorkerMessageListenerAttached || typeof window === "undefined") {
    return;
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event?.data?.type !== "push-notification-received") return;
      console.log(PUSH_DEBUG_PREFIX, "Received service worker message in page", { payload: event.data.payload });
      showForegroundNotification(event.data.payload || {});
    });
  }

  if (typeof BroadcastChannel !== "undefined") {
    serviceWorkerBroadcastChannel = new BroadcastChannel("push-notifications");
    serviceWorkerBroadcastChannel.addEventListener("message", (event) => {
      if (event?.data?.type !== "push-notification-received") return;
      console.log(PUSH_DEBUG_PREFIX, "Received BroadcastChannel push message in page", { payload: event.data.payload });
      showForegroundNotification(event.data.payload || {});
    });
  }

  serviceWorkerMessageListenerAttached = true;
}

export function initPushNotificationClient() {
  if (typeof window === "undefined") return;
  console.log(PUSH_DEBUG_PREFIX, "Initializing push notification client", {
    path: window.location.pathname,
    soundEnabled: isPushSoundEnabled(),
  });

  if (isPushSoundEnabled()) {
    pushSoundUnlocked = true;
  }

  setupPushSoundUnlock();
  attachServiceWorkerMessageListener();
}

async function attachForegroundListener(firebaseAppInstance) {
  if (foregroundListenerAttached) return;

  const { getMessaging, onMessage, isSupported } = await import("firebase/messaging");
  const supported = await isSupported().catch(() => false);
  if (!supported) return;

  const messaging = getMessaging(firebaseAppInstance);
  setupPushSoundUnlock();
  attachServiceWorkerMessageListener();

  onMessage(messaging, (payload) => {
    console.log(PUSH_DEBUG_PREFIX, "Received Firebase foreground message", { payload });
    showForegroundNotification(payload);
  });

  foregroundListenerAttached = true;
}

export async function registerWebPushForCurrentModule(pathname = window.location.pathname) {
  initPushNotificationClient();

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
    console.log(PUSH_DEBUG_PREFIX, "Service worker registered for push", {
      scope: registration.scope,
      moduleName,
    });
    const messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: firebasePublicEnv.vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) return;
    console.log(PUSH_DEBUG_PREFIX, "FCM token resolved", {
      moduleName,
      tokenPreview: `${token.slice(0, 12)}...`,
    });

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

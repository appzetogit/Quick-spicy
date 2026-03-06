/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

const sanitize = (value) => String(value || "").trim().replace(/^['"]|['"]$/g, "");
const pushBroadcastChannel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("push-notifications") : null;
const PUSH_DEBUG_PREFIX = "[push-sw]";
const getNotificationKey = (payload) =>
  payload?.data?.notificationId ||
  payload?.data?.messageId ||
  payload?.messageId ||
  [
    payload?.notification?.title || payload?.data?.title || "",
    payload?.notification?.body || payload?.data?.body || "",
    payload?.data?.orderId || "",
    payload?.data?.targetUrl || payload?.data?.link || "",
  ].join("::");

async function notifyOpenClients(payload) {
  console.log(PUSH_DEBUG_PREFIX, "Broadcasting push to open clients", { payload });
  try {
    pushBroadcastChannel?.postMessage({
      type: "push-notification-received",
      payload,
    });
  } catch {
    // Ignore BroadcastChannel delivery issues and continue with postMessage.
  }

  const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
  windowClients.forEach((client) => {
    client.postMessage({
      type: "push-notification-received",
      payload,
    });
  });
}

async function hasVisibleClient() {
  const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const visibleClient = windowClients.find(
    (client) => client.visibilityState === "visible" || client.focused,
  );
  console.log(PUSH_DEBUG_PREFIX, "Visible client check", {
    count: windowClients.length,
    hasVisibleClient: Boolean(visibleClient),
    clients: windowClients.map((client) => ({
      url: client.url,
      visibilityState: client.visibilityState,
      focused: client.focused,
    })),
  });
  return Boolean(visibleClient);
}

async function loadFirebaseWebConfig() {
  const candidates = ["/api/env/public"];
  if (self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1") {
    candidates.push("http://localhost:5000/api/env/public");
  }

  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const json = await response.json();
      const data = (json && json.data) || {};
      const config = {
        apiKey: sanitize(data.FIREBASE_API_KEY),
        authDomain: sanitize(data.FIREBASE_AUTH_DOMAIN),
        projectId: sanitize(data.FIREBASE_PROJECT_ID),
        appId: sanitize(data.FIREBASE_APP_ID),
        messagingSenderId: sanitize(data.FIREBASE_MESSAGING_SENDER_ID),
        storageBucket: sanitize(data.FIREBASE_STORAGE_BUCKET),
        measurementId: sanitize(data.MEASUREMENT_ID),
      };

      if (config.apiKey && config.projectId && config.appId && config.messagingSenderId) {
        console.log(PUSH_DEBUG_PREFIX, "Loaded Firebase web config");
        return config;
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

(async () => {
  const config = await loadFirebaseWebConfig();
  if (!config || !config.apiKey || !config.projectId || !config.appId || !config.messagingSenderId) {
    return;
  }

  firebase.initializeApp(config);
  console.log(PUSH_DEBUG_PREFIX, "Firebase messaging service worker initialized");
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(async (payload) => {
    console.log(PUSH_DEBUG_PREFIX, "Received Firebase background message", { payload });
    await notifyOpenClients(payload);

    if (await hasVisibleClient()) {
      console.log(PUSH_DEBUG_PREFIX, "Skipping service worker notification because app tab is visible");
      return;
    }

    if (payload?.notification?.title || payload?.notification?.body) {
      console.log(PUSH_DEBUG_PREFIX, "Skipping manual showNotification because payload already has notification");
      return;
    }

    const title = payload?.data?.title || "New Notification";
    const body = payload?.data?.body || "";
    const image =
      payload?.data?.image ||
      payload?.data?.imageUrl ||
      undefined;
    const notificationKey = getNotificationKey(payload);
    console.log(PUSH_DEBUG_PREFIX, "Showing service worker notification", {
      title,
      body,
      image,
      notificationKey,
    });

    self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      image,
      tag: notificationKey,
      renotify: false,
      silent: false,
      requireInteraction: false,
      vibrate: [200, 100, 200, 100, 300],
      data: payload?.data || {},
    });
  });
})();

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    console.log(PUSH_DEBUG_PREFIX, "Received raw push event", { payload });
    event.waitUntil(
      (async () => {
        await notifyOpenClients(payload);
        if (await hasVisibleClient()) {
          console.log(PUSH_DEBUG_PREFIX, "Raw push handled by visible tab; worker notification suppressed");
        }
      })(),
    );
  } catch {
    // Ignore malformed payloads.
  }
});

self.addEventListener("notificationclick", (event) => {
  console.log(PUSH_DEBUG_PREFIX, "Notification click received", {
    data: event?.notification?.data || {},
  });
  event.notification.close();
  const rawLink =
    event?.notification?.data?.link ||
    event?.notification?.data?.click_action ||
    event?.notification?.data?.targetUrl ||
    "/";
  const targetUrl = String(rawLink || "/").startsWith("/") ? String(rawLink || "/") : "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const client = windowClients.find((c) => c.url.includes(self.location.origin));
      if (client) {
        client.focus();
        return client.navigate(targetUrl);
      }
      return clients.openWindow(targetUrl);
    }),
  );
});

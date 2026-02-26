/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

const sanitize = (value) => String(value || "").trim().replace(/^['"]|['"]$/g, "");

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
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || "New Notification";
    const body = payload?.notification?.body || "";
    const image =
      payload?.notification?.image ||
      payload?.notification?.imageUrl ||
      payload?.data?.image ||
      payload?.data?.imageUrl ||
      undefined;

    self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      image,
      data: payload?.data || {},
    });
  });
})();

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = "/";
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

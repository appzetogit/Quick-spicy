/* eslint-disable no-undef */

const PUSH_DEBUG_PREFIX = "[push-sw]";
const pushDebugLog = () => {};

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
  const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
  windowClients.forEach((client) => {
    client.postMessage({
      type: "push-notification-received",
      payload,
    });
  });
}

function getTargetPathFromPayload(payload = {}) {
  const rawTarget =
    payload?.data?.targetUrl ||
    payload?.data?.link ||
    payload?.data?.click_action ||
    payload?.fcmOptions?.link ||
    "/";

  try {
    const url = new URL(rawTarget, self.location.origin);
    return url.pathname || "/";
  } catch {
    return "/";
  }
}

async function hasVisibleClientForTarget(payload = {}) {
  const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const targetPath = getTargetPathFromPayload(payload);
  const targetRoot = `/${String(targetPath).split("/").filter(Boolean)[0] || ""}`;

  return windowClients.some((client) => {
    const isVisible = client.visibilityState === "visible" || client.focused;
    if (!isVisible) return false;
    try {
      const clientUrl = new URL(client.url);
      if (targetRoot === "/" || !targetRoot) return true;
      return clientUrl.pathname.startsWith(targetRoot);
    } catch {
      return false;
    }
  });
}

function normalizePushPayload(rawPayload = {}) {
  const data = rawPayload?.data && typeof rawPayload.data === "object" ? rawPayload.data : {};
  const notification =
    rawPayload?.notification && typeof rawPayload.notification === "object"
      ? rawPayload.notification
      : {};

  return {
    ...rawPayload,
    data,
    notification,
  };
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      if (!event.data) return;

      let payload = {};
      try {
        payload = normalizePushPayload(event.data.json());
      } catch {
        return;
      }

      pushDebugLog(PUSH_DEBUG_PREFIX, "Received raw push event", { payload });

      const visibleClient = await hasVisibleClientForTarget(payload);
      if (visibleClient) {
        await notifyOpenClients(payload);
        return;
      }

      const title = payload?.notification?.title || payload?.data?.title || "New Notification";
      const body = payload?.notification?.body || payload?.data?.body || "";
      const image =
        payload?.notification?.image ||
        payload?.data?.image ||
        payload?.data?.imageUrl ||
        undefined;
      const notificationKey = getNotificationKey(payload);

      await self.registration.showNotification(title, {
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
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  pushDebugLog(PUSH_DEBUG_PREFIX, "pushsubscriptionchange received");
  event.waitUntil(Promise.resolve());
});

self.addEventListener("notificationclick", (event) => {
  pushDebugLog(PUSH_DEBUG_PREFIX, "notificationclick received", {
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
      const sameOriginClient = windowClients.find((client) => {
        try {
          const clientUrl = new URL(client.url);
          return clientUrl.origin === self.location.origin;
        } catch {
          return false;
        }
      });

      if (sameOriginClient) {
        return sameOriginClient.focus().then(() => sameOriginClient.navigate(targetUrl));
      }
      return clients.openWindow(targetUrl);
    }),
  );
});

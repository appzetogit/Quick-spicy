import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { BellRing, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enablePushNotificationSound, isPushSoundEnabled } from "@/lib/utils/firebaseMessaging";

export default function PushSoundEnableButton() {
  const location = useLocation();
  const [enabled, setEnabled] = useState(() => isPushSoundEnabled());
  const [permission, setPermission] = useState(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isAdminRoute = location.pathname.startsWith("/admin");
  const shouldShowPrompt = useMemo(() => {
    if (isAdminRoute) return false;
    if (permission === "denied") return false;
    return permission !== "granted" || !enabled;
  }, [enabled, isAdminRoute, permission]);

  useEffect(() => {
    const syncState = () => {
      setEnabled(isPushSoundEnabled());
      setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    };
    window.addEventListener("push-sound-enabled", syncState);
    return () => window.removeEventListener("push-sound-enabled", syncState);
  }, []);

  const handleEnable = async () => {
    setIsSubmitting(true);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      const requestedPermission = await Notification.requestPermission();
      setPermission(requestedPermission);
      if (requestedPermission !== "granted") {
        setIsSubmitting(false);
        return;
      }
    }

    const success = await enablePushNotificationSound();
    setEnabled(success || isPushSoundEnabled());
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    setIsSubmitting(false);
  };

  if (!shouldShowPrompt) return null;

  const title = permission === "granted" ? "Enable push sound" : "Enable notifications";
  const description =
    permission === "granted"
      ? "Click once to allow notification sound in this browser."
      : "Allow browser notifications first, then sound will be enabled automatically.";
  const buttonLabel =
    permission === "granted"
      ? "Enable Sound"
      : "Allow Notifications";

  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-[calc(100vw-2rem)]">
      <div className="rounded-2xl border border-amber-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <BellRing className="h-4 w-4 text-amber-600" />
          {title}
        </div>
        <p className="mb-3 text-xs text-slate-600">
          {description}
        </p>
        <Button
          type="button"
          onClick={handleEnable}
          disabled={isSubmitting}
          className="h-9 w-full bg-slate-900 text-white hover:bg-slate-800"
        >
          <Volume2 className="mr-2 h-4 w-4" />
          {isSubmitting ? "Enabling..." : buttonLabel}
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { BellRing, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enablePushNotificationSound, isPushSoundEnabled } from "@/lib/utils/firebaseMessaging";

export default function PushSoundEnableButton() {
  const [enabled, setEnabled] = useState(() => isPushSoundEnabled());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const syncState = () => setEnabled(isPushSoundEnabled());
    window.addEventListener("push-sound-enabled", syncState);
    return () => window.removeEventListener("push-sound-enabled", syncState);
  }, []);

  const handleEnable = async () => {
    setIsSubmitting(true);
    const success = await enablePushNotificationSound();
    setEnabled(success || isPushSoundEnabled());
    setIsSubmitting(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-[calc(100vw-2rem)]">
      <div className="rounded-2xl border border-amber-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <BellRing className="h-4 w-4 text-amber-600" />
          {enabled ? "Push sound ready" : "Enable push sound"}
        </div>
        <p className="mb-3 text-xs text-slate-600">
          {enabled
            ? "Use this button to replay the sound and verify browser audio."
            : "Click once to allow notification sound in this browser."}
        </p>
        <Button
          type="button"
          onClick={handleEnable}
          disabled={isSubmitting}
          className="h-9 w-full bg-slate-900 text-white hover:bg-slate-800"
        >
          <Volume2 className="mr-2 h-4 w-4" />
          {isSubmitting ? "Testing..." : enabled ? "Test Sound" : "Enable Sound"}
        </Button>
      </div>
    </div>
  );
}

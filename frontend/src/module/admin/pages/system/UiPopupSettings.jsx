import { useEffect, useRef, useState } from "react";
import { BellRing, Loader2, Save, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const debugError = () => {};

export default function UiPopupSettings() {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    enabled: false,
    message: "",
    imageFile: null,
    imagePreviewUrl: "",
    existingImageUrl: "",
    removeImage: false,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const response = await api.get("/hero-banners/landing/settings");
        const settings = response?.data?.data?.settings || {};
        setFormData({
          enabled: Boolean(settings?.homePopup?.enabled),
          message: settings?.homePopup?.message || "",
          imageFile: null,
          imagePreviewUrl: "",
          existingImageUrl: settings?.homePopup?.imageUrl || "",
          removeImage: false,
        });
      } catch (error) {
        debugError("Failed to fetch UI popup settings:", error);
        toast.error(error?.response?.data?.message || "Failed to load UI popup settings");
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  useEffect(() => {
    return () => {
      if (formData.imagePreviewUrl) {
        URL.revokeObjectURL(formData.imagePreviewUrl);
      }
    };
  }, [formData.imagePreviewUrl]);

  const currentPreviewImage = formData.removeImage
    ? ""
    : formData.imagePreviewUrl || formData.existingImageUrl;

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (formData.imagePreviewUrl) {
      URL.revokeObjectURL(formData.imagePreviewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setFormData((prev) => ({
      ...prev,
      imageFile: file,
      imagePreviewUrl: previewUrl,
      removeImage: false,
    }));
  };

  const handleRemoveImage = () => {
    if (formData.imagePreviewUrl) {
      URL.revokeObjectURL(formData.imagePreviewUrl);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setFormData((prev) => ({
      ...prev,
      imageFile: null,
      imagePreviewUrl: "",
      removeImage: true,
    }));
  };

  const handleSave = async () => {
    const trimmedMessage = formData.message.trim();
    const hasImage = Boolean(currentPreviewImage || formData.imageFile);

    if (formData.enabled && !trimmedMessage && !hasImage) {
      toast.error("Add a popup message or image before enabling it");
      return;
    }

    try {
      setSaving(true);
      const payload = new FormData();
      payload.append("homePopup[enabled]", String(formData.enabled));
      payload.append("homePopup[message]", trimmedMessage);
      payload.append("homePopup[removeImage]", String(formData.removeImage));

      if (formData.imageFile) {
        payload.append("image", formData.imageFile);
      }

      const response = await api.patch("/hero-banners/landing/settings", payload, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const savedPopup = response?.data?.data?.settings?.homePopup || {};

      setFormData((prev) => ({
        ...prev,
        message: trimmedMessage,
        imageFile: null,
        existingImageUrl: savedPopup.imageUrl || "",
        imagePreviewUrl: "",
        removeImage: false,
      }));
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      toast.success("UI popup settings saved");
    } catch (error) {
      debugError("Failed to save UI popup settings:", error);
      toast.error(error?.response?.data?.message || "Failed to save UI popup settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-700">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">Loading popup settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-6 text-white shadow-lg">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
              <BellRing className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Homepage UI Popup</h1>
              <p className="max-w-2xl text-sm text-white/90">
                Show a custom popup on `http://localhost:5173/` for announcements like holiday closures,
                special notices, or temporary service updates.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Popup status</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Turn this on to show the announcement popup on the user homepage.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${
                  formData.enabled ? "bg-emerald-500" : "bg-slate-300"
                }`}
                aria-pressed={formData.enabled}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    formData.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div>
              <label htmlFor="ui-popup-message" className="mb-2 block text-sm font-semibold text-slate-800">
                Popup message
              </label>
              <textarea
                id="ui-popup-message"
                rows={5}
                maxLength={500}
                value={formData.message}
                onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
                placeholder="Today is closed on the occasion of Bakri Eid."
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
              <div className="mt-2 flex items-center justify-between gap-4 text-xs text-slate-500">
                <span>The user can dismiss it locally after seeing it.</span>
                <span>{formData.message.length}/500</span>
              </div>
            </div>

            <div>
              <label htmlFor="ui-popup-image" className="mb-2 block text-sm font-semibold text-slate-800">
                Popup image
              </label>
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  id="ui-popup-image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-orange-400 hover:bg-orange-50"
                >
                  <Upload className="h-4 w-4" />
                  {currentPreviewImage ? "Replace image" : "Upload image"}
                </button>
                <p className="text-xs text-slate-500">
                  Optional. Upload an image and it will show inside the popup above the message.
                </p>
                {currentPreviewImage ? (
                  <div className="space-y-3 rounded-2xl border border-slate-200 p-3">
                    <img
                      src={currentPreviewImage}
                      alt="Popup upload preview"
                      className="h-44 w-full rounded-2xl object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove image
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Sparkles className="h-4 w-4 text-orange-500" />
                Preview
              </div>
              <div className="space-y-3">
                {currentPreviewImage ? (
                  <img
                    src={currentPreviewImage}
                    alt="Popup preview"
                    className="h-44 w-full rounded-2xl object-cover"
                  />
                ) : null}
                <p className="text-sm text-slate-600">
                  {formData.message.trim() || "Your popup message preview will appear here."}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving..." : "Save popup"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { adminAPI } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";

const createDefaultItem = () => ({
  id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  name: "",
  price: 0,
  description: "",
  foodType: "Non-Veg",
  isAvailable: true,
  image: "",
});

const createDefaultSection = (index = 0) => ({
  id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  name: `Section ${index + 1}`,
  isEnabled: true,
  order: index,
  items: [],
  subsections: [],
});

const getImagePreviewSrc = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("data:image/")) return raw;
  if (raw.startsWith("blob:")) return raw;
  if (raw.startsWith("/")) return raw;
  return "";
};

export default function RestaurantMenuManager() {
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [sections, setSections] = useState([]);
  const [loadingRestaurants, setLoadingRestaurants] = useState(true);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");

  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        setLoadingRestaurants(true);
        const response = await adminAPI.getRestaurants({ limit: 500, page: 1 });
        const data = response?.data?.data?.restaurants || response?.data?.data || [];
        const mapped = (Array.isArray(data) ? data : [])
          .map((restaurant) => ({
            id: restaurant?._id || restaurant?.id,
            name: restaurant?.name || "Unnamed Restaurant",
          }))
          .filter((restaurant) => restaurant.id);
        setRestaurants(mapped);
      } catch (error) {
        toast.error(error?.response?.data?.message || "Failed to load restaurants");
      } finally {
        setLoadingRestaurants(false);
      }
    };

    fetchRestaurants();
  }, []);

  useEffect(() => {
    const fetchMenu = async () => {
      if (!selectedRestaurantId) {
        setSections([]);
        return;
      }

      try {
        setLoadingMenu(true);
        const response = await adminAPI.getRestaurantMenuById(selectedRestaurantId);
        const menu = response?.data?.data?.menu || {};
        setSections(Array.isArray(menu.sections) ? menu.sections : []);
      } catch (error) {
        toast.error(error?.response?.data?.message || "Failed to load restaurant menu");
        setSections([]);
      } finally {
        setLoadingMenu(false);
      }
    };

    fetchMenu();
  }, [selectedRestaurantId]);

  const selectedRestaurantName = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === selectedRestaurantId)?.name || "",
    [restaurants, selectedRestaurantId],
  );

  const addSection = () => {
    const label = newSectionName.trim() || `Section ${sections.length + 1}`;
    setSections((prev) => [
      ...prev,
      {
        ...createDefaultSection(prev.length),
        name: label,
      },
    ]);
    setNewSectionName("");
  };

  const removeSection = (sectionId) => {
    setSections((prev) => prev.filter((section) => String(section.id) !== String(sectionId)));
  };

  const updateSectionField = (sectionId, key, value) => {
    setSections((prev) =>
      prev.map((section) =>
        String(section.id) === String(sectionId) ? { ...section, [key]: value } : section,
      ),
    );
  };

  const addItem = (sectionId) => {
    setSections((prev) =>
      prev.map((section) =>
        String(section.id) === String(sectionId)
          ? { ...section, items: [...(section.items || []), createDefaultItem()] }
          : section,
      ),
    );
  };

  const removeItem = (sectionId, itemId) => {
    setSections((prev) =>
      prev.map((section) =>
        String(section.id) === String(sectionId)
          ? {
              ...section,
              items: (section.items || []).filter((item) => String(item.id) !== String(itemId)),
            }
          : section,
      ),
    );
  };

  const updateItemField = (sectionId, itemId, key, value) => {
    setSections((prev) =>
      prev.map((section) =>
        String(section.id) === String(sectionId)
          ? {
              ...section,
              items: (section.items || []).map((item) =>
                String(item.id) === String(itemId) ? { ...item, [key]: value } : item,
              ),
            }
          : section,
      ),
    );
  };

  const saveMenu = async () => {
    if (!selectedRestaurantId) {
      toast.error("Please select a restaurant first");
      return;
    }

    try {
      setSaving(true);
      await adminAPI.updateRestaurantMenuById(selectedRestaurantId, { sections });
      toast.success("Restaurant menu saved successfully");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save restaurant menu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-end">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900">Restaurant Menu Manager</h1>
              <p className="text-sm text-slate-600 mt-1">
                Select a restaurant, then add/edit menu sections and foods.
              </p>
            </div>
            <div className="w-full lg:w-96">
              <label className="block text-sm font-medium text-slate-700 mb-2">Restaurant</label>
              <select
                value={selectedRestaurantId}
                onChange={(event) => setSelectedRestaurantId(event.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                disabled={loadingRestaurants}
              >
                <option value="">
                  {loadingRestaurants ? "Loading restaurants..." : "Select restaurant"}
                </option>
                {restaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {selectedRestaurantId ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedRestaurantName}</h2>
                <p className="text-xs text-slate-500">Manual menu editor</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  Add new items or edit existing items below
                </span>
                <button
                  type="button"
                  onClick={saveMenu}
                  disabled={saving || loadingMenu}
                  className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{saving ? "Saving..." : "Save Menu"}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-2">
              <input
                type="text"
                value={newSectionName}
                onChange={(event) => setNewSectionName(event.target.value)}
                placeholder="New section name (e.g. Starters)"
                className="flex-1 px-3 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={addSection}
                className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Section</span>
              </button>
            </div>

            {loadingMenu ? (
              <div className="py-12 flex items-center justify-center text-slate-600 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading menu...
              </div>
            ) : sections.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                No sections yet. Add your first section.
              </div>
            ) : (
              <div className="space-y-4">
                {sections.map((section, sectionIndex) => (
                  <div key={section.id || sectionIndex} className="border border-slate-200 rounded-xl p-4">
                    <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                      <input
                        type="text"
                        value={section.name || ""}
                        onChange={(event) =>
                          updateSectionField(section.id, "name", event.target.value)
                        }
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium"
                        placeholder="Section name"
                      />
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={section.isEnabled !== false}
                          onChange={(event) =>
                            updateSectionField(section.id, "isEnabled", event.target.checked)
                          }
                        />
                        Enabled
                      </label>
                      <button
                        type="button"
                        onClick={() => removeSection(section.id)}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Remove Section</span>
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {(section.items || []).map((item, itemIndex) => (
                        <div
                          key={item.id || itemIndex}
                          className="bg-slate-50 rounded-lg border border-slate-200 p-3"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                            <input
                              type="text"
                              value={item.name || ""}
                              onChange={(event) =>
                                updateItemField(section.id, item.id, "name", event.target.value)
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Item name"
                            />
                            <input
                              type="number"
                              min="0"
                              value={Number(item.price) || 0}
                              onChange={(event) =>
                                updateItemField(
                                  section.id,
                                  item.id,
                                  "price",
                                  Number(event.target.value) || 0,
                                )
                              }
                              className="md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Price"
                            />
                            <select
                              value={item.foodType || "Non-Veg"}
                              onChange={(event) =>
                                updateItemField(section.id, item.id, "foodType", event.target.value)
                              }
                              className="md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                            >
                              <option value="Veg">Veg</option>
                              <option value="Non-Veg">Non-Veg</option>
                            </select>
                            <label className="md:col-span-2 inline-flex items-center gap-2 px-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={item.isAvailable !== false}
                                onChange={(event) =>
                                  updateItemField(
                                    section.id,
                                    item.id,
                                    "isAvailable",
                                    event.target.checked,
                                  )
                                }
                              />
                              In Stock
                            </label>
                            <button
                              type="button"
                              onClick={() => removeItem(section.id, item.id)}
                              className="md:col-span-3 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm inline-flex items-center justify-center gap-1.5"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Remove Item</span>
                            </button>
                            <input
                              type="text"
                              value={item.image || ""}
                              onChange={(event) =>
                                updateItemField(section.id, item.id, "image", event.target.value)
                              }
                              className="md:col-span-12 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Image URL (optional)"
                            />
                            <div className="md:col-span-12">
                              {getImagePreviewSrc(item.image) ? (
                                <div className="w-28 h-20 rounded-lg overflow-hidden border border-slate-300 bg-white">
                                  <img
                                    src={getImagePreviewSrc(item.image)}
                                    alt={item.name || "Item preview"}
                                    className="w-full h-full object-cover"
                                    onError={(event) => {
                                      event.currentTarget.style.display = "none";
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="w-28 h-20 rounded-lg border border-dashed border-slate-300 bg-white text-[11px] text-slate-500 flex items-center justify-center px-2 text-center">
                                  No image preview
                                </div>
                              )}
                            </div>
                            <textarea
                              value={item.description || ""}
                              onChange={(event) =>
                                updateItemField(
                                  section.id,
                                  item.id,
                                  "description",
                                  event.target.value,
                                )
                              }
                              rows={2}
                              className="md:col-span-12 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white resize-none"
                              placeholder="Description"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => addItem(section.id)}
                      className="mt-3 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Item</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

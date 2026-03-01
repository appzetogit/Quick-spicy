import { useEffect, useMemo, useState } from "react";
import { adminAPI } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Save, Loader2, Upload, X } from "lucide-react";

const createDefaultItem = () => ({
  id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  name: "",
  price: 0,
  description: "",
  foodType: "Non-Veg",
  isAvailable: true,
  image: "",
  category: "",
  subCategory: "",
  stock: "Unlimited",
  discountType: "Percent",
  discountAmount: 0,
  isRecommended: false,
  variations: [],
  tags: [],
  nutrition: [],
  allergies: [],
  servesInfo: "",
  itemSize: "",
  itemSizeQuantity: "",
  itemSizeUnit: "piece",
  gst: 0,
  preparationTime: "",
});

const createDefaultSection = (index = 0) => ({
  id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  name: `Section ${index + 1}`,
  isEnabled: true,
  order: index,
  items: [],
  subsections: [],
});

const createQuickItemDraft = () => ({
  name: "",
  price: "",
  foodType: "Non-Veg",
  description: "",
  image: "",
  isAvailable: true,
  discountType: "Percent",
  discountAmount: "",
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
  const [quickItemDrafts, setQuickItemDrafts] = useState({});

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

  const addItem = (sectionId, itemPayload = null) => {
    setSections((prev) =>
      prev.map((section) =>
        String(section.id) === String(sectionId)
          ? {
              ...section,
              items: [
                ...(section.items || []),
                itemPayload || {
                  ...createDefaultItem(),
                  category: section?.name || "",
                },
              ],
            }
          : section,
      ),
    );
  };

  const updateQuickItemDraft = (sectionId, key, value) => {
    setQuickItemDrafts((prev) => ({
      ...prev,
      [sectionId]: {
        ...createQuickItemDraft(),
        ...(prev[sectionId] || {}),
        [key]: value,
      },
    }));
  };

  const addQuickItem = (sectionId, sectionName) => {
    const draft = {
      ...createQuickItemDraft(),
      ...(quickItemDrafts[sectionId] || {}),
    };

    if (!String(draft.name || "").trim()) {
      toast.error("Food name is required");
      return;
    }

    const price = Number(draft.price);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Price must be greater than 0");
      return;
    }

    const quickItem = {
      ...createDefaultItem(),
      name: String(draft.name || "").trim(),
      price,
      foodType: draft.foodType === "Veg" ? "Veg" : "Non-Veg",
      description: String(draft.description || "").trim(),
      image: String(draft.image || "").trim(),
      isAvailable: draft.isAvailable !== false,
      discountType: draft.discountType === "Fixed" ? "Fixed" : "Percent",
      discountAmount: Number(draft.discountAmount) || 0,
      category: sectionName || "Varieties",
    };

    addItem(sectionId, quickItem);
    setQuickItemDrafts((prev) => ({
      ...prev,
      [sectionId]: createQuickItemDraft(),
    }));
    toast.success("Food added");
  };

  const handleQuickItemImageUpload = (sectionId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      updateQuickItemDraft(sectionId, "image", reader.result || "");
    };
    reader.readAsDataURL(file);
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

  const moveItemToSection = (sourceSectionId, itemId, targetSectionId) => {
    if (!targetSectionId || String(sourceSectionId) === String(targetSectionId)) return;

    setSections((prev) => {
      let movedItem = null;

      const withoutItem = prev.map((section) => {
        if (String(section.id) !== String(sourceSectionId)) return section;
        const items = section.items || [];
        const targetItem = items.find((item) => String(item.id) === String(itemId));
        if (targetItem) movedItem = targetItem;
        return {
          ...section,
          items: items.filter((item) => String(item.id) !== String(itemId)),
        };
      });

      if (!movedItem) return prev;

      return withoutItem.map((section) => {
        if (String(section.id) !== String(targetSectionId)) return section;
        return {
          ...section,
          items: [
            ...(section.items || []),
            {
              ...movedItem,
              category: section?.name || movedItem?.category || "",
            },
          ],
        };
      });
    });
  };

  const updateArrayFieldFromCSV = (sectionId, itemId, key, csvValue) => {
    const parsed = String(csvValue || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    updateItemField(sectionId, itemId, key, parsed);
  };

  const addVariation = (sectionId, itemId) => {
    const newVariation = {
      id: `variation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: "",
      price: 0,
      stock: "Unlimited",
    };

    setSections((prev) =>
      prev.map((section) =>
        String(section.id) === String(sectionId)
          ? {
              ...section,
              items: (section.items || []).map((item) =>
                String(item.id) === String(itemId)
                  ? {
                      ...item,
                      variations: [...(Array.isArray(item.variations) ? item.variations : []), newVariation],
                    }
                  : item,
              ),
            }
          : section,
      ),
    );
  };

  const updateVariationField = (sectionId, itemId, variationId, key, value) => {
    setSections((prev) =>
      prev.map((section) =>
        String(section.id) === String(sectionId)
          ? {
              ...section,
              items: (section.items || []).map((item) =>
                String(item.id) === String(itemId)
                  ? {
                      ...item,
                      variations: (Array.isArray(item.variations) ? item.variations : []).map((variation) =>
                        String(variation.id) === String(variationId)
                          ? { ...variation, [key]: value }
                          : variation,
                      ),
                    }
                  : item,
              ),
            }
          : section,
      ),
    );
  };

  const removeVariation = (sectionId, itemId, variationId) => {
    setSections((prev) =>
      prev.map((section) =>
        String(section.id) === String(sectionId)
          ? {
              ...section,
              items: (section.items || []).map((item) =>
                String(item.id) === String(itemId)
                  ? {
                      ...item,
                      variations: (Array.isArray(item.variations) ? item.variations : []).filter(
                        (variation) => String(variation.id) !== String(variationId),
                      ),
                    }
                  : item,
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
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <h4 className="text-sm font-semibold text-slate-900 mb-3">Quick Add Food</h4>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                          <input
                            type="text"
                            value={(quickItemDrafts[section.id] || {}).name || ""}
                            onChange={(event) =>
                              updateQuickItemDraft(section.id, "name", event.target.value)
                            }
                            className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                            placeholder="Food name *"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={(quickItemDrafts[section.id] || {}).price || ""}
                            onChange={(event) =>
                              updateQuickItemDraft(section.id, "price", event.target.value)
                            }
                            className="md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                            placeholder="Price *"
                          />
                          <select
                            value={(quickItemDrafts[section.id] || {}).foodType || "Non-Veg"}
                            onChange={(event) =>
                              updateQuickItemDraft(section.id, "foodType", event.target.value)
                            }
                            className="md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                          >
                            <option value="Veg">Veg</option>
                            <option value="Non-Veg">Non-Veg</option>
                          </select>
                          <input
                            type="text"
                            value={(quickItemDrafts[section.id] || {}).image || ""}
                            onChange={(event) =>
                              updateQuickItemDraft(section.id, "image", event.target.value)
                            }
                            className="md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                            placeholder="Image URL"
                          />
                          <div className="md:col-span-1">
                            <label
                              htmlFor={`quick-food-image-${section.id}`}
                              className="h-full w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Upload className="w-4 h-4" />
                              <span>Upload</span>
                            </label>
                            <input
                              id={`quick-food-image-${section.id}`}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) => {
                                handleQuickItemImageUpload(
                                  section.id,
                                  event.target.files?.[0] || null,
                                );
                                event.target.value = "";
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => addQuickItem(section.id, section.name)}
                            className="md:col-span-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 inline-flex items-center justify-center gap-1.5"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Add Food</span>
                          </button>
                          <input
                            type="text"
                            value={(quickItemDrafts[section.id] || {}).description || ""}
                            onChange={(event) =>
                              updateQuickItemDraft(section.id, "description", event.target.value)
                            }
                            className="md:col-span-6 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                            placeholder="Description (optional)"
                          />
                          <select
                            value={(quickItemDrafts[section.id] || {}).discountType || "Percent"}
                            onChange={(event) =>
                              updateQuickItemDraft(section.id, "discountType", event.target.value)
                            }
                            className="md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                          >
                            <option value="Percent">Percent</option>
                            <option value="Fixed">Fixed</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={(quickItemDrafts[section.id] || {}).discountAmount || ""}
                            onChange={(event) =>
                              updateQuickItemDraft(section.id, "discountAmount", event.target.value)
                            }
                            className="md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                            placeholder="Discount"
                          />
                          <label className="md:col-span-2 inline-flex items-center gap-2 px-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={(quickItemDrafts[section.id] || {}).isAvailable !== false}
                              onChange={(event) =>
                                updateQuickItemDraft(section.id, "isAvailable", event.target.checked)
                              }
                            />
                            Available
                          </label>
                          <div className="md:col-span-12">
                            {getImagePreviewSrc((quickItemDrafts[section.id] || {}).image) ? (
                              <div className="w-28 h-20 rounded-lg overflow-hidden border border-slate-300 bg-white relative">
                                <img
                                  src={getImagePreviewSrc((quickItemDrafts[section.id] || {}).image)}
                                  alt="Quick food preview"
                                  className="w-full h-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateQuickItemDraft(section.id, "image", "")}
                                  className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white hover:bg-black/75"
                                  title="Remove image"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">
                                You can paste an image URL or upload an image file.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

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
                            <select
                              value={section.id || ""}
                              onChange={(event) =>
                                moveItemToSection(section.id, item.id, event.target.value)
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                            >
                              {sections.map((sectionOption) => (
                                <option key={sectionOption.id} value={sectionOption.id}>
                                  {sectionOption.name || "Unnamed Section"}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={item.category || ""}
                              onChange={(event) =>
                                updateItemField(section.id, item.id, "category", event.target.value)
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Category label"
                            />
                            <input
                              type="text"
                              value={item.subCategory || ""}
                              onChange={(event) =>
                                updateItemField(section.id, item.id, "subCategory", event.target.value)
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Sub category"
                            />
                            <select
                              value={item.isRecommended === true ? "true" : "false"}
                              onChange={(event) =>
                                updateItemField(
                                  section.id,
                                  item.id,
                                  "isRecommended",
                                  event.target.value === "true",
                                )
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                            >
                              <option value="false">Not Recommended</option>
                              <option value="true">Recommended</option>
                            </select>
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
                            <input
                              type="text"
                              value={item.stock ?? "Unlimited"}
                              onChange={(event) =>
                                updateItemField(section.id, item.id, "stock", event.target.value)
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Stock (e.g. Unlimited / 25)"
                            />
                            <select
                              value={item.discountType || "Percent"}
                              onChange={(event) =>
                                updateItemField(
                                  section.id,
                                  item.id,
                                  "discountType",
                                  event.target.value,
                                )
                              }
                              className="md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                            >
                              <option value="Percent">Percent</option>
                              <option value="Fixed">Fixed</option>
                            </select>
                            <input
                              type="number"
                              min="0"
                              value={Number(item.discountAmount) || 0}
                              onChange={(event) =>
                                updateItemField(
                                  section.id,
                                  item.id,
                                  "discountAmount",
                                  Number(event.target.value) || 0,
                                )
                              }
                              className="md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Discount"
                            />
                            <input
                              type="number"
                              min="0"
                              value={Number(item.gst) || 0}
                              onChange={(event) =>
                                updateItemField(
                                  section.id,
                                  item.id,
                                  "gst",
                                  Number(event.target.value) || 0,
                                )
                              }
                              className="md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="GST %"
                            />
                            <input
                              type="text"
                              value={item.preparationTime || ""}
                              onChange={(event) =>
                                updateItemField(
                                  section.id,
                                  item.id,
                                  "preparationTime",
                                  event.target.value,
                                )
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Preparation time"
                            />
                            <input
                              type="text"
                              value={item.servesInfo || ""}
                              onChange={(event) =>
                                updateItemField(section.id, item.id, "servesInfo", event.target.value)
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Serves info"
                            />
                            <input
                              type="text"
                              value={item.itemSize || ""}
                              onChange={(event) =>
                                updateItemField(section.id, item.id, "itemSize", event.target.value)
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Item size label"
                            />
                            <input
                              type="text"
                              value={item.itemSizeQuantity || ""}
                              onChange={(event) =>
                                updateItemField(
                                  section.id,
                                  item.id,
                                  "itemSizeQuantity",
                                  event.target.value,
                                )
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Item size quantity"
                            />
                            <input
                              type="text"
                              value={item.itemSizeUnit || "piece"}
                              onChange={(event) =>
                                updateItemField(section.id, item.id, "itemSizeUnit", event.target.value)
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Item size unit"
                            />
                            <input
                              type="text"
                              value={(Array.isArray(item.tags) ? item.tags : []).join(", ")}
                              onChange={(event) =>
                                updateArrayFieldFromCSV(
                                  section.id,
                                  item.id,
                                  "tags",
                                  event.target.value,
                                )
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Tags (comma separated)"
                            />
                            <input
                              type="text"
                              value={(Array.isArray(item.nutrition) ? item.nutrition : []).join(", ")}
                              onChange={(event) =>
                                updateArrayFieldFromCSV(
                                  section.id,
                                  item.id,
                                  "nutrition",
                                  event.target.value,
                                )
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Nutrition (comma separated)"
                            />
                            <input
                              type="text"
                              value={(Array.isArray(item.allergies) ? item.allergies : []).join(", ")}
                              onChange={(event) =>
                                updateArrayFieldFromCSV(
                                  section.id,
                                  item.id,
                                  "allergies",
                                  event.target.value,
                                )
                              }
                              className="md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                              placeholder="Allergies (comma separated)"
                            />
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
                            <div className="md:col-span-12 border border-slate-200 rounded-lg p-3 bg-white">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-medium text-slate-800">Variations</h4>
                                <button
                                  type="button"
                                  onClick={() => addVariation(section.id, item.id)}
                                  className="px-2 py-1 border border-slate-300 rounded text-xs hover:bg-slate-50 inline-flex items-center gap-1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Add Variation</span>
                                </button>
                              </div>
                              {(Array.isArray(item.variations) ? item.variations : []).length === 0 ? (
                                <p className="text-xs text-slate-500">No variations added.</p>
                              ) : (
                                <div className="space-y-2">
                                  {(Array.isArray(item.variations) ? item.variations : []).map(
                                    (variation) => (
                                      <div
                                        key={variation.id}
                                        className="grid grid-cols-1 md:grid-cols-12 gap-2"
                                      >
                                        <input
                                          type="text"
                                          value={variation.name || ""}
                                          onChange={(event) =>
                                            updateVariationField(
                                              section.id,
                                              item.id,
                                              variation.id,
                                              "name",
                                              event.target.value,
                                            )
                                          }
                                          className="md:col-span-5 px-3 py-2 border border-slate-300 rounded text-sm"
                                          placeholder="Variation name"
                                        />
                                        <input
                                          type="number"
                                          min="0"
                                          value={Number(variation.price) || 0}
                                          onChange={(event) =>
                                            updateVariationField(
                                              section.id,
                                              item.id,
                                              variation.id,
                                              "price",
                                              Number(event.target.value) || 0,
                                            )
                                          }
                                          className="md:col-span-3 px-3 py-2 border border-slate-300 rounded text-sm"
                                          placeholder="Price"
                                        />
                                        <input
                                          type="text"
                                          value={variation.stock ?? "Unlimited"}
                                          onChange={(event) =>
                                            updateVariationField(
                                              section.id,
                                              item.id,
                                              variation.id,
                                              "stock",
                                              event.target.value,
                                            )
                                          }
                                          className="md:col-span-3 px-3 py-2 border border-slate-300 rounded text-sm"
                                          placeholder="Stock"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeVariation(section.id, item.id, variation.id)
                                          }
                                          className="md:col-span-1 px-2 py-2 text-red-600 hover:bg-red-50 rounded inline-flex items-center justify-center"
                                          title="Remove variation"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
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
                      <span>Add Blank Item (Advanced)</span>
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

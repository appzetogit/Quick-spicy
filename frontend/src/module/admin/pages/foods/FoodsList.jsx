import { useState, useMemo, useEffect, useCallback } from "react"
import { Search, Trash2, Loader2, Eye, Pencil, Plus, Save, ChevronDown } from "lucide-react"
import { adminAPI, uploadAPI } from "@/lib/api"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const createFoodForm = () => ({
  restaurantId: "",
  sectionName: "",
  name: "",
  price: "",
  description: "",
  image: "",
  foodType: "Non-Veg",
  isAvailable: true,
  preparationTime: "",
})

export default function FoodsList() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRestaurant, setSelectedRestaurant] = useState("all")
  const [foods, setFoods] = useState([])
  const [restaurantsForFilter, setRestaurantsForFilter] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [selectedFood, setSelectedFood] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showFoodFormModal, setShowFoodFormModal] = useState(false)
  const [foodFormMode, setFoodFormMode] = useState("add")
  const [foodForm, setFoodForm] = useState(createFoodForm())
  const [editingFood, setEditingFood] = useState(null)
  const [submittingFood, setSubmittingFood] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState([])
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState("")

  const getItemCreatedMs = (item = {}) => {
    const direct = [item.createdAt, item.addedAt, item.requestedAt, item.updatedAt]
      .map((v) => new Date(v).getTime())
      .find((ms) => Number.isFinite(ms) && ms > 0)
    if (direct) return direct

    const rawId = String(item.id || "")
    const match = rawId.match(/\d{10,}/)
    if (match) {
      const fromId = Number(match[0])
      if (Number.isFinite(fromId) && fromId > 0) return fromId
    }
    return 0
  }

  const toArray = (value) => (Array.isArray(value) ? value : [])

  const fetchAllFoods = useCallback(async () => {
    try {
      setLoading(true)

      const [activeRestaurantsResponse, inactiveRestaurantsResponse] = await Promise.all([
        adminAPI.getRestaurants({ limit: 1000 }),
        adminAPI.getRestaurants({ limit: 1000, status: "inactive" }),
      ])

      const activeRestaurants = activeRestaurantsResponse?.data?.data?.restaurants ||
        activeRestaurantsResponse?.data?.restaurants ||
        []
      const inactiveRestaurants = inactiveRestaurantsResponse?.data?.data?.restaurants ||
        inactiveRestaurantsResponse?.data?.restaurants ||
        []

      const restaurantsMap = new Map()
      ;[...activeRestaurants, ...inactiveRestaurants].forEach((restaurant) => {
        const restaurantId = String(restaurant?._id || restaurant?.id || "")
        if (!restaurantId) return
        if (!restaurantsMap.has(restaurantId)) {
          restaurantsMap.set(restaurantId, restaurant)
        }
      })
      const restaurants = Array.from(restaurantsMap.values())
      setRestaurantsForFilter(
        restaurants
          .map((restaurant) => ({
            id: String(restaurant?._id || restaurant?.id || ""),
            name: restaurant?.name || "Unknown Restaurant",
          }))
          .filter((restaurant) => restaurant.id)
          .sort((a, b) => a.name.localeCompare(b.name))
      )

      if (restaurants.length === 0) {
        setFoods([])
        return
      }

      const allFoods = []

      for (const restaurant of restaurants) {
        try {
          const restaurantId = restaurant._id || restaurant.id
          const menuResponse = await adminAPI.getRestaurantMenuById(restaurantId)
          const menu = menuResponse?.data?.data?.menu || menuResponse?.data?.menu

          if (menu && Array.isArray(menu.sections)) {
            toArray(menu.sections).forEach((section) => {
              toArray(section.items).forEach((item) => {
                allFoods.push({
                  id: item.id || `${restaurantId}-${section.id}-${item.name}`,
                  _id: item._id,
                  name: item.name || "Unnamed Item",
                  image: item.image || item.images?.[0] || "https://via.placeholder.com/40",
                  priority: "Normal",
                  status: item.isAvailable !== false && item.approvalStatus !== "rejected",
                  restaurantId,
                  restaurantName: restaurant.name || "Unknown Restaurant",
                  sectionId: section.id,
                  sectionName: section.name || "Unknown Section",
                  price: item.price || 0,
                  foodType: item.foodType || "Non-Veg",
                  approvalStatus: item.approvalStatus || "pending",
                  originalItem: item,
                })
              })

              toArray(section.subsections).forEach((subsection) => {
                toArray(subsection.items).forEach((item) => {
                  allFoods.push({
                    id: item.id || `${restaurantId}-${section.id}-${subsection.id}-${item.name}`,
                    _id: item._id,
                    name: item.name || "Unnamed Item",
                    image: item.image || item.images?.[0] || "https://via.placeholder.com/40",
                    priority: "Normal",
                    status: item.isAvailable !== false && item.approvalStatus !== "rejected",
                    restaurantId,
                    restaurantName: restaurant.name || "Unknown Restaurant",
                    sectionId: section.id,
                    sectionName: section.name || "Unknown Section",
                    subsectionId: subsection.id,
                    subsectionName: subsection.name || "Unknown Subsection",
                    price: item.price || 0,
                    foodType: item.foodType || "Non-Veg",
                    approvalStatus: item.approvalStatus || "pending",
                    originalItem: item,
                  })
                })
              })
            })
          }
        } catch (error) {
          console.warn(`Failed to fetch menu for restaurant ${restaurant._id || restaurant.id}:`, error.message)
        }
      }

      allFoods.sort((a, b) => getItemCreatedMs(b.originalItem) - getItemCreatedMs(a.originalItem))
      setFoods(
        allFoods.filter(
          (food) => String(food.approvalStatus || "").toLowerCase() === "approved"
        )
      )
    } catch (error) {
      console.error("Error fetching foods:", error)
      toast.error("Failed to load foods from restaurants")
      setFoods([])
      setRestaurantsForFilter([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAllFoods()
  }, [fetchAllFoods])

  // Format ID to FOOD format (e.g., FOOD519399)
  const formatFoodId = (id) => {
    if (!id) return "FOOD000000"
    
    const idString = String(id)
    // Extract last 6 digits from the ID
    // Handle formats like "1768285554154-0.703896654519399" or "item-1768285554154-0.703896654519399"
    const parts = idString.split(/[-.]/)
    let lastDigits = ""
    
    // Get the last part and extract digits
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1]
      // Extract only digits from the last part
      const digits = lastPart.match(/\d+/g)
      if (digits && digits.length > 0) {
        // Get last 6 digits from all digits found
        const allDigits = digits.join("")
        lastDigits = allDigits.slice(-6).padStart(6, "0")
      }
    }
    
    // If no digits found, use a hash of the ID
    if (!lastDigits) {
      const hash = idString.split("").reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0) | 0
      }, 0)
      lastDigits = Math.abs(hash).toString().slice(-6).padStart(6, "0")
    }
    
    return `FOOD${lastDigits}`
  }

  const filteredFoods = useMemo(() => {
    let result = [...foods]
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(food =>
        food.name.toLowerCase().includes(query) ||
        food.id.toString().includes(query) ||
        food.restaurantName?.toLowerCase().includes(query) ||
        food.sectionName?.toLowerCase().includes(query) ||
        food.subsectionName?.toLowerCase().includes(query)
      )
    }

    if (selectedRestaurant !== "all") {
      result = result.filter((food) => String(food.restaurantId) === selectedRestaurant)
    }

    result.sort((a, b) => getItemCreatedMs(b.originalItem) - getItemCreatedMs(a.originalItem))
    return result
  }, [foods, searchQuery, selectedRestaurant])

  const restaurantOptions = useMemo(() => {
    return restaurantsForFilter
  }, [restaurantsForFilter])

  const openAddFoodModal = () => {
    setFoodFormMode("add")
    setEditingFood(null)
    setFoodForm({
      ...createFoodForm(),
      restaurantId: selectedRestaurant !== "all" ? selectedRestaurant : "",
    })
    setSelectedImageFile(null)
    setImagePreviewUrl("")
    setShowFoodFormModal(true)
  }

  const openEditFoodModal = (food) => {
    setFoodFormMode("edit")
    setEditingFood(food)
    setFoodForm({
      restaurantId: String(food.restaurantId || ""),
      sectionName: String(food.sectionName || ""),
      name: String(food.originalItem?.name || ""),
      price: String(food.originalItem?.price ?? ""),
      description: String(food.originalItem?.description || ""),
      image: String(food.originalItem?.image || food.originalItem?.images?.[0] || ""),
      foodType: String(food.originalItem?.foodType || "Non-Veg"),
      isAvailable: food.originalItem?.isAvailable !== false,
      preparationTime: String(food.originalItem?.preparationTime || ""),
    })
    setSelectedImageFile(null)
    setImagePreviewUrl(String(food.originalItem?.image || food.originalItem?.images?.[0] || ""))
    setShowFoodFormModal(true)
  }

  const loadRestaurantMenu = useCallback(async (restaurantId) => {
    const menuResponse = await adminAPI.getRestaurantMenuById(restaurantId)
    return menuResponse?.data?.data?.menu || menuResponse?.data?.menu || { sections: [] }
  }, [])

  useEffect(() => {
    if (!showFoodFormModal || !foodForm.restaurantId) {
      setCategoryOptions([])
      return
    }

    let cancelled = false

    const loadCategoryOptions = async () => {
      try {
        const menu = await loadRestaurantMenu(foodForm.restaurantId)
        const menuSections = Array.isArray(menu.sections) ? menu.sections : []
        const menuOptions = menuSections
          .map((section) => ({
            id: section.id || section.name,
            name: section.name || "Unknown Category",
          }))
          .filter((section) => String(section.name || "").trim())

        const fallbackOptions = foods.reduce((acc, food) => {
          if (String(food.restaurantId) !== String(foodForm.restaurantId)) return acc
          if (!acc.some((section) => String(section.name) === String(food.sectionName || ""))) {
            acc.push({
              id: food.sectionId || food.sectionName,
              name: food.sectionName || "Unknown Category",
            })
          }
          return acc
        }, [])

        const mergedOptions = [...menuOptions, ...fallbackOptions].filter(
          (section, index, array) =>
            array.findIndex(
              (candidate) => String(candidate.name || "").trim().toLowerCase() === String(section.name || "").trim().toLowerCase()
            ) === index
        )

        if (!cancelled) {
          setCategoryOptions(mergedOptions)
        }
      } catch (error) {
        if (!cancelled) {
          setCategoryOptions([])
        }
      }
    }

    loadCategoryOptions()

    return () => {
      cancelled = true
    }
  }, [foodForm.restaurantId, foods, loadRestaurantMenu, showFoodFormModal])

  const persistRestaurantMenu = async (restaurantId, sections) => {
    await adminAPI.updateRestaurantMenuById(restaurantId, { sections })
  }

  const handleFoodFormSubmit = async () => {
    if (!foodForm.restaurantId) {
      toast.error("Please select a restaurant")
      return
    }
    if (!foodForm.sectionName.trim()) {
      toast.error("Please select or enter a category")
      return
    }
    if (!foodForm.name.trim()) {
      toast.error("Food name is required")
      return
    }

    const parsedPrice = Number(foodForm.price)
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      toast.error("Price must be greater than 0")
      return
    }

    try {
      setSubmittingFood(true)
      let imageUrl = foodForm.image.trim()

      if (selectedImageFile) {
        const uploadResponse = await uploadAPI.uploadMedia(selectedImageFile, {
          folder: "foods",
        })
        imageUrl =
          uploadResponse?.data?.data?.url ||
          uploadResponse?.data?.url ||
          imageUrl
      }

      const menu = await loadRestaurantMenu(foodForm.restaurantId)
      const menuSections = Array.isArray(menu.sections) ? [...menu.sections] : []
      const sectionIndex = menuSections.findIndex(
        (section) => String(section.name || "").trim().toLowerCase() === foodForm.sectionName.trim().toLowerCase()
      )

      const targetSection =
        sectionIndex >= 0
          ? {
              ...menuSections[sectionIndex],
              items: Array.isArray(menuSections[sectionIndex].items) ? [...menuSections[sectionIndex].items] : [],
            }
          : {
              id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              name: foodForm.sectionName.trim(),
              isEnabled: true,
              order: menuSections.length,
              items: [],
              subsections: [],
            }

      const nextItem = {
        ...(foodFormMode === "edit" ? editingFood?.originalItem : {}),
        id:
          foodFormMode === "edit"
            ? editingFood?.originalItem?.id || editingFood?.id
            : `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: foodForm.name.trim(),
        price: parsedPrice,
        description: foodForm.description.trim(),
        image: imageUrl,
        images: imageUrl ? [imageUrl] : [],
        foodType: foodForm.foodType === "Veg" ? "Veg" : "Non-Veg",
        isAvailable: foodForm.isAvailable !== false,
        category: foodForm.sectionName.trim(),
        preparationTime: foodForm.preparationTime.trim(),
        approvalStatus: "approved",
      }

      if (foodFormMode === "edit") {
        targetSection.items = targetSection.items.map((item) =>
          String(item.id) === String(editingFood?.originalItem?.id || editingFood?.id) ? nextItem : item
        )
      } else {
        targetSection.items.push(nextItem)
      }

      if (sectionIndex >= 0) {
        menuSections[sectionIndex] = targetSection
      } else {
        menuSections.push(targetSection)
      }

      await persistRestaurantMenu(foodForm.restaurantId, menuSections)
      toast.success(foodFormMode === "edit" ? "Food updated successfully" : "Food added successfully")
      setShowFoodFormModal(false)
      setEditingFood(null)
      setFoodForm(createFoodForm())
      setSelectedImageFile(null)
      setImagePreviewUrl("")
      await fetchAllFoods()
    } catch (error) {
      console.error("Error saving food:", error)
      toast.error(error?.response?.data?.message || "Failed to save food")
    } finally {
      setSubmittingFood(false)
    }
  }

  const handleDelete = async (id) => {
    const food = foods.find(f => f.id === id)
    if (!food) return

    if (!window.confirm(`Are you sure you want to delete "${food.name}"? This action cannot be undone.`)) {
      return
    }

    try {
      setDeleting(true)

      const menu = await loadRestaurantMenu(food.restaurantId)
      
      if (!menu || !menu.sections) {
        throw new Error("Menu not found")
      }

      // Find and remove the item from the menu structure
      let itemRemoved = false
      const updatedSections = menu.sections.map(section => {
        // Check items in section
        if (section.items && Array.isArray(section.items)) {
          const itemIndex = section.items.findIndex(item => 
            String(item.id) === String(food.id) || 
            String(item.id) === String(food.originalItem?.id)
          )
          if (itemIndex !== -1) {
            section.items.splice(itemIndex, 1)
            itemRemoved = true
          }
        }
        
        // Check items in subsections
        if (section.subsections && Array.isArray(section.subsections)) {
          section.subsections = section.subsections.map(subsection => {
            if (subsection.items && Array.isArray(subsection.items)) {
              const itemIndex = subsection.items.findIndex(item => 
                String(item.id) === String(food.id) || 
                String(item.id) === String(food.originalItem?.id)
              )
              if (itemIndex !== -1) {
                subsection.items.splice(itemIndex, 1)
                itemRemoved = true
              }
            }
            return subsection
          })
        }
        
        return section
      })

      if (!itemRemoved) {
        throw new Error("Item not found in menu")
      }

      await persistRestaurantMenu(food.restaurantId, updatedSections)

      // Remove from local state
      setFoods(foods.filter(f => f.id !== id))
      toast.success("Food item deleted successfully")
    } catch (error) {
      console.error("Error deleting food:", error)
      toast.error(error?.response?.data?.message || "Failed to delete food item")
    } finally {
      setDeleting(false)
    }
  }

  const handleViewDetails = (food) => {
    setSelectedFood(food)
    setShowDetailModal(true)
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Food</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Food List</h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {filteredFoods.length}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={openAddFoodModal}
              className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Food</span>
            </button>
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <input
                type="text"
                placeholder="Ex : Foods"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
            <select
              value={selectedRestaurant}
              onChange={(e) => setSelectedRestaurant(e.target.value)}
              className="px-4 py-2.5 min-w-[220px] text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            >
              <option value="all">All Restaurants</option>
              {restaurantOptions.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  SL
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Image
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Restaurant
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                      <p className="text-sm text-slate-500">Loading foods from restaurants...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredFoods.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                      <p className="text-sm text-slate-500">No food items match your search or restaurant filter</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFoods.map((food, index) => (
                  <tr
                    key={food.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{index + 1}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                        <img
                          src={food.image}
                          alt={food.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = "https://via.placeholder.com/40"
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900">{food.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-800">{food.restaurantName || "-"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-800">{food.sectionName || "-"}</span>
                        {food.subsectionName && (
                          <span className="text-xs text-slate-500">{food.subsectionName}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleViewDetails(food)}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditFoodModal(food)}
                          className="p-1.5 rounded text-amber-600 hover:bg-amber-50 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(food.id)}
                          disabled={deleting}
                          className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          {deleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-semibold text-slate-900">Food Details</DialogTitle>
          </DialogHeader>
          {selectedFood && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <img
                  src={selectedFood.image}
                  alt={selectedFood.name}
                  className="w-20 h-20 rounded-xl object-cover border border-slate-200"
                  onError={(e) => {
                    e.target.src = "https://via.placeholder.com/64"
                  }}
                />
                <div>
                  <p className="text-lg font-semibold text-slate-900">{selectedFood.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">ID #{formatFoodId(selectedFood.id)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p><span className="font-semibold text-slate-700">Restaurant:</span> <span className="text-slate-900">{selectedFood.restaurantName || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Price:</span> <span className="text-slate-900">₹{selectedFood.price}</span></p>
                <p><span className="font-semibold text-slate-700">Category:</span> <span className="text-slate-900">{selectedFood.sectionName || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Subcategory:</span> <span className="text-slate-900">{selectedFood.subsectionName || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Food Type:</span> <span className="text-slate-900">{selectedFood.foodType || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Approval:</span> <span className="text-slate-900 capitalize">{selectedFood.approvalStatus || "-"}</span></p>
              </div>
              {selectedFood.originalItem?.description && (
                <p className="text-sm text-slate-700 leading-relaxed">
                  <span className="font-semibold text-slate-800">Description:</span> {selectedFood.originalItem.description}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showFoodFormModal}
        onOpenChange={(open) => {
          setShowFoodFormModal(open)
          if (!open) {
            setEditingFood(null)
            setFoodForm(createFoodForm())
            setCategoryOptions([])
            setSelectedImageFile(null)
            setImagePreviewUrl("")
          }
        }}
      >
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-semibold text-slate-900">
              {foodFormMode === "edit" ? "Edit Food" : "Add Food"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Restaurant</label>
                <select
                  value={foodForm.restaurantId}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, restaurantId: e.target.value, sectionName: "" }))}
                  disabled={foodFormMode === "edit"}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100"
                >
                  <option value="">Select restaurant</option>
                  {restaurantOptions.map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.id}>
                      {restaurant.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <input
                  list="food-category-options"
                  value={foodForm.sectionName}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, sectionName: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                  placeholder="Select or enter category"
                />
                <datalist id="food-category-options">
                  {categoryOptions.map((section) => (
                    <option key={section.id} value={section.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Food Name</label>
                <input
                  type="text"
                  value={foodForm.name}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Price</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={foodForm.price}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, price: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Food Type</label>
                <select
                  value={foodForm.foodType}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, foodType: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="Veg">Veg</option>
                  <option value="Non-Veg">Non-Veg</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Upload Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    setSelectedImageFile(file)
                    if (file) {
                      setImagePreviewUrl(URL.createObjectURL(file))
                    } else {
                      setImagePreviewUrl(foodForm.image.trim())
                    }
                  }}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Timing</label>
                <div className="relative">
                  <select
                  value={foodForm.preparationTime}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, preparationTime: e.target.value }))}
                    className="w-full px-3 py-2.5 pr-10 border border-slate-300 rounded-lg text-sm bg-white appearance-none"
                  >
                    <option value="">Select timing</option>
                    <option value="10-20 mins">10-20 mins</option>
                    <option value="20-25 mins">20-25 mins</option>
                    <option value="25-35 mins">25-35 mins</option>
                    <option value="35-45 mins">35-45 mins</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>
              {imagePreviewUrl ? (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Image Preview</label>
                  <div className="w-28 h-28 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                    <img
                      src={imagePreviewUrl}
                      alt="Food preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              ) : null}
              <div className="flex items-center gap-6 pt-7">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={foodForm.isAvailable}
                    onChange={(e) => setFoodForm((prev) => ({ ...prev, isAvailable: e.target.checked }))}
                  />
                  Available
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                rows={4}
                value={foodForm.description}
                onChange={(e) => setFoodForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white resize-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleFoodFormSubmit}
                disabled={submittingFood}
                className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {submittingFood ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{submittingFood ? "Saving..." : foodFormMode === "edit" ? "Update Food" : "Add Food"}</span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

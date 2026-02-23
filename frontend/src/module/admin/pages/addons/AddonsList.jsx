import { useState, useMemo, useEffect } from "react"
import { Search, Trash2, Loader2, Eye } from "lucide-react"
import { adminAPI, restaurantAPI } from "@/lib/api"
import apiClient from "@/lib/api"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export default function AddonsList() {
  const [searchQuery, setSearchQuery] = useState("")
  const [addons, setAddons] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [selectedAddon, setSelectedAddon] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

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

  const isListEligibleStatus = (status) => {
    const normalized = String(status || "").toLowerCase()
    return normalized === "approved" || normalized === "rejected"
  }

  // Fetch all addons from all restaurants
  useEffect(() => {
    const fetchAllAddons = async () => {
      try {
        setLoading(true)
        
        // First, fetch all restaurants
        const restaurantsResponse = await adminAPI.getRestaurants({ limit: 1000 })
        const restaurants = restaurantsResponse?.data?.data?.restaurants || 
                          restaurantsResponse?.data?.restaurants || 
                          []
        
        if (restaurants.length === 0) {
          setAddons([])
          setLoading(false)
          return
        }

        // Fetch addons for each restaurant using admin menu endpoint
        const allAddons = []
        
        for (const restaurant of restaurants) {
          try {
            const restaurantId = restaurant._id || restaurant.id
            const menuResponse = await apiClient.get(`/admin/restaurants/${restaurantId}/menu`)
            const menu = menuResponse?.data?.data?.menu || menuResponse?.data?.menu
            const restaurantAddons = Array.isArray(menu?.addons) ? menu.addons : []
            
            // Map addons with restaurant information
            restaurantAddons.forEach((addon) => {
              allAddons.push({
                id: addon.id || `${restaurantId}-${addon.name}`,
                _id: addon._id,
                name: addon.name || "Unnamed Addon",
                image: addon.image || addon.images?.[0] || "https://via.placeholder.com/40",
                price: addon.price || 0,
                description: addon.description || "",
                isAvailable: addon.isAvailable !== false,
                approvalStatus: addon.approvalStatus || 'pending',
                restaurantId: restaurantId,
                restaurantName: restaurant.name || "Unknown Restaurant",
                originalAddon: addon // Keep original addon data
              })
            })
          } catch (error) {
            // Silently skip restaurants that don't have addons or have errors
            console.warn(`Failed to fetch addons for restaurant ${restaurant._id || restaurant.id}:`, error.message)
          }
        }
        
        allAddons.sort((a, b) => getItemCreatedMs(b.originalAddon) - getItemCreatedMs(a.originalAddon))
        setAddons(allAddons.filter((addon) => isListEligibleStatus(addon.approvalStatus)))
      } catch (error) {
        console.error("Error fetching addons:", error)
        toast.error("Failed to load addons from restaurants")
        setAddons([])
      } finally {
        setLoading(false)
      }
    }

    fetchAllAddons()
  }, [])

  // Format ID to ADDON format (e.g., ADDON606927)
  const formatAddonId = (id) => {
    if (!id) return "ADDON000000"
    
    const idString = String(id)
    // Extract last 6 digits from the ID
    // Handle formats like "addon-1768285606927-r7kwd45t8" or "1768285606927-r7kwd45t8"
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
      } else {
        // If no digits in last part, look for digits in all parts
        const allParts = parts.join("")
        const allDigits = allParts.match(/\d+/g)
        if (allDigits && allDigits.length > 0) {
          const combinedDigits = allDigits.join("")
          lastDigits = combinedDigits.slice(-6).padStart(6, "0")
        }
      }
    }
    
    // If no digits found, use a hash of the ID
    if (!lastDigits) {
      const hash = idString.split("").reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0) | 0
      }, 0)
      lastDigits = Math.abs(hash).toString().slice(-6).padStart(6, "0")
    }
    
    return `ADDON${lastDigits}`
  }

  const filteredAddons = useMemo(() => {
    let result = [...addons]
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(addon =>
        addon.name.toLowerCase().includes(query) ||
        addon.id.toString().includes(query) ||
        addon.restaurantName?.toLowerCase().includes(query)
      )
    }

    result.sort((a, b) => getItemCreatedMs(b.originalAddon) - getItemCreatedMs(a.originalAddon))
    return result
  }, [addons, searchQuery])

  const handleDelete = async (id) => {
    const addon = addons.find(a => a.id === id)
    if (!addon) return

    if (!window.confirm(`Are you sure you want to delete "${addon.name}"? This action cannot be undone.`)) {
      return
    }

    try {
      setDeleting(true)
      
      // Get the restaurant's menu to find and remove the addon
      const menuResponse = await restaurantAPI.getMenuByRestaurantId(addon.restaurantId)
      const menu = menuResponse?.data?.data?.menu || menuResponse?.data?.menu
      
      if (!menu) {
        throw new Error("Menu not found")
      }

      // Find and remove the addon from the menu
      const addonIndex = menu.addons?.findIndex(a => 
        String(a.id) === String(addon.id) || 
        String(a.id) === String(addon.originalAddon?.id)
      )

      if (addonIndex === -1 || !menu.addons) {
        throw new Error("Addon not found in menu")
      }

      // Remove addon from array
      menu.addons.splice(addonIndex, 1)

      // Update menu in backend
      try {
        const response = await apiClient.put(
          `/restaurant/menu`,
          { 
            sections: menu.sections || [],
            addons: menu.addons
          }
        )
        
        if (!response.data || !response.data.success) {
          throw new Error(response.data?.message || "Failed to update menu")
        }
      } catch (apiError) {
        if (apiError.response?.status === 401 || apiError.response?.status === 403) {
          throw new Error("Admin cannot directly update restaurant menus. Please contact developer to add admin menu update endpoint.")
        }
        throw apiError
      }

      // Remove from local state
      setAddons(addons.filter(a => a.id !== id))
      toast.success("Addon deleted successfully")
    } catch (error) {
      console.error("Error deleting addon:", error)
      toast.error(error?.response?.data?.message || error?.message || "Failed to delete addon")
    } finally {
      setDeleting(false)
    }
  }

  const handleViewDetails = (addon) => {
    setSelectedAddon(addon)
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
          <h1 className="text-2xl font-bold text-slate-900">Addon</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Addon List</h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {filteredAddons.length}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <input
                type="text"
                placeholder="Ex : Addons"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
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
                  Name
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                      <p className="text-sm text-slate-500">Loading addons from restaurants...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredAddons.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                      <p className="text-sm text-slate-500">No addons match your search</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAddons.map((addon, index) => (
                  <tr
                    key={addon.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{index + 1}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                        <img
                          src={addon.image}
                          alt={addon.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = "https://via.placeholder.com/40"
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900">{addon.name}</span>
                        <span className="text-xs text-slate-500">ID #{formatAddonId(addon.id)}</span>
                        {addon.restaurantName && (
                          <span className="text-xs text-slate-400 mt-0.5">
                            {addon.restaurantName}
                          </span>
                        )}
                        {addon.description && (
                          <span className="text-xs text-slate-500 mt-0.5">
                            {addon.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-900">
                        ₹{addon.price.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleViewDetails(addon)}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(addon.id)}
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
            <DialogTitle className="text-lg font-semibold text-slate-900">Add-on Details</DialogTitle>
          </DialogHeader>
          {selectedAddon && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <img
                  src={selectedAddon.image}
                  alt={selectedAddon.name}
                  className="w-20 h-20 rounded-xl object-cover border border-slate-200"
                  onError={(e) => {
                    e.target.src = "https://via.placeholder.com/64"
                  }}
                />
                <div>
                  <p className="text-lg font-semibold text-slate-900">{selectedAddon.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">ID #{formatAddonId(selectedAddon.id)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p><span className="font-semibold text-slate-700">Restaurant:</span> <span className="text-slate-900">{selectedAddon.restaurantName || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Price:</span> <span className="text-slate-900">₹{selectedAddon.price?.toFixed(2)}</span></p>
                <p><span className="font-semibold text-slate-700">Status:</span> <span className="text-slate-900">{selectedAddon.isAvailable ? "Available" : "Unavailable"}</span></p>
                <p><span className="font-semibold text-slate-700">Approval:</span> <span className="text-slate-900 capitalize">{selectedAddon.approvalStatus || "-"}</span></p>
              </div>
              {selectedAddon.description && (
                <p className="text-sm text-slate-700 leading-relaxed">
                  <span className="font-semibold text-slate-800">Description:</span> {selectedAddon.description}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

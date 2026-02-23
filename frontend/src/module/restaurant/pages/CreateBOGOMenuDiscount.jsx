import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Search, ChevronDown, Check } from "lucide-react"
import BottomNavOrders from "../components/BottomNavOrders"
import { getAllFoods } from "../utils/foodManagement"

export default function CreateBOGOMenuDiscount() {
  const navigate = useNavigate()
  const allFoods = getAllFoods()

  const [discountConstruct, setDiscountConstruct] = useState("buy-1-get-1-free")
  const [selectedItems, setSelectedItems] = useState([])
  const [isItemsPopupOpen, setIsItemsPopupOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Transform foods for display
  const transformedFoods = allFoods.map(food => ({
    ...food,
    price: food.price || 0,
    category: food.category || "Varieties",
    foodType: food.foodType || "Non-Veg",
  }))

  // Group foods by category
  const foodsByCategory = useMemo(() => {
    const grouped = {}
    transformedFoods.forEach(food => {
      const category = food.category || "Other"
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(food)
    })
    return grouped
  }, [transformedFoods])

  // Filter foods based on search
  const filteredFoodsByCategory = useMemo(() => {
    const filtered = {}
    Object.keys(foodsByCategory).forEach(category => {
      const filteredItems = foodsByCategory[category].filter(food =>
        food.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      if (filteredItems.length > 0) {
        filtered[category] = filteredItems
      }
    })
    return filtered
  }, [foodsByCategory, searchQuery])

  const handleItemToggle = (foodId) => {
    setSelectedItems(prev =>
      prev.includes(foodId)
        ? prev.filter(id => id !== foodId)
        : [...prev, foodId]
    )
  }

  const handleConfirmItems = () => {
    setIsItemsPopupOpen(false)
  }

  const isFormValid = discountConstruct && selectedItems.length > 0

  const getSelectedItemsText = () => {
    if (selectedItems.length === 0) return "Select items"
    if (selectedItems.length === 1) return "1 item selected"
    return `${selectedItems.length} items selected`
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/restaurant/hub-growth/create-offers/delight-customers")}
            className="p-1 rounded-full hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">BOGO</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6">
        <h2 className="text-lg font-bold text-gray-900 tracking-wider mb-4">Offer setup</h2>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          {/* Discount construct */}
          <div>
            <label className="text-sm font-medium text-gray-900 mb-2 block">Discount construct</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="discountConstruct"
                  value="buy-1-get-1-free"
                  checked={discountConstruct === "buy-1-get-1-free"}
                  onChange={(e) => setDiscountConstruct(e.target.value)}
                  className="w-5 h-5 text-black border-gray-400 focus:ring-black"
                  style={{ accentColor: "#000000" }}
                />
                <span className="text-sm font-medium text-gray-900">Buy 1 Get 1 free</span>
              </label>
            </div>
          </div>

          {/* Items for discount */}
          <div>
            <label className="text-sm font-medium text-gray-900 mb-2 block">Items for discount</label>
            <button
              onClick={() => setIsItemsPopupOpen(true)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-left flex items-center justify-between text-sm text-gray-600"
            >
              <span>{getSelectedItemsText()}</span>
              <ChevronDown className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Button */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-4">
        <button
          onClick={() => {
            if (!isFormValid) return
            navigate("/restaurant/hub-growth/create-offers/delight-customers/bogo/timings", {
              state: {
                discountConstruct,
                selectedItems,
                discountType: "bogo-menu",
              },
            })
          }}
          className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors ${
            isFormValid
              ? "bg-black text-white hover:bg-gray-900"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
          disabled={!isFormValid}
        >
          Continue
        </button>
      </div>

      {/* Items Selection Popup */}
      <AnimatePresence>
        {isItemsPopupOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsItemsPopupOpen(false)}
              className="fixed inset-0 bg-black/50 z-[9999]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-[9999] max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900 text-center">Select items for discount</h2>
              </div>
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by item name"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {Object.keys(filteredFoodsByCategory).length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No items found</div>
                ) : (
                  <div className="space-y-6">
                    {Object.keys(filteredFoodsByCategory).map(category => (
                      <div key={category}>
                        <h3 className="text-xs font-bold text-gray-900 uppercase mb-3">{category}</h3>
                        <div className="space-y-3">
                          {filteredFoodsByCategory[category].map(food => {
                            const isSelected = selectedItems.includes(food.id)
                            return (
                              <div key={food.id} className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-3 flex-1">
                                  <div
                                    className={`w-4 h-4 rounded border-2 shrink-0 ${
                                      food.foodType === "Veg"
                                        ? "bg-green-50 border-green-600"
                                        : "bg-red-50 border-red-600"
                                    }`}
                                  />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">{food.name}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium text-gray-900">₹{food.price}</span>
                                  <button
                                    onClick={() => handleItemToggle(food.id)}
                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                                      isSelected
                                        ? "bg-black border-black"
                                        : "bg-white border-gray-400"
                                    }`}
                                  >
                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-4 py-4 border-t border-gray-200">
                <button
                  onClick={handleConfirmItems}
                  className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors ${
                    selectedItems.length > 0
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                  disabled={selectedItems.length === 0}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <BottomNavOrders />
    </div>
  )
}

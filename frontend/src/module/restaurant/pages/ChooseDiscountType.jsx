import { motion } from "framer-motion"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, ChevronRight } from "lucide-react"
import BottomNavOrders from "../components/BottomNavOrders"

const offerGoalTitles = {
  "grow-customers": "Grow your customer base",
  "increase-value": "Increase your order value",
  "mealtime-orders": "Get more mealtime orders",
}

const discountTypes = [
  {
    id: "percentage",
    title: "Percentage discount",
    description: "Create promo discounts like '30% OFF up to ₹75'",
    indicator: (
      <div className="flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-purple-600 leading-none">30%</span>
        <span className="text-xs font-semibold text-purple-600 leading-tight">OFF</span>
      </div>
    ),
  },
]

export default function ChooseDiscountType() {
  const navigate = useNavigate()
  const { goalId } = useParams()
  const pageTitle = offerGoalTitles[goalId] || "Choose discount type"

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/restaurant/hub-growth/create-offers")}
            className="p-1 rounded-full hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">{pageTitle}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 border border-xl border-grey-200">
        {/* Light Blue Header */}
        <div className="bg-[#6a82f1] rounded-t-2xl px-4 pt-6 pb-6 relative overflow-hidden">
          {/* Decorative gear icons */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {/* Main gear with percentage */}
            <div className="relative w-8 h-8">
              <svg className="w-8 h-8 text-blue-800/40" viewBox="0 0 24 24" fill="currentColor">
                {/* Gear/cogwheel shape */}
                <path d="M12 2L13.5 4.5L17 6L13.5 7.5L12 11L10.5 7.5L7 6L10.5 4.5L12 2Z" />
                <path d="M12 13L13.5 15.5L17 17L13.5 18.5L12 22L10.5 18.5L7 17L10.5 15.5L12 13Z" />
                <path d="M2 12L4.5 10.5L6 7L7.5 10.5L11 12L7.5 13.5L6 17L4.5 13.5L2 12Z" />
                <path d="M22 12L19.5 13.5L18 17L16.5 13.5L13 12L16.5 10.5L18 7L19.5 10.5L22 12Z" />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">%</span>
              </div>
            </div>
            {/* Blurred gear behind */}
            <div className="relative w-10 h-10">
              <svg className="w-10 h-10 text-blue-800/20 blur-sm" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L13.5 4.5L17 6L13.5 7.5L12 11L10.5 7.5L7 6L10.5 4.5L12 2Z" />
                <path d="M12 13L13.5 15.5L17 17L13.5 18.5L12 22L10.5 18.5L7 17L10.5 15.5L12 13Z" />
                <path d="M2 12L4.5 10.5L6 7L7.5 10.5L11 12L7.5 13.5L6 17L4.5 13.5L2 12Z" />
                <path d="M22 12L19.5 13.5L18 17L16.5 13.5L13 12L16.5 10.5L18 7L19.5 10.5L22 12Z" />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              </svg>
            </div>
          </div>
          
          <div className="relative z-10 pr-16">
            <h2 className="text-xl font-bold text-white leading-tight">
              Choose your promo discount type
            </h2>
          </div>
        </div>

        {/* Discount Type Options */}
        <div className="bg-white rounded-b-2xl -mt-1 border border-xl border-grey-200">
          {discountTypes.map((type, index) => (
            <motion.div
              key={type.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                // Navigate to discount creation page with type and goal
                navigate(`/restaurant/hub-growth/create-offers/${goalId}/${type.id}/create`)
              }}
              className={`px-4 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                index !== discountTypes.length - 1 ? "border-b border-dashed border-gray-200" : ""
              }`}
            >
              <div className="shrink-0 w-12">
                {type.indicator}
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-900 mb-1">{type.title}</h3>
                <p className="text-sm text-gray-600">{type.description}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-700 shrink-0" />
            </motion.div>
          ))}
        </div>
      </div>

      <BottomNavOrders />
    </div>
  )
}

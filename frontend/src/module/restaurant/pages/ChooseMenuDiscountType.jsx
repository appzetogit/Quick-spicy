import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ChevronRight } from "lucide-react"
import BottomNavOrders from "../components/BottomNavOrders"
import freebiesIcon from "@/assets/hub/icons/delite your customers/freebies.png"
import percentageDiscountIcon from "@/assets/hub/icons/delite your customers/percentagediscount.png"
import flatPriceIcon from "@/assets/hub/icons/delite your customers/flatprice.png"
import bogoIcon from "@/assets/hub/icons/delite your customers/bogo.png"

const menuDiscountTypes = [
  {
    id: "freebies",
    title: "Freebies",
    description: "Give a complimentary dish to delight your high value customers",
    icon: freebiesIcon,
  },
  {
    id: "percentage",
    title: "Percentage discount",
    description: "Flat percentage discount on select items",
    icon: percentageDiscountIcon,
  },
  {
    id: "flat-price",
    title: "Flat price",
    description: "Select items at fixed prices like ₹99, ₹129, ₹129, etc",
    icon: flatPriceIcon,
  },
  {
    id: "bogo",
    title: "BOGO",
    description: "Buy 1 Get 1 free offer on selected items",
    icon: bogoIcon,
  },
]

export default function ChooseMenuDiscountType() {
  const navigate = useNavigate()

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
          <h1 className="text-lg font-bold text-gray-900">Delight your customers</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        {/* Purple Header */}
        <div className="bg-[#946FF1] rounded-t-2xl px-4 pt-6 pb-6 relative overflow-hidden">
          {/* Decorative icons */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {/* Bowl with spoon/chopsticks icon */}
            <div className="relative w-10 h-10">
              <svg className="w-10 h-10 text-purple-800/30" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                <path d="M8 10h8v2H8z" />
                <path d="M10 8h4v6h-4z" />
              </svg>
            </div>
            {/* Additional decorative shapes */}
            <div className="w-8 h-8 bg-purple-800/20 rounded-full blur-sm" />
            <div className="w-6 h-6 bg-purple-800/15 rounded-full blur-sm" />
          </div>
          
          <div className="relative z-10 pr-20">
            <h2 className="text-xl font-bold text-white leading-tight">
              Choose your menu discount type
            </h2>
          </div>
        </div>

        {/* Menu Discount Type Options */}
        <div className="bg-white rounded-b-2xl -mt-1 border border-xl border-grey-200">
          {menuDiscountTypes.map((type, index) => (
            <motion.div
              key={type.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                // Navigate to discount creation page
                if (type.id === "freebies") {
                  navigate("/restaurant/hub-growth/create-offers/delight-customers/freebies")
                } else if (type.id === "percentage") {
                  navigate("/restaurant/hub-growth/create-offers/delight-customers/percentage")
                } else if (type.id === "flat-price") {
                  navigate("/restaurant/hub-growth/create-offers/delight-customers/flat-price")
                } else if (type.id === "bogo") {
                  navigate("/restaurant/hub-growth/create-offers/delight-customers/bogo")
                } else {
                  navigate(`/restaurant/hub-growth/create-offers/delight-customers/${type.id}`)
                }
              }}
              className={`px-4 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                index !== menuDiscountTypes.length - 1 ? "border-b border-dashed border-gray-200" : ""
              }`}
            >
              <div className="shrink-0">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center relative overflow-hidden">
                  <img src={type.icon} alt={type.title} className="w-full h-full object-contain" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-900 mb-1">{type.title}</h3>
                <p className="text-sm text-gray-600">{type.description}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-blue-600 shrink-0" />
            </motion.div>
          ))}
        </div>
      </div>

      <BottomNavOrders />
    </div>
  )
}

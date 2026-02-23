import { useState } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ChevronRight, Menu } from "lucide-react"
import BottomNavOrders from "../components/BottomNavOrders"
import offersAndDiscountsIcon from "@/assets/hub/icons/offersanddiscounts.png"

export default function HubGrowth() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Grow your business</h1>
          <button
            onClick={() => navigate("/restaurant/explore")}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <Menu className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6">
        {/* Build your own section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Build your own</h2>
          
          <div className="space-y-3">
            {/* Offers and discounts card */}
            <motion.div
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/restaurant/hub-growth/create-offers")}
              className="bg-white rounded-lg p-4 flex items-center gap-4  border border-gray-200 cursor-pointer "
            >
              <div className="shrink-0">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center relative overflow-hidden">
                  <img src={offersAndDiscountsIcon} alt="Offers and discounts" className="w-full h-full object-contain" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-900 mb-1">Offers and discounts</h3>
                <p className="text-sm text-gray-600">Start your own offers and grow your business</p>
              </div>
              <ChevronRight className="w-5 h-5 text-blue-600 shrink-0" />
            </motion.div>

          </div>
        </div>
      </div>

      <BottomNavOrders />
    </div>
  )
}

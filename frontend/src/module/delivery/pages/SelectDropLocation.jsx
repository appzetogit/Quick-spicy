import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { MapPin, CheckCircle, X } from "lucide-react"
import { useGigStore } from "../store/gigStore"
// import dropLocationBanner from "../../../assets/droplocationbanner.png" // File not found - using fallback
import deliveryLoginBanner from "../../../assets/deliveryloginbanner.png"

const LOCATIONS = [
  { name: "New Palasia", available: true },
  { name: "Sanchar Nagar", available: true },
  { name: "Ambikapuri Main", available: false },
  { name: "Siyaganj", available: false },
  { name: "Bhawar Kuan", available: false },
]

export default function SelectDropLocation() {
  const navigate = useNavigate()
  const { setSelectedDropLocation } = useGigStore()
  const [selectedLocations, setSelectedLocations] = useState([])

  const handleLocationToggle = (locationName) => {
    setSelectedLocations(prev => {
      if (prev.includes(locationName)) {
        // Remove location if already selected
        return prev.filter(loc => loc !== locationName)
      } else if (prev.length < 3) {
        // Add location if less than 3 selected
        return [...prev, locationName]
      }
      // Don't add if already 3 selected
      return prev
    })
  }

  const handleContinue = () => {
    if (selectedLocations.length > 0) {
      // Store as comma-separated string or array - using array for now
      setSelectedDropLocation(selectedLocations.join(','))
      navigate("/delivery")
    }
  }

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden relative">
      {/* Top Banner Section - Extended height to show behind rounded corners */}
      <div className="absolute top-0 left-0 right-0 w-full" style={{ height: '45vh' }}>
        <img 
          src={deliveryLoginBanner} 
          alt="Drop Location Banner" 
          className="w-full h-full object-cover"
        />
        
        {/* Close Button */}
        <button
          onClick={() => navigate("/delivery")}
          className="absolute top-4 left-4 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors z-20"
        >
          <X className="w-6 h-6 text-gray-900" />
        </button>
      </div>

      {/* Content Overlay - White content with rounded corners overlaying image */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col bg-white rounded-t-lg overflow-hidden z-10" style={{ height: 'calc(100% - 38vh)' }}>
        {/* Status Bar - First element with rounded corners */}
        <div className="bg-black px-4 py-2 rounded-t-lg flex-shrink-0">
          <p className="text-white text-sm text-center">1 chance left today</p>
        </div>

        {/* Bottom Sheet Content */}
        <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="px-4 pb-4 pt-4 flex-shrink-0">
          <h2 className="text-2xl font-bold text-gray-900">Select upto 3 locations</h2>
          {selectedLocations.length > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              {selectedLocations.length} of 3 selected
            </p>
          )}
        </div>

        {/* Location List */}
        <div className="px-4 pb-4 flex-1">
          <div className="space-y-0">
            {LOCATIONS.map((location, index) => {
              const isSelected = selectedLocations.includes(location.name)
              const canSelect = location.available && (isSelected || selectedLocations.length < 3)
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`flex items-center gap-3 py-4 border-b border-gray-100 last:border-b-0 transition-colors ${
                    canSelect
                      ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100' 
                      : 'cursor-not-allowed opacity-60'
                  }`}
                  onClick={() => {
                    if (location.available) {
                      handleLocationToggle(location.name)
                    }
                  }}
                >
                  <MapPin className={`w-5 h-5 flex-shrink-0 ${
                    location.available 
                      ? isSelected ? 'text-blue-600' : 'text-gray-700' 
                      : 'text-gray-400'
                  }`} />
                  <span className={`flex-1 text-base ${
                    location.available 
                      ? isSelected ? 'text-blue-600 font-semibold' : 'text-gray-900' 
                      : 'text-gray-400'
                  }`}>
                    {location.name}
                  </span>
                  <div className={`w-5 h-5 border-2 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500'
                      : location.available
                      ? 'border-gray-300'
                      : 'border-gray-200'
                  }`}>
                    {isSelected && (
                      <CheckCircle className="w-4 h-4 text-white" fill="currentColor" />
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Learn More Link */}
        <div className="px-4 pb-4 text-center flex-shrink-0">
          <button className="text-gray-400 text-sm hover:text-gray-600 transition-colors">
            LEARN ABOUT THIS FEATURE
          </button>
        </div>

        {/* Continue Button */}
        <div className="px-4 pb-6 pt-2 flex-shrink-0">
          <motion.button
            onClick={handleContinue}
            disabled={selectedLocations.length === 0}
            className={`w-full font-semibold py-4 rounded-lg transition-all ${
              selectedLocations.length > 0
                ? 'bg-black text-white hover:bg-gray-800 active:bg-gray-900'
                : 'bg-gray-300 text-white cursor-not-allowed'
            }`}
            whileTap={selectedLocations.length > 0 ? { scale: 0.98 } : {}}
          >
            Continue
          </motion.button>
        </div>
        </div>
      </div>
    </div>
  )
}


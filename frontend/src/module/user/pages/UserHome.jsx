import { Utensils, Zap } from "lucide-react"

export default function UserHome() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-orange-50/30 via-white to-yellow-50/20 p-4 md:p-6 lg:p-8">
      <div className="text-center max-w-md md:max-w-2xl lg:max-w-4xl">
        {/* Logo Icon */}
        <div className="relative inline-block mb-4 md:mb-6">
          <div className="w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 bg-gradient-to-br from-[#EB590E] to-[#D94F0C] rounded-full flex items-center justify-center shadow-xl shadow-orange-500/30">
            <Utensils className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 md:w-10 md:h-10 bg-yellow-400 rounded-full flex items-center justify-center border-4 border-white">
            <Zap className="w-4 h-4 md:w-5 md:h-5 text-orange-600 fill-orange-600" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-3 md:mb-4 lg:mb-5 bg-gradient-to-r from-[#EB590E] to-[#D94F0C] bg-clip-text text-transparent">
          Quick Spicy
        </h1>
        
        {/* Subtitle */}
        <p className="text-base md:text-lg lg:text-xl text-muted-foreground mb-2">
          Welcome to your food journey
        </p>
        
        {/* Tagline */}
        <p className="text-sm md:text-base text-[#EB590E] font-medium">
          Fast. Fresh. Flavorful. 🌶️
        </p>
      </div>
    </div>
  )
}


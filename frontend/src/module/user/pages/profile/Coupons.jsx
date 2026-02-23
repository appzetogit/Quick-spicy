import { Link } from "react-router-dom"
import { ArrowLeft, MapPin } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"

export default function Coupons() {
  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a]">
      <div className="max-w-md mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link to="/user/profile">
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
              <ArrowLeft className="h-5 w-5 text-black dark:text-white" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-black dark:text-white">Your coupons</h1>
        </div>

        {/* Empty State */}
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          {/* Circular Map Illustration */}
          <div className="relative mb-8">
            {/* Circular Background */}
            <div className="relative w-64 h-64 sm:w-80 sm:h-80 mx-auto bg-gray-200 rounded-full flex items-center justify-center overflow-hidden shadow-inner">
              {/* Map Pattern Background - More detailed */}
              <svg
                className="absolute inset-0 w-full h-full opacity-70"
                viewBox="0 0 200 200"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Main horizontal road */}
                <path
                  d="M 20 100 Q 50 80, 80 100 T 140 100"
                  stroke="#a1a1aa"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                />
                {/* Main vertical road */}
                <path
                  d="M 100 20 Q 100 50, 100 80 T 100 140"
                  stroke="#a1a1aa"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                />
                {/* Diagonal roads */}
                <path
                  d="M 40 40 Q 60 60, 80 80 T 120 120"
                  stroke="#b4b4b8"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d="M 160 40 Q 140 60, 120 80 T 80 120"
                  stroke="#b4b4b8"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d="M 30 170 Q 50 150, 70 130 T 110 90"
                  stroke="#b4b4b8"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d="M 170 170 Q 150 150, 130 130 T 90 90"
                  stroke="#b4b4b8"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
                {/* Additional connecting paths */}
                <path
                  d="M 50 50 L 70 70"
                  stroke="#c4c4c7"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M 150 50 L 130 70"
                  stroke="#c4c4c7"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M 50 150 L 70 130"
                  stroke="#c4c4c7"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M 150 150 L 130 130"
                  stroke="#c4c4c7"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>

              {/* Map Pins */}
              <div className="absolute left-12 top-16 z-20">
                <MapPin className="h-7 w-7 text-red-500 drop-shadow-lg" fill="currentColor" />
              </div>
              <div className="absolute right-12 top-20 z-20">
                <MapPin className="h-7 w-7 text-red-500 drop-shadow-lg" fill="currentColor" />
              </div>

              {/* Treasure Chest and Coins */}
              <div className="relative z-10 flex flex-col items-center">
                {/* Gold Coins Stack (Left) */}
                <div className="absolute -left-10 top-2 flex flex-col gap-0.5">
                  <div className="w-7 h-7 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full border-2 border-yellow-600 shadow-lg"></div>
                  <div className="w-7 h-7 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full border-2 border-yellow-600 shadow-lg -ml-1"></div>
                  <div className="w-7 h-7 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full border-2 border-yellow-600 shadow-lg -ml-2"></div>
                </div>

                {/* Treasure Chest */}
                <div className="relative mt-4">
                  {/* Chest Body */}
                  <div className="w-24 h-20 bg-gradient-to-b from-amber-800 to-amber-900 rounded-lg shadow-xl relative">
                    {/* Chest Top/Lid */}
                    <div className="absolute -top-3 left-0 right-0 h-5 bg-gradient-to-b from-amber-900 to-amber-950 rounded-t-lg shadow-md"></div>
                    
                    {/* Chest Lock */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                      <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full border-2 border-yellow-700 shadow-lg flex items-center justify-center">
                        <div className="w-4 h-4 bg-yellow-700 rounded-full shadow-inner"></div>
                      </div>
                    </div>

                    {/* Chest Straps */}
                    <div className="absolute top-3 left-3 w-16 h-1.5 bg-amber-950 rounded-full shadow-sm"></div>
                    <div className="absolute bottom-3 left-3 w-16 h-1.5 bg-amber-950 rounded-full shadow-sm"></div>
                    
                    {/* Chest Details */}
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-16 h-0.5 bg-amber-700"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Text Content */}
          <div className="text-center space-y-3 max-w-sm">
            <h2 className="text-xl font-bold text-black">No coupons found</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Discover hidden coupons on your map screen after placing an order
            </p>
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}


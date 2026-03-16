import { Link } from "react-router-dom"
import { ArrowLeft, CalendarClock } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"

export default function DiningBookings() {
  return (
    <AnimatedPage className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/user">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">Table Bookings</h1>
        </div>

        <div className="rounded-2xl border border-gray-200 p-6 text-center bg-gray-50">
          <CalendarClock className="h-10 w-10 mx-auto text-[#EB590E] mb-3" />
          <p className="text-base font-medium text-gray-900">No table bookings found</p>
          <p className="text-sm text-gray-600 mt-1">
            Your table bookings will appear here once a reservation is confirmed.
          </p>
          <div className="mt-4">
            <Link to="/user/help">
              <Button className="bg-[#EB590E] hover:bg-[#d24f0b] text-white">Get Help</Button>
            </Link>
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}

import { Building } from "lucide-react"
import DisbursementPage from "../components/disbursement/DisbursementPage"
import { restaurantDisbursementsDummy } from "../data/restaurantDisbursementsDummy"

export default function RestaurantDisbursement() {
  const tabs = ["All", "Pending", "Completed", "Partially completed", "Canceled"]
  
  return (
    <DisbursementPage
      title="Restaurant Disbursement"
      icon={Building}
      tabs={tabs}
      disbursements={restaurantDisbursementsDummy}
      count={restaurantDisbursementsDummy.length}
    />
  )
}


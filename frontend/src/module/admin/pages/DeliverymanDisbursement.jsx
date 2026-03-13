import { ShoppingBag } from "lucide-react"
import DisbursementPage from "../components/disbursement/DisbursementPage"
import { emptyDeliverymanDisbursements } from "../utils/adminFallbackData"

export default function DeliverymanDisbursement() {
  const tabs = ["All", "Pending", "Processing", "Completed", "Partially completed", "Canceled"]
  
  return (
    <DisbursementPage
      title="Deliveryman Disbursement"
      icon={ShoppingBag}
      tabs={tabs}
      disbursements={emptyDeliverymanDisbursements}
      count={emptyDeliverymanDisbursements.length}
    />
  )
}


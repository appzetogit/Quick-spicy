import { ShoppingBag } from "lucide-react"
import DisbursementPage from "../components/disbursement/DisbursementPage"
import { deliverymanDisbursementsDummy } from "../data/deliverymanDisbursementsDummy"

export default function DeliverymanDisbursement() {
  const tabs = ["All", "Pending", "Processing", "Completed", "Partially completed", "Canceled"]
  
  return (
    <DisbursementPage
      title="Deliveryman Disbursement"
      icon={ShoppingBag}
      tabs={tabs}
      disbursements={deliverymanDisbursementsDummy}
      count={deliverymanDisbursementsDummy.length}
    />
  )
}


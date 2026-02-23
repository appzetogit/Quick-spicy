import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Wallet,
  Wifi,
  X,
  ArrowLeft
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { 
  getDeliveryWalletState, 
  calculateDeliveryBalances 
} from "../utils/deliveryWalletState"
import { formatCurrency } from "../../restaurant/utils/currency"

export default function MyAccount() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [walletState, setWalletState] = useState(() => getDeliveryWalletState())

  // Listen for wallet state updates
  useEffect(() => {
    const handleWalletUpdate = () => {
      setWalletState(getDeliveryWalletState())
    }

    // Check on mount
    handleWalletUpdate()

    // Listen for custom event (for same tab updates)
    window.addEventListener('deliveryWalletStateUpdated', handleWalletUpdate)
    // Listen for storage event (for cross-tab updates)
    window.addEventListener('storage', handleWalletUpdate)

    return () => {
      window.removeEventListener('deliveryWalletStateUpdated', handleWalletUpdate)
      window.removeEventListener('storage', handleWalletUpdate)
    }
  }, [location.pathname])

  const balances = calculateDeliveryBalances(walletState)

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-6 flex items-center gap-4 rounded-b-3xl md:rounded-b-none">
        <button 
          onClick={() => navigate("/delivery")}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1 flex flex-col items-center">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-900 rounded-full flex items-center justify-center mb-2 md:mb-3">
            <Wifi className="w-6 h-6 md:w-8 md:h-8 text-white" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">My Account</h1>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {/* Payable Amount Card */}
        <div className="bg-gray-800 rounded-xl p-4 md:p-6 mb-6 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Wallet className="w-6 h-6 md:w-8 md:h-8 text-white flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-white text-sm md:text-base mb-1">Payable Amount</p>
                <p className="text-white text-3xl md:text-4xl font-bold">
                  {formatCurrency(balances.cashInHand)}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 w-full md:w-auto md:flex-shrink-0">
              <Button 
                onClick={() => setShowConfirmDialog(true)}
                className="bg-[#ff8100] hover:bg-[#e67300] text-white font-semibold px-3 py-2 md:px-4 md:py-2 rounded-lg text-xs md:text-sm w-full md:w-auto"
              >
                Adjust Payments
              </Button>
              <Button 
                onClick={() => {
                  // TODO: Process payment
                  console.log("Pay Now clicked")
                  alert("Payment processing feature coming soon")
                }}
                className="bg-[#ff8100] hover:bg-[#e67300] text-white font-semibold px-3 py-2 md:px-4 md:py-2 rounded-lg text-xs md:text-sm w-full md:w-auto"
              >
                Pay Now
              </Button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
            <p className="text-[#ff8100] text-2xl md:text-3xl font-bold mb-2">
              {formatCurrency(balances.cashInHand)}
            </p>
            <p className="text-gray-600 text-sm md:text-base">Cash in Hand</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
            <p className="text-[#ff8100] text-2xl md:text-3xl font-bold mb-2">
              {formatCurrency(balances.totalWithdrawn)}
            </p>
            <p className="text-gray-600 text-sm md:text-base">Total Withdrawn</p>
          </div>
        </div>

        {/* Transaction History */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg md:text-xl font-bold text-gray-900">Transaction History</h2>
            <button 
              onClick={() => navigate("/delivery/transactions")}
              className="text-[#ff8100] text-sm md:text-base font-medium hover:underline"
            >
              View All
            </button>
          </div>
          
          <div className="text-center py-12">
            <p className="text-gray-900 text-base md:text-lg">No transaction found</p>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirmDialog && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowConfirmDialog(false)}
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            >
              {/* Dialog Box */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ 
                  type: "spring", 
                  stiffness: 300, 
                  damping: 30 
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 relative"
              >
                {/* Close Button */}
                <button
                  onClick={() => setShowConfirmDialog(false)}
                  className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>

                {/* Content */}
                <div className="mt-2">
                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    Adjust Payments
                  </h3>
                  <p className="text-gray-600 text-base mb-6">
                    Are you sure you want to adjust the payment amount? This action will modify your current balance.
                  </p>

                  {/* Buttons */}
                  <div className="flex gap-3">
                    <Button
                      onClick={() => setShowConfirmDialog(false)}
                      variant="outline"
                      className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        // Handle OK action
                        console.log("Adjust Payments confirmed")
                        setShowConfirmDialog(false)
                        // TODO: Add actual adjustment logic here
                      }}
                      className="flex-1 bg-[#ff8100] hover:bg-[#e67300] text-white"
                    >
                      OK
                    </Button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  )
}


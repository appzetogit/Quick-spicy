import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle
} from "lucide-react"
import { formatCurrency } from "../../restaurant/utils/currency"
import { fetchWalletTransactions } from "../utils/deliveryWalletState"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function Payout() {
  const navigate = useNavigate()
  const [payouts, setPayouts] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Fetch withdrawal transactions
  useEffect(() => {
    const loadPayouts = async () => {
      try {
        setLoading(true)
        
        // Fetch only withdrawal transactions
        const fetchedTransactions = await fetchWalletTransactions({
          type: "withdrawal",
          limit: 1000
        })
        
        // Format transactions for display
        const formattedTransactions = fetchedTransactions.map(t => ({
          id: t._id || t.id,
          amount: t.amount || 0,
          status: t.status || 'Pending',
          description: t.description || 'Withdrawal request',
          date: t.date || t.createdAt ? new Date(t.date || t.createdAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }) : 'N/A',
          processedAt: t.processedAt ? new Date(t.processedAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }) : null,
          failureReason: t.failureReason || null,
          paymentMethod: t.paymentMethod || 'bank_transfer'
        }))
        
        // Sort by date (newest first)
        formattedTransactions.sort((a, b) => {
          const dateA = new Date(a.date)
          const dateB = new Date(b.date)
          return dateB - dateA
        })
        
        setPayouts(formattedTransactions)
      } catch (error) {
        debugError('Error loading withdrawal transactions:', error)
        setPayouts([])
      } finally {
        setLoading(false)
      }
    }
    
    loadPayouts()

    // Listen for wallet state updates
    const handleWalletUpdate = () => {
      loadPayouts()
    }

    window.addEventListener('deliveryWalletStateUpdated', handleWalletUpdate)
    window.addEventListener('storage', handleWalletUpdate)
    
    return () => {
      window.removeEventListener('deliveryWalletStateUpdated', handleWalletUpdate)
      window.removeEventListener('storage', handleWalletUpdate)
    }
  }, [])
  
  // Get status icon and color
  const getStatusInfo = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'approved':
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200'
        }
      case 'pending':
        return {
          icon: Clock,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200'
        }
      case 'denied':
      case 'rejected':
        return {
          icon: XCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200'
        }
      default:
    return {
          icon: Clock,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200'
        }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden pb-24 md:pb-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
        <h1 className="text-lg md:text-xl font-bold text-gray-900">Payout history</h1>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-4" />
            <p className="text-gray-600 text-base">Loading transactions...</p>
          </div>
        ) : payouts.length > 0 ? (
          <div className="space-y-4">
            {payouts.map((payout, index) => {
              const statusInfo = getStatusInfo(payout.status)
              const StatusIcon = statusInfo.icon
              
              return (
            <div
                  key={payout.id || index}
                  className={`bg-white rounded-xl p-4 shadow-sm border ${statusInfo.borderColor} transition-all hover:shadow-md`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusIcon className={`w-5 h-5 ${statusInfo.color}`} />
                        <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${statusInfo.bgColor} ${statusInfo.color}`}>
                          {payout.status}
                        </span>
                      </div>
                      <p className="text-gray-900 text-xl font-bold mb-1">
                        {formatCurrency(payout.amount)}
                      </p>
                      <p className="text-gray-600 text-sm mb-1">
                        {payout.description || "Payout request"}
                      </p>
                      <p className="text-gray-500 text-xs">
                        Requested: {payout.date}
                      </p>
                      {payout.processedAt && (
                        <p className="text-gray-500 text-xs mt-1">
                          Processed: {payout.processedAt}
                        </p>
                      )}
                      {payout.failureReason && (
                        <p className="text-red-600 text-xs mt-2 font-medium">
                          Reason: {payout.failureReason}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Payment Method Badge */}
                  {payout.paymentMethod && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <span className="text-xs text-gray-500 capitalize">
                        Payment method: {payout.paymentMethod.replace('_', ' ')}
                </span>
                    </div>
                  )}
                </div>
              )
            })}
              </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-900 text-lg font-semibold mb-2">No payouts yet</p>
            <p className="text-gray-600 text-sm text-center max-w-xs">
              Completed and pending payout requests will appear here.
            </p>
        </div>
        )}
      </div>
    </div>
  )
}



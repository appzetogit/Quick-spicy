import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Clock, Loader2, MinusCircle } from "lucide-react"
import { formatCurrency } from "../../restaurant/utils/currency"
import { fetchWalletTransactions } from "../utils/deliveryWalletState"
const debugError = (...args) => {}

const formatDateTime = (value) => {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function DeductionStatement() {
  const navigate = useNavigate()
  const [deductions, setDeductions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadDeductions = async () => {
      try {
        setLoading(true)
        const fetchedTransactions = await fetchWalletTransactions({
          type: "deduction",
          limit: 1000,
        })

        const formatted = fetchedTransactions
          .map((transaction) => ({
            id: transaction._id || transaction.id,
            amount: Number(transaction.amount) || 0,
            status: transaction.status || "Completed",
            description: transaction.description || "Deduction",
            date: formatDateTime(transaction.date || transaction.createdAt),
            processedAt: formatDateTime(transaction.processedAt),
            failureReason: transaction.failureReason || null,
          }))
          .sort((a, b) => new Date(b.processedAt || b.date) - new Date(a.processedAt || a.date))

        setDeductions(formatted)
      } catch (error) {
        debugError("Error loading deduction transactions:", error)
        setDeductions([])
      } finally {
        setLoading(false)
      }
    }

    loadDeductions()

    const refreshDeductions = () => {
      loadDeductions()
    }

    window.addEventListener("deliveryWalletStateUpdated", refreshDeductions)
    window.addEventListener("storage", refreshDeductions)

    return () => {
      window.removeEventListener("deliveryWalletStateUpdated", refreshDeductions)
      window.removeEventListener("storage", refreshDeductions)
    }
  }, [])

  const summary = useMemo(() => {
    const completed = deductions.filter((item) => item.status === "Completed")
    return completed.reduce((sum, item) => sum + item.amount, 0)
  }, [deductions])

  return (
    <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-6">
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-6 flex items-center gap-4 rounded-b-3xl md:rounded-b-none">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Deduction statement</h1>
      </div>

      <div className="px-4 py-6">
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-sm text-gray-500 mb-1">Total deductions</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary)}</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-4" />
            <p className="text-gray-600 text-base">Loading deductions...</p>
          </div>
        ) : deductions.length > 0 ? (
          <div className="space-y-3">
            {deductions.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-200"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <MinusCircle className="w-5 h-5 text-red-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.description}</p>
                      <p className="text-xs text-gray-500 mt-1">Created: {item.date}</p>
                      {item.processedAt !== "N/A" && (
                        <p className="text-xs text-gray-500">Processed: {item.processedAt}</p>
                      )}
                      {item.failureReason && (
                        <p className="text-xs text-red-600 mt-1">Reason: {item.failureReason}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">- {formatCurrency(item.amount)}</p>
                    <p className="text-xs text-gray-500 mt-1">{item.status}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-900 text-lg font-semibold mb-2">No deductions yet</p>
            <p className="text-gray-600 text-sm text-center max-w-xs">
              Deductions added by admin will appear here automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

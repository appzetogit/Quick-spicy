import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, AlertTriangle } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { fetchDeliveryWallet } from "../utils/deliveryWalletState"

export default function CustomerTipsBalancePage() {
  const navigate = useNavigate()
  const MIN_TIP_WITHDRAWAL = 0
  const [walletState, setWalletState] = useState({ totalTips: 0, transactions: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadWallet = async () => {
      setLoading(true)
      const data = await fetchDeliveryWallet()
      if (mounted) {
        setWalletState(data || { totalTips: 0, transactions: [] })
        setLoading(false)
      }
    }

    loadWallet()

    const refresh = () => loadWallet()
    window.addEventListener("deliveryWalletStateUpdated", refresh)
    window.addEventListener("focus", refresh)

    return () => {
      mounted = false
      window.removeEventListener("deliveryWalletStateUpdated", refresh)
      window.removeEventListener("focus", refresh)
    }
  }, [])

  const tipSummary = useMemo(() => {
    const transactions = Array.isArray(walletState?.transactions)
      ? walletState.transactions
      : []

    const tipFromTransactions = transactions
      .filter(
        (t) =>
          t?.status === "Completed" &&
          (t?.type === "tip" ||
            (t?.type === "payment" &&
              String(t?.description || "").toLowerCase().includes("tip")))
      )
      .reduce((sum, t) => sum + (Number(t?.amount) || 0), 0)

    const tipsReceived =
      Number(walletState?.totalTips) > 0
        ? Number(walletState.totalTips)
        : tipFromTransactions

    const tipsWithdrawn = transactions
      .filter((t) => {
        if (t?.type !== "withdrawal" || t?.status !== "Completed") return false
        const description = String(t?.description || "").toLowerCase()
        const source = String(t?.metadata?.source || "").toLowerCase()
        return source.includes("tip") || description.includes("tip")
      })
      .reduce((sum, t) => sum + (Number(t?.amount) || 0), 0)

    const withdrawable = Math.max(0, tipsReceived - tipsWithdrawn)

    return {
      tipsReceived,
      tipsWithdrawn,
      withdrawable,
    }
  }, [walletState])

  const formatAmount = (amount) => `\u20B9${Number(amount || 0).toFixed(2)}`

  const today = new Date()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const weekRange = `${weekStart.getDate()} ${weekStart
    .toLocaleString("en-US", { month: "short" })
    .toUpperCase()} - ${today.getDate()} ${today
    .toLocaleString("en-US", { month: "short" })
    .toUpperCase()}`

  const canWithdraw = tipSummary.withdrawable > MIN_TIP_WITHDRAWAL

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="flex items-center gap-3 p-4 border-b border-gray-200">
        <ArrowLeft onClick={() => navigate(-1)} size={22} className="cursor-pointer" />
        <h1 className="text-lg font-semibold">Customer tips</h1>
      </div>

      <div className="bg-yellow-400 p-4 flex items-start gap-3 text-black">
        <AlertTriangle size={20} />
        <div className="text-sm leading-tight">
          <p className="font-semibold">
            {canWithdraw ? "Tips available to withdraw" : "Withdraw currently disabled"}
          </p>
          <p className="text-xs">
            Withdrawable amount is {formatAmount(tipSummary.withdrawable)}
          </p>
        </div>
      </div>

      <div className="px-5 py-6 flex flex-col items-start">
        <p className="text-sm text-gray-600 mb-1">Customer tips balance</p>
        <p className="text-4xl font-bold mb-5">
          {loading ? "..." : formatAmount(tipSummary.tipsReceived)}
        </p>

        <button
          disabled={!canWithdraw}
          onClick={() => canWithdraw && navigate("/delivery/pocket-balance")}
          className={`w-full font-medium py-3 rounded-lg ${
            canWithdraw
              ? "bg-black text-white"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}
        >
          Withdraw
        </button>
        <p className="text-xs text-gray-500 mt-2">
          Minimum withdrawal amount for tips: {formatAmount(MIN_TIP_WITHDRAWAL)}
        </p>
      </div>

      <div className="bg-gray-100 py-2 pt-4 text-center text-xs font-semibold text-gray-600">
        TIPS DETAILS - {weekRange}
      </div>

      <div className="px-4 pt-2">
        <DetailRow label="Tips" value={formatAmount(tipSummary.tipsReceived)} />
        <DetailRow label="Tips Withdrawn" value={formatAmount(tipSummary.tipsWithdrawn)} />
        <DetailRow
          label="Withdrawable Amount"
          value={formatAmount(tipSummary.withdrawable)}
        />
      </div>

      <div className="bg-gray-50 rounded-xl p-2 shadow-sm border border-gray-50 fixed bottom-0 w-[90%] mx-auto left-1/2 transform -translate-x-1/2 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="relative shrink-0 scale-75">
            <svg width="80" height="80" viewBox="0 0 80 80" className="shrink-0">
              <circle cx="40" cy="40" r="38" fill="white" stroke="#9ca3af" strokeWidth="2" />
              <path
                d="M 25 40 L 35 50 L 55 30"
                stroke="#9ca3af"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <path
                  id="tipCircle"
                  d="M 40,40 m -30,0 a 30,30 0 1,1 60,0 a 30,30 0 1,1 -60,0"
                  fill="none"
                />
              </defs>
              <text fill="#9ca3af" fontSize="7" fontWeight="600" letterSpacing="0.5">
                <textPath href="#tipCircle" startOffset="0%">
                  100% TIP TRANSFER
                </textPath>
              </text>
            </svg>
          </div>

          <div className="flex-1">
            <h2 className="text-sm md:text-md font-semibold text-gray-400 truncate">
              100% TIP TRANSFER GUARANTEE
            </h2>
          </div>
        </div>

        <div className="border-t border-dashed border-gray-400 mb-4"></div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0"></div>
            <p className="text-gray-400 text-sm md:text-base">
              Tips are never used to settle your deductions.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0"></div>
            <p className="text-gray-400 text-sm md:text-base">
              Tips are transferred to your bank account weekly, if not withdrawn.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, multiline = false }) {
  return (
    <div className="py-3 flex justify-between items-start border-b border-gray-100">
      <div className={`text-sm ${multiline ? "" : "font-medium"} text-gray-800`}>
        {label}
      </div>
      <div className="text-sm font-semibold text-black">{value}</div>
    </div>
  )
}

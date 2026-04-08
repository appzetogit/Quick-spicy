import { useState } from "react"
import { IndianRupee, Loader2 } from "lucide-react"
import { deliveryAPI } from "@/lib/api"
import { initCashfreePayment } from "@/lib/utils/cashfree"
import { toast } from "sonner"

export default function DepositPopup({ onSuccess, cashInHand = 0 }) {
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)

  const cashInHandNum = Number(cashInHand) || 0

  const handleAmountChange = (e) => {
    const v = e.target.value.replace(/[^0-9.]/g, "")
    if (v === "" || (parseFloat(v) >= 0 && parseFloat(v) <= 500000)) setAmount(v)
  }

  const handleDeposit = async () => {
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt < 1) {
      toast.error("Enter a valid amount (minimum INR 1)")
      return
    }
    if (amt > 500000) {
      toast.error("Maximum deposit is INR 5,00,000")
      return
    }
    if (cashInHandNum > 0 && amt > cashInHandNum) {
      toast.error(`Deposit amount cannot exceed cash in hand (INR ${cashInHandNum.toFixed(2)})`)
      return
    }

    try {
      setLoading(true)
      const orderRes = await deliveryAPI.createDepositOrder(amt)
      const data = orderRes?.data?.data
      const cashfree = data?.cashfree
      if (!cashfree?.orderId || !cashfree?.paymentSessionId) {
        toast.error("Payment gateway not ready. Please try again.")
        setLoading(false)
        return
      }
      setLoading(false)
      setProcessing(true)

      await initCashfreePayment({
        paymentSessionId: cashfree.paymentSessionId,
        environment: cashfree.environment
      })

      const verifyRes = await deliveryAPI.verifyDepositPayment({
        cashfreeOrderId: cashfree.orderId,
        amount: amt
      })

      if (verifyRes?.data?.success) {
        toast.success(`Deposit of INR ${amt.toFixed(2)} successful. Available limit updated.`)
        setAmount("")
        window.dispatchEvent(new CustomEvent("deliveryWalletStateUpdated"))
        if (onSuccess) onSuccess()
      } else {
        toast.error(verifyRes?.data?.message || "Verification failed")
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to create payment")
    } finally {
      setLoading(false)
      setProcessing(false)
    }
  }

  return (
    <div className="flex flex-col p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Amount (INR)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            <IndianRupee className="w-4 h-4" />
          </span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={handleAmountChange}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        {cashInHandNum > 0 && (
          <p className="text-xs text-slate-500 mt-1">
            Cash in hand: INR {cashInHandNum.toFixed(2)}. Deposit cannot exceed this.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleDeposit}
        disabled={loading || processing || !amount || parseFloat(amount) < 1}
        className="w-full py-2.5 rounded-lg bg-black text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading || processing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : null}
        {loading ? "Creating..." : processing ? "Opening Cashfree..." : "Deposit"}
      </button>
    </div>
  )
}

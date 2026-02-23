import { ArrowLeft, AlertTriangle, Loader2 } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import {
  fetchDeliveryWallet,
  calculateDeliveryBalances,
  calculatePeriodEarnings
} from "../utils/deliveryWalletState"
import { formatCurrency } from "../../restaurant/utils/currency"
import { deliveryAPI } from "@/lib/api"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

export default function PocketBalancePage() {
  const navigate = useNavigate()
  const [walletState, setWalletState] = useState({
    totalBalance: 0,
    cashInHand: 0,
    totalWithdrawn: 0,
    totalEarned: 0,
    transactions: [],
    joiningBonusClaimed: false
  })
  const [walletLoading, setWalletLoading] = useState(true)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false)

  // Fetch wallet data from API (cashInHand = Cash collected from backend)
  const fetchWalletData = async () => {
    try {
      setWalletLoading(true)
      const walletData = await fetchDeliveryWallet()
      setWalletState(walletData)
    } catch (error) {
      console.error('Error fetching wallet data:', error)
      setWalletState({
        totalBalance: 0,
        cashInHand: 0,
        totalWithdrawn: 0,
        totalEarned: 0,
        transactions: [],
        joiningBonusClaimed: false
      })
    } finally {
      setWalletLoading(false)
    }
  }

  useEffect(() => {
    fetchWalletData()

    const handleWalletUpdate = () => {
      fetchWalletData()
    }

    window.addEventListener('deliveryWalletStateUpdated', handleWalletUpdate)
    window.addEventListener('storage', handleWalletUpdate)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchWalletData()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Refetch periodically when visible so admin approve/reject reflects in pocket balance
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchWalletData()
    }, 20000)

    return () => {
      window.removeEventListener('deliveryWalletStateUpdated', handleWalletUpdate)
      window.removeEventListener('storage', handleWalletUpdate)
      document.removeEventListener('visibilitychange', handleVisibility)
      clearInterval(interval)
    }
  }, [])

  const balances = calculateDeliveryBalances(walletState)
  
  // Calculate weekly earnings for the current week (excludes bonus)
  const weeklyEarnings = calculatePeriodEarnings(walletState, 'week')
  
  // Calculate total bonus amount from all bonus transactions
  const totalBonus = walletState?.transactions
    ?.filter(t => t.type === 'bonus' && t.status === 'Completed')
    .reduce((sum, t) => sum + (t.amount || 0), 0) || 0
  
  // Calculate total withdrawn (needed for pocket balance calculation)
  const totalWithdrawn = balances.totalWithdrawn || 0
  
  // Pocket balance = total balance (includes bonus + earnings)
  // Formula: Pocket Balance = Earnings + Bonus - Withdrawals
  // Use walletState.pocketBalance if available, otherwise calculate from totalBalance
  let pocketBalance = walletState?.pocketBalance !== undefined 
    ? walletState.pocketBalance 
    : (walletState?.totalBalance || balances.totalBalance || 0)
  
  // IMPORTANT: Ensure pocket balance includes bonus
  // If backend totalBalance is 0 but we have bonus, calculate it manually
  // This ensures bonus is always reflected in pocket balance and withdrawable amount
  if (pocketBalance === 0 && totalBonus > 0) {
    // If totalBalance is 0 but we have bonus, pocket balance = bonus
    pocketBalance = totalBonus
  } else if (pocketBalance > 0 && totalBonus > 0) {
    // Verify pocket balance includes bonus
    // Calculate expected: Earnings + Bonus - Withdrawals
    const expectedBalance = weeklyEarnings + totalBonus - totalWithdrawn
    // Use the higher value to ensure bonus is included
    if (expectedBalance > pocketBalance) {
      pocketBalance = expectedBalance
    }
  }
  
  // Calculate cash collected (cash in hand)
  const cashCollected = balances.cashInHand || 0
  
  // Deductions = actual deductions only (fees, penalties). Pending withdrawal is NOT a deduction.
  const deductions = 0
  
  // Amount withdrawn = approved + pending (requested) withdrawals. Withdraw ki hui amount yahin dikhegi.
  const amountWithdrawnDisplay = (balances.totalWithdrawn || 0) + (balances.pendingWithdrawals || 0)
  
  // Withdrawal limit from admin (min amount above which withdrawal is allowed)
  const withdrawalLimit = Number(walletState?.deliveryWithdrawalLimit) || 100
  
  // Withdrawable amount = pocket balance (includes bonus + earnings)
  const withdrawableAmount = pocketBalance > 0 ? pocketBalance : 0
  
  // Withdrawal allowed only when withdrawable amount >= withdrawal limit
  const canWithdraw = withdrawableAmount >= withdrawalLimit && withdrawableAmount > 0
  
  // Debug logging (cashInHand = Cash collected from backend)
  console.log('💰 PocketBalance Page Calculations:', {
    walletStateCashInHand: walletState?.cashInHand,
    balancesCashInHand: balances.cashInHand,
    cashCollected,
    walletStateTotalBalance: walletState?.totalBalance,
    walletStatePocketBalance: walletState?.pocketBalance,
    balancesTotalBalance: balances.totalBalance,
    calculatedPocketBalance: pocketBalance,
    totalBonus: totalBonus,
    weeklyEarnings: weeklyEarnings,
    withdrawableAmount: withdrawableAmount,
    withdrawalLimit,
    canWithdraw
  })

  // Get current week date range
  const getCurrentWeekRange = () => {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - dayOfWeek)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)

    const formatDate = (date) => {
      const day = date.getDate()
      const month = date.toLocaleString('en-US', { month: 'short' })
      return `${day} ${month}`
    }

    return `${formatDate(startOfWeek)} - ${formatDate(endOfWeek)}`
  }

  const openWithdrawModal = () => {
    setWithdrawAmount("")
    setShowWithdrawModal(true)
  }

  const handleWithdrawSubmit = async () => {
    const num = Number(withdrawAmount)
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Enter a valid amount")
      return
    }
    if (num < withdrawalLimit) {
      toast.error(`Minimum withdrawal is ${formatCurrency(withdrawalLimit)}`)
      return
    }
    if (num > withdrawableAmount) {
      toast.error(`Maximum withdrawable is ${formatCurrency(withdrawableAmount)}`)
      return
    }

    let profile
    try {
      const res = await deliveryAPI.getProfile()
      profile = res?.data?.data?.profile ?? res?.data?.profile
    } catch (e) {
      toast.error("Failed to load profile")
      return
    }

    const b = profile?.documents?.bankDetails
    const hasBank =
      b?.accountHolderName?.trim() &&
      b?.accountNumber?.trim() &&
      b?.ifscCode?.trim() &&
      b?.bankName?.trim()
    if (!hasBank) {
      toast.error("Add bank details first")
      setShowWithdrawModal(false)
      navigate("/delivery/profile/details")
      return
    }

    setWithdrawSubmitting(true)
    try {
      const res = await deliveryAPI.createWithdrawalRequest({
        amount: num,
        paymentMethod: "bank_transfer",
        bankDetails: {
          accountHolderName: b.accountHolderName.trim(),
          accountNumber: b.accountNumber.trim(),
          ifscCode: b.ifscCode.trim(),
          bankName: b.bankName.trim(),
        },
      })
      if (res?.data?.success) {
        toast.success("Withdrawal request submitted")
        setShowWithdrawModal(false)
        setWithdrawAmount("")
        fetchWalletData()
        window.dispatchEvent(new Event("deliveryWalletStateUpdated"))
      } else {
        toast.error(res?.data?.message || "Failed to submit withdrawal")
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to submit withdrawal")
    } finally {
      setWithdrawSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white text-black">

      {/* Top Bar */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200">
        <ArrowLeft onClick={() => navigate(-1)} size={22} className="cursor-pointer" />
        <h1 className="text-lg font-semibold">Pocket balance</h1>
      </div>

      {/* Warning Banner – when withdraw disabled */}
      {!canWithdraw && (
        <div className="bg-yellow-400 p-4 flex items-start gap-3 text-black">
          <AlertTriangle size={20} />
          <div className="text-sm leading-tight">
            <p className="font-semibold">Withdraw currently disabled</p>
            <p className="text-xs">
              {withdrawableAmount <= 0
                ? "Withdrawable amount is ₹0"
                : `Withdrawable amount is minimum (${formatCurrency(withdrawalLimit)}).`}
            </p>
          </div>
        </div>
      )}

      {/* Withdraw Section */}
      <div className="px-5 py-6 flex flex-col items-center text-center">
        <p className="text-sm text-gray-600 mb-1">Withdraw amount</p>
        <p className="text-4xl font-bold mb-5">{formatCurrency(withdrawableAmount)}</p>

        <button
          disabled={!canWithdraw}
          onClick={() => canWithdraw && openWithdrawModal()}
          className={`w-full font-medium py-3 rounded-lg ${
            canWithdraw
              ? "bg-black text-white hover:bg-gray-800"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}
        >
          Withdraw
        </button>
      </div>

      {/* Withdraw amount popup */}
      <Dialog open={showWithdrawModal} onOpenChange={setShowWithdrawModal}>
        <DialogContent className="max-w-sm bg-white p-0 rounded-xl">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="text-lg font-semibold text-black">Withdraw amount</DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
              <input
                type="number"
                min={withdrawalLimit}
                max={withdrawableAmount}
                step="1"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
              />
              <p className="text-xs text-gray-500 mt-1">
                Min {formatCurrency(withdrawalLimit)} · Max {formatCurrency(withdrawableAmount)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWithdrawAmount(String(withdrawableAmount))}
              className="w-full py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Use full amount ({formatCurrency(withdrawableAmount)})
            </button>
          </div>
          <DialogFooter className="px-5 pb-5 flex gap-3">
            <button
              onClick={() => setShowWithdrawModal(false)}
              className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleWithdrawSubmit}
              disabled={withdrawSubmitting}
              className="flex-1 py-2.5 text-sm font-medium rounded-lg bg-black text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {withdrawSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {withdrawSubmitting ? "Submitting…" : "Withdraw"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section Header */}
      <div className=" bg-gray-100 py-2 pt-4 text-center text-xs font-semibold text-gray-600">
        POCKET DETAILS • {getCurrentWeekRange()}
      </div>

      {/* Detail Rows */}
      <div className="px-4 pt-2">

        <DetailRow label="Earnings" value={formatCurrency(weeklyEarnings)} />
        <DetailRow label="Bonus" value={formatCurrency(totalBonus)} />
        <DetailRow label="Amount withdrawn" value={formatCurrency(totalWithdrawn)} />
        <DetailRow label="Cash collected" value={formatCurrency(cashCollected)} />
        <DetailRow label="Deductions" value={formatCurrency(deductions)} />
        <DetailRow label="Pocket balance" value={formatCurrency(pocketBalance)} />

        <DetailRow
          label={
            <div>
              Min. withdrawal amount
              <p className="text-xs text-gray-500">
                Withdrawal allowed only when withdrawable amount ≥ this
              </p>
            </div>
          }
          value={formatCurrency(withdrawalLimit)}
          multiline
        />

        <DetailRow label="Withdrawable amount" value={formatCurrency(withdrawableAmount)} />

      </div>
    </div>
  )
}

/* Reusable row component */
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

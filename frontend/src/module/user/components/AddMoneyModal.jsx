import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { IndianRupee, Loader2 } from "lucide-react"
import { userAPI } from "@/lib/api"
import { initCashfreePayment } from "@/lib/utils/cashfree"
import { toast } from "sonner"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default function AddMoneyModal({ open, onOpenChange, onSuccess }) {
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Quick amount buttons
  const quickAmounts = [100, 250, 500, 1000, 2000, 5000]

  const handleAmountSelect = (selectedAmount) => {
    setAmount(selectedAmount.toString())
  }

  const handleAmountChange = (e) => {
    const value = e.target.value.replace(/[^0-9.]/g, "")
    if (value === "" || (parseFloat(value) >= 1 && parseFloat(value) <= 50000)) {
      setAmount(value)
    }
  }

  const handleAddMoney = async () => {
    const amountNum = parseFloat(amount)

    if (!amount || isNaN(amountNum) || amountNum < 1) {
      toast.error("Please enter a valid amount (minimum ₹1)")
      return
    }

    if (amountNum > 50000) {
      toast.error("Maximum amount is ₹50,000")
      return
    }

    try {
      setLoading(true)

      // Create Cashfree order
      debugLog('Creating wallet top-up order for amount:', amountNum)
      const orderResponse = await userAPI.createWalletTopupOrder(amountNum)
      debugLog('Order response:', orderResponse)

      const { cashfree } = orderResponse.data.data

      if (!cashfree || !cashfree.orderId || !cashfree.paymentSessionId) {
        debugError('Invalid Cashfree response:', { cashfree, orderResponse })
        throw new Error("Failed to initialize payment gateway")
      }

      setLoading(false)

      // Close the modal before opening Cashfree to avoid z-index conflicts
      onOpenChange(false)

      // Small delay to ensure modal is closed
      await new Promise(resolve => setTimeout(resolve, 100))

      setProcessing(true)

      // Get user info for payment prefill
      let userInfo = {}
      try {
        const userResponse = await userAPI.getProfile()
        userInfo = userResponse?.data?.data?.user || userResponse?.data?.user || {}
      } catch (err) {
        debugWarn("Could not fetch user profile for payment prefill:", err)
      }

      const userPhone = userInfo.phone || ""
      const userEmail = userInfo.email || ""
      const userName = userInfo.name || ""

      // Format phone number (remove non-digits, take last 10 digits)
      const formattedPhone = userPhone.replace(/\D/g, "").slice(-10)

      debugLog("Payment prefill info:", { userName, userEmail, formattedPhone })

      await initCashfreePayment({
        paymentSessionId: cashfree.paymentSessionId,
        environment: cashfree.environment
      })

      try {
        let verifyResponse = null
        let lastPendingMessage = ""

        for (let attempt = 1; attempt <= 6; attempt += 1) {
          try {
            verifyResponse = await userAPI.verifyWalletTopupPayment({
              cashfreeOrderId: cashfree.orderId,
              amount: amountNum
            })
          } catch (verifyError) {
            const isPendingVerification =
              verifyError?.response?.status === 202 ||
              verifyError?.response?.data?.pending === true

            if (isPendingVerification && attempt < 6) {
              lastPendingMessage =
                verifyError?.response?.data?.message || "Payment confirmation is pending"
              await wait(1800)
              continue
            }

            throw verifyError
          }

          if (verifyResponse?.data?.success) {
            break
          }

          if (attempt < 6) {
            lastPendingMessage = verifyResponse?.data?.message || "Payment confirmation is pending"
            await wait(1800)
          }
        }

        if (!verifyResponse?.data?.success) {
          throw new Error(lastPendingMessage || "Payment verification failed")
        }

        toast.success(`₹${amountNum} added to wallet successfully!`)
        setAmount("")
        setProcessing(false)
        onOpenChange(false)

        if (onSuccess) {
          onSuccess()
        }
      } catch (error) {
        debugError("Payment verification error:", error)
        const pendingVerification =
          error?.response?.status === 202 ||
          error?.response?.data?.pending === true

        if (pendingVerification) {
          toast.success("Payment is processing. Your wallet balance should update shortly.")
          setAmount("")
          setProcessing(false)

          if (onSuccess) {
            onSuccess()
          }
          return
        }

        toast.error(error?.response?.data?.message || error?.message || "Payment verification failed. Please contact support.")
        setProcessing(false)
      }
    } catch (error) {
      debugError("Error creating payment order:", error)
      debugError("Error response:", error?.response)
      debugError("Error response data:", error?.response?.data)

      // Extract error message from response
      let errorMessage = "Failed to initialize payment. Please try again."

      if (error?.response?.data) {
        if (error.response.data.message) {
          errorMessage = error.response.data.message
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error
        } else if (typeof error.response.data === 'string') {
          errorMessage = error.response.data
        }
      } else if (error?.message) {
        errorMessage = error.message
      }

      debugError("Final error message:", errorMessage)
      toast.error(errorMessage)
      setLoading(false)
      setProcessing(false)
    }
  }

  const handleClose = () => {
    if (!loading && !processing) {
      setAmount("")
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-6 bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
            Add Money to Wallet
          </DialogTitle>
          <DialogDescription className="text-sm md:text-base text-gray-600 dark:text-gray-400">
            Enter the amount you want to add to your wallet
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Amount Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Enter Amount
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <IndianRupee className="h-5 w-5 text-gray-400" />
              </div>
              <Input
                type="text"
                value={amount}
                onChange={handleAmountChange}
                placeholder="Enter amount"
                className="pl-10 h-12 text-lg bg-white dark:bg-[#111111] border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                disabled={loading || processing}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Minimum: ₹1 | Maximum: ₹50,000
            </p>
          </div>

          {/* Quick Amount Buttons */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Quick Select
            </label>
            <div className="grid grid-cols-3 gap-2">
              {quickAmounts.map((quickAmount) => (
                <Button
                  key={quickAmount}
                  type="button"
                  variant={amount === quickAmount.toString() ? "default" : "outline"}
                  className={`h-10 ${
                    amount === quickAmount.toString()
                      ? "bg-black text-white hover:bg-gray-900 dark:bg-green-600 dark:hover:bg-green-700 dark:text-white"
                      : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50 dark:bg-[#111111] dark:text-white dark:border-gray-700 dark:hover:bg-[#202020]"
                  }`}
                  onClick={() => handleAmountSelect(quickAmount)}
                  disabled={loading || processing}
                >
                  ₹{quickAmount}
                </Button>
              ))}
            </div>
          </div>

          {/* Add Money Button */}
          <Button
            onClick={handleAddMoney}
            disabled={!amount || loading || processing || parseFloat(amount) < 1}
            className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-semibold text-base"
          >
            {loading || processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {loading ? "Processing..." : "Opening Cashfree..."}
              </>
            ) : (
              `Add ₹${amount || "0"}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}



import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { FileText, Calendar, Package } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import OrdersTopbar from "../../components/orders/OrdersTopbar"
import OrdersTable from "../../components/orders/OrdersTable"
import FilterPanel from "../../components/orders/FilterPanel"
import ViewOrderDialog from "../../components/orders/ViewOrderDialog"
import SettingsDialog from "../../components/orders/SettingsDialog"
import RefundModal from "../../components/orders/RefundModal"
import { useOrdersManagement } from "../../components/orders/useOrdersManagement"
import { Loader2 } from "lucide-react"
import alertSound from "@/assets/audio/alert.mp3"

// Status configuration with titles, colors, and icons
const statusConfig = {
  "all": { title: "All Orders", color: "emerald", icon: FileText },
  "scheduled": { title: "Scheduled Orders", color: "blue", icon: Calendar },
  "pending": { title: "Pending Orders", color: "amber", icon: Package },
  "accepted": { title: "Accepted Orders", color: "green", icon: Package },
  "processing": { title: "Processing Orders", color: "orange", icon: Package },
  "food-on-the-way": { title: "Food On The Way Orders", color: "amber", icon: Package },
  "delivered": { title: "Delivered Orders", color: "emerald", icon: Package },
  "canceled": { title: "Canceled Orders", color: "rose", icon: Package },
  "restaurant-cancelled": { title: "Restaurant Cancelled Orders", color: "red", icon: Package },
  "payment-failed": { title: "Payment Failed Orders", color: "red", icon: Package },
  "refunded": { title: "Refunded Orders", color: "sky", icon: Package },
  "offline-payments": { title: "Offline Payments", color: "slate", icon: Package },
}

export default function OrdersPage({ statusKey = "all" }) {
  const config = statusConfig[statusKey] || statusConfig["all"]
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [processingRefund, setProcessingRefund] = useState(null)
  const [processingActionOrderId, setProcessingActionOrderId] = useState(null)
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [selectedOrderForRefund, setSelectedOrderForRefund] = useState(null)
  const seenPendingOrderIdsRef = useRef(new Set())
  const isFirstLoadRef = useRef(true)
  const fallbackAudioRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioUnlockedRef = useRef(false)

  const isPendingOrder = useCallback((order) => {
    const orderStatus = String(order?.orderStatus || "").toLowerCase()
    const status = String(order?.status || "").toLowerCase()
    return orderStatus === "pending" || (status === "confirmed" && orderStatus === "accepted")
  }, [])

  const playDefaultRing = useCallback(() => {
    try {
      if (!fallbackAudioRef.current) {
        fallbackAudioRef.current = new Audio(alertSound)
        fallbackAudioRef.current.preload = "auto"
        fallbackAudioRef.current.volume = 1
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioCtx()
        }
        const ctx = audioContextRef.current
        const playWithContext = async () => {
          if (ctx.state === "suspended") {
            await ctx.resume()
          }

          const beep = (startAt, frequency = 880, duration = 0.2) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.type = "sine"
            osc.frequency.value = frequency
            gain.gain.value = 0.0001
            osc.connect(gain)
            gain.connect(ctx.destination)

            const start = ctx.currentTime + startAt
            osc.start(start)
            gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
            osc.stop(start + duration + 0.02)
          }

          beep(0, 880, 0.2)
          beep(0.26, 880, 0.2)
          beep(0.52, 988, 0.26)

          setTimeout(() => {
            if (ctx.state === "running") {
              ctx.suspend().catch(() => {})
            }
          }, 1200)
        }
        playWithContext().catch(async () => {
          if (fallbackAudioRef.current) {
            fallbackAudioRef.current.currentTime = 0
            await fallbackAudioRef.current.play()
          }
        })
        return
      }

      if (fallbackAudioRef.current) {
        fallbackAudioRef.current.currentTime = 0
        fallbackAudioRef.current.play().catch(() => {})
      }
    } catch (error) {
      console.warn("Ring sound could not be played:", error)
    }
  }, [])

  // Unlock audio on first user gesture so rings can play reliably later
  useEffect(() => {
    const unlockAudio = async () => {
      if (audioUnlockedRef.current) return

      try {
        if (!fallbackAudioRef.current) {
          fallbackAudioRef.current = new Audio(alertSound)
          fallbackAudioRef.current.preload = "auto"
          fallbackAudioRef.current.volume = 1
        }

        // Prime media element playback permission
        fallbackAudioRef.current.muted = true
        await fallbackAudioRef.current.play()
        fallbackAudioRef.current.pause()
        fallbackAudioRef.current.currentTime = 0
        fallbackAudioRef.current.muted = false

        // Prime WebAudio permission
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (AudioCtx && !audioContextRef.current) {
          audioContextRef.current = new AudioCtx()
        }
        if (audioContextRef.current?.state === "suspended") {
          await audioContextRef.current.resume()
        }
        if (audioContextRef.current?.state === "running") {
          await audioContextRef.current.suspend()
        }

        audioUnlockedRef.current = true
      } catch {
        // Ignore unlock errors; we'll retry on next gesture implicitly
      }
    }

    window.addEventListener("pointerdown", unlockAudio, { passive: true })
    window.addEventListener("keydown", unlockAudio)
    window.addEventListener("touchstart", unlockAudio, { passive: true })

    return () => {
      window.removeEventListener("pointerdown", unlockAudio)
      window.removeEventListener("keydown", unlockAudio)
      window.removeEventListener("touchstart", unlockAudio)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

  const fetchOrders = useCallback(async (options = {}) => {
    const { silent = false, withRingCheck = false } = options

    try {
      if (!silent) setIsLoading(true)
      const params = {
        page: 1,
        limit: 1000,
        status:
          statusKey === "all"
            ? undefined
            : statusKey === "restaurant-cancelled"
              ? "cancelled"
              : statusKey,
        cancelledBy: statusKey === "restaurant-cancelled" ? "restaurant" : undefined,
      }

      const response = await adminAPI.getOrders(params)

      if (response.data?.success && response.data?.data?.orders) {
        const nextOrders = response.data.data.orders
        const nextPendingIds = new Set(
          nextOrders
            .filter((order) => isPendingOrder(order))
            .map((order) => order.id || order._id || order.orderId)
            .filter(Boolean),
        )

        if (withRingCheck && !isFirstLoadRef.current) {
          const hasNewPendingOrder = [...nextPendingIds].some(
            (id) => !seenPendingOrderIdsRef.current.has(id),
          )
          if (hasNewPendingOrder) {
            playDefaultRing()
            toast.info("New pending order received")
          }
        }

        seenPendingOrderIdsRef.current = nextPendingIds
        isFirstLoadRef.current = false
        setOrders(nextOrders)
      } else {
        console.error("Failed to fetch orders:", response.data)
        if (!silent) toast.error("Failed to fetch orders")
        setOrders([])
      }
    } catch (error) {
      console.error("Error fetching orders:", error)
      if (!silent) {
        toast.error(error.response?.data?.message || "Failed to fetch orders")
      }
      setOrders([])
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [statusKey, playDefaultRing, isPendingOrder])

  useEffect(() => {
    isFirstLoadRef.current = true
    seenPendingOrderIdsRef.current = new Set()
    fetchOrders({ silent: false, withRingCheck: false })
  }, [fetchOrders])

  useEffect(() => {
    if (statusKey !== "all") return undefined

    const pollId = setInterval(() => {
      fetchOrders({ silent: true, withRingCheck: true })
    }, 15000)

    return () => clearInterval(pollId)
  }, [statusKey, fetchOrders])

  const handleAcceptOrder = async (order) => {
    const orderIdToUse = order.id || order._id || order.orderId
    if (!orderIdToUse) {
      toast.error("Order ID not found")
      return
    }

    try {
      setProcessingActionOrderId(order.id || order.orderId)
      const response = await adminAPI.acceptOrder(orderIdToUse)
      if (response.data?.success) {
        toast.success(response.data?.message || `Order ${order.orderId} accepted`)
        await fetchOrders({ silent: true, withRingCheck: false })
      } else {
        toast.error(response.data?.message || "Failed to accept order")
      }
    } catch (error) {
      console.error("Error accepting order:", error)
      toast.error(error.response?.data?.message || "Failed to accept order")
    } finally {
      setProcessingActionOrderId(null)
    }
  }

  const handleRejectOrder = async (order) => {
    const orderIdToUse = order.id || order._id || order.orderId
    if (!orderIdToUse) {
      toast.error("Order ID not found")
      return
    }

    const reason = prompt(
      `Enter rejection reason for order ${order.orderId}:`,
      "Order rejected by admin",
    )

    if (reason === null) return

    try {
      setProcessingActionOrderId(order.id || order.orderId)
      const response = await adminAPI.rejectOrder(orderIdToUse, reason)
      if (response.data?.success) {
        toast.success(response.data?.message || `Order ${order.orderId} rejected`)
        await fetchOrders({ silent: true, withRingCheck: false })
      } else {
        toast.error(response.data?.message || "Failed to reject order")
      }
    } catch (error) {
      console.error("Error rejecting order:", error)
      toast.error(error.response?.data?.message || "Failed to reject order")
    } finally {
      setProcessingActionOrderId(null)
    }
  }

  // Handle refund button click - show modal for wallet payments, confirm dialog for others
  const handleRefund = (order) => {
    const isWalletPayment = order.paymentType === "Wallet" || order.payment?.method === "wallet";
    
    if (isWalletPayment) {
      // Show modal for wallet refunds
      setSelectedOrderForRefund(order)
      setRefundModalOpen(true)
    } else {
      // For non-wallet payments, use the old confirm dialog flow
      const confirmMessage = `Are you sure you want to process refund for order ${order.orderId}?\n\nThis will initiate a Razorpay refund to the customer's original payment method.`;
      
      if (!confirm(confirmMessage)) {
        return
      }
      
      processRefund(order, null) // null amount means use default
    }
  }

  // Process refund with amount
  const processRefund = async (order, refundAmount = null) => {
    // Try using MongoDB _id first (more reliable for route matching), then fallback to orderId string
    // Backend accepts either MongoDB ObjectId (24 chars) or orderId string
    // Using MongoDB _id is more reliable for route matching (no dashes/special chars)
    const orderIdToUse = order.id || order._id || order.orderId
    
    if (!orderIdToUse) {
      console.error('❌ No orderId found in order object:', order)
      toast.error('Order ID not found. Please refresh the page and try again.')
      return
    }
    
    console.log('🔍 Order details for refund:', {
      orderIdString: order.orderId,
      mongoId: order.id,
      orderIdToUse,
      willUse: order.orderId ? 'orderId string' : 'MongoDB _id',
      refundAmount
    })

    try {
      setProcessingRefund(orderIdToUse)
      
      console.log('🔍 Processing refund for order:', {
        orderId: order.orderId,
        id: order.id,
        _id: order._id,
        orderIdToUse,
        refundAmount,
        url: `/api/admin/orders/${orderIdToUse}/refund`
      })
      
      // Include refundAmount in request body if provided (ensure it's a number)
      const requestData = refundAmount !== null ? { refundAmount: parseFloat(refundAmount) } : {}
      console.log('📤 Request data being sent:', requestData)
      const response = await adminAPI.processRefund(orderIdToUse, requestData)
      
      if (response.data?.success) {
        const isWalletPayment = order.paymentType === "Wallet" || order.payment?.method === "wallet";
        toast.success(response.data?.message || (isWalletPayment 
          ? `Wallet refund of ₹${refundAmount || order.totalAmount} processed successfully for order ${order.orderId}`
          : `Refund initiated successfully for order ${order.orderId}`))
        // Update the order in the local state immediately to show "Refunded" status
        setOrders(prevOrders => 
          prevOrders.map(o => 
            (o.id === order.id || o.orderId === order.orderId)
              ? { ...o, refundStatus: 'processed' } // Wallet refunds are instant, so mark as processed
              : o
          )
        )
        // Refresh the orders list to get updated data
        await fetchOrders({ silent: true, withRingCheck: false })
      } else {
        toast.error(response.data?.message || "Failed to process refund")
      }
    } catch (error) {
      console.error("❌ Error processing refund:", error)
      
      // Log full error details for debugging
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        fullURL: error.config?.baseURL + error.config?.url,
        orderId: orderIdToUse,
        refundAmount: refundAmount,
        order: {
          id: order.id,
          orderId: order.orderId,
          _id: order._id
        },
        stack: error.stack
      }
      console.error("❌ Error details:", JSON.stringify(errorDetails, null, 2))
      
      // Show more specific error message
      let errorMessage = "Failed to process refund"
      
      if (error.response) {
        // Server responded with error
        if (error.response.status === 404) {
          errorMessage = `Order not found (ID: ${orderIdToUse}). Please check if the order exists.`
        } else if (error.response.status === 400) {
          errorMessage = error.response.data?.message || "Invalid request. Please check the refund amount."
        } else if (error.response.status === 500) {
          errorMessage = error.response.data?.message || "Server error. Please try again later."
        } else if (error.response.data?.message) {
          errorMessage = error.response.data.message
        } else {
          errorMessage = `Error ${error.response.status}: ${error.response.statusText || "Unknown error"}`
        }
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = "Network error. Please check your internet connection and try again."
      } else {
        // Error in setting up the request
        errorMessage = error.message || "Failed to process refund"
      }
      
      console.error("❌ Final error message:", errorMessage)
      toast.error(errorMessage)
    } finally {
      setProcessingRefund(null)
      setRefundModalOpen(false)
      setSelectedOrderForRefund(null)
    }
  }

  // Handle refund confirmation from modal
  const handleRefundConfirm = (amount) => {
    if (selectedOrderForRefund) {
      processRefund(selectedOrderForRefund, amount)
    }
  }

  const normalizedOrders = useMemo(() => orders, [orders])

  const {
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isViewOrderOpen,
    setIsViewOrderOpen,
    selectedOrder,
    filters,
    setFilters,
    visibleColumns,
    filteredOrders,
    count,
    activeFiltersCount,
    restaurants,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  } = useOrdersManagement(normalizedOrders, statusKey, config.title)

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-gray-600">Loading orders...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden">
      <OrdersTopbar 
        title={config.title} 
        count={count} 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onFilterClick={() => setIsFilterOpen(true)}
        activeFiltersCount={activeFiltersCount}
        onExport={handleExport}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />
      <FilterPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        setFilters={setFilters}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        restaurants={restaurants}
      />
      <SettingsDialog
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        visibleColumns={visibleColumns}
        toggleColumn={toggleColumn}
        resetColumns={resetColumns}
      />
      <ViewOrderDialog
        isOpen={isViewOrderOpen}
        onOpenChange={setIsViewOrderOpen}
        order={selectedOrder}
      />
      <RefundModal
        isOpen={refundModalOpen}
        onOpenChange={setRefundModalOpen}
        order={selectedOrderForRefund}
        onConfirm={handleRefundConfirm}
        isProcessing={processingRefund !== null}
      />
      <OrdersTable 
        orders={filteredOrders} 
        visibleColumns={visibleColumns}
        onViewOrder={handleViewOrder}
        onPrintOrder={handlePrintOrder}
        onRefund={handleRefund}
        onAcceptOrder={statusKey === "all" || statusKey === "pending" ? handleAcceptOrder : undefined}
        onRejectOrder={statusKey === "all" || statusKey === "pending" ? handleRejectOrder : undefined}
        actionLoadingOrderId={processingActionOrderId}
      />
    </div>
  )
}

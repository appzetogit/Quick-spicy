import { useEffect, useRef, useState, useMemo } from "react"
import Lenis from "lenis"
import { useNavigate, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Home,
  FileText,
  UtensilsCrossed,
  User,
  ArrowRight,
  Lightbulb,
  HelpCircle,
  Wallet,
  CheckCircle,
  Receipt,
  FileText as FileTextIcon,
  Wallet as WalletIcon,
  Sparkles,
  IndianRupee
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  fetchDeliveryWallet,
  calculateDeliveryBalances,
  calculatePeriodEarnings
} from "../utils/deliveryWalletState"
import { formatCurrency } from "../../restaurant/utils/currency"
import { useGigStore } from "../store/gigStore"
import { useProgressStore } from "../store/progressStore"
import { getAllDeliveryOrders } from "../utils/deliveryOrderStatus"
import { deliveryAPI } from "@/lib/api"
import { API_BASE_URL } from "@/lib/api/config"
import FeedNavbar from "../components/FeedNavbar"
import AvailableCashLimit from "../components/AvailableCashLimit"
import BottomPopup from "../components/BottomPopup"
import DepositPopup from "../components/DepositPopup"

export default function PocketPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [animationKey, setAnimationKey] = useState(0)
  const [walletState, setWalletState] = useState({
    totalBalance: 0,
    cashInHand: 0,
    totalWithdrawn: 0,
    totalEarned: 0,
    transactions: [],
    joiningBonusClaimed: false
  })
  const [walletLoading, setWalletLoading] = useState(true)

  const [currentCarouselSlide, setCurrentCarouselSlide] = useState(0)
  const carouselRef = useRef(null)
  const carouselStartX = useRef(0)
  const carouselIsSwiping = useRef(false)
  const carouselAutoRotateRef = useRef(null)

  const [showCashLimitPopup, setShowCashLimitPopup] = useState(false)
  const [showDepositPopup, setShowDepositPopup] = useState(false)
  const [bankDetailsFilled, setBankDetailsFilled] = useState(false)
  const [dashboardData, setDashboardData] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [activeEarningAddon, setActiveEarningAddon] = useState(null)
  const [earningAddonLoading, setEarningAddonLoading] = useState(true)
  const [liveWeekStats, setLiveWeekStats] = useState({ earnings: null, orders: null })

  const {
    isOnline,
    bookedGigs,
    goOnline,
    goOffline
  } = useGigStore()

  const { getDateData, hasDateData } = useProgressStore()

  // Fetch bank details status
  useEffect(() => {
    const checkBankDetails = async () => {
      try {
        const response = await deliveryAPI.getProfile()
        if (response?.data?.success && response?.data?.data?.profile) {
          const profile = response.data.data.profile
          const bankDetails = profile?.documents?.bankDetails

          // Check if all required bank details fields are filled
          const isFilled = !!(
            bankDetails?.accountHolderName?.trim() &&
            bankDetails?.accountNumber?.trim() &&
            bankDetails?.ifscCode?.trim() &&
            bankDetails?.bankName?.trim()
          )

          setBankDetailsFilled(isFilled)
        }
      } catch (error) {
        // Skip logging timeout errors (handled by axios interceptor)
        if (error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          console.error("Error checking bank details:", error)
        }
        // Default to showing the banner if we can't check
        setBankDetailsFilled(false)
      }
    }

    checkBankDetails()

    // Listen for profile updates
    const handleProfileRefresh = () => {
      checkBankDetails()
    }

    window.addEventListener('deliveryProfileRefresh', handleProfileRefresh)

    return () => {
      window.removeEventListener('deliveryProfileRefresh', handleProfileRefresh)
    }
  }, [])

  // Carousel slides data - only show bank details banner when not filled
  const carouselSlides = useMemo(() =>
    bankDetailsFilled ? [] : [{
      id: 2,
      title: "Submit bank details",
      subtitle: "PAN & bank details required for payouts",
      icon: "bank",
      buttonText: "Submit",
      bgColor: "bg-yellow-400"
    }]
    , [bankDetailsFilled])

  // Calculate balances
  const balances = calculateDeliveryBalances(walletState)

  // Debug: Log wallet state and balances
  useEffect(() => {
    console.log('💰 Wallet State:', walletState)
    console.log('💰 Calculated Balances:', balances)
    // Pocket balance = total balance (includes bonus)
    const calculatedPocketBalance = walletState?.totalBalance || balances.totalBalance || 0
    console.log('💰 Pocket Balance (same as Total Balance):', calculatedPocketBalance)
    console.log('💰 Total Balance (includes bonus):', walletState?.totalBalance || balances.totalBalance)
    console.log('💰 Cash In Hand:', walletState?.cashInHand || balances.cashInHand)
    // Check for bonus transactions
    const bonusTransactions = walletState?.transactions?.filter(t => t.type === 'bonus' && t.status === 'Completed') || []
    console.log('💰 Bonus Transactions:', bonusTransactions)
    if (bonusTransactions.length > 0) {
      const totalBonus = bonusTransactions.reduce((sum, t) => sum + (t.amount || 0), 0)
      console.log('💰 Total Bonus Amount:', totalBonus)
      console.log('💰 Pocket Balance should include this bonus:', totalBonus)
    }
  }, [walletState, balances])

  // Calculate weekly earnings from wallet transactions (payment + earning_addon bonus)
  // Include both payment and earning_addon transactions in weekly earnings
  const weeklyEarningsFromWallet = walletState?.transactions
    ?.filter(t => {
      // Include both payment and earning_addon transactions
      if ((t.type !== 'payment' && t.type !== 'earning_addon') || t.status !== 'Completed') return false
      const now = new Date()
      const startOfWeek = new Date(now)
      startOfWeek.setDate(now.getDate() - now.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      const transactionDate = t.date ? new Date(t.date) : (t.createdAt ? new Date(t.createdAt) : null)
      if (!transactionDate) return false
      return transactionDate >= startOfWeek && transactionDate <= now
    })
    .reduce((sum, t) => sum + (t.amount || 0), 0) || 0

  // Calculate weekly orders count from transactions
  const calculateWeeklyOrders = () => {
    if (!walletState || !walletState.transactions || !Array.isArray(walletState.transactions)) {
      return 0
    }

    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay()) // Start of week (Sunday)
    startOfWeek.setHours(0, 0, 0, 0)

    return walletState.transactions.filter(t => {
      // Count payment transactions (completed orders)
      if (t.type !== 'payment' || t.status !== 'Completed') return false
      const transactionDate = t.date ? new Date(t.date) : (t.createdAt ? new Date(t.createdAt) : null)
      if (!transactionDate) return false
      return transactionDate >= startOfWeek && transactionDate <= now
    }).length
  }

  const weeklyOrdersFromWallet = calculateWeeklyOrders()

  const weeklyEarnings = liveWeekStats.earnings ?? weeklyEarningsFromWallet
  const weeklyOrders = liveWeekStats.orders ?? weeklyOrdersFromWallet

  // Fetch real-time week summary so Pocket order count and earning stay updated.
  useEffect(() => {
    const fetchLiveWeekStats = async () => {
      try {
        const response = await deliveryAPI.getEarnings({
          period: "week",
          date: new Date().toISOString(),
          page: 1,
          limit: 1000
        })

        const summary = response?.data?.data?.summary || {}
        setLiveWeekStats({
          earnings: Number(summary.totalEarnings) || 0,
          orders: Number(summary.totalOrders) || 0
        })
      } catch (error) {
        if (error.code !== "ECONNABORTED" && !error.message?.includes("timeout")) {
          console.warn("Pocket week stats fetch failed, using wallet fallback:", error?.message)
        }
        setLiveWeekStats({ earnings: null, orders: null })
      }
    }

    fetchLiveWeekStats()
    const intervalId = setInterval(fetchLiveWeekStats, 5000)
    window.addEventListener("deliveryWalletStateUpdated", fetchLiveWeekStats)
    window.addEventListener("deliveryOrderStatusUpdated", fetchLiveWeekStats)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener("deliveryWalletStateUpdated", fetchLiveWeekStats)
      window.removeEventListener("deliveryOrderStatusUpdated", fetchLiveWeekStats)
    }
  }, [])

  // Fetch active earning addon offers
  useEffect(() => {
    const fetchActiveEarningAddons = async () => {
      try {
        setEarningAddonLoading(true)
        console.log('🔄 Fetching active earning addons...')
        const response = await deliveryAPI.getActiveEarningAddons()
        console.log('✅ Active earning addons response:', response?.data)

        if (response?.data?.success && response?.data?.data?.activeOffers) {
          const offers = response.data.data.activeOffers
          console.log('📦 Active offers found:', offers.length, offers)

          // Get the first valid active offer (prioritize isValid, then isUpcoming, then any active status)
          const activeOffer = offers.find(offer => offer.isValid) ||
            offers.find(offer => offer.isUpcoming) ||
            offers.find(offer => offer.status === 'active') ||
            offers[0] ||
            null

          console.log('🎯 Selected active offer:', activeOffer)
          setActiveEarningAddon(activeOffer)
        } else {
          console.log('ℹ️ No active offers found in response')
          setActiveEarningAddon(null)
        }
      } catch (error) {
        if (error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          if (error.code === 'ERR_NETWORK') {
            console.warn('Active offers: network error. Ensure backend is running and CORS allows /api/delivery.')
          } else if (error.response) {
            console.warn('Active offers fetch failed:', error.response.status, error.response?.data?.message || error.response?.data)
          } else {
            console.warn('Active offers fetch failed:', error.message)
          }
        }
        setActiveEarningAddon(null)
      } finally {
        setEarningAddonLoading(false)
      }
    }

    // Fetch immediately on mount
    fetchActiveEarningAddons()

    // Refresh every 5 seconds to get latest offers
    const refreshInterval = setInterval(() => {
      fetchActiveEarningAddons()
    }, 3000) // Refresh every 3 seconds - FAST REFRESH

    // Refresh when page becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchActiveEarningAddons()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Also listen for focus events for instant refresh
    const handleFocus = () => {
      fetchActiveEarningAddons()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      clearInterval(refreshInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // Calculate bonus earnings from earning_addon transactions (only for active offer)
  const calculateBonusEarnings = () => {
    if (!activeEarningAddon || !walletState?.transactions) return 0

    const now = new Date()
    const startDate = activeEarningAddon.startDate ? new Date(activeEarningAddon.startDate) : null
    const endDate = activeEarningAddon.endDate ? new Date(activeEarningAddon.endDate) : null

    return walletState.transactions
      .filter(t => {
        // Only count earning_addon type transactions
        if (t.type !== 'earning_addon' || t.status !== 'Completed') return false

        // Filter by date range if offer has dates
        if (startDate || endDate) {
          const transactionDate = t.date ? new Date(t.date) : (t.createdAt ? new Date(t.createdAt) : null)
          if (!transactionDate) return false

          if (startDate && transactionDate < startDate) return false
          if (endDate && transactionDate > endDate) return false
        }

        // Check if transaction is related to current offer
        if (t.metadata?.earningAddonId) {
          return t.metadata.earningAddonId === activeEarningAddon._id?.toString() ||
            t.metadata.earningAddonId === activeEarningAddon.id?.toString()
        }

        // If no metadata, include all earning_addon transactions in date range
        return true
      })
      .reduce((sum, t) => sum + (t.amount || 0), 0)
  }

  // Earnings Guarantee - Use active earning addon if available, otherwise show 0
  // When no offer is active, show 0 of 0 and ₹0
  const earningsGuaranteeTarget = activeEarningAddon?.earningAmount || 0
  const earningsGuaranteeOrdersTarget = activeEarningAddon?.requiredOrders || 0
  // Only show current orders/earnings if there's an active offer
  const addonCurrentOrders = Number(activeEarningAddon?.currentOrders) || 0
  const earningsGuaranteeCurrentOrders = activeEarningAddon ? Math.max(addonCurrentOrders, weeklyOrders) : 0
  // Show only bonus earnings from the offer, not total weekly earnings
  const addonCurrentEarnings =
    Number(activeEarningAddon?.currentEarning ?? activeEarningAddon?.currentEarnings) || 0
  const earningsGuaranteeCurrentEarnings = activeEarningAddon
    ? Math.max(addonCurrentEarnings, calculateBonusEarnings())
    : 0
  const ordersProgress = earningsGuaranteeOrdersTarget > 0
    ? Math.min(earningsGuaranteeCurrentOrders / earningsGuaranteeOrdersTarget, 1)
    : 0
  const earningsProgress = earningsGuaranteeTarget > 0
    ? Math.min(earningsGuaranteeCurrentEarnings / earningsGuaranteeTarget, 1)
    : 0

  // Get week end date for valid till - use offer end date if available
  const getWeekEndDate = () => {
    if (activeEarningAddon?.endDate) {
      const endDate = new Date(activeEarningAddon.endDate)
      const day = endDate.getDate()
      const month = endDate.toLocaleString('en-US', { month: 'short' })
      return `${day} ${month}`
    }
    const now = new Date()
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() - now.getDay() + 6) // End of week (Saturday)
    const day = endOfWeek.getDate()
    const month = endOfWeek.toLocaleString('en-US', { month: 'short' })
    return `${day} ${month}`
  }

  const weekEndDate = getWeekEndDate()
  // Offer is live if it's valid (started) or upcoming (not started yet but active)
  const isOfferLive = activeEarningAddon?.isValid || activeEarningAddon?.isUpcoming || false

  // Calculate total bonus amount from all bonus transactions
  const totalBonus = walletState?.transactions
    ?.filter(t => t.type === 'bonus' && t.status === 'Completed')
    .reduce((sum, t) => sum + (t.amount || 0), 0) || 0

  // Pocket balance - shows total balance (includes bonus)
  // Total balance = all earnings + bonus - withdrawals
  // This is what delivery partner can withdraw
  // IMPORTANT: Use walletState.pocketBalance if available (from API), otherwise use totalBalance
  let pocketBalance = walletState?.pocketBalance !== undefined
    ? walletState.pocketBalance
    : (walletState?.totalBalance || balances.totalBalance || 0)

  // IMPORTANT: Ensure pocket balance includes bonus
  // If backend totalBalance is 0 but we have bonus, calculate it manually
  // This ensures bonus is always reflected in pocket balance
  if (pocketBalance === 0 && totalBonus > 0) {
    // If totalBalance is 0 but we have bonus, pocket balance = bonus
    pocketBalance = totalBonus
  } else if (pocketBalance > 0 && totalBonus > 0) {
    // Verify pocket balance includes bonus
    // Calculate expected: Earnings + Bonus - Withdrawals
    const totalWithdrawn = balances.totalWithdrawn || 0
    const expectedBalance = weeklyEarningsFromWallet + totalBonus - totalWithdrawn
    // Use the higher value to ensure bonus is included
    if (expectedBalance > pocketBalance) {
      pocketBalance = expectedBalance
    }
  }

  // Debug: Log pocket balance calculation
  useEffect(() => {
    const bonusTransactions = walletState?.transactions?.filter(t => t.type === 'bonus' && t.status === 'Completed') || []
    const calculatedTotalBonus = bonusTransactions.reduce((sum, t) => sum + (t.amount || 0), 0) || 0

    console.log('💰 FINAL Pocket Balance Display:', {
      pocketBalance: pocketBalance,
      walletStatePocketBalance: walletState?.pocketBalance,
      walletStateTotalBalance: walletState?.totalBalance,
      balancesTotalBalance: balances.totalBalance,
      totalBonus: calculatedTotalBonus,
      weeklyEarnings: weeklyEarningsFromWallet,
      bonusTransactions: bonusTransactions
    })
    // Only depend on walletState and balances - totalBonus and weeklyEarnings are derived from these
  }, [pocketBalance, walletState, balances, weeklyEarningsFromWallet])
  // Available cash limit = remaining limit (global limit - cash in hand)
  const totalCashLimit = Number.isFinite(Number(walletState?.totalCashLimit))
    ? Number(walletState.totalCashLimit)
    : 0
  const availableCashLimit =
    Number.isFinite(Number(walletState?.availableCashLimit)) &&
      Number(walletState?.availableCashLimit) >= 0
      ? Number(walletState.availableCashLimit)
      : Math.max(0, totalCashLimit - (Number(balances.cashInHand) || 0))
  const depositAmount = pocketBalance < 0 ? Math.abs(pocketBalance) : 0

  // Customer tips balance - calculate from transactions
  const customerTipsBalance = walletState.transactions
    ?.filter(t => t.type === 'payment' && t.description?.toLowerCase().includes('tip'))
    .reduce((sum, t) => sum + (t.amount || 0), 0) || 0

  // Payout data - calculate from completed withdrawals in previous week
  const calculatePayoutAmount = () => {
    const now = new Date()
    const lastWeekStart = new Date(now)
    lastWeekStart.setDate(now.getDate() - now.getDay() - 7) // Previous week start
    lastWeekStart.setHours(0, 0, 0, 0)
    const lastWeekEnd = new Date(lastWeekStart)
    lastWeekEnd.setDate(lastWeekStart.getDate() + 6)
    lastWeekEnd.setHours(23, 59, 59, 999)

    return walletState.transactions
      ?.filter(t => {
        if (t.type !== 'withdrawal' || t.status !== 'Completed') return false
        const transactionDate = t.date ? new Date(t.date) : (t.createdAt ? new Date(t.createdAt) : null)
        if (!transactionDate) return false
        return transactionDate >= lastWeekStart && transactionDate <= lastWeekEnd
      })
      .reduce((sum, t) => sum + (t.amount || 0), 0) || 0
  }

  const payoutAmount = calculatePayoutAmount()

  // Payout period - previous week
  const getPayoutPeriod = () => {
    const now = new Date()
    const lastWeekStart = new Date(now)
    lastWeekStart.setDate(now.getDate() - now.getDay() - 7)
    const lastWeekEnd = new Date(lastWeekStart)
    lastWeekEnd.setDate(lastWeekStart.getDate() + 6)

    const formatDate = (date) => {
      const day = date.getDate()
      const month = date.toLocaleString('en-US', { month: 'short' })
      return `${day} ${month}`
    }

    return `${formatDate(lastWeekStart)} - ${formatDate(lastWeekEnd)}`
  }

  const payoutPeriod = getPayoutPeriod()

  // Fetch wallet data from API
  useEffect(() => {
    const fetchWalletData = async () => {
      try {
        setWalletLoading(true)
        const walletData = await fetchDeliveryWallet()
        setWalletState(walletData)
        console.log('💰 Wallet data fetched:', walletData)
        console.log('💰 Total Balance from API:', walletData?.totalBalance)
        console.log('💰 Pocket Balance from API:', walletData?.pocketBalance)
        console.log('💰 Bonus Transactions:', walletData?.transactions?.filter(t => t.type === 'bonus'))
        const totalBonus = walletData?.transactions?.filter(t => t.type === 'bonus' && t.status === 'Completed')
          .reduce((sum, t) => sum + (t.amount || 0), 0) || 0
        console.log('💰 Total Bonus Amount:', totalBonus)
      } catch (error) {
        console.error('Error fetching wallet data:', error)
        // Keep empty state on error
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

    fetchWalletData()

    // Refresh wallet data every 3 seconds to get latest balance (including bonus) - FAST REFRESH
    const refreshInterval = setInterval(() => {
      fetchWalletData()
    }, 3000)

    // INSTANT refresh when page becomes visible (user switches back to tab) - BONUS SHOWS FAST
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchWalletData() // Instant refresh when user comes back
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // INSTANT refresh when window gets focus - BONUS SHOWS FAST
    const handleFocus = () => {
      fetchWalletData() // Instant refresh when window gets focus
    }
    window.addEventListener('focus', handleFocus)

    // Listen for custom wallet update events
    const handleWalletUpdate = () => {
      fetchWalletData()
    }
    window.addEventListener('deliveryWalletStateUpdated', handleWalletUpdate)
    window.addEventListener('storage', handleWalletUpdate)

    return () => {
      clearInterval(refreshInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('deliveryWalletStateUpdated', handleWalletUpdate)
      window.removeEventListener('storage', handleWalletUpdate)
    }
  }, [location.pathname])

  useEffect(() => {
    // Initialize Lenis for smooth scrolling
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [location.pathname, animationKey])

  // Listen for refresh events from bottom navigation
  useEffect(() => {
    const handleRequestRefresh = () => {
      setAnimationKey(prev => prev + 1)
    }

    window.addEventListener('deliveryRequestRefresh', handleRequestRefresh)

    return () => {
      window.removeEventListener('deliveryRequestRefresh', handleRequestRefresh)
    }
  }, [])

  // Handle online toggle
  const handleToggleOnline = () => {
    if (isOnline) {
      goOffline()
    } else {
      if (bookedGigs.length === 0) {
        navigate("/delivery/gig")
      } else {
        goOnline()
      }
    }
  }

  // Auto-rotate carousel
  useEffect(() => {
    // Reset to first slide if current slide is out of bounds
    setCurrentCarouselSlide((prev) => {
      if (prev >= carouselSlides.length) {
        return 0
      }
      return prev
    })

    carouselAutoRotateRef.current = setInterval(() => {
      setCurrentCarouselSlide((prev) => (prev + 1) % carouselSlides.length)
    }, 3000)
    return () => {
      if (carouselAutoRotateRef.current) {
        clearInterval(carouselAutoRotateRef.current)
      }
    }
  }, [carouselSlides])

  // Reset auto-rotate timer after manual swipe
  const resetCarouselAutoRotate = () => {
    if (carouselAutoRotateRef.current) {
      clearInterval(carouselAutoRotateRef.current)
    }
    carouselAutoRotateRef.current = setInterval(() => {
      setCurrentCarouselSlide((prev) => (prev + 1) % carouselSlides.length)
    }, 3000)
  }

  // Handle carousel swipe touch events
  const carouselStartY = useRef(0)

  const handleCarouselTouchStart = (e) => {
    carouselIsSwiping.current = true
    carouselStartX.current = e.touches[0].clientX
    carouselStartY.current = e.touches[0].clientY
  }

  const handleCarouselTouchMove = (e) => {
    if (!carouselIsSwiping.current) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const deltaX = Math.abs(currentX - carouselStartX.current)
    const deltaY = Math.abs(currentY - carouselStartY.current)

    // Only prevent default if horizontal swipe is dominant
    if (deltaX > deltaY && deltaX > 10) {
      e.preventDefault()
    }
  }

  const handleCarouselTouchEnd = (e) => {
    if (!carouselIsSwiping.current) return

    const endX = e.changedTouches[0].clientX
    const endY = e.changedTouches[0].clientY
    const deltaX = carouselStartX.current - endX
    const deltaY = Math.abs(carouselStartY.current - endY)
    const threshold = 50 // Minimum swipe distance

    // Only trigger if horizontal swipe is dominant
    if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        // Swiped left - go to next slide
        setCurrentCarouselSlide((prev) => (prev + 1) % carouselSlides.length)
      } else {
        // Swiped right - go to previous slide
        setCurrentCarouselSlide((prev) => (prev - 1 + carouselSlides.length) % carouselSlides.length)
      }
      resetCarouselAutoRotate()
    }

    carouselIsSwiping.current = false
    carouselStartX.current = 0
    carouselStartY.current = 0
  }

  // Handle carousel mouse events for desktop
  const handleCarouselMouseDown = (e) => {
    carouselIsSwiping.current = true
    carouselStartX.current = e.clientX

    const handleMouseMove = (moveEvent) => {
      if (!carouselIsSwiping.current) return
      moveEvent.preventDefault()
    }

    const handleMouseUp = (upEvent) => {
      if (!carouselIsSwiping.current) {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        return
      }

      const endX = upEvent.clientX
      const deltaX = carouselStartX.current - endX
      const threshold = 50

      if (Math.abs(deltaX) > threshold) {
        if (deltaX > 0) {
          // Swiped left - go to next slide
          setCurrentCarouselSlide((prev) => (prev + 1) % carouselSlides.length)
        } else {
          // Swiped right - go to previous slide
          setCurrentCarouselSlide((prev) => (prev - 1 + carouselSlides.length) % carouselSlides.length)
        }
        resetCarouselAutoRotate()
      }

      carouselIsSwiping.current = false
      carouselStartX.current = 0
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }



  // Get current week date range (17 Nov - 23 Nov format)
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


  return (
    <div className="min-h-screen bg-[#f6e9dc]  overflow-x-hidden">
      {/* Top Navigation Bar */}
      <FeedNavbar
        isOnline={isOnline}
        onToggleOnline={handleToggleOnline}
        onEmergencyClick={() => { }}
        onHelpClick={() => { }}
        className=""
      />

      {carouselSlides.length > 0 && (
        <div
          ref={carouselRef}
          className="relative overflow-hidden bg-gray-700 cursor-grab active:cursor-grabbing select-none"
          onTouchStart={handleCarouselTouchStart}
          onTouchMove={handleCarouselTouchMove}
          onTouchEnd={handleCarouselTouchEnd}
          onMouseDown={handleCarouselMouseDown}
        >
          <div className="flex transition-transform duration-500 ease-in-out" style={{ transform: `translateX(-${currentCarouselSlide * 100}%)` }}>
            {carouselSlides.map((slide) => (
              <div key={slide.id} className="min-w-full">
                <div className={`${slide.bgColor} px-4 py-3 flex items-center gap-3 min-h-[80px]`}>
                  {/* Icon */}
                  <div className="flex-shrink-0">
                    {slide.icon === "bag" ? (
                      <div className="relative">
                        {/* Delivery Bag Icon - Reduced size */}
                        <div className="w-12 h-12 bg-black rounded-lg flex items-center justify-center shadow-lg relative">
                          {/* Bag shape */}
                          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                          </svg>
                        </div>
                        {/* Shadow */}
                        <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-black/30 rounded-full blur-sm"></div>
                      </div>
                    ) : (
                      <div className="relative w-10 h-10">
                        {/* Bank/Rupee Icon - Reduced size */}
                        <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center relative">
                          {/* Rupee symbol */}
                          <svg className="w-12 h-12 text-white absolute" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Text Content */}
                  <div className="flex-1">
                    <h3 className={`${slide.bgColor === "bg-gray-700" ? "text-white" : "text-black"} text-sm font-semibold mb-0.5`}>
                      {slide.title}
                    </h3>
                    <p className={`${slide.bgColor === "bg-gray-700" ? "text-white/90" : "text-black/80"} text-xs`}>
                      {slide.subtitle}
                    </p>
                  </div>

                  {/* Button */}
                  <button
                    onClick={() => {
                      if (slide.id === 2) {
                        navigate("/delivery/profile/details")
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-colors ${slide.bgColor === "bg-gray-700"
                      ? "bg-gray-600 text-white hover:bg-gray-500"
                      : "bg-yellow-300 text-black hover:bg-yellow-200"
                      }`}>
                    {slide.buttonText}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Carousel Indicators */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {carouselSlides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentCarouselSlide(index)}
                className={`h-1.5 rounded-full transition-all duration-300 ${index === currentCarouselSlide
                  ? (currentCarouselSlide === 0 ? "w-6 bg-white" : "w-6 bg-black")
                  : (index === 0 ? "w-1.5 bg-white/50" : "w-1.5 bg-black/30")
                  }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="px-4 py-6 bg-gray-100 pb-24 md:pb-6">
        {/* Earnings Section */}
        <Card onClick={() => navigate("/delivery/earnings")} className="py-4 bg-white border-0 shadow-none mb-4">
          <CardContent className="p-4 text-center">

            {/* Top text */}
            <div className="flex justify-center mb-2">
              <span className="text-black text-sm">
                Earnings: {getCurrentWeekRange()}
              </span>
            </div>

            {/* Earnings number */}
            <div className="text-black text-3xl font-bold text-center">
              ₹{weeklyEarnings.toFixed(0)}
            </div>

          </CardContent>
        </Card>

        {/* Earnings Guarantee Card */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className="w-full rounded-xl overflow-hidden bg-white mb-4"
        >
          {/* Header */}
          <div className="border-b  border-gray-100">
            <div className="flex p-2 px-3 items-center justify-between bg-black">
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white mb-1">Earnings Guarantee</h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white">Valid till {weekEndDate}</span>
                  {isOfferLive && (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm text-green-600 font-medium">Live</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Summary Box */}
              <div className="bg-black text-white px-4 py-3 rounded-lg text-center min-w-[80px]">
                <div className="text-2xl font-bold">₹{earningsGuaranteeTarget.toFixed(0)}</div>
                <div className="text-xs text-white/80 mt-1">{earningsGuaranteeOrdersTarget} orders</div>
              </div>
            </div>
          </div>

          {/* Progress Circles */}
          <div className="px-6 py-6">
            <div className="flex items-center justify-around gap-6">
              {/* Orders Progress Circle */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5, type: "spring" }}
                className="flex flex-col items-center"
              >
                <div className="relative w-32 h-32">
                  <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
                    {/* Background circle */}
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="8"
                    />
                    {/* Progress circle */}
                    <motion.circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke="#000000"
                      strokeWidth="8"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: ordersProgress }}
                      transition={{ delay: 0.6, duration: 1, ease: "easeOut" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-bold text-gray-900">{earningsGuaranteeCurrentOrders} of {earningsGuaranteeOrdersTarget || 0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700">Orders</span>
                </div>
              </motion.div>

              {/* Earnings Progress Circle */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5, type: "spring" }}
                className="flex flex-col items-center"
              >
                <div className="relative w-32 h-32">
                  <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
                    {/* Background circle */}
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="8"
                    />
                    {/* Progress circle */}
                    <motion.circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke="#000000"
                      strokeWidth="8"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: earningsProgress }}
                      transition={{ delay: 0.7, duration: 1, ease: "easeOut" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-gray-900">₹{earningsGuaranteeCurrentEarnings.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <IndianRupee className="w-5 h-5 text-gray-700" />
                  <span className="text-sm font-medium text-gray-700">Earnings</span>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Pocket Section */}
        <div className="my-6 ">
          <div className="relative mb-4 my-4">
            <div className="h-px bg-gray-300"></div>
            <div className="absolute left-1/2 transform -translate-x-1/2 bg-gray-100 -top-3 px-3">
              <span className="text-black text-xs font-medium">POCKET</span>
            </div>
          </div>

          <Card className="py-0  bg-white border-0 shadow-none" >
            <CardContent className="p-4 space-y-4">
              {/* Pocket Balance */}
              <div onClick={() => navigate("/delivery/pocket-balance")} className="flex items-center justify-between">
                <span className="text-black text-sm">Pocket balance</span>
                <div className="flex items-center gap-2">
                  <span className="text-black text-sm font-medium">₹{pocketBalance.toFixed(2)}</span>
                  <ArrowRight className="w-4 h-4 text-gray-600" />
                </div>
              </div>

              <hr />

              {/* Available Cash Limit */}
              <div onClick={() => setShowCashLimitPopup(true)} className="flex items-center justify-between">
                <span className="text-black text-sm">Available cash limit</span>
                <div className="flex items-center gap-2">
                  <span className="text-black text-sm font-medium">₹{availableCashLimit.toFixed(2)}</span>
                  <ArrowRight className="w-4 h-4 text-gray-600" />
                </div>
              </div>

              {/* Warning Message */}
              {/* <div className="bg-yellow-500 rounded-lg p-3 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-yellow-500 text-xs font-bold leading-none">!</span>
                </div>
                <p className="text-black text-sm font-medium flex-1">
                  Deposit ₹{depositAmount.toFixed(2)} to avoid getting blocked
                </p>
              </div> */}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => setShowDepositPopup(true)}
                  className="flex-1 bg-white hover:bg-gray-300 text-black border border-black font-semibold py-3 rounded-lg"
                >
                  Deposit
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* More Services Section */}
        <div className="mb-6">
          <div className="relative mb-4">
            <div className="h-px bg-gray-300"></div>
            <div className="absolute left-1/2 transform -translate-x-1/2 -top-3 bg-gray-100 px-3">
              <span className="text-black text-xs font-medium">MORE SERVICES</span>
            </div>
          </div>


          <div className="grid grid-cols-2 gap-4">
            {/* Payout Card */}
            <Card
              className=" py-0  bg-white border-0 shadow-none cursor-pointer hover:bg-gray-200 transition-colors"
              onClick={() => navigate("/delivery/payout")}
            >
              <CardContent className="p-4 flex flex-col items-start text-start">
                <div className="text-black text-2xl font-bold mb-2">₹{payoutAmount}</div>
                <div className="text-black text-sm font-medium mb-1">Payout</div>
                <div className="text-gray-600 text-xs">{payoutPeriod}</div>
              </CardContent>
            </Card>

            {/* Available Limit Settlement */}
            <Card
              className=" py-0  bg-white border-0 shadow-none cursor-pointer hover:bg-gray-200 transition-colors"
              onClick={() => navigate("/delivery/limit-settlement")}
            >
              <CardContent className="p-4 flex flex-col items-start text-start">
                <div className="w-12 h-12 flex items-start mb-3">
                  <Receipt className="w-8 h-8 text-black" />
                </div>
                <div className="text-black text-sm font-medium text-start">Available limit settlement</div>
              </CardContent>
            </Card>

            {/* Deduction Statement */}
            <Card
              className=" py-0  bg-white border-0 shadow-none cursor-pointer hover:bg-gray-200 transition-colors"
              onClick={() => navigate("/delivery/deduction-statement")}
            >
              <CardContent className="p-4 flex flex-col items-start text-start">
                <div className="w-12 h-12 flex items-center justify-center mb-3">
                  <FileTextIcon className="w-8 h-8 text-black" />
                </div>
                <div className="text-black text-sm font-medium">Deduction statement</div>
              </CardContent>
            </Card>

            {/* Pocket Details */}
            <Card
              className=" py-0  bg-white border-0 shadow-none cursor-pointer hover:bg-gray-200 transition-colors"
              onClick={() => navigate("/delivery/pocket-details")}
            >
              <CardContent className="p-4 flex flex-col items-start text-start">
                <div className="w-12 h-12 flex items-center justify-center mb-3">
                  <WalletIcon className="w-8 h-8 text-black" />
                </div>
                <div className="text-black text-sm font-medium">Pocket details</div>
              </CardContent>
            </Card>

          </div>

        </div>
      </div>

      <BottomPopup
        isOpen={showCashLimitPopup}
        onClose={() => setShowCashLimitPopup(false)}
        title="Available Cash Limit?"
        showCloseButton={false}
        showHandle={false}
        closeOnBackdropClick={true}
        maxHeight="60vh"
      >
        <AvailableCashLimit
          onClose={() => setShowCashLimitPopup(false)}
          walletData={{
            totalCashLimit: totalCashLimit,
            cashInHand: balances.cashInHand ?? 0,
            deductions: 0,
            pocketWithdrawals: balances.totalWithdrawn ?? 0,
            settlementAdjustment: 0
          }}
        />
      </BottomPopup>

      <BottomPopup
        isOpen={showDepositPopup}
        onClose={() => setShowDepositPopup(false)}
        title="Deposit"
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="50vh"
      >
        <DepositPopup
          cashInHand={balances.cashInHand ?? walletState?.cashInHand ?? 0}
          onSuccess={() => setShowDepositPopup(false)}
        />
      </BottomPopup>
    </div>
  )
}

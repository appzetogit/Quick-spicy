import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { clearModuleAuth } from "@/lib/utils/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Activity, ArrowUpRight, ShoppingBag, CreditCard, Truck, Receipt, DollarSign, Store, UserCheck, Package, UserCircle, Clock, CheckCircle, Plus } from "lucide-react"
import { adminAPI } from "@/lib/api"
const debugLog = () => {}
const debugError = () => {}

const dashboardRoutePreloaders = {
  "/admin/transaction-report": () => import("../pages/reports/TransactionReport"),
  "/admin/tax-report": () => import("../pages/reports/TaxReport"),
  "/admin/restaurants": () => import("../pages/restaurant/RestaurantsList"),
  "/admin/delivery-partners": () => import("../pages/delivery-partners/DeliverymanList"),
  "/admin/orders/all": () => import("../pages/orders/OrdersPage"),
  "/admin/orders/pending": () => import("../pages/orders/OrdersPage"),
  "/admin/orders/delivered": () => import("../pages/orders/OrdersPage"),
}

const INR_SYMBOL = "\u20B9"

function formatCurrency(amount, options = {}) {
  const numericAmount = Number(amount || 0)
  const formattedAmount = numericAmount.toLocaleString("en-IN", options)
  return `${INR_SYMBOL}${formattedAmount}`
}

function getRestaurantZoneLabel(restaurant) {
  return String(
    restaurant?.location?.area ||
    restaurant?.location?.city ||
    restaurant?.zone ||
    restaurant?.nameOfZone ||
    ""
  ).trim()
}

function getOrderCreatedAt(order) {
  return order?.createdAt || order?.updatedAt || order?.orderDate || order?.placedAt || null
}

function matchesSelectedPeriod(dateValue, selectedPeriod) {
  if (!dateValue || selectedPeriod === "overall") return true

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return false

  const now = new Date()
  if (selectedPeriod === "today") return date.toDateString() === now.toDateString()
  if (selectedPeriod === "week") {
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)
    return date >= startOfWeek && date <= now
  }
  if (selectedPeriod === "month") {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
  }
  if (selectedPeriod === "year") {
    return date.getFullYear() === now.getFullYear()
  }
  return true
}

function getOrderZoneLabel(order, restaurantZoneMap) {
  const directZone = String(
    order?.zone ||
    order?.restaurantZone ||
    order?.deliveryZone ||
    order?.restaurantId?.location?.area ||
    order?.restaurantId?.location?.city ||
    ""
  ).trim()

  if (directZone) return directZone

  const restaurantId = String(
    order?.restaurantId?._id ||
    order?.restaurantId?.id ||
    order?.restaurantId ||
    order?.restaurant ||
    ""
  ).trim()

  return restaurantZoneMap.get(restaurantId) || ""
}


export default function AdminHome() {
  const navigate = useNavigate()
  const hasFetchedRef = useRef(false)
  const [selectedZone, setSelectedZone] = useState("all")
  const [selectedPeriod, setSelectedPeriod] = useState("overall")
  const [isLoading, setIsLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState(null)
  const [configuredPlatformFee, setConfiguredPlatformFee] = useState(0)
  const [configuredDeliveryFee, setConfiguredDeliveryFee] = useState(0)
  const [configuredGstRate, setConfiguredGstRate] = useState(0)
  const [pendingRestaurantRequestsCount, setPendingRestaurantRequestsCount] = useState(0)
  const [deliveryPartnersCount, setDeliveryPartnersCount] = useState(0)
  const [zoneOptions, setZoneOptions] = useState([])
  const [allOrders, setAllOrders] = useState([])
  const [allRestaurants, setAllRestaurants] = useState([])
  const [addonsCountByRestaurant, setAddonsCountByRestaurant] = useState({})
  const [addonsLoaded, setAddonsLoaded] = useState(false)
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0)
  const isInitialLoading = isLoading && !dashboardData

  // Fetch dashboard stats on mount
  useEffect(() => {
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true

    const fetchDashboardStats = async () => {
      try {
        setIsLoading(true)
        const dashboardResponse = await adminAPI.getDashboardStats()

        if (dashboardResponse?.data?.success && dashboardResponse?.data?.data) {
          setDashboardData(dashboardResponse.data.data)
          setIsLoading(false)
          debugLog('Dashboard stats fetched:', dashboardResponse.data.data)
          debugLog('Commission:', dashboardResponse.data.data.commission)
          debugLog('Platform Fee:', dashboardResponse.data.data.platformFee)
          debugLog('Delivery Fee:', dashboardResponse.data.data.deliveryFee)
          debugLog('GST:', dashboardResponse.data.data.gst)
          debugLog('Total Admin Earnings:', dashboardResponse.data.data.totalAdminEarnings)
        } else {
          debugError('Dashboard stats unavailable or invalid response')
        }

        Promise.allSettled([
          adminAPI.getFeeSettings(),
          adminAPI.getRestaurantJoinRequests({ status: "pending", page: 1, limit: 200 }),
          adminAPI.getDeliveryPartners({ page: 1, limit: 200 }),
          adminAPI.getZones({ limit: 200 }),
          adminAPI.getOrders({ page: 1, limit: 200 }),
          adminAPI.getOrders({ page: 1, limit: 200, status: "pending" }),
          adminAPI.getRestaurants({ limit: 200 }),
          adminAPI.getRestaurants({ limit: 200, status: "inactive" }),
        ]).then((secondaryResults) => {
          const getSettledValue = (index) =>
            secondaryResults[index]?.status === "fulfilled" ? secondaryResults[index].value : null

          const feeSettingsResponse = getSettledValue(0)
          const joinRequestsResponse = getSettledValue(1)
          const deliveryPartnersResponse = getSettledValue(2)
          const zonesResponse = getSettledValue(3)
          const ordersResponse = getSettledValue(4)
          const pendingOrdersResponse = getSettledValue(5)
          const activeRestaurantsResponse = getSettledValue(6)
          const inactiveRestaurantsResponse = getSettledValue(7)

          if (feeSettingsResponse?.data?.success && feeSettingsResponse.data?.data?.feeSettings) {
            const feeSettings = feeSettingsResponse.data.data.feeSettings
            setConfiguredPlatformFee(Number(feeSettings.platformFee || 0))
            setConfiguredDeliveryFee(Number(feeSettings.deliveryFee || 0))
            setConfiguredGstRate(Number(feeSettings.gstRate || 0))
          }

          if (joinRequestsResponse?.data?.success && joinRequestsResponse.data?.data) {
            const requests =
              joinRequestsResponse.data.data.requests ||
              joinRequestsResponse.data.data.restaurants ||
              joinRequestsResponse.data.data ||
              []
            setPendingRestaurantRequestsCount(Array.isArray(requests) ? requests.length : 0)
          }

          if (deliveryPartnersResponse?.data?.success && deliveryPartnersResponse.data?.data) {
            const deliveryPartners = deliveryPartnersResponse.data.data.deliveryPartners || []
            setDeliveryPartnersCount(Array.isArray(deliveryPartners) ? deliveryPartners.length : 0)
          }

          if (zonesResponse?.data?.success && zonesResponse.data?.data?.zones) {
            setZoneOptions(zonesResponse.data.data.zones || [])
          }

          if (ordersResponse?.data?.success && ordersResponse.data?.data?.orders) {
            setAllOrders(ordersResponse.data.data.orders || [])
          }

          if (pendingOrdersResponse?.data?.success && pendingOrdersResponse.data?.data?.orders) {
            setPendingOrdersCount((pendingOrdersResponse.data.data.orders || []).length)
          }

          const activeRestaurants =
            activeRestaurantsResponse?.data?.data?.restaurants ||
            activeRestaurantsResponse?.data?.restaurants ||
            []
          const inactiveRestaurants =
            inactiveRestaurantsResponse?.data?.data?.restaurants ||
            inactiveRestaurantsResponse?.data?.restaurants ||
            []

          const restaurantMap = new Map()
          ;[...activeRestaurants, ...inactiveRestaurants].forEach((restaurant) => {
            const restaurantId = String(restaurant?._id || restaurant?.id || "")
            if (!restaurantId || restaurantMap.has(restaurantId)) return
            restaurantMap.set(restaurantId, restaurant)
          })

          const mergedRestaurants = Array.from(restaurantMap.values())
          setAllRestaurants(mergedRestaurants)

          // Menus are not loaded here to prevent heavy network overhead and server timeouts.
          // We utilize the pre-calculated addons count from the dashboard statistics instead.
          setAddonsCountByRestaurant({})
          setAddonsLoaded(true)
        }).catch((error) => {
          debugError('Secondary dashboard requests failed:', error)
        })
      } catch (error) {
        debugError("Error fetching dashboard stats:", error)
        if (error?.response?.status === 401) {
          clearModuleAuth("admin")
          navigate("/admin/login", { replace: true })
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardStats()
  }, [navigate])

  const restaurantZoneMap = new Map(
    allRestaurants.map((restaurant) => [
      String(restaurant?._id || restaurant?.id || ""),
      getRestaurantZoneLabel(restaurant),
    ]),
  )

  const filteredRestaurants = allRestaurants.filter((restaurant) => {
    if (selectedZone === "all") return true
    return getRestaurantZoneLabel(restaurant) === selectedZone
  })

  const filteredOrders = allOrders.filter((order) => {
    const matchesZone =
      selectedZone === "all" ||
      getOrderZoneLabel(order, restaurantZoneMap) === selectedZone
    const matchesPeriod = matchesSelectedPeriod(getOrderCreatedAt(order), selectedPeriod)
    return matchesZone && matchesPeriod
  })

  const filteredPendingOrders = filteredOrders.filter(
    (order) => String(order?.status || "").toLowerCase() === "pending",
  ).length

  const filteredCompletedOrders = filteredOrders.filter(
    (order) => String(order?.status || "").toLowerCase() === "delivered",
  ).length

  const filteredAddonsCount = filteredRestaurants.reduce((total, restaurant) => {
    const restaurantId = String(restaurant?._id || restaurant?.id || "")
    return total + Number(addonsCountByRestaurant[restaurantId] || 0)
  }, 0)

  const hasActiveFilters = selectedZone !== "all" || selectedPeriod !== "overall"

  // Get order stats from real data
  const getOrderStats = () => {
    if (hasActiveFilters) {
      const counts = filteredOrders.reduce((acc, order) => {
        const status = String(order?.status || "").toLowerCase()
        if (status === "delivered") acc.delivered += 1
        else if (status === "cancelled" || status === "canceled") acc.cancelled += 1
        else if (status === "refunded") acc.refunded += 1
        else if (status === "pending") acc.pending += 1
        return acc
      }, { delivered: 0, cancelled: 0, refunded: 0, pending: 0 })

      return [
        { label: "Delivered", value: counts.delivered, color: "#0ea5e9" },
        { label: "Cancelled", value: counts.cancelled, color: "#ef4444" },
        { label: "Refunded", value: counts.refunded, color: "#f59e0b" },
        { label: "Pending", value: counts.pending, color: "#10b981" },
      ]
    }

    if (!dashboardData?.orders?.byStatus) {
      return [
        { label: "Delivered", value: 0, color: "#0ea5e9" },
        { label: "Cancelled", value: 0, color: "#ef4444" },
        { label: "Refunded", value: 0, color: "#f59e0b" },
        { label: "Pending", value: 0, color: "#10b981" },
      ]
    }

    const byStatus = dashboardData.orders.byStatus
    return [
      { label: "Delivered", value: byStatus.delivered || 0, color: "#0ea5e9" },
      { label: "Cancelled", value: byStatus.cancelled || 0, color: "#ef4444" },
      { label: "Refunded", value: 0, color: "#f59e0b" }, // Refunded not tracked separately
      { label: "Pending", value: byStatus.pending || 0, color: "#10b981" },
    ]
  }

  // Get monthly data from real data
  const getMonthlyData = () => {
    if (!dashboardData?.monthlyData || dashboardData.monthlyData.length === 0) {
      // Return empty data structure if no data
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return monthNames.map(month => ({ month, commission: 0, revenue: 0, orders: 0 }))
    }

    // Use real monthly data from backend
    return dashboardData.monthlyData.map(item => ({
      month: item.month,
      commission: item.commission || 0,
      revenue: item.revenue || 0,
      orders: item.orders || 0
    }))
  }

  const orderStats = getOrderStats()
  const monthlyData = getMonthlyData()

  // Calculate totals from real data
  const revenueTotal = dashboardData?.revenue?.total || 0
  const commissionTotal = dashboardData?.commission?.total || 0
  const ordersTotal = hasActiveFilters ? filteredOrders.length : (dashboardData?.orders?.total || filteredOrders.length || 0)
  const platformFeeTotal = dashboardData?.platformFee?.total || 0
  const platformFeeCardValue = configuredPlatformFee > 0 ? configuredPlatformFee : platformFeeTotal
  const deliveryFeeTotal = dashboardData?.deliveryFee?.total || 0
  const deliveryFeeCardValue = configuredDeliveryFee > 0 ? configuredDeliveryFee : deliveryFeeTotal
  const gstTotal = dashboardData?.gst?.total || 0
  const gstCardValue = configuredGstRate > 0 ? configuredGstRate : gstTotal
  const totalAdminEarnings =
    commissionTotal +
    platformFeeCardValue +
    deliveryFeeCardValue +
    (configuredGstRate > 0 ? 0 : gstCardValue)

  // Additional stats
  const totalRestaurants =
    selectedZone === "all"
      ? (dashboardData?.restaurants?.total || filteredRestaurants.length || 0)
      : filteredRestaurants.length
  const pendingRestaurantRequests = pendingRestaurantRequestsCount || dashboardData?.restaurants?.pendingRequests || 0
  const totalDeliveryBoys = deliveryPartnersCount || dashboardData?.deliveryBoys?.total || 0
  const pendingDeliveryBoyRequests = dashboardData?.deliveryBoys?.pendingRequests || 0
  const totalFoods = dashboardData?.foods?.total || 0
  const totalAddons =
    selectedZone === "all"
      ? (addonsLoaded ? filteredAddonsCount : (dashboardData?.addons?.total || 0))
      : filteredAddonsCount
  const totalCustomers = dashboardData?.customers?.total || 0
  const byStatus = dashboardData?.orders?.byStatus || {}
  const pendingOrders = hasActiveFilters
    ? filteredPendingOrders
    : (pendingOrdersCount || Number(byStatus.pending || 0) || dashboardData?.orderStats?.pending || 0)
  const completedOrders = hasActiveFilters
    ? filteredCompletedOrders
    : (dashboardData?.orderStats?.completed || filteredCompletedOrders || 0)

  const pieData = orderStats.map((item) => ({
    name: item.label,
    value: item.value,
    fill: item.color,
  }))

  const totalRevenueHelper = [
    `Commission ${formatCurrency(commissionTotal, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Platform ${formatCurrency(platformFeeCardValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Delivery ${formatCurrency(deliveryFeeCardValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    configuredGstRate > 0
      ? `GST ${configuredGstRate}%`
      : `GST ${formatCurrency(gstCardValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  ].join(" + ")

  return (
    <div className="px-4 pb-10 lg:px-6 pt-4">
      <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-[0_30px_120px_-60px_rgba(0,0,0,0.28)]">
        {isInitialLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm text-neutral-700 ring-1 ring-neutral-200">
              <span className="h-3 w-3 animate-ping rounded-full bg-neutral-800/70" />
              Updating metrics...
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 border-b border-neutral-200 bg-linear-to-br from-white via-neutral-50 to-neutral-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Admin Overview</p>
              <h1 className="text-2xl font-semibold text-neutral-900">Operations Command</h1>
            </div>
          </div>
          {isLoading && dashboardData && (
            <div className="inline-flex items-center gap-2 self-start rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600 ring-1 ring-neutral-200 lg:self-auto">
              <span className="h-2 w-2 animate-pulse rounded-full bg-neutral-500" />
              Refreshing details
            </div>
          )}
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Gross revenue"
              value={formatCurrency(revenueTotal)}
              helper="Rolling 12 months"
              icon={<ShoppingBag className="h-5 w-5 text-emerald-600" />}
              accent="bg-emerald-200/40"
              path="/admin/transaction-report"
            />
            <MetricCard
              title="Commission earned"
              value={formatCurrency(commissionTotal)}
              helper="Restaurant commission"
              icon={<ArrowUpRight className="h-5 w-5 text-indigo-600" />}
              accent="bg-indigo-200/40"
              path="/admin/restaurants/commission"
            />
            <MetricCard
              title="Orders processed"
              value={ordersTotal.toLocaleString("en-IN")}
              helper="Fulfilled & billed"
              icon={<Activity className="h-5 w-5 text-amber-600" />}
              accent="bg-amber-200/40"
              path="/admin/orders/all"
            />
            <MetricCard
              title="Platform fee"
              value={formatCurrency(platformFeeCardValue)}
              helper={configuredPlatformFee > 0 ? "Current configured platform fee" : "Total platform fees"}
              icon={<CreditCard className="h-5 w-5 text-purple-600" />}
              accent="bg-purple-200/40"
              path="/admin/fee-settings"
            />
            <MetricCard
              title="Delivery fee"
              value={formatCurrency(deliveryFeeCardValue)}
              helper={configuredDeliveryFee > 0 ? "Current configured delivery fee" : "Total delivery fees"}
              icon={<Truck className="h-5 w-5 text-blue-600" />}
              accent="bg-blue-200/40"
              path="/admin/transaction-report"
            />
            <MetricCard
              title="GST"
              value={configuredGstRate > 0 ? `${configuredGstRate}%` : formatCurrency(gstCardValue)}
              helper={configuredGstRate > 0 ? "Current configured GST rate" : "Total GST collected"}
              icon={<Receipt className="h-5 w-5 text-orange-600" />}
              accent="bg-orange-200/40"
              path="/admin/tax-report"
            />
            <MetricCard
              title="Total revenue"
              value={formatCurrency(totalAdminEarnings, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              helper={totalRevenueHelper}
              icon={<DollarSign className="h-5 w-5 text-green-600" />}
              accent="bg-green-200/40"
              path="/admin/transaction-report"
            />
            <MetricCard
              title="Total restaurants"
              value={totalRestaurants.toLocaleString("en-IN")}
              helper="All registered restaurants"
              icon={<Store className="h-5 w-5 text-blue-600" />}
              accent="bg-blue-200/40"
              path="/admin/restaurants"
            />
            <MetricCard
              title="Restaurant request pending"
              value={pendingRestaurantRequests.toLocaleString("en-IN")}
              helper="Awaiting approval"
              icon={<UserCheck className="h-5 w-5 text-orange-600" />}
              accent="bg-orange-200/40"
              path="/admin/restaurants/joining-request"
            />
            <MetricCard
              title="Total delivery boy"
              value={totalDeliveryBoys.toLocaleString("en-IN")}
              helper="All delivery partners"
              icon={<Truck className="h-5 w-5 text-indigo-600" />}
              accent="bg-indigo-200/40"
              path="/admin/delivery-partners"
            />
            <MetricCard
              title="Delivery boy request pending"
              value={pendingDeliveryBoyRequests.toLocaleString("en-IN")}
              helper="Awaiting verification"
              icon={<Clock className="h-5 w-5 text-yellow-600" />}
              accent="bg-yellow-200/40"
              path="/admin/delivery-partners/join-request"
            />
            <MetricCard
              title="Total foods"
              value={totalFoods.toLocaleString("en-IN")}
              helper="Active menu items"
              icon={<Package className="h-5 w-5 text-purple-600" />}
              accent="bg-purple-200/40"
              path="/admin/foods"
            />
            <MetricCard
              title="Total addons"
              value={totalAddons.toLocaleString("en-IN")}
              helper="Active addon items"
              icon={<Plus className="h-5 w-5 text-pink-600" />}
              accent="bg-pink-200/40"
              path="/admin/addons"
            />
            <MetricCard
              title="Total customers"
              value={totalCustomers.toLocaleString("en-IN")}
              helper="Registered users"
              icon={<UserCircle className="h-5 w-5 text-cyan-600" />}
              accent="bg-cyan-200/40"
              path="/admin/customers"
            />
            <MetricCard
              title="Pending orders"
              value={pendingOrders.toLocaleString("en-IN")}
              helper="Orders awaiting processing"
              icon={<Clock className="h-5 w-5 text-red-600" />}
              accent="bg-red-200/40"
              path="/admin/orders/pending"
            />
            <MetricCard
              title="Completed orders"
              value={completedOrders.toLocaleString("en-IN")}
              helper="Successfully delivered"
              icon={<CheckCircle className="h-5 w-5 text-emerald-600" />}
              accent="bg-emerald-200/40"
              path="/admin/orders/delivered"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 min-w-0 border-neutral-200 bg-white">
              <CardHeader className="flex flex-col gap-2 border-b border-neutral-200 pb-4">
                <CardTitle className="text-lg text-neutral-900">Revenue trajectory</CardTitle>
                <p className="text-sm text-neutral-500">
                  Commission and gross revenue with monthly order volume
                </p>
              </CardHeader>
              <CardContent className="min-w-0 pt-4">
                <div className="h-80 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart data={monthlyData}>
                      <defs>
                        <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="comFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12 }}
                        labelStyle={{ color: "#111827" }}
                        itemStyle={{ color: "#111827" }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#0ea5e9"
                        fillOpacity={1}
                        fill="url(#revFill)"
                        name="Gross revenue"
                      />
                      <Area
                        type="monotone"
                        dataKey="commission"
                        stroke="#a855f7"
                        fillOpacity={1}
                        fill="url(#comFill)"
                        name="Commission"
                      />
                      <Bar
                        dataKey="orders"
                        fill="#ef4444"
                        radius={[6, 6, 0, 0]}
                        name="Orders"
                        barSize={10}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 border-neutral-200 bg-white">
              <CardHeader className="flex items-center justify-between border-b border-neutral-200 pb-4">
                <div>
                  <CardTitle className="text-lg text-neutral-900">Order mix</CardTitle>
                  <p className="text-sm text-neutral-500">Distribution by state</p>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                  {orderStats.reduce((s, o) => s + o.value, 0)} orders
                </span>
              </CardHeader>
              <CardContent className="min-w-0 pt-4">
                <div className="h-72 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12 }}
                        labelStyle={{ color: "#111827" }}
                        itemStyle={{ color: "#111827" }}
                      />
                      <Legend
                        formatter={(value) => <span style={{ color: "#111827", fontSize: 12 }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {orderStats.map((item) => (
                    <div
                      key={item.label}
                      onClick={() => {
                        const routes = {
                          'Delivered': '/admin/orders/delivered',
                          'Cancelled': '/admin/orders/canceled',
                          'Refunded': '/admin/orders/refunded',
                          'Pending': '/admin/orders/pending'
                        }
                        navigate(routes[item.label] || '/admin/orders/all')
                      }}
                      className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2 cursor-pointer hover:bg-neutral-50 hover:border-neutral-300 transition-all group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full transition-transform group-hover:scale-125" style={{ background: item.color }} />
                        <p className="text-sm text-neutral-800 group-hover:text-neutral-900">{item.label}</p>
                      </div>
                      <p className="text-sm font-semibold text-neutral-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  )
}

function MetricCard({ title, value, helper, icon, accent, path }) {
  const navigate = useNavigate()
  const handlePrefetch = () => {
    if (!path) return
    dashboardRoutePreloaders[path]?.()
  }
  return (
    <Card
      className="overflow-hidden border-neutral-200 bg-white p-0 cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
      onClick={() => path && navigate(path)}
      onMouseEnter={handlePrefetch}
      onFocus={handlePrefetch}
      onPointerDown={handlePrefetch}
    >
      <CardContent className="relative flex flex-col gap-2 px-4 pb-4 pt-4">
        <div className={`absolute inset-0 ${accent} `} />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">{title}</p>
            <p className="text-2xl font-semibold text-neutral-900">{value}</p>
            <p className="text-xs text-neutral-500">{helper}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/80 ring-1 ring-neutral-200 shadow-sm transition-transform duration-300 group-hover:rotate-12">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}


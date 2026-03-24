import { useState, useMemo, useEffect } from "react"
import { BarChart3, ChevronDown, Info, FileText, FileSpreadsheet, Code, Loader2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { exportTransactionReportToCSV, exportTransactionReportToExcel, exportTransactionReportToPDF, exportTransactionReportToJSON } from "../../components/reports/reportsExportUtils"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

// Import icons from Transaction-report-icons
import completedIcon from "../../assets/Transaction-report-icons/trx1.png"
import refundedIcon from "../../assets/Transaction-report-icons/trx3.png"
import adminEarningIcon from "../../assets/Transaction-report-icons/admin-earning.png"
import restaurantEarningIcon from "../../assets/Transaction-report-icons/store-earning.png"
import deliverymanEarningIcon from "../../assets/Transaction-report-icons/deliveryman-earning.png"

// Import search and export icons from Dashboard-icons
import searchIcon from "../../assets/Dashboard-icons/image8.png"
import exportIcon from "../../assets/Dashboard-icons/image9.png"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function TransactionReport() {
  const [searchQuery, setSearchQuery] = useState("")
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    completedTransaction: 0,
    refundedTransaction: 0,
    adminEarning: 0,
    restaurantEarning: 0,
    deliverymanEarning: 0
  })
  const [filters, setFilters] = useState({
    zone: "All Zones",
    restaurant: "All restaurants",
    time: "All Time",
  })
  const [zones, setZones] = useState([])
  const [restaurants, setRestaurants] = useState([])

  const derivedSummary = useMemo(() => {
    const transactionRows = Array.isArray(transactions) ? transactions : []

    return {
      completedTransaction: transactionRows.length,
      deliverymanEarning: transactionRows.reduce(
        (total, transaction) =>
          total + Number(
            transaction.deliverymanEarning ??
            transaction.deliveryPartnerEarning ??
            transaction.deliveryCharge ??
            0,
          ),
        0,
      ),
    }
  }, [transactions])

  // Fetch zones and restaurants for filters
  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        // Fetch zones
        const zonesResponse = await adminAPI.getZones({ limit: 1000 })
        if (zonesResponse?.data?.success && zonesResponse.data.data?.zones) {
          setZones(zonesResponse.data.data.zones)
        }

        // Fetch restaurants
        const restaurantsResponse = await adminAPI.getRestaurants({ limit: 1000 })
        if (restaurantsResponse?.data?.success && restaurantsResponse.data.data?.restaurants) {
          setRestaurants(restaurantsResponse.data.data.restaurants)
        }
      } catch (error) {
        debugError("Error fetching filter data:", error)
      }
    }
    fetchFilterData()
  }, [])

  // Fetch transaction report data
  useEffect(() => {
    const fetchTransactionReport = async () => {
      try {
        setLoading(true)
        
        // Build date range based on time filter
        let fromDate = null
        let toDate = null
        const now = new Date()
        
        if (filters.time === "Today") {
          fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
        } else if (filters.time === "This Week") {
          const dayOfWeek = now.getDay()
          const diff = now.getDate() - dayOfWeek
          fromDate = new Date(now.getFullYear(), now.getMonth(), diff)
          toDate = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59)
        } else if (filters.time === "This Month") {
          fromDate = new Date(now.getFullYear(), now.getMonth(), 1)
          toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
        }

        const params = {
          zone: filters.zone !== "All Zones" ? filters.zone : undefined,
          restaurant: filters.restaurant !== "All restaurants" ? filters.restaurant : undefined,
          fromDate: fromDate ? fromDate.toISOString() : undefined,
          toDate: toDate ? toDate.toISOString() : undefined,
          limit: 1000
        }

        const response = await adminAPI.getTransactionReport(params)

        if (response?.data?.success && response.data.data) {
          setTransactions(response.data.data.transactions || [])
          setSummary(response.data.data.summary || {
            completedTransaction: 0,
            refundedTransaction: 0,
            adminEarning: 0,
            restaurantEarning: 0,
            deliverymanEarning: 0
          })
        } else {
          setTransactions([])
          if (response?.data?.message) {
            toast.error(response.data.message)
          }
        }
      } catch (error) {
        debugError("Error fetching transaction report:", error)
        toast.error("Failed to fetch transaction report")
        setTransactions([])
      } finally {
        setLoading(false)
      }
    }

    fetchTransactionReport()
  }, [filters])

  const filteredTransactions = useMemo(() => {
    const normalizedSearch = String(searchQuery || "").trim().toLowerCase()

    if (!normalizedSearch) {
      return transactions
    }

    return transactions.filter((transaction) =>
      String(transaction.orderId || "").toLowerCase().includes(normalizedSearch)
    )
  }, [transactions, searchQuery])

  const handleExport = (format) => {
    if (filteredTransactions.length === 0) {
      alert("No data to export")
      return
    }
    switch (format) {
      case "csv": exportTransactionReportToCSV(filteredTransactions); break
      case "excel": exportTransactionReportToExcel(filteredTransactions); break
      case "pdf": exportTransactionReportToPDF(filteredTransactions); break
      case "json": exportTransactionReportToJSON(filteredTransactions); break
    }
  }

  const handleResetFilters = () => {
    setFilters({
      zone: "All Zones",
      restaurant: "All restaurants",
      time: "All Time",
    })
  }

  const formatCurrency = (amount) => {
    if (amount >= 1000) {
      return `₹ ${(amount / 1000).toFixed(2)}K`
    }
    return `₹ ${amount.toFixed(2)}`
  }

  const formatFullCurrency = (amount) => {
    return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  if (loading) {
    return (
      <div className="p-2 lg:p-3 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-gray-600">Loading transaction report...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-2 lg:p-3 bg-slate-50 min-h-screen">
      <div className="w-full mx-auto">
        {/* Page Header */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Transaction Report</h1>
          </div>
        </div>

        {/* Search Data Section */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <select
                value={filters.zone}
                onChange={(e) => setFilters(prev => ({ ...prev, zone: e.target.value }))}
                className="w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs appearance-none cursor-pointer"
              >
                <option value="All Zones" className="text-slate-900 bg-white">All Zones</option>
                {zones.map(zone => (
                  <option key={zone._id} value={zone.name} className="text-slate-900 bg-white">{zone.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative flex-1 min-w-0">
              <select
                value={filters.restaurant}
                onChange={(e) => setFilters(prev => ({ ...prev, restaurant: e.target.value }))}
                className="w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs appearance-none cursor-pointer"
              >
                <option value="All restaurants" className="text-slate-900 bg-white">All restaurants</option>
                {restaurants.map(restaurant => (
                  <option key={restaurant._id} value={restaurant.name} className="text-slate-900 bg-white">{restaurant.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative flex-1 min-w-0">
              <select
                value={filters.time}
                onChange={(e) => setFilters(prev => ({ ...prev, time: e.target.value }))}
                className="w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs appearance-none cursor-pointer"
              >
                <option value="All Time" className="text-slate-900 bg-white">All Time</option>
                <option value="Today" className="text-slate-900 bg-white">Today</option>
                <option value="This Week" className="text-slate-900 bg-white">This Week</option>
                <option value="This Month" className="text-slate-900 bg-white">This Month</option>
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <button 
              onClick={handleResetFilters}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all whitespace-nowrap"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* Left Column - Large Cards */}
          <div className="space-y-3">
            {/* Completed Transaction - Green */}
            <div className="rounded-lg shadow-sm border border-slate-200 p-4" style={{ backgroundColor: '#f1f5f9' }}>
              <div className="relative mb-3 flex justify-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <img src={completedIcon} alt="Completed" className="w-12 h-12" />
                </div>
                <div className="absolute top-0 right-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <Info className="w-3 h-3 text-white" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-green-600 mb-1">{derivedSummary.completedTransaction.toLocaleString("en-IN")}</p>
                <p className="text-sm text-slate-600 leading-tight">Completed Transaction</p>
              </div>
            </div>

            {/* Refunded Transaction - Red */}
            <div className="rounded-lg shadow-sm border border-slate-200 p-4" style={{ backgroundColor: '#f1f5f9' }}>
              <div className="relative mb-3 flex justify-center">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                  <img src={refundedIcon} alt="Refunded" className="w-12 h-12" />
                </div>
                <div className="absolute top-0 right-0 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                  <Info className="w-3 h-3 text-white" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-red-600 mb-1">{formatFullCurrency(summary.refundedTransaction)}</p>
                <p className="text-sm text-slate-600 leading-tight">Refunded Transaction</p>
              </div>
            </div>
          </div>

          {/* Right Column - Small Cards */}
          <div className="space-y-3">
            {/* Admin Earning */}
            <div className="rounded-lg shadow-sm border border-slate-200 p-3" style={{ backgroundColor: '#f1f5f9' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <img src={adminEarningIcon} alt="Admin Earning" className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">Admin Earning</p>
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <Info className="w-3 h-3 text-white" />
                    </div>
                  </div>
                </div>
                <p className="text-base font-bold text-slate-900">{formatCurrency(summary.adminEarning)}</p>
              </div>
            </div>

            {/* Restaurant Earning */}
            <div className="rounded-lg shadow-sm border border-slate-200 p-3" style={{ backgroundColor: '#f1f5f9' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <img src={restaurantEarningIcon} alt="Restaurant Earning" className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">Restaurant Earning</p>
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <Info className="w-3 h-3 text-white" />
                    </div>
                  </div>
                </div>
                <p className="text-base font-bold text-green-600">{formatCurrency(summary.restaurantEarning)}</p>
              </div>
            </div>

            {/* Deliveryman Earning */}
            <div className="rounded-lg shadow-sm border border-slate-200 p-3" style={{ backgroundColor: '#f1f5f9' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <img src={deliverymanEarningIcon} alt="Deliveryman Earning" className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">Deliveryman Earning</p>
                    <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                      <Info className="w-3 h-3 text-white" />
                    </div>
                  </div>
                </div>
                <p className="text-base font-bold text-orange-600">{formatCurrency(derivedSummary.deliverymanEarning || summary.deliverymanEarning || 0)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Order Transactions Section */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h2 className="text-base font-bold text-slate-900">Order Transactions {filteredTransactions.length}</h2>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-initial min-w-[180px]">
                <input
                  type="text"
                  placeholder="Search by Order ID"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 pr-2 py-1.5 w-full text-[11px] rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <img src={searchIcon} alt="Search" className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1 transition-all">
                    <img src={exportIcon} alt="Export" className="w-3 h-3" />
                    <span>Export</span>
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
                  <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("csv")} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("excel")} className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pdf")} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("json")} className="cursor-pointer">
                    <Code className="w-4 h-4 mr-2" />
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full min-w-[1320px]" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '3%' }}>SI</th>
                  <th className="px-2 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '12%' }}>Order Id</th>
                  <th className="px-2 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '16%' }}>Restaurant</th>
                  <th className="px-2 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '14%' }}>Customer Name</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '9%' }}>Total Item Amount</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '8%' }}>Item Discount</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '8%' }}>Coupon Discount</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '8%' }}>Referral Discount</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '8%' }}>Discounted Amount</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '7%' }}>Vat/Tax</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '8%' }}>Delivery Charge</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '8%' }}>Order Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                        <p className="text-sm text-slate-500">No transactions match your search</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((transaction, index) => (
                    <tr
                      key={transaction.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] font-medium text-slate-700">{index + 1}</span>
                      </td>
                      <td className="px-2 py-1">
                        <span className="text-[10px] text-slate-700 whitespace-nowrap">{transaction.orderId}</span>
                      </td>
                      <td className="px-2 py-1">
                        <span className="text-[10px] text-slate-700 truncate block">{transaction.restaurant}</span>
                      </td>
                      <td className="px-2 py-1">
                        <span className={`text-[10px] truncate block ${
                          transaction.customerName === "Invalid Customer Data" 
                            ? "text-red-600 font-semibold" 
                            : "text-slate-700"
                        }`}>
                          {transaction.customerName}
                        </span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.totalItemAmount)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.itemDiscount)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.couponDiscount)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.referralDiscount)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">
                          {transaction.discountedAmount >= 1000 
                            ? formatCurrency(transaction.discountedAmount)
                            : formatFullCurrency(transaction.discountedAmount)
                          }
                        </span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.vatTax)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.deliveryCharge)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] font-medium text-slate-900">{formatFullCurrency(transaction.orderAmount)}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  )
}


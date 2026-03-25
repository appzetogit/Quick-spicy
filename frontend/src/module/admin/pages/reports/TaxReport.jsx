import { useMemo, useState } from "react"
import { Download, ChevronDown, FileText, DollarSign, Settings, FileSpreadsheet, Code, Loader2 } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { exportReportsToCSV, exportReportsToExcel, exportReportsToPDF, exportReportsToJSON } from "../../components/reports/reportsExportUtils"
import { toast } from "sonner"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const formatCurrency = (value) => {
  const number = Number(value || 0)
  return `INR ${number.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const getDateRangeParams = (dateRangeType) => {
  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)

  if (dateRangeType === "Today") {
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
  } else if (dateRangeType === "This Week") {
    const day = now.getDay()
    start.setDate(now.getDate() - day)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
  } else if (dateRangeType === "This Month") {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
  } else if (dateRangeType === "This Year") {
    start.setMonth(0, 1)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
  } else {
    return {}
  }

  return {
    fromDate: start.toISOString().split("T")[0],
    toDate: end.toISOString().split("T")[0],
  }
}

const computeTax = (transaction, calculateTax, taxRateNumber) => {
  const taxableAmount = Number(transaction.discountedAmount || transaction.orderAmount || 0)

  if (calculateTax === "Fixed Amount") {
    return taxRateNumber
  }

  if (calculateTax === "Tiered") {
    if (taxableAmount <= 1000) return taxableAmount * 0.05
    if (taxableAmount <= 5000) return taxableAmount * 0.12
    return taxableAmount * 0.18
  }

  return taxableAmount * (taxRateNumber / 100)
}

export default function TaxReport() {
  const [filters, setFilters] = useState({
    dateRangeType: "Select Date Range",
    calculateTax: "Select Calculate Tax",
    taxRate: "Select Tax Rate",
  })
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [appliedFilters, setAppliedFilters] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [taxReports, setTaxReports] = useState([])
  const [taxStats, setTaxStats] = useState({
    totalIncome: "INR 0.00",
    totalTax: "INR 0.00",
  })

  const hasGeneratedReport = appliedFilters !== null

  const handleReset = () => {
    setFilters({
      dateRangeType: "Select Date Range",
      calculateTax: "Select Calculate Tax",
      taxRate: "Select Tax Rate",
    })
    setAppliedFilters(null)
    setTaxReports([])
    setTaxStats({
      totalIncome: "INR 0.00",
      totalTax: "INR 0.00",
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (filters.dateRangeType === "Select Date Range") {
      toast.error("Please select a date range")
      return
    }
    if (filters.calculateTax === "Select Calculate Tax") {
      toast.error("Please select how to calculate tax")
      return
    }
    if (filters.taxRate === "Select Tax Rate") {
      toast.error("Please select a tax rate")
      return
    }
    if (filters.dateRangeType === "Custom Range") {
      toast.error("Custom range is not available yet. Please choose another date range.")
      return
    }

    try {
      setIsSubmitting(true)
      const dateRangeParams = getDateRangeParams(filters.dateRangeType)
      const response = await adminAPI.getTransactionReport({
        page: 1,
        limit: 1000,
        ...dateRangeParams,
      })

      const transactions = response?.data?.data?.transactions || []
      const taxRateNumber = Number(String(filters.taxRate).replace("%", "")) || 0
      const aggregateByRestaurant = new Map()

      for (const tx of transactions) {
        const incomeSource = tx.restaurant || "Unknown Restaurant"
        const current = aggregateByRestaurant.get(incomeSource) || { income: 0, tax: 0 }
        const orderAmount = Number(tx.orderAmount || 0)
        const calculatedTax = computeTax(tx, filters.calculateTax, taxRateNumber)

        current.income += orderAmount
        current.tax += calculatedTax
        aggregateByRestaurant.set(incomeSource, current)
      }

      const nextRows = Array.from(aggregateByRestaurant.entries()).map(([incomeSource, values], index) => ({
        sl: index + 1,
        incomeSource,
        totalIncome: formatCurrency(values.income),
        totalTax: formatCurrency(values.tax),
      }))

      const totalIncome = nextRows.reduce((sum, row) => {
        const value = Number(String(row.totalIncome).replace(/[^\d.-]/g, "")) || 0
        return sum + value
      }, 0)
      const totalTax = nextRows.reduce((sum, row) => {
        const value = Number(String(row.totalTax).replace(/[^\d.-]/g, "")) || 0
        return sum + value
      }, 0)

      setTaxReports(nextRows)
      setTaxStats({
        totalIncome: formatCurrency(totalIncome),
        totalTax: formatCurrency(totalTax),
      })
      setAppliedFilters({ ...filters })
      debugLog("Submitting tax report filters:", filters)
      toast.success("Tax report generated")
    } catch (error) {
      debugError("Error generating tax report:", error)
      toast.error(error?.response?.data?.message || "Failed to generate tax report")
      setTaxReports([])
      setTaxStats({
        totalIncome: "INR 0.00",
        totalTax: "INR 0.00",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleExport = (format) => {
    if (taxReports.length === 0) {
      toast.error("No data to export")
      return
    }

    const headers = [
      { key: "sl", label: "SI" },
      { key: "incomeSource", label: "Income Source" },
      { key: "totalIncome", label: "Total Income" },
      { key: "totalTax", label: "Total Tax" },
    ]

    switch (format) {
      case "csv": exportReportsToCSV(taxReports, headers, "tax_report"); break
      case "excel": exportReportsToExcel(taxReports, headers, "tax_report"); break
      case "pdf": exportReportsToPDF(taxReports, headers, "tax_report", "Tax Report"); break
      case "json": exportReportsToJSON(taxReports, "tax_report"); break
      default: debugWarn("Unsupported export format:", format)
    }
  }

  const emptyMessage = useMemo(() => {
    if (!hasGeneratedReport) {
      return "To generate your tax report please select & input above field and submit for the result"
    }
    return "No tax report data found for the selected filters"
  }, [hasGeneratedReport])

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen overflow-x-hidden">
      <div className="w-full max-w-full">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Generate Tax Report</h1>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Admin Tax Report</h2>
          <p className="text-sm text-slate-600 mb-6">
            To generate your tax report please select & input following field and submit for the result.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4 mb-6">
              <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Date Range Type
                </label>
                <select
                  value={filters.dateRangeType}
                  onChange={(e) => setFilters((prev) => ({ ...prev, dateRangeType: e.target.value }))}
                  className="w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Select Date Range">Select Date Range</option>
                  <option value="Today">Today</option>
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                  <option value="This Year">This Year</option>
                  <option value="Custom Range">Custom Range</option>
                </select>
                <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>

              <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Select How to calculate tax
                </label>
                <select
                  value={filters.calculateTax}
                  onChange={(e) => setFilters((prev) => ({ ...prev, calculateTax: e.target.value }))}
                  className="w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Select Calculate Tax">Select Calculate Tax</option>
                  <option value="Percentage">Percentage</option>
                  <option value="Fixed Amount">Fixed Amount</option>
                  <option value="Tiered">Tiered</option>
                </select>
                <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>

              <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Select Tax Rates
                </label>
                <select
                  value={filters.taxRate}
                  onChange={(e) => setFilters((prev) => ({ ...prev, taxRate: e.target.value }))}
                  className="w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Select Tax Rate">Select Tax Rate</option>
                  <option value="5%">5%</option>
                  <option value="10%">10%</option>
                  <option value="15%">15%</option>
                  <option value="20%">20%</option>
                </select>
                <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleReset}
                disabled={isSubmitting}
                className="px-6 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-60"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSubmitting ? "Generating..." : "Submit"}
              </button>
            </div>
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Total Income</p>
                <p className="text-2xl font-bold text-blue-600">{taxStats.totalIncome}</p>
              </div>
              <div className="w-14 h-14 rounded-lg bg-yellow-100 flex items-center justify-center">
                <DollarSign className="w-8 h-8 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Total Tax</p>
                <p className="text-2xl font-bold text-red-600">{taxStats.totalTax}</p>
              </div>
              <div className="w-14 h-14 rounded-lg bg-pink-100 flex items-center justify-center">
                <FileText className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold text-slate-900">Tax Report List</h2>

            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all">
                    <Download className="w-4 h-4" />
                    <span className="text-black font-bold">Export</span>
                    <ChevronDown className="w-3 h-3" />
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
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {taxReports.length === 0 ? (
            <div className="py-20 text-center">
              <div className="flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-lg bg-purple-100 flex items-center justify-center mb-4">
                  <FileText className="w-12 h-12 text-purple-600" />
                </div>
                <p className="text-lg font-semibold text-slate-700 mb-2">No Tax Report Generated</p>
                <p className="text-sm text-slate-500 max-w-md">{emptyMessage}</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">SI</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Income Source</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total Income</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total Tax</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {taxReports.map((report) => (
                    <tr key={report.sl} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-700">{report.sl}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-slate-700">{report.incomeSource}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-900">{report.totalIncome}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-900">{report.totalTax}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md bg-white p-0 opacity-0 data-[state=open]:opacity-100 data-[state=closed]:opacity-0 transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:scale-100 data-[state=closed]:scale-100">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Report Settings
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <p className="text-sm text-slate-700">
              Tax report settings and preferences will be available here.
            </p>
          </div>
          <div className="px-6 pb-6 flex items-center justify-end">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

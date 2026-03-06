import { useState, useMemo } from "react"
import { exportToCSV, exportToExcel, exportToPDF, exportToJSON } from "./ordersExportUtils"
import quickSpicyLogo from "@/assets/quicky-spicy-logo.png"
import { getCachedSettings, loadBusinessSettings } from "@/lib/utils/businessSettings"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const formatMoney = (value) => `INR ${toNumber(value).toFixed(2)}`

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

const imageUrlToDataUrl = async (url) => {
  if (!url) return null
  if (url.startsWith("data:")) return url

  try {
    const response = await fetch(url, { cache: "force-cache" })
    if (!response.ok) return null
    const blob = await response.blob()
    return await blobToDataUrl(blob)
  } catch {
    return null
  }
}

export function useOrdersManagement(orders, statusKey, title) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOrderOpen, setIsViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [filters, setFilters] = useState({
    paymentStatus: "",
    deliveryType: "",
    minAmount: "",
    maxAmount: "",
    fromDate: "",
    toDate: "",
    restaurant: "",
  })
  const [visibleColumns, setVisibleColumns] = useState({
    si: true,
    orderId: true,
    orderDate: true,
    orderOtp: true,
    customer: true,
    restaurant: true,
    foodItems: true,
    totalAmount: true,
    paymentType: true,
    paymentCollectionStatus: true,
    orderStatus: true,
    actions: true,
  })

  // Get unique restaurants from orders
  const restaurants = useMemo(() => {
    return [...new Set(orders.map(o => o.restaurant))]
  }, [orders])

  // Apply search and filters
  const filteredOrders = useMemo(() => {
    let result = [...orders]

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(order =>
        order.orderId.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query) ||
        order.restaurant.toLowerCase().includes(query) ||
        order.customerPhone.includes(query) ||
        order.totalAmount.toString().includes(query)
      )
    }

    // Apply filters
    if (filters.paymentStatus) {
      const wanted = filters.paymentStatus.toLowerCase()
      result = result.filter((order) => {
        const paymentStatus = String(order.paymentStatus || "").toLowerCase()
        const collectionStatus = String(order.paymentCollectionStatus || "").toLowerCase()
        return paymentStatus === wanted || collectionStatus === wanted
      })
    }

    if (filters.deliveryType) {
      result = result.filter(
        (order) => String(order.deliveryType || "").toLowerCase() === filters.deliveryType.toLowerCase(),
      )
    }

    if (filters.minAmount) {
      result = result.filter(order => order.totalAmount >= parseFloat(filters.minAmount))
    }

    if (filters.maxAmount) {
      result = result.filter(order => order.totalAmount <= parseFloat(filters.maxAmount))
    }

    if (filters.restaurant) {
      result = result.filter(order => order.restaurant === filters.restaurant)
    }

    // Helper function to parse date format "16 JUL 2025"
    const parseOrderDate = (dateStr) => {
      const months = {
        "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04", "MAY": "05", "JUN": "06",
        "JUL": "07", "AUG": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12"
      }
      const parts = dateStr.split(" ")
      if (parts.length === 3) {
        const day = parts[0].padStart(2, "0")
        const month = months[parts[1].toUpperCase()] || "01"
        const year = parts[2]
        return new Date(`${year}-${month}-${day}`)
      }
      return new Date(dateStr)
    }

    if (filters.fromDate) {
      result = result.filter(order => {
        const orderDate = parseOrderDate(order.date)
        const fromDate = new Date(filters.fromDate)
        return orderDate >= fromDate
      })
    }

    if (filters.toDate) {
      result = result.filter(order => {
        const orderDate = parseOrderDate(order.date)
        const toDate = new Date(filters.toDate)
        toDate.setHours(23, 59, 59, 999) // Include entire day
        return orderDate <= toDate
      })
    }

    return result
  }, [orders, searchQuery, filters])

  const count = filteredOrders.length

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(value => value !== "").length
  }, [filters])

  const handleApplyFilters = () => {
    setIsFilterOpen(false)
  }

  const handleResetFilters = () => {
    setFilters({
      paymentStatus: "",
      deliveryType: "",
      minAmount: "",
      maxAmount: "",
      fromDate: "",
      toDate: "",
      restaurant: "",
    })
  }

  const handleExport = (format) => {
    const filename = title.toLowerCase().replace(/\s+/g, "_")
    switch (format) {
      case "csv":
        exportToCSV(filteredOrders, filename)
        break
      case "excel":
        exportToExcel(filteredOrders, filename)
        break
      case "pdf":
        exportToPDF(filteredOrders, filename)
        break
      case "json":
        exportToJSON(filteredOrders, filename)
        break
      default:
        break
    }
  }

  const handleViewOrder = (order) => {
    setSelectedOrder(order)
    setIsViewOrderOpen(true)
  }

  const handlePrintOrder = async (order) => {
    try {
      const { default: jsPDF } = await import("jspdf")
      const { default: autoTable } = await import("jspdf-autotable")

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const orderId = order.orderId || order.id || order.subscriptionId || "N/A"
      const orderDate = order.date && order.time
        ? `${order.date}, ${order.time}`
        : (order.date || new Date().toLocaleDateString())

      const settings = getCachedSettings() || await loadBusinessSettings()
      const companyName = settings?.companyName || "Appzeto Food"
      const logoUrl = settings?.logo?.url || quickSpicyLogo
      const logoDataUrl = await imageUrlToDataUrl(logoUrl)

      const items = Array.isArray(order.items) ? order.items : []
      const itemsSubtotal = items.reduce((sum, item) => {
        const qty = toNumber(item?.quantity || 1)
        const unitPrice = toNumber(item?.price)
        return sum + (qty * unitPrice)
      }, 0)
      const subtotal = itemsSubtotal > 0 ? itemsSubtotal : toNumber(order.subtotal || order.totalAmount)
      const deliveryFee = toNumber(order.deliveryFee || order.deliveryCharge || order.delivery?.fee)
      const taxAmount = toNumber(order.taxAmount || order.tax || order.gst)
      const discountAmount = toNumber(order.discountAmount || order.discount)
      const computedTotal = subtotal + deliveryFee + taxAmount - discountAmount
      const totalAmount = toNumber(order.totalAmount || computedTotal)

      doc.setFillColor(15, 118, 110)
      doc.rect(0, 0, pageWidth, 42, "F")

      if (logoDataUrl) {
        try {
          const logoFormat = logoDataUrl.includes("image/jpeg") ? "JPEG" : "PNG"
          doc.addImage(logoDataUrl, logoFormat, 14, 8, 24, 24, undefined, "FAST")
        } catch {
          // Ignore logo rendering issues and continue with text-only header.
        }
      }

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(16)
      doc.setFont(undefined, "bold")
      doc.text(companyName, logoDataUrl ? 42 : 14, 17)
      doc.setFontSize(10)
      doc.setFont(undefined, "normal")
      doc.text("Order Invoice", logoDataUrl ? 42 : 14, 24)

      doc.setFontSize(9)
      doc.text(`Invoice #: ${orderId}`, pageWidth - 14, 14, { align: "right" })
      doc.text(`Date: ${orderDate}`, pageWidth - 14, 20, { align: "right" })

      doc.setDrawColor(226, 232, 240)
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(14, 49, 90, 42, 2, 2, "FD")
      doc.roundedRect(108, 49, 88, 42, 2, 2, "FD")

      doc.setTextColor(15, 23, 42)
      doc.setFontSize(10)
      doc.setFont(undefined, "bold")
      doc.text("Bill To", 18, 57)
      doc.text("Order Details", 112, 57)

      doc.setFont(undefined, "normal")
      doc.setFontSize(9)
      doc.setTextColor(71, 85, 105)
      doc.text(`Customer: ${order.customerName || "N/A"}`, 18, 64)
      doc.text(`Phone: ${order.customerPhone || "N/A"}`, 18, 70)
      doc.text(`Restaurant: ${order.restaurant || "N/A"}`, 18, 76)
      doc.text(`Delivery: ${order.deliveryType || "N/A"}`, 18, 82)

      const paymentType = order.paymentType || order.payment?.method || order.paymentMethod || "N/A"
      doc.text(`Order ID: ${orderId}`, 112, 64)
      doc.text(`Status: ${order.orderStatus || "N/A"}`, 112, 70)
      doc.text(`Payment: ${paymentType}`, 112, 76)
      doc.text(`Payment Status: ${order.paymentStatus || "N/A"}`, 112, 82)

      const tableBody = items.length > 0
        ? items.map((item) => {
          const qty = toNumber(item.quantity || 1)
          const title = item.name || item.itemName || item.title || "Item"
          const unitPrice = toNumber(item.price)
          const lineTotal = qty * unitPrice
          return [qty, title, formatMoney(unitPrice), formatMoney(lineTotal)]
        })
        : [[1, "Order Total", formatMoney(totalAmount), formatMoney(totalAmount)]]

      autoTable(doc, {
        startY: 98,
        head: [["Qty", "Item", "Unit Price", "Line Total"]],
        body: tableBody,
        theme: "grid",
        headStyles: {
          fillColor: [15, 118, 110],
          textColor: 255,
          fontSize: 9,
          fontStyle: "bold",
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [30, 41, 59],
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        styles: {
          cellPadding: 3.2,
          lineColor: [226, 232, 240],
          lineWidth: 0.3,
        },
        columnStyles: {
          0: { halign: "center", cellWidth: 18 },
          1: { cellWidth: 94 },
          2: { halign: "right", cellWidth: 36 },
          3: { halign: "right", cellWidth: 38 },
        },
        margin: { left: 14, right: 14 },
      })

      const summaryStartY = (doc.lastAutoTable?.finalY || 130) + 8
      autoTable(doc, {
        startY: summaryStartY,
        body: [
          ["Subtotal", formatMoney(subtotal)],
          ["Delivery Fee", formatMoney(deliveryFee)],
          ["Tax", formatMoney(taxAmount)],
          ["Discount", `- ${formatMoney(discountAmount)}`],
          ["Grand Total", formatMoney(totalAmount)],
        ],
        theme: "plain",
        styles: {
          fontSize: 10,
          textColor: [30, 41, 59],
          cellPadding: 1.8,
        },
        columnStyles: {
          0: { cellWidth: 34, fontStyle: "bold" },
          1: { cellWidth: 40, halign: "right" },
        },
        margin: { left: pageWidth - 88 },
        didParseCell: (hookData) => {
          if (hookData.row.index === 4) {
            hookData.cell.styles.fontStyle = "bold"
            hookData.cell.styles.fontSize = 11
            hookData.cell.styles.textColor = [15, 118, 110]
          }
        },
      })

      const footerY = Math.max((doc.lastAutoTable?.finalY || summaryStartY) + 14, 255)
      doc.setDrawColor(226, 232, 240)
      doc.line(14, footerY - 6, pageWidth - 14, footerY - 6)
      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)
      doc.text(`Generated on ${new Date().toLocaleString()}`, 14, footerY)
      doc.text("Thank you for using our platform.", pageWidth - 14, footerY, { align: "right" })

      const filename = `Invoice_${orderId}_${new Date().toISOString().split("T")[0]}.pdf`
      doc.save(filename)
    } catch (error) {
      debugError("Error generating PDF invoice:", error)
      alert("Failed to download PDF invoice. Please try again.")
    }
  }

  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }

  const resetColumns = () => {
    setVisibleColumns({
      si: true,
      orderId: true,
      orderDate: true,
      orderOtp: true,
      customer: true,
      restaurant: true,
      foodItems: true,
      totalAmount: true,
      paymentType: true,
      paymentCollectionStatus: true,
      orderStatus: true,
      actions: true,
    })
  }

  return {
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
  }
}


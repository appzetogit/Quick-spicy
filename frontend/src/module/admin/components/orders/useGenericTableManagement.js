import { useState, useMemo } from "react"
import { exportToExcel, exportToPDF } from "./ordersExportUtils"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const firstFiniteNumber = (...values) => {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

const formatMoney = (value) => `₹${toNumber(value).toFixed(2)}`

const resolveInvoicePricing = (order, items = []) => {
  const pricing = order?.pricing || {}
  const settlementPayment = order?.userPayment || order?.settlement?.userPayment || {}
  const itemsSubtotal = items.reduce((sum, item) => {
    const qty = toNumber(item?.quantity || 1)
    const unitPrice = toNumber(item?.price)
    return sum + (qty * unitPrice)
  }, 0)
  const itemsOriginalSubtotal = items.reduce((sum, item) => {
    const qty = toNumber(item?.quantity || 1)
    const unitPrice = firstFiniteNumber(item?.originalPrice, item?.price)
    return sum + (qty * unitPrice)
  }, 0)
  const itemsLevelDiscount = Math.max(0, itemsOriginalSubtotal - itemsSubtotal)
  const recordedDiscountAmount = firstFiniteNumber(
    order?.itemDiscount,
    order?.couponDiscount,
    order?.discountAmount,
    order?.discount,
    pricing?.discount,
    settlementPayment?.discount,
  )
  const hasRecordedDiscount = recordedDiscountAmount > 0
  const discountAmount = hasRecordedDiscount ? recordedDiscountAmount : itemsLevelDiscount

  const recordedSubtotal = firstFiniteNumber(
    order?.totalItemAmount,
    order?.subtotal,
    pricing?.subtotal,
    settlementPayment?.subtotal,
    itemsSubtotal > 0 ? itemsSubtotal : undefined,
    order?.discountedAmount ? toNumber(order.discountedAmount) + discountAmount : undefined,
  )
  const subtotal =
    !hasRecordedDiscount && itemsLevelDiscount > 0
      ? Math.max(recordedSubtotal, itemsOriginalSubtotal)
      : recordedSubtotal

  const deliveryFee = firstFiniteNumber(
    order?.deliveryCharge,
    order?.deliveryFee,
    order?.delivery?.fee,
    pricing?.deliveryFee,
    settlementPayment?.deliveryFee,
  )

  const platformFee = firstFiniteNumber(
    order?.platformFee,
    pricing?.platformFee,
    settlementPayment?.platformFee,
  )

  const taxAmount = firstFiniteNumber(
    order?.vatTax,
    order?.taxAmount,
    order?.tax,
    order?.gst,
    pricing?.tax,
    pricing?.gst,
    settlementPayment?.gst,
  )

  const computedTotal = subtotal + deliveryFee + platformFee + taxAmount - discountAmount
  const totalAmount = firstFiniteNumber(
    order?.totalAmount,
    order?.orderAmount,
    pricing?.total,
    settlementPayment?.total,
    computedTotal,
  )

  return {
    subtotal,
    discountAmount,
    deliveryFee,
    platformFee,
    taxAmount,
    totalAmount,
    couponCode:
      order?.couponCode ||
      pricing?.couponCode ||
      pricing?.appliedCoupon?.code ||
      settlementPayment?.couponCode ||
      "",
  }
}

export function useGenericTableManagement(data, title, searchFields = []) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOrderOpen, setIsViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [filters, setFilters] = useState({})
  const [visibleColumns, setVisibleColumns] = useState({})

  // Apply search
  const filteredData = useMemo(() => {
    let result = [...data]

    // Apply search query
    if (searchQuery.trim() && searchFields.length > 0) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(item => 
        searchFields.some(field => {
          const value = item[field]
          return value && value.toString().toLowerCase().includes(query)
        })
      )
    }

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "") {
        result = result.filter(item => {
          if (key === "restaurant") {
            const restaurantValue = item.restaurant || item.restaurantName || ""
            return restaurantValue.toString().toLowerCase().includes(String(value).toLowerCase())
          }

          if (key === "fromDate" || key === "toDate") {
            const rawDate = item.createdAt || item.originalOrder?.createdAt || item.date
            if (!rawDate) return false

            const itemDate = new Date(rawDate)
            if (Number.isNaN(itemDate.getTime())) return false

            const filterDate = new Date(value)
            if (Number.isNaN(filterDate.getTime())) return true

            if (key === "fromDate") {
              filterDate.setHours(0, 0, 0, 0)
              return itemDate >= filterDate
            }

            filterDate.setHours(23, 59, 59, 999)
            return itemDate <= filterDate
          }

          const itemValue = item[key]
          if (typeof value === 'string') {
            return itemValue === value || itemValue?.toString().toLowerCase() === value.toLowerCase()
          }
          return itemValue === value
        })
      }
    })

    return result
  }, [data, searchQuery, filters, searchFields])

  const count = filteredData.length

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(value => value !== "" && value !== null && value !== undefined).length
  }, [filters])

  const handleApplyFilters = () => {
    setIsFilterOpen(false)
  }

  const handleResetFilters = () => {
    setFilters({})
  }

  const handleExport = async (format) => {
    const filename = title.toLowerCase().replace(/\s+/g, "_")
    switch (format) {
      case "excel":
        exportToExcel(filteredData, filename)
        break
      case "pdf":
        await exportToPDF(filteredData, filename)
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
      // Dynamic import of jsPDF and autoTable for instant PDF download
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      // Add title
      doc.setFontSize(18)
      doc.setTextColor(30, 30, 30)
      doc.text('Order Invoice', 105, 20, { align: 'center' })
      
      // Order ID
      doc.setFontSize(12)
      doc.setTextColor(100, 100, 100)
      const orderId = order.orderId || order.id || order.subscriptionId || 'N/A'
      doc.text(`Order ID: ${orderId}`, 105, 28, { align: 'center' })
      
      // Date
      doc.setFontSize(10)
      const orderDate = order.date && order.time ? `${order.date}, ${order.time}` : (order.date || new Date().toLocaleDateString())
      doc.text(`Date: ${orderDate}`, 105, 34, { align: 'center' })
      
      let startY = 45
      
      // Customer Information
      if (order.customerName || order.customerPhone) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Customer Information', 14, startY)
        startY += 8
        
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        if (order.customerName) {
          doc.text(`Name: ${order.customerName}`, 14, startY)
          startY += 6
        }
        if (order.customerPhone) {
          doc.text(`Phone: ${order.customerPhone}`, 14, startY)
          startY += 6
        }
        startY += 5
      }
      
      // Restaurant Information
      if (order.restaurant) {
        doc.setFontSize(12)
        doc.setTextColor(30, 30, 30)
        doc.text('Restaurant', 14, startY)
        startY += 8
        
        doc.setFontSize(10)
        doc.setTextColor(60, 60, 60)
        doc.text(order.restaurant, 14, startY)
        startY += 10
      }
      
      const items = Array.isArray(order.items) ? order.items : []
      const {
        subtotal,
        discountAmount,
        deliveryFee,
        platformFee,
        taxAmount,
        totalAmount,
        couponCode,
      } = resolveInvoicePricing(order, items)

      // Order Items Table
      if (items.length > 0) {
        const tableData = items.map((item) => [
          item.quantity || 1,
          item.name || item.itemName || item.title || 'Unknown Item',
          formatMoney(item.price || 0),
          formatMoney((item.quantity || 1) * (item.price || 0))
        ])
        
        autoTable(doc, {
          startY: startY,
          head: [['Qty', 'Item Name', 'Price', 'Total']],
          body: tableData,
          theme: 'striped',
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 10
          },
          bodyStyles: {
            fontSize: 9,
            textColor: [30, 30, 30]
          },
          alternateRowStyles: {
            fillColor: [245, 247, 250]
          },
          styles: {
            cellPadding: 4,
            lineColor: [200, 200, 200],
            lineWidth: 0.5
          },
          columnStyles: {
            0: { cellWidth: 20, halign: 'center' },
            1: { cellWidth: 80 },
            2: { cellWidth: 35, halign: 'right' },
            3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
          },
          margin: { left: 14, right: 14 }
        })
        
        startY = doc.lastAutoTable.finalY + 10
      }

      const summaryRows = [
        ['Subtotal', formatMoney(subtotal)],
        ['Delivery Fee', formatMoney(deliveryFee)],
      ]
      if (platformFee > 0) {
        summaryRows.push(['Platform Fee', formatMoney(platformFee)])
      }
      summaryRows.push(['GST', formatMoney(taxAmount)])
      if (discountAmount > 0) {
        summaryRows.push([
          couponCode ? `Discount (${couponCode})` : 'Discount',
          `- ${formatMoney(discountAmount)}`,
        ])
      }
      summaryRows.push(['Total Amount', formatMoney(totalAmount)])

      autoTable(doc, {
        startY,
        body: summaryRows,
        theme: 'plain',
        styles: {
          fontSize: 10,
          textColor: [30, 30, 30],
          cellPadding: 1.8,
        },
        columnStyles: {
          0: { cellWidth: 46, fontStyle: 'bold' },
          1: { cellWidth: 32, halign: 'right' },
        },
        margin: { left: 128, right: 14 },
        didParseCell: (hookData) => {
          if (hookData.row.index === summaryRows.length - 1) {
            hookData.cell.styles.fontStyle = 'bold'
            hookData.cell.styles.fontSize = 11
          }
        },
      })

      startY = (doc.lastAutoTable?.finalY || startY) + 8
      
      // Payment Status
      if (order.paymentStatus) {
        doc.setFontSize(10)
        doc.setTextColor(100, 100, 100)
        doc.setFont(undefined, 'normal')
        doc.text(`Payment Status: ${order.paymentStatus}`, 14, startY)
        startY += 6
      }
      
      // Order Status
      if (order.orderStatus) {
        doc.setFontSize(10)
        doc.text(`Order Status: ${order.orderStatus}`, 14, startY)
      }
      
      // Save the PDF instantly
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

  const resetColumns = (defaultColumns) => {
    setVisibleColumns(defaultColumns || {})
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
    filteredData,
    count,
    activeFiltersCount,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  }
}


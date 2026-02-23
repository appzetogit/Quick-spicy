/**
 * Order Status Utility Functions
 * Centralized management for order status across the restaurant module
 */

// Standard status values (as used in OrderDetails.jsx)
export const ORDER_STATUS = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  COOKING: "Cooking",
  READY_TO_HANDOVER: "Ready to handover",
  DELIVERED: "Delivered",
  REFUNDED: "Refunded"
}

/**
 * Get order status from localStorage
 * @param {string|number} orderId - The order ID
 * @returns {string} - The order status, defaults to "Pending"
 */
export const getOrderStatus = (orderId) => {
  if (!orderId) return ORDER_STATUS.PENDING
  
  try {
    const savedStatus = localStorage.getItem(`order_status_${orderId}`)
    return savedStatus || ORDER_STATUS.PENDING
  } catch (error) {
    console.error('Error reading order status from localStorage:', error)
    return ORDER_STATUS.PENDING
  }
}

/**
 * Save order status to localStorage
 * @param {string|number} orderId - The order ID
 * @param {string} status - The order status to save
 */
export const saveOrderStatus = (orderId, status) => {
  if (!orderId || !status) return
  
  try {
    localStorage.setItem(`order_status_${orderId}`, status)
  } catch (error) {
    console.error('Error saving order status to localStorage:', error)
  }
}

/**
 * Normalize status to standard format
 * Converts various status formats to standard format
 * @param {string} status - The status to normalize
 * @returns {string} - Normalized status
 */
export const normalizeStatus = (status) => {
  if (!status) return ORDER_STATUS.PENDING
  
  const statusLower = status.toLowerCase().trim()
  
  // Map various formats to standard format
  const statusMap = {
    'pending': ORDER_STATUS.PENDING,
    'confirmed': ORDER_STATUS.CONFIRMED,
    'cooking': ORDER_STATUS.COOKING,
    'ready': ORDER_STATUS.READY_TO_HANDOVER,
    'ready to handover': ORDER_STATUS.READY_TO_HANDOVER,
    'ready_to_handover': ORDER_STATUS.READY_TO_HANDOVER,
    'onway': ORDER_STATUS.READY_TO_HANDOVER, // "onway" means ready for delivery
    'on the way': ORDER_STATUS.READY_TO_HANDOVER,
    'delivered': ORDER_STATUS.DELIVERED, // Delivered orders (past orders)
    'refunded': ORDER_STATUS.REFUNDED // Refunded orders (past orders)
  }
  
  return statusMap[statusLower] || status
}

/**
 * Get status for display in home page tabs
 * Maps standard status to tab-friendly format
 * @param {string} status - The order status
 * @returns {string} - Tab-friendly status format
 */
export const getStatusForTab = (status) => {
  const normalized = normalizeStatus(status)
  
  const tabMap = {
    [ORDER_STATUS.PENDING]: 'pending',
    [ORDER_STATUS.CONFIRMED]: 'confirmed',
    [ORDER_STATUS.COOKING]: 'cooking',
    [ORDER_STATUS.READY_TO_HANDOVER]: 'ready'
  }
  
  return tabMap[normalized] || 'pending'
}

/**
 * Check if order matches a tab filter
 * @param {string} orderStatus - The order status
 * @param {string} tabFilter - The tab filter (pending, confirmed, cooking, ready, onway)
 * @returns {boolean}
 */
export const matchesTabFilter = (orderStatus, tabFilter) => {
  const normalized = normalizeStatus(orderStatus)
  const statusForTab = getStatusForTab(normalized)
  
  // Special case: "onway" tab should show "Ready to handover" status
  if (tabFilter === 'onway') {
    return normalized === ORDER_STATUS.READY_TO_HANDOVER
  }
  
  return statusForTab === tabFilter
}

/**
 * Check if order matches OrdersPage filter tab
 * @param {string} orderStatus - The order status
 * @param {string} filterTab - The filter tab (all, delivered, refunded, cancelled, history)
 * @returns {boolean}
 */
export const matchesOrdersPageFilter = (orderStatus, filterTab) => {
  if (filterTab === 'all') {
    return true // Show all orders
  }
  
  const normalized = normalizeStatus(orderStatus)
  
  // Map filter tabs to status
  if (filterTab === 'delivered') {
    // "Delivered" means orders that are delivered (past orders)
    return normalized === ORDER_STATUS.DELIVERED
  }
  
  if (filterTab === 'refunded') {
    // "Refunded" means orders that are refunded (past orders)
    return normalized === ORDER_STATUS.REFUNDED
  }
  
  // "history" filter shows both delivered and refunded orders (past orders)
  if (filterTab === 'history') {
    return normalized === ORDER_STATUS.DELIVERED || normalized === ORDER_STATUS.REFUNDED
  }
  
  // For cancelled - return false (no orders match)
  if (filterTab === 'cancelled') {
    return false // No orders match this filter yet
  }
  
  return false
}


/**
 * Delivery Order Status Utility Functions
 * Centralized management for delivery order status across the delivery module
 */

// Standard delivery status values
export const DELIVERY_ORDER_STATUS = {
  ACCEPTED: "Order is Accepted",
  PICKED_UP: "Picked Up",
  ON_THE_WAY: "On the Way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled"
}

/**
 * Get delivery order status from localStorage
 * @param {string|number} orderId - The order ID
 * @returns {string} - The order status, defaults to "Order is Accepted"
 */
export const getDeliveryOrderStatus = (orderId) => {
  if (!orderId) return DELIVERY_ORDER_STATUS.ACCEPTED
  
  try {
    const savedStatus = localStorage.getItem(`delivery_order_status_${orderId}`)
    return savedStatus || DELIVERY_ORDER_STATUS.ACCEPTED
  } catch (error) {
    console.error('Error reading delivery order status from localStorage:', error)
    return DELIVERY_ORDER_STATUS.ACCEPTED
  }
}

/**
 * Save delivery order status to localStorage
 * @param {string|number} orderId - The order ID
 * @param {string} status - The order status to save
 */
export const saveDeliveryOrderStatus = (orderId, status) => {
  if (!orderId || !status) return
  
  try {
    localStorage.setItem(`delivery_order_status_${orderId}`, status)
    // Dispatch custom event for other components
    window.dispatchEvent(new CustomEvent('deliveryOrderStatusUpdated', { 
      detail: { orderId, status } 
    }))
  } catch (error) {
    console.error('Error saving delivery order status to localStorage:', error)
  }
}

/**
 * Normalize status to standard format
 * Converts various status formats to standard format
 * @param {string} status - The status to normalize
 * @returns {string} - Normalized status
 */
export const normalizeDeliveryStatus = (status) => {
  if (!status) return DELIVERY_ORDER_STATUS.ACCEPTED
  
  const statusLower = status.toLowerCase().trim()
  
  // Map various formats to standard format
  const statusMap = {
    'accepted': DELIVERY_ORDER_STATUS.ACCEPTED,
    'order is accepted': DELIVERY_ORDER_STATUS.ACCEPTED,
    'picked up': DELIVERY_ORDER_STATUS.PICKED_UP,
    'pickedup': DELIVERY_ORDER_STATUS.PICKED_UP,
    'on the way': DELIVERY_ORDER_STATUS.ON_THE_WAY,
    'onway': DELIVERY_ORDER_STATUS.ON_THE_WAY,
    'onway': DELIVERY_ORDER_STATUS.ON_THE_WAY,
    'delivered': DELIVERY_ORDER_STATUS.DELIVERED,
    'cancelled': DELIVERY_ORDER_STATUS.CANCELLED,
    'canceled': DELIVERY_ORDER_STATUS.CANCELLED
  }
  
  return statusMap[statusLower] || status
}

/**
 * Get status message for display
 * @param {string} status - The order status
 * @returns {Object} - Status message and description
 */
export const getDeliveryStatusMessage = (status) => {
  const normalized = normalizeDeliveryStatus(status)
  
  const statusMessages = {
    [DELIVERY_ORDER_STATUS.ACCEPTED]: {
      message: "Food is waiting for cook",
      description: "When it's ready for cooking, you will be notified."
    },
    [DELIVERY_ORDER_STATUS.PICKED_UP]: {
      message: "Order picked up from restaurant",
      description: "You can now proceed to deliver the order."
    },
    [DELIVERY_ORDER_STATUS.ON_THE_WAY]: {
      message: "On the way to customer",
      description: "You are currently delivering this order."
    },
    [DELIVERY_ORDER_STATUS.DELIVERED]: {
      message: "Order delivered successfully",
      description: "This order has been completed."
    },
    [DELIVERY_ORDER_STATUS.CANCELLED]: {
      message: "Order cancelled",
      description: "This order has been cancelled."
    }
  }
  
  return statusMessages[normalized] || statusMessages[DELIVERY_ORDER_STATUS.ACCEPTED]
}

/**
 * Check if order matches a filter
 * @param {string} orderStatus - The order status
 * @param {string} filter - The filter (all, delivered, cancelled, refund)
 * @returns {boolean}
 */
export const matchesDeliveryFilter = (orderStatus, filter) => {
  if (filter === 'all') {
    return true
  }
  
  const normalized = normalizeDeliveryStatus(orderStatus)
  
  if (filter === 'delivered') {
    return normalized === DELIVERY_ORDER_STATUS.DELIVERED
  }
  
  if (filter === 'cancelled') {
    return normalized === DELIVERY_ORDER_STATUS.CANCELLED
  }
  
  if (filter === 'refund') {
    // For now, no refund status - can be added later
    return false
  }
  
  return false
}

/**
 * Get all delivery orders with their statuses
 * @returns {Array} - Array of orders with status
 */
export const getAllDeliveryOrders = () => {
  try {
    const ordersMap = new Map()
    
    // Get active order from localStorage
    const activeOrder = localStorage.getItem('activeOrder')
    if (activeOrder) {
      const order = JSON.parse(activeOrder)
      order.status = getDeliveryOrderStatus(order.orderId)
      ordersMap.set(order.orderId, order)
    }
    
    // Get all order statuses from localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('delivery_order_status_')) {
        const orderId = key.replace('delivery_order_status_', '')
        const status = localStorage.getItem(key)
        
        // Only add if not already in map (to avoid duplicates with activeOrder)
        if (!ordersMap.has(orderId)) {
          ordersMap.set(orderId, {
            orderId,
            status
          })
        } else {
          // Update status if order already exists
          const existingOrder = ordersMap.get(orderId)
          existingOrder.status = status
        }
      }
    }
    
    return Array.from(ordersMap.values())
  } catch (error) {
    console.error('Error getting all delivery orders:', error)
    return []
  }
}

/**
 * Get orders count by status
 * @param {string} status - The status to count (optional, if not provided returns all counts)
 * @returns {number|Object} - Count or object with counts by status
 */
export const getDeliveryOrdersCount = (status = null) => {
  const orders = getAllDeliveryOrders()
  
  if (status) {
    const normalized = normalizeDeliveryStatus(status)
    return orders.filter(o => normalizeDeliveryStatus(o.status) === normalized).length
  }
  
  // Return counts by status
  return {
    total: orders.length,
    accepted: orders.filter(o => normalizeDeliveryStatus(o.status) === DELIVERY_ORDER_STATUS.ACCEPTED).length,
    pickedUp: orders.filter(o => normalizeDeliveryStatus(o.status) === DELIVERY_ORDER_STATUS.PICKED_UP).length,
    onTheWay: orders.filter(o => normalizeDeliveryStatus(o.status) === DELIVERY_ORDER_STATUS.ON_THE_WAY).length,
    delivered: orders.filter(o => normalizeDeliveryStatus(o.status) === DELIVERY_ORDER_STATUS.DELIVERED).length,
    cancelled: orders.filter(o => normalizeDeliveryStatus(o.status) === DELIVERY_ORDER_STATUS.CANCELLED).length
  }
}


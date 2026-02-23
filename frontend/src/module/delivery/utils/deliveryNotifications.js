/**
 * Delivery Notifications Utility Functions
 * Centralized management for delivery notifications
 */

const DELIVERY_NOTIFICATIONS_KEY = 'delivery_notifications'

/**
 * Get all notifications from localStorage
 * @returns {Array} - Array of notifications
 */
export const getDeliveryNotifications = () => {
  try {
    const saved = localStorage.getItem(DELIVERY_NOTIFICATIONS_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
    // Return default notifications if none exist
    return []
  } catch (error) {
    console.error('Error reading delivery notifications from localStorage:', error)
    return []
  }
}

/**
 * Save notifications to localStorage
 * @param {Array} notifications - Array of notifications
 */
export const saveDeliveryNotifications = (notifications) => {
  try {
    localStorage.setItem(DELIVERY_NOTIFICATIONS_KEY, JSON.stringify(notifications))
    // Dispatch custom event for other components
    window.dispatchEvent(new CustomEvent('deliveryNotificationsUpdated'))
  } catch (error) {
    console.error('Error saving delivery notifications to localStorage:', error)
  }
}

/**
 * Get unread notification count
 * @returns {number} - Count of unread notifications
 */
export const getUnreadDeliveryNotificationCount = () => {
  try {
    const notifications = getDeliveryNotifications()
    return notifications.filter(n => !n.read).length
  } catch (error) {
    console.error('Error getting unread notification count:', error)
    return 0
  }
}

/**
 * Add a new notification
 * @param {Object} notification - Notification object
 */
export const addDeliveryNotification = (notification) => {
  const notifications = getDeliveryNotifications()
  const newNotification = {
    id: Date.now(),
    read: false,
    ...notification
  }
  notifications.unshift(newNotification)
  saveDeliveryNotifications(notifications)
  return newNotification
}

/**
 * Mark notification as read
 * @param {number} notificationId - Notification ID
 */
export const markDeliveryNotificationAsRead = (notificationId) => {
  const notifications = getDeliveryNotifications()
  const notification = notifications.find(n => n.id === notificationId)
  if (notification) {
    notification.read = true
    saveDeliveryNotifications(notifications)
  }
}


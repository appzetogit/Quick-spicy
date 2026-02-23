/**
 * Notifications Utility Functions
 * Centralized management for notifications
 */

import { getTransactionsByType, getTransactionsByStatus } from './walletState'

/**
 * Get unread notification count
 * @returns {number} - Count of unread notifications
 */
export const getUnreadNotificationCount = () => {
  try {
    // Get wallet transactions for notifications
    const paymentTransactions = getTransactionsByType("payment").slice(0, 3)
    const completedWithdrawals = getTransactionsByStatus("Completed").slice(0, 2)
    
    // Count unread wallet notifications
    let unreadCount = 0
    if (paymentTransactions.length > 0) {
      unreadCount += 1 // First payment notification is unread
    }
    
    // Static notifications (hardcoded unread ones)
    const staticUnread = 2 // "New Order Received" and "New Review"
    
    return unreadCount + staticUnread
  } catch (error) {
    console.error('Error getting unread notification count:', error)
    return 0
  }
}


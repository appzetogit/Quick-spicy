import Order from '../models/Order.js';
import { notifyDeliveryBoyOrderReady } from './deliveryNotificationService.js';

/**
 * Automatically mark orders as ready when ETA becomes 0
 * This runs as a cron job to check all preparing orders
 * @returns {Promise<{processed: number, message: string}>}
 */
export async function processAutoReadyOrders() {
  try {
    // Find all orders with status 'preparing' that have tracking.preparing.timestamp
    const preparingOrders = await Order.find({
      status: 'preparing',
      'tracking.preparing.timestamp': { $exists: true },
      estimatedDeliveryTime: { $exists: true, $gt: 0 }
    })
      .populate('deliveryPartnerId', 'name phone')
      .lean();

    if (preparingOrders.length === 0) {
      return { processed: 0, message: 'No preparing orders to check' };
    }

    const now = new Date();
    let processedCount = 0;
    const readyOrders = [];

    for (const order of preparingOrders) {
      const preparingTimestamp = order.tracking?.preparing?.timestamp;
      if (!preparingTimestamp) {
        continue;
      }

      // Calculate elapsed time in minutes
      const elapsedMs = now - new Date(preparingTimestamp);
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      const estimatedTime = order.estimatedDeliveryTime || 0;

      // Check if ETA has elapsed (with 5 second buffer to account for cron interval)
      if (elapsedMinutes >= estimatedTime) {
        try {
          // Update order status to ready
          const updatedOrder = await Order.findByIdAndUpdate(
            order._id,
            {
              $set: {
                status: 'ready',
                'tracking.ready': {
                  status: true,
                  timestamp: now
                }
              }
            },
            { new: true }
          )
            .populate('restaurantId', 'name location address phone')
            .populate('userId', 'name phone')
            .populate('deliveryPartnerId', 'name phone')
            .lean();

          if (updatedOrder) {
            readyOrders.push(updatedOrder);
            processedCount++;

            console.log(`✅ Order ${order.orderId} automatically marked as ready (ETA elapsed: ${elapsedMinutes} mins >= ${estimatedTime} mins)`);

            // Notify delivery boy if order is assigned
            if (updatedOrder.deliveryPartnerId) {
              try {
                await notifyDeliveryBoyOrderReady(updatedOrder, updatedOrder.deliveryPartnerId._id || updatedOrder.deliveryPartnerId);
                console.log(`📢 Notified delivery boy ${updatedOrder.deliveryPartnerId._id || updatedOrder.deliveryPartnerId} about order ${order.orderId} being ready`);
              } catch (notifError) {
                console.error(`❌ Error notifying delivery boy about order ${order.orderId}:`, notifError);
              }
            }
          }
        } catch (updateError) {
          console.error(`❌ Error updating order ${order.orderId} to ready:`, updateError);
        }
      }
    }

    return {
      processed: processedCount,
      message: processedCount > 0 
        ? `Marked ${processedCount} order(s) as ready automatically`
        : 'No orders ready yet'
    };
  } catch (error) {
    console.error('❌ Error processing auto-ready orders:', error);
    return { processed: 0, message: `Error: ${error.message}` };
  }
}


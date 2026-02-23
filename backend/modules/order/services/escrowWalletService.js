import Order from '../models/Order.js';
import OrderSettlement from '../models/OrderSettlement.js';
import UserWallet from '../../user/models/UserWallet.js';
import AdminWallet from '../../admin/models/AdminWallet.js';
import AuditLog from '../../admin/models/AuditLog.js';

/**
 * Hold funds in escrow when order is placed
 * This moves money from user payment to escrow
 */
export const holdEscrow = async (orderId, userId, amount) => {
  try {
    // Get or create settlement
    let settlement = await OrderSettlement.findOne({ orderId });
    if (!settlement) {
      settlement = await OrderSettlement.findOrCreateByOrderId(orderId);
    }

    // Update escrow status
    settlement.escrowStatus = 'held';
    settlement.escrowAmount = amount;
    settlement.escrowHeldAt = new Date();
    await settlement.save();

    // Create audit log
    await AuditLog.createLog({
      entityType: 'order',
      entityId: orderId,
      action: 'escrow_hold',
      actionType: 'create',
      performedBy: {
        type: 'system',
        name: 'System'
      },
      transactionDetails: {
        amount: amount,
        type: 'escrow_hold',
        status: 'success',
        orderId: orderId
      },
      description: `Escrow held for order ${settlement.orderNumber}`
    });

    return settlement;
  } catch (error) {
    console.error('Error holding escrow:', error);
    throw new Error(`Failed to hold escrow: ${error.message}`);
  }
};

/**
 * Release escrow and distribute funds after delivery
 */
export const releaseEscrow = async (orderId) => {
  try {
    const settlement = await OrderSettlement.findOne({ orderId });
    if (!settlement) {
      throw new Error('Settlement not found');
    }

    if (settlement.escrowStatus !== 'held') {
      throw new Error(`Escrow not in held status. Current status: ${settlement.escrowStatus}`);
    }

    // Update escrow status
    settlement.escrowStatus = 'released';
    settlement.escrowReleasedAt = new Date();
    await settlement.save();

    // Credit restaurant wallet with net earning (food price - commission)
    // Example: ₹200 order, 15% commission = ₹30, restaurant gets ₹170
    if (settlement.restaurantEarning.netEarning > 0) {
      await creditRestaurantWallet(
        settlement.restaurantId,
        settlement.orderId,
        settlement.restaurantEarning.netEarning, // ₹170 (₹200 - ₹30)
        settlement.orderNumber,
        settlement.restaurantEarning.foodPrice, // Full order value for reference
        settlement.restaurantEarning.commission // Commission deducted
      );
      settlement.restaurantEarning.status = 'credited';
      settlement.restaurantEarning.creditedAt = new Date();
      settlement.restaurantSettled = true;
    }

    // Credit delivery partner wallet
    if (settlement.deliveryPartnerId && settlement.deliveryPartnerEarning.totalEarning > 0) {
      await creditDeliveryWallet(
        settlement.deliveryPartnerId,
        settlement.orderId,
        settlement.deliveryPartnerEarning.totalEarning,
        settlement.orderNumber
      );
      settlement.deliveryPartnerEarning.status = 'credited';
      settlement.deliveryPartnerEarning.creditedAt = new Date();
      settlement.deliveryPartnerSettled = true;
    }

    // Credit admin wallet
    await creditAdminWallet(
      settlement.orderId,
      settlement.adminEarning,
      settlement.orderNumber,
      settlement.restaurantId,
      settlement // Pass settlement for reference
    );
    settlement.adminEarning.status = 'credited';
    settlement.adminEarning.creditedAt = new Date();
    settlement.adminSettled = true;

    // Update settlement status
    settlement.settlementStatus = 'completed';
    await settlement.save();

    // Create audit log
    await AuditLog.createLog({
      entityType: 'order',
      entityId: orderId,
      action: 'escrow_release',
      actionType: 'settle',
      performedBy: {
        type: 'system',
        name: 'System'
      },
      transactionDetails: {
        amount: settlement.escrowAmount,
        type: 'escrow_release',
        status: 'success',
        orderId: orderId
      },
      description: `Escrow released and funds distributed for order ${settlement.orderNumber}`
    });

    return settlement;
  } catch (error) {
    console.error('Error releasing escrow:', error);
    throw new Error(`Failed to release escrow: ${error.message}`);
  }
};

/**
 * Credit restaurant wallet
 * @param {ObjectId} restaurantId - Restaurant ID
 * @param {ObjectId} orderId - Order ID
 * @param {Number} netAmount - Net amount to credit (food price - commission)
 * @param {String} orderNumber - Order number
 * @param {Number} foodPrice - Full food price (for reference)
 * @param {Number} commission - Commission deducted (for reference)
 */
const creditRestaurantWallet = async (restaurantId, orderId, netAmount, orderNumber, foodPrice = null, commission = null) => {
  try {
    const RestaurantWallet = (await import('../../restaurant/models/RestaurantWallet.js')).default;
    const wallet = await RestaurantWallet.findOrCreateByRestaurantId(restaurantId);
    
    // Create description with breakdown
    let description = `Payment for order ${orderNumber}`;
    if (foodPrice && commission) {
      description = `Payment for order ${orderNumber} (Order: ₹${foodPrice}, Commission: ₹${commission}, Net: ₹${netAmount})`;
    }
    
    wallet.addTransaction({
      amount: netAmount, // Credit net amount (₹170)
      type: 'payment',
      status: 'Completed',
      description: description,
      orderId: orderId
    });
    
    await wallet.save();

    // Create audit log
    await AuditLog.createLog({
      entityType: 'restaurant',
      entityId: restaurantId,
      action: 'wallet_credit',
      actionType: 'credit',
      performedBy: {
        type: 'system',
        name: 'System'
      },
      transactionDetails: {
        amount: netAmount,
        type: 'payment',
        status: 'success',
        orderId: orderId,
        walletType: 'restaurant'
      },
      description: `Restaurant wallet credited for order ${orderNumber}`
    });
  } catch (error) {
    console.error('Error crediting restaurant wallet:', error);
    throw error;
  }
};

/**
 * Credit delivery partner wallet
 */
const creditDeliveryWallet = async (deliveryId, orderId, amount, orderNumber) => {
  try {
    const DeliveryWallet = (await import('../../delivery/models/DeliveryWallet.js')).default;
    const wallet = await DeliveryWallet.findOrCreateByDeliveryId(deliveryId);
    
    wallet.addTransaction({
      amount: amount,
      type: 'payment',
      status: 'Completed',
      description: `Payment for order ${orderNumber}`,
      orderId: orderId,
      paymentCollected: false // Will be updated when COD is collected
    });
    
    await wallet.save();

    // Create audit log
    await AuditLog.createLog({
      entityType: 'delivery',
      entityId: deliveryId,
      action: 'wallet_credit',
      actionType: 'credit',
      performedBy: {
        type: 'system',
        name: 'System'
      },
      transactionDetails: {
        amount: amount,
        type: 'payment',
        status: 'success',
        orderId: orderId,
        walletType: 'delivery'
      },
      description: `Delivery partner wallet credited for order ${orderNumber}`
    });
  } catch (error) {
    console.error('Error crediting delivery wallet:', error);
    throw error;
  }
};

/**
 * Credit admin wallet
 * @param {ObjectId} orderId - Order ID
 * @param {Object} adminEarning - Admin earning breakdown
 * @param {String} orderNumber - Order number
 * @param {ObjectId} restaurantId - Restaurant ID
 * @param {Object} settlement - Settlement object (optional, for reference)
 */
const creditAdminWallet = async (orderId, adminEarning, orderNumber, restaurantId, settlement = null) => {
  try {
    const wallet = await AdminWallet.findOrCreate();

    // Credit commission (from restaurant)
    // This is the commission deducted from restaurant's food price
    if (adminEarning.commission > 0) {
      const foodPrice = settlement?.restaurantEarning?.foodPrice || 0;
      const commissionPercent = foodPrice > 0 ? ((adminEarning.commission / foodPrice) * 100).toFixed(1) : '0';
      wallet.addTransaction({
        amount: adminEarning.commission,
        type: 'commission',
        status: 'Completed',
        description: `Restaurant commission from order ${orderNumber} (${commissionPercent}% of ₹${foodPrice})`,
        orderId: orderId,
        restaurantId: restaurantId
      });
    }

    // Credit platform fee
    if (adminEarning.platformFee > 0) {
      wallet.addTransaction({
        amount: adminEarning.platformFee,
        type: 'platform_fee',
        status: 'Completed',
        description: `Platform fee from order ${orderNumber}`,
        orderId: orderId
      });
    }

    // Credit delivery fee
    if (adminEarning.deliveryFee > 0) {
      wallet.addTransaction({
        amount: adminEarning.deliveryFee,
        type: 'delivery_fee',
        status: 'Completed',
        description: `Delivery fee from order ${orderNumber}`,
        orderId: orderId
      });
    }

    // Credit GST
    if (adminEarning.gst > 0) {
      wallet.addTransaction({
        amount: adminEarning.gst,
        type: 'gst',
        status: 'Completed',
        description: `GST from order ${orderNumber}`,
        orderId: orderId
      });
    }

    await wallet.save();

    // Create audit log
    await AuditLog.createLog({
      entityType: 'order',
      entityId: orderId,
      action: 'admin_wallet_credit',
      actionType: 'credit',
      performedBy: {
        type: 'system',
        name: 'System'
      },
      transactionDetails: {
        amount: adminEarning.totalEarning,
        type: 'platform_earning',
        status: 'success',
        orderId: orderId,
        walletType: 'admin'
      },
      description: `Admin wallet credited for order ${orderNumber}`
    });
  } catch (error) {
    console.error('Error crediting admin wallet:', error);
    throw error;
  }
};


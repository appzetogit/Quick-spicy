import EarningAddon from '../../admin/models/EarningAddon.js';
import EarningAddonHistory from '../../admin/models/EarningAddonHistory.js';
import DeliveryWallet from '../models/DeliveryWallet.js';
import Order from '../../order/models/Order.js';
import mongoose from 'mongoose';

/**
 * Check and award earning addon bonuses when a delivery boy completes an order
 * @param {Object} deliveryId - Delivery partner ID
 * @param {Object} orderId - Order ID that was just completed
 * @param {Date} orderDeliveredAt - When the order was delivered
 * @returns {Promise<Object|null>} - Returns bonus details if awarded, null otherwise
 */
export const checkAndAwardEarningAddon = async (deliveryId, orderId, orderDeliveredAt = new Date()) => {
  try {
    const now = new Date();
    
    // Get all active earning addons that are currently valid
    const activeOffers = await EarningAddon.find({
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { maxRedemptions: null },
        { $expr: { $lt: ['$currentRedemptions', '$maxRedemptions'] } }
      ]
    }).lean();

    if (!activeOffers || activeOffers.length === 0) {
      console.log(`ℹ️ No active earning addon offers found for delivery ${deliveryId}`);
      return null;
    }

    console.log(`🔍 Checking ${activeOffers.length} active offers for delivery ${deliveryId} after order ${orderId}`);

    // Check each offer to see if delivery boy qualifies
    for (const offer of activeOffers) {
      try {
        // Check if delivery boy already redeemed this offer
        const existingRedemption = await EarningAddonHistory.findOne({
          earningAddonId: offer._id,
          deliveryPartnerId: deliveryId,
          status: 'credited'
        });

        if (existingRedemption) {
          console.log(`ℹ️ Delivery ${deliveryId} already redeemed offer ${offer._id}, skipping`);
          continue;
        }

        // Count orders completed by this delivery boy AFTER offer was created
        // Use the later of: offer creation date or offer start date
        const offerStartDate = new Date(offer.startDate);
        const offerCreatedAt = offer.createdAt ? new Date(offer.createdAt) : offerStartDate;
        // Count orders from when offer was created (or start date, whichever is later)
        const countFromDate = offerCreatedAt > offerStartDate ? offerCreatedAt : offerStartDate;
        const endDate = new Date(offer.endDate);
        
        // Count delivered orders AFTER offer creation and within the offer end date
        const orderCount = await Order.countDocuments({
          deliveryPartnerId: deliveryId,
          status: 'delivered',
          deliveredAt: {
            $gte: countFromDate, // Count from offer creation/start date
            $lte: endDate
          }
        });

        console.log(`📊 Offer ${offer._id}: Delivery ${deliveryId} has completed ${orderCount} orders (required: ${offer.requiredOrders})`);

        // Check if delivery boy has completed the required number of orders
        if (orderCount >= offer.requiredOrders) {
          // Check if bonus was already awarded (check wallet transactions)
          const wallet = await DeliveryWallet.findOne({ deliveryId });
          if (wallet) {
            const existingBonus = wallet.transactions.find(t => {
              if (t.type !== 'earning_addon' || t.status !== 'Completed') return false;
              
              // Handle metadata - can be Map or plain object
              const metadata = t.metadata;
              if (metadata) {
                const earningAddonId = metadata instanceof Map 
                  ? metadata.get('earningAddonId')
                  : metadata.earningAddonId;
                
                return earningAddonId?.toString() === offer._id.toString();
              }
              return false;
            });

            if (existingBonus) {
              console.log(`ℹ️ Bonus already awarded for offer ${offer._id} to delivery ${deliveryId}`);
              continue;
            }
          }

          // Check if already has pending history record
          const existingPendingHistory = await EarningAddonHistory.findOne({
            earningAddonId: offer._id,
            deliveryPartnerId: deliveryId,
            status: 'pending'
          });

          if (existingPendingHistory) {
            console.log(`ℹ️ Delivery ${deliveryId} already has pending history for offer ${offer._id}, skipping`);
            continue;
          }

          // Delivery boy qualifies for offer - create pending history record
          // Admin will manually credit the amount from history page
          console.log(`🎉 Delivery ${deliveryId} qualifies for offer ${offer._id}! Creating pending history record for ₹${offer.earningAmount}`);

          // Ensure offer._id is ObjectId (handle both string and ObjectId formats)
          let offerId = offer._id;
          if (mongoose.Types.ObjectId.isValid(offer._id)) {
            offerId = typeof offer._id === 'string' 
              ? new mongoose.Types.ObjectId(offer._id) 
              : offer._id;
          }

          console.log(`📝 Creating pending history record for offer:`, {
            offerId: offerId,
            offerIdType: typeof offerId,
            offerIdString: offerId.toString(),
            deliveryId: deliveryId,
            deliveryIdType: typeof deliveryId
          });

          // Create history record with 'pending' status
          // Amount will be credited to wallet only when admin manually credits from history page
          const history = await EarningAddonHistory.create({
            earningAddonId: offerId,
            deliveryPartnerId: deliveryId,
            offerSnapshot: {
              title: offer.title,
              requiredOrders: offer.requiredOrders,
              earningAmount: offer.earningAmount,
              startDate: offer.startDate,
              endDate: offer.endDate
            },
            ordersCompleted: orderCount,
            ordersRequired: offer.requiredOrders,
            earningAmount: offer.earningAmount,
            completedAt: now,
            status: 'pending', // Status is 'pending' - admin will credit manually
            // transactionId and walletId will be set when admin credits from history page
            contributingOrders: [orderId.toString()],
            metadata: {
              completionTime: Math.ceil((now - offerStartDate) / (1000 * 60 * 60 * 24)) // days
            }
          });

          console.log(`📝 Created EarningAddonHistory record:`, {
            historyId: history._id,
            earningAddonId: history.earningAddonId?.toString(),
            earningAddonIdType: typeof history.earningAddonId,
            deliveryPartnerId: history.deliveryPartnerId?.toString(),
            status: history.status
          });

          // Verify history record was saved correctly
          const verifyHistory = await EarningAddonHistory.findById(history._id).lean();
          console.log(`✅ Verified history record saved:`, {
            found: !!verifyHistory,
            earningAddonId: verifyHistory?.earningAddonId?.toString(),
            status: verifyHistory?.status
          });

          // Update offer redemption count
          const updateResult = await EarningAddon.updateOne(
            { _id: offerId },
            { $inc: { currentRedemptions: 1 } }
          );

          console.log(`📊 Updated redemption count for offer ${offerId}:`, {
            matchedCount: updateResult.matchedCount,
            modifiedCount: updateResult.modifiedCount,
            offerTitle: offer.title
          });

          // Verify the count was updated
          const updatedOffer = await EarningAddon.findById(offerId).select('currentRedemptions').lean();
          console.log(`✅ Verified redemption count after update: ${updatedOffer?.currentRedemptions || 0}`);
          
          // Also verify by counting history records
          const historyCount = await EarningAddonHistory.countDocuments({
            earningAddonId: offerId,
            status: { $in: ['pending', 'credited'] }
          });
          console.log(`🔍 History count verification for offer ${offerId}: ${historyCount} records (pending + credited)`);

          console.log(`✅ Earning addon history record created (pending): ₹${offer.earningAmount} for delivery ${deliveryId} for offer "${offer.title}"`);
          console.log(`📋 Admin needs to manually credit this from Earning Addon History page`);

          return {
            success: true,
            offerId: offer._id,
            offerTitle: offer.title,
            amount: offer.earningAmount,
            ordersCompleted: orderCount,
            ordersRequired: offer.requiredOrders,
            historyId: history._id,
            status: 'pending', // Status is pending, not credited yet
            message: 'History record created. Admin will credit manually from history page.'
          };
        }
      } catch (offerError) {
        console.error(`❌ Error processing offer ${offer._id}:`, offerError);
        // Continue with next offer
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error(`❌ Error checking earning addon bonuses:`, error);
    // Don't throw - this is a bonus feature, shouldn't break order completion
    return null;
  }
};

/**
 * Get delivery boy's progress for all active offers
 * @param {Object} deliveryId - Delivery partner ID
 * @returns {Promise<Array>} - Array of offers with progress
 */
export const getDeliveryBoyOfferProgress = async (deliveryId) => {
  try {
    const now = new Date();
    
    const activeOffers = await EarningAddon.find({
      status: 'active',
      endDate: { $gte: now },
      $or: [
        { maxRedemptions: null },
        { $expr: { $lt: ['$currentRedemptions', '$maxRedemptions'] } }
      ]
    }).lean();

    const offersWithProgress = await Promise.all(
      activeOffers.map(async (offer) => {
        // Use the later of: offer creation date or offer start date
        const offerStartDate = new Date(offer.startDate);
        const offerCreatedAt = offer.createdAt ? new Date(offer.createdAt) : offerStartDate;
        // Count orders from when offer was created (or start date, whichever is later)
        const countFromDate = offerCreatedAt > offerStartDate ? offerCreatedAt : offerStartDate;
        const endDate = new Date(offer.endDate);
        
        // Count orders completed AFTER offer creation and within offer period
        const orderCount = await Order.countDocuments({
          deliveryPartnerId: deliveryId,
          status: 'delivered',
          deliveredAt: {
            $gte: countFromDate, // Count from offer creation/start date
            $lte: now > endDate ? endDate : now
          }
        });

        // Check if already redeemed (credited) or has pending record
        const redeemed = await EarningAddonHistory.findOne({
          earningAddonId: offer._id,
          deliveryPartnerId: deliveryId,
          status: { $in: ['credited', 'pending'] }
        });

        const isValid = offer.status === 'active' &&
          now >= startDate &&
          now <= endDate &&
          (offer.maxRedemptions === null || offer.currentRedemptions < offer.maxRedemptions);

        return {
          ...offer,
          isValid,
          currentOrders: orderCount,
          progress: offer.requiredOrders > 0 ? Math.min(orderCount / offer.requiredOrders, 1) : 0,
          redeemed: !!redeemed,
          canRedeem: !redeemed && orderCount >= offer.requiredOrders && isValid
        };
      })
    );

    return offersWithProgress;
  } catch (error) {
    console.error(`❌ Error getting offer progress:`, error);
    return [];
  }
};

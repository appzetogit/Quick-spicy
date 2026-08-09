import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../../auth/models/User.js';
import UserWallet from '../../user/models/UserWallet.js';

/**
 * Pays the referrer, and only when the referral produced a real customer.
 *
 * The reward used to be credited the moment the referred friend signed up, which made a
 * signup itself worth 50 rupees: one customer manufactured roughly 80 of them and drew
 * close to 4,000 rupees without an order ever being placed. The operating team's rule now:
 *
 *   - nothing at signup;
 *   - 50 rupees to the referrer when the referred customer COMPLETES a delivered order of
 *     299 or more;
 *   - once per referred customer, ever.
 *
 * Called from both places an order becomes delivered - the rider's completeDelivery and the
 * admin panel's mark-delivered - the same pair of paths escrow release taught us about.
 */

// Fallbacks only. The live values come from the admin panel (Reward Settings) and are read
// per grant, so changing the payout does not need a deploy.
export const REFERRAL_REWARD_AMOUNT = Number(process.env.REFERRAL_REWARD_AMOUNT || 50);
export const REFERRAL_QUALIFYING_ORDER_MIN = Number(
  process.env.REFERRAL_QUALIFYING_ORDER_MIN || 299
);

/**
 * The order value the 299 threshold applies to. Food subtotal, not the charged total:
 * total includes delivery fee and tip, and a tip is customer-chosen, which would let a
 * 100-rupee order tip itself over the line. Falls back to total only when subtotal is
 * missing on old records.
 */
export function qualifyingAmountOf(pricing = {}) {
  const subtotal = Number(pricing?.subtotal);
  if (Number.isFinite(subtotal) && subtotal > 0) return subtotal;
  const total = Number(pricing?.total);
  return Number.isFinite(total) ? total : 0;
}

export function isQualifyingOrderAmount(pricing = {}, minimum = REFERRAL_QUALIFYING_ORDER_MIN) {
  return qualifyingAmountOf(pricing) >= minimum;
}

/**
 * Fire-and-forget safe: never throws. A failure here must not affect the delivery flow
 * that triggered it.
 */
export async function grantReferralRewardOnQualifiedOrder(orderOrId) {
  try {
    const order =
      orderOrId && orderOrId.pricing !== undefined
        ? orderOrId
        : await Order.findById(orderOrId).select('orderId userId pricing status').lean();

    if (!order || String(order.status) !== 'delivered') return;

    const { default: RewardSettings } = await import('../../admin/models/RewardSettings.js');
    const config = await RewardSettings.getConfig().catch(() => null);
    if (config && config.referralRewardEnabled === false) return;
    const rewardAmount = Number(config?.referralRewardAmount ?? REFERRAL_REWARD_AMOUNT);
    const minOrderAmount = Number(config?.referralMinOrderAmount ?? REFERRAL_QUALIFYING_ORDER_MIN);
    if (!Number.isFinite(rewardAmount) || rewardAmount <= 0) return;

    if (!isQualifyingOrderAmount(order.pricing, minOrderAmount)) return;

    const referredUserId = order.userId?._id || order.userId;
    if (!referredUserId) return;

    // Atomic once-only claim. Two delivered events for the same customer - or the rider
    // path and the admin path firing together - race straight into this update, and only
    // one can match the referralRewardGranted: {$ne: true} condition. The loser gets null
    // and walks away, which is the whole guarantee.
    const claimed = await User.findOneAndUpdate(
      {
        _id: referredUserId,
        role: 'user',
        referredBy: { $ne: null },
        referralRewardGranted: { $ne: true },
      },
      {
        $set: {
          referralRewardGranted: true,
          referralRewardGrantedAt: new Date(),
          referralQualifyingOrderId: order._id,
        },
      },
      { new: true }
    ).select('_id name referredBy');

    if (!claimed) return; // not referred, or already rewarded

    const referrer = await User.findById(claimed.referredBy).select('_id name isActive');
    if (!referrer || !referrer.isActive) {
      // Claim intentionally kept: a deleted or blocked referrer cannot be paid, and
      // releasing the claim would retry this forever.
      console.warn(
        `[referralReward] Referrer ${claimed.referredBy} missing or inactive; reward for ${claimed._id} not paid`
      );
      return;
    }

    const wallet = await UserWallet.findOrCreateByUserId(referrer._id);

    // Belt and braces on top of the claim: if any referral transaction for this referred
    // customer already exists - including one from the old pay-at-signup era - do not pay
    // again even if the user flags somehow desynced.
    const alreadyPaid = (wallet.transactions || []).some((t) => {
      const src = t?.metadata?.get?.('source') || t?.metadata?.source;
      const ref = t?.metadata?.get?.('referredUserId') || t?.metadata?.referredUserId;
      return (
        String(ref || '') === String(claimed._id) &&
        ['referral_signup', 'referral_qualified_order'].includes(String(src || ''))
      );
    });
    if (alreadyPaid) {
      console.warn(
        `[referralReward] Wallet already holds a referral payment for ${claimed._id}; skipping duplicate`
      );
      return;
    }

    try {
      wallet.addTransaction({
        amount: rewardAmount,
        type: 'addition',
        status: 'Completed',
        description: `Referral reward: ${claimed.name || 'your friend'} completed their first qualifying order`,
        paymentMethod: 'wallet',
        orderId: order._id,
        metadata: new Map([
          ['source', 'referral_qualified_order'],
          ['referredUserId', String(claimed._id)],
          ['qualifyingOrderId', String(order._id)],
          ['qualifyingOrderNumber', String(order.orderId || '')],
        ]),
      });
      await wallet.save();

      await User.findByIdAndUpdate(referrer._id, {
        'wallet.balance': wallet.balance,
        'wallet.currency': wallet.currency || 'INR',
      });

      console.log(
        `[referralReward] Paid ${rewardAmount} to ${referrer._id} for referred customer ${claimed._id} (order ${order.orderId})`
      );
    } catch (creditError) {
      // The claim is already taken but the money did not move: release the claim so the
      // next delivered qualifying order can retry, and shout, because this is the one state
      // that needs a human if it repeats.
      console.error(
        `[referralReward] CRITICAL: claim taken but wallet credit FAILED for referrer ${referrer._id} / referred ${claimed._id}:`,
        creditError
      );
      await User.updateOne(
        { _id: claimed._id },
        {
          $set: { referralRewardGranted: false },
          $unset: { referralRewardGrantedAt: '', referralQualifyingOrderId: '' },
        }
      ).catch(() => {});
    }
  } catch (error) {
    console.error('[referralReward] grant check failed (delivery flow unaffected):', error?.message);
  }
}

export default grantReferralRewardOnQualifiedOrder;

import mongoose from 'mongoose';
import { getCachedOrFetch, invalidateCachePrefix } from '../../../shared/utils/microCache.js';

/**
 * The two payouts the platform makes for growth rather than for food: the welcome credit a
 * new account gets, and the referral reward. Both were hardcoded - 20 in authController, 50
 * and the 299 threshold in referralRewardService - so changing what the business pays meant
 * a deploy. Single document; the admin panel edits it.
 */
const rewardSettingsSchema = new mongoose.Schema(
  {
    signupBonusAmount: {
      type: Number,
      default: 20,
      min: 0,
      comment: 'Credited once to a new customer wallet on first phone verification',
    },
    referralRewardAmount: {
      type: Number,
      default: 50,
      min: 0,
      comment: "Credited to the referrer after the referred customer's first qualifying order",
    },
    referralMinOrderAmount: {
      type: Number,
      default: 299,
      min: 0,
      comment: 'Food subtotal a referred customer must reach for the referrer to be paid',
    },
    signupBonusEnabled: { type: Boolean, default: true },
    referralRewardEnabled: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

const CACHE_KEY = 'rewardSettings:current';

/**
 * Read by the signup and delivery paths on every new customer and every delivered order, so
 * it is cached for a minute rather than fetched each time - the VPS-to-Atlas link is
 * throttled and this document changes a few times a year. invalidate() on save means an
 * admin edit takes effect immediately rather than after the TTL.
 */
rewardSettingsSchema.statics.getConfig = async function getConfig() {
  return getCachedOrFetch(CACHE_KEY, 60_000, async () => {
    const doc = await this.findOne().sort({ createdAt: 1 }).lean();
    return {
      signupBonusAmount: Number(doc?.signupBonusAmount ?? 20),
      referralRewardAmount: Number(doc?.referralRewardAmount ?? 50),
      referralMinOrderAmount: Number(doc?.referralMinOrderAmount ?? 299),
      signupBonusEnabled: doc?.signupBonusEnabled !== false,
      referralRewardEnabled: doc?.referralRewardEnabled !== false,
    };
  });
};

rewardSettingsSchema.statics.invalidateCache = function invalidateCache() {
  invalidateCachePrefix(CACHE_KEY);
};

const RewardSettings = mongoose.model('RewardSettings', rewardSettingsSchema);
export default RewardSettings;

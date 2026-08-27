import mongoose from 'mongoose';

/**
 * "Spend X, get Y free" - a restaurant's threshold rewards.
 *
 * Kept separate from the Offer model on purpose. Offer is coupon-code driven: a customer
 * types a code and gets a percentage or flat discount. This is the opposite shape -
 * nothing is typed, the reward is a physical item rather than money off, and it is
 * applied automatically the moment the cart crosses a threshold. Bolting it onto Offer
 * would have meant every coupon query learning to ignore a kind of offer that has no
 * code, no discount value, and different validity rules.
 *
 * One document per restaurant. Tiers are evaluated against the cart subtotal and the
 * HIGHEST qualifying tier wins - a 500 rupee cart on a restaurant offering 200 and 300
 * tiers gets the 300 reward, not both.
 */

const freebieTierSchema = new mongoose.Schema(
  {
    // Cart subtotal, in rupees, at or above which this reward unlocks.
    minOrderValue: {
      type: Number,
      required: true,
      min: 1,
    },
    // Whether the reward is a dish from the menu or an addon.
    rewardType: {
      type: String,
      enum: ['item', 'addon'],
      required: true,
    },
    // Identifies the reward within the restaurant's menu or addon list.
    rewardId: {
      type: String,
      required: true,
      trim: true,
    },
    rewardName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    // Shown in the cart so the customer can see what they are getting.
    rewardImage: {
      type: String,
      default: '',
      trim: true,
    },
    // Drives the veg/non-veg marker. Null means unknown - the consumer app renders no
    // marker rather than guessing, same rule as everywhere else.
    rewardIsVeg: {
      type: Boolean,
      default: null,
    },
    // What the item normally sells for. Never charged; used to show the customer what
    // they saved, and to keep restaurant settlement honest about what was given away.
    rewardValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const freebieOfferSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      unique: true,
      index: true,
    },
    // Master switch. Lets a restaurant pause the whole scheme without losing its tiers.
    isActive: {
      type: Boolean,
      default: false,
    },
    tiers: {
      type: [freebieTierSchema],
      default: [],
    },
    // Who last changed it. Both the restaurant and an admin can edit, and when free food
    // starts appearing on orders somebody will ask which.
    updatedBy: {
      type: String,
      enum: ['restaurant', 'admin'],
      default: 'restaurant',
    },
  },
  { timestamps: true }
);

/**
 * The best tier a given subtotal qualifies for, or null.
 * Only active tiers on an active offer count.
 */
freebieOfferSchema.methods.resolveTierFor = function resolveTierFor(subtotal) {
  if (!this.isActive) return null;
  const amount = Number(subtotal) || 0;

  return (this.tiers || [])
    .filter((t) => t && t.isActive !== false && Number(t.minOrderValue) > 0)
    .filter((t) => amount >= Number(t.minOrderValue))
    .sort((a, b) => Number(b.minOrderValue) - Number(a.minOrderValue))[0] || null;
};

/**
 * The next tier the customer has NOT yet reached, so the cart can nudge:
 * "Add 60 more to get a free Coke."
 */
freebieOfferSchema.methods.nextTierAfter = function nextTierAfter(subtotal) {
  if (!this.isActive) return null;
  const amount = Number(subtotal) || 0;

  return (this.tiers || [])
    .filter((t) => t && t.isActive !== false && Number(t.minOrderValue) > amount)
    .sort((a, b) => Number(a.minOrderValue) - Number(b.minOrderValue))[0] || null;
};

export default mongoose.model('FreebieOffer', freebieOfferSchema);

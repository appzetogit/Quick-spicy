import mongoose from 'mongoose';
import FreebieOffer from '../models/FreebieOffer.js';
import Restaurant from '../models/Restaurant.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

/**
 * "Spend X, get Y free" configuration.
 *
 * Editable from two places - the restaurant's own panel and the admin panel - so the
 * validation and shaping live here once rather than being duplicated and drifting apart.
 */

const MAX_TIERS = 5;

const toObjectId = (value) => {
  const raw = String(value || '').trim();
  if (mongoose.Types.ObjectId.isValid(raw) && raw.length === 24) {
    return new mongoose.Types.ObjectId(raw);
  }
  return null;
};

/**
 * Accepts whatever the panel sent and returns clean tiers, or throws with a message the
 * user can act on. Free food is being given away here, so a malformed tier is rejected
 * rather than coerced into something surprising.
 */
const sanitizeTiers = (rawTiers) => {
  if (!Array.isArray(rawTiers)) return [];
  if (rawTiers.length > MAX_TIERS) {
    throw new Error(`A restaurant can have at most ${MAX_TIERS} reward tiers.`);
  }

  const seenThresholds = new Set();

  return rawTiers.map((tier, index) => {
    const position = index + 1;
    const minOrderValue = Number(tier?.minOrderValue);
    if (!Number.isFinite(minOrderValue) || minOrderValue < 1) {
      throw new Error(`Tier ${position}: enter the order amount that unlocks the reward.`);
    }

    // Two tiers at the same threshold would make which reward is given arbitrary.
    const key = Math.round(minOrderValue);
    if (seenThresholds.has(key)) {
      throw new Error(`Tier ${position}: there is already a reward at ${key}. Use a different amount.`);
    }
    seenThresholds.add(key);

    const rewardType = tier?.rewardType === 'addon' ? 'addon' : 'item';
    const rewardId = String(tier?.rewardId || '').trim();
    const rewardName = String(tier?.rewardName || '').trim();

    if (!rewardId || !rewardName) {
      throw new Error(`Tier ${position}: choose the free ${rewardType === 'addon' ? 'addon' : 'dish'}.`);
    }

    const rewardValue = Number(tier?.rewardValue);

    return {
      minOrderValue: key,
      rewardType,
      rewardId,
      rewardName,
      rewardImage: String(tier?.rewardImage || '').trim(),
      rewardIsVeg: typeof tier?.rewardIsVeg === 'boolean' ? tier.rewardIsVeg : null,
      rewardValue: Number.isFinite(rewardValue) && rewardValue >= 0 ? Math.round(rewardValue) : 0,
      isActive: tier?.isActive !== false,
    };
  });
};

const loadOrEmpty = async (restaurantObjectId) => {
  const doc = await FreebieOffer.findOne({ restaurant: restaurantObjectId }).lean();
  return doc || { restaurant: restaurantObjectId, isActive: false, tiers: [] };
};

const saveConfig = async (restaurantObjectId, body, updatedBy) => {
  const tiers = sanitizeTiers(body?.tiers);
  const isActive = Boolean(body?.isActive);

  // Turning the scheme on with nothing to give away is almost always a mistake, and it
  // would show customers a reward that never arrives.
  if (isActive && tiers.filter((t) => t.isActive).length === 0) {
    throw new Error('Add at least one active reward tier before switching this on.');
  }

  return FreebieOffer.findOneAndUpdate(
    { restaurant: restaurantObjectId },
    { $set: { isActive, tiers, updatedBy } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
};

/** Restaurant panel: read own configuration. */
export const getMyFreebieOffer = asyncHandler(async (req, res) => {
  const restaurantObjectId = toObjectId(req.restaurant?._id || req.restaurant?.id || req.user?.restaurantId);
  if (!restaurantObjectId) return errorResponse(res, 401, 'Restaurant authentication required');

  return successResponse(res, 200, 'Freebie offer retrieved', {
    freebieOffer: await loadOrEmpty(restaurantObjectId),
  });
});

/** Restaurant panel: save own configuration. */
export const updateMyFreebieOffer = asyncHandler(async (req, res) => {
  const restaurantObjectId = toObjectId(req.restaurant?._id || req.restaurant?.id || req.user?.restaurantId);
  if (!restaurantObjectId) return errorResponse(res, 401, 'Restaurant authentication required');

  try {
    const saved = await saveConfig(restaurantObjectId, req.body, 'restaurant');
    return successResponse(res, 200, 'Freebie offer saved', { freebieOffer: saved });
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
});

/** Admin panel: read any restaurant's configuration. */
export const getRestaurantFreebieOffer = asyncHandler(async (req, res) => {
  const restaurantObjectId = toObjectId(req.params.restaurantId);
  if (!restaurantObjectId) return errorResponse(res, 400, 'Invalid restaurant id');

  const restaurant = await Restaurant.findById(restaurantObjectId).select('name').lean();
  if (!restaurant) return errorResponse(res, 404, 'Restaurant not found');

  return successResponse(res, 200, 'Freebie offer retrieved', {
    restaurant: { _id: restaurant._id, name: restaurant.name },
    freebieOffer: await loadOrEmpty(restaurantObjectId),
  });
});

/** Admin panel: save any restaurant's configuration. */
export const updateRestaurantFreebieOffer = asyncHandler(async (req, res) => {
  const restaurantObjectId = toObjectId(req.params.restaurantId);
  if (!restaurantObjectId) return errorResponse(res, 400, 'Invalid restaurant id');

  const exists = await Restaurant.exists({ _id: restaurantObjectId });
  if (!exists) return errorResponse(res, 404, 'Restaurant not found');

  try {
    const saved = await saveConfig(restaurantObjectId, req.body, 'admin');
    return successResponse(res, 200, 'Freebie offer saved', { freebieOffer: saved });
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
});

/** Consumer app: what a restaurant is currently offering, for the store screen. */
export const getPublicFreebieOffer = asyncHandler(async (req, res) => {
  const restaurantObjectId = toObjectId(req.params.restaurantId);
  if (!restaurantObjectId) return errorResponse(res, 400, 'Invalid restaurant id');

  const doc = await FreebieOffer.findOne({ restaurant: restaurantObjectId, isActive: true }).lean();
  const tiers = (doc?.tiers || [])
    .filter((t) => t.isActive !== false)
    .sort((a, b) => a.minOrderValue - b.minOrderValue);

  return successResponse(res, 200, 'Freebie offer retrieved', {
    freebieOffer: doc ? { isActive: true, tiers } : null,
  });
});

import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Restaurant from '../../restaurant/models/Restaurant.js';

/**
 * Recompute a restaurant's rating from the reviews customers actually left.
 *
 * Reviews were being written onto the order and never rolled up, so every restaurant sat at
 * 0 while 325 customers had rated. The home page hid that by inventing a 4.5.
 *
 * Recomputed from scratch rather than kept as a running average, so editing or removing a
 * review cannot leave the aggregate drifting away from the underlying data.
 *
 * Order.restaurantId is a String while Restaurant._id is an ObjectId, so both forms are
 * matched: orders exist with each.
 */
export const recalculateRestaurantRating = async (restaurantId) => {
  const raw = String(restaurantId || '').trim();
  if (!raw) return null;

  const idVariants = [raw];
  if (mongoose.Types.ObjectId.isValid(raw)) idVariants.push(new mongoose.Types.ObjectId(raw));

  const [result] = await Order.aggregate([
    {
      $match: {
        restaurantId: { $in: idVariants },
        // Prefer the explicit restaurant score, falling back to the older single rating.
        $or: [
          { 'review.restaurantRating': { $gte: 1 } },
          { 'review.rating': { $gte: 1 } },
        ],
      },
    },
    {
      $project: {
        score: { $ifNull: ['$review.restaurantRating', '$review.rating'] },
      },
    },
    { $match: { score: { $gte: 1, $lte: 5 } } },
    { $group: { _id: null, average: { $avg: '$score' }, count: { $sum: 1 } } },
  ]);

  const average = result?.average ? Math.round(result.average * 10) / 10 : 0;
  const count = result?.count || 0;

  if (!mongoose.Types.ObjectId.isValid(raw)) {
    // Some orders store a slug or human id; resolve those before writing.
    const restaurant = await Restaurant.findOne({ restaurantId: raw }).select('_id').lean();
    if (!restaurant) return null;
    await Restaurant.updateOne({ _id: restaurant._id }, { $set: { rating: average, totalRatings: count } });
    return { restaurantId: String(restaurant._id), rating: average, totalRatings: count };
  }

  await Restaurant.updateOne({ _id: raw }, { $set: { rating: average, totalRatings: count } });
  return { restaurantId: raw, rating: average, totalRatings: count };
};

export default recalculateRestaurantRating;

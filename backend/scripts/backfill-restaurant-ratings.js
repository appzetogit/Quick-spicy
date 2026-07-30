/**
 * Rebuild every restaurant's rating from the reviews customers already left.
 *
 * Reviews were saved onto the order but never rolled up, so all 113 restaurants sat at 0
 * while hundreds of customers had rated. The home page papered over it by falling back to a
 * fabricated 4.5.
 *
 * Safe to re-run: each restaurant is recomputed from its orders rather than incremented.
 *
 * Usage, from backend/:
 *   node --env-file=.env scripts/backfill-restaurant-ratings.js          # dry run
 *   node --env-file=.env scripts/backfill-restaurant-ratings.js --apply  # write
 */
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

// Average the explicit restaurant score, falling back to the older single rating.
const rows = await db
  .collection("orders")
  .aggregate([
    {
      $match: {
        $or: [
          { "review.restaurantRating": { $gte: 1 } },
          { "review.rating": { $gte: 1 } },
        ],
      },
    },
    {
      $project: {
        restaurantId: 1,
        score: { $ifNull: ["$review.restaurantRating", "$review.rating"] },
      },
    },
    { $match: { score: { $gte: 1, $lte: 5 } } },
    { $group: { _id: "$restaurantId", average: { $avg: "$score" }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ])
  .toArray();

console.log(`${APPLY ? "APPLY" : "DRY RUN"} - ${rows.length} restaurants have ratings\n`);

let updated = 0;
let unresolved = 0;

for (const row of rows) {
  const raw = String(row._id || "").trim();
  if (!raw) continue;

  let restaurant = null;
  if (mongoose.Types.ObjectId.isValid(raw)) {
    restaurant = await db
      .collection("restaurants")
      .findOne({ _id: new mongoose.Types.ObjectId(raw) }, { projection: { name: 1 } });
  }
  if (!restaurant) {
    restaurant = await db
      .collection("restaurants")
      .findOne({ restaurantId: raw }, { projection: { name: 1 } });
  }
  if (!restaurant) {
    unresolved += 1;
    continue;
  }

  const rating = Math.round(row.average * 10) / 10;
  console.log(`  ${String(restaurant.name).slice(0, 32).padEnd(32)} ${rating.toFixed(1)}  (${row.count} ratings)`);

  if (APPLY) {
    await db
      .collection("restaurants")
      .updateOne({ _id: restaurant._id }, { $set: { rating, totalRatings: row.count } });
    updated += 1;
  }
}

if (unresolved) console.log(`\n${unresolved} restaurantId values did not resolve to a restaurant and were skipped`);

if (APPLY) {
  const withRating = await db.collection("restaurants").countDocuments({ rating: { $gt: 0 } });
  console.log(`\nupdated ${updated} restaurants; ${withRating} now have a rating above 0`);
}

await mongoose.disconnect();

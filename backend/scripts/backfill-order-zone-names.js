/**
 * Backfill assignmentInfo.zoneName on orders that have a valid zoneId but no name.
 *
 * Orders created between roughly June 2026 and the fix stored a zoneId without a zoneName
 * whenever the customer's address fell outside every zone polygon and zone resolution fell
 * back to the restaurant's zone. The order was correctly zoned; only the denormalized name
 * was missing, so anything displaying it showed the order as having no zone.
 *
 * The zoneId is authoritative, so the name is simply looked up and filled in. Orders whose
 * zoneId does not resolve to a zone are reported and left alone rather than guessed at.
 *
 * Usage, from backend/:
 *   node --env-file=.env scripts/backfill-order-zone-names.js          # dry run
 *   node --env-file=.env scripts/backfill-order-zone-names.js --apply  # write
 */
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const missingName = {
  "assignmentInfo.zoneId": { $nin: [null, ""] },
  $or: [
    { "assignmentInfo.zoneName": { $exists: false } },
    { "assignmentInfo.zoneName": { $in: [null, ""] } },
  ],
};

const zones = await db.collection("zones").find({}).project({ name: 1, zoneName: 1 }).toArray();
const nameById = new Map(zones.map((z) => [z._id.toString(), z.name || z.zoneName || null]));

const orders = await db
  .collection("orders")
  .find(missingName)
  .project({ orderId: 1, "assignmentInfo.zoneId": 1 })
  .toArray();

console.log(`${APPLY ? "APPLY" : "DRY RUN"} - ${orders.length} orders missing zoneName\n`);

const perZone = new Map();
const unresolved = [];

for (const order of orders) {
  const zoneId = String(order.assignmentInfo?.zoneId || "");
  const name = nameById.get(zoneId);
  if (!name) {
    unresolved.push({ orderId: order.orderId, zoneId });
    continue;
  }
  perZone.set(name, (perZone.get(name) || 0) + 1);
  if (APPLY) {
    await db
      .collection("orders")
      .updateOne({ _id: order._id }, { $set: { "assignmentInfo.zoneName": name } });
  }
}

console.log("would fill:");
[...perZone.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([name, count]) => console.log(`  ${String(count).padStart(4)}  ${name}`));

if (unresolved.length) {
  console.log(`\nunresolved zoneIds (left untouched): ${unresolved.length}`);
  unresolved.slice(0, 10).forEach((u) => console.log(`  ${u.orderId} -> ${u.zoneId}`));
}

const remaining = await db.collection("orders").countDocuments(missingName);
console.log(`\nstill missing after run: ${remaining}`);

await mongoose.disconnect();

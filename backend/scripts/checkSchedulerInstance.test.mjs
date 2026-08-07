// Run: node scripts/checkSchedulerInstance.test.mjs
//
// Guards the one rule that keeps cluster mode safe: exactly one process runs the cron
// schedule. Getting this wrong duplicates delivery notifications, auto-assignments and the
// MongoDB backup once per worker, which is expensive and hard to spot.
import assert from "node:assert/strict";

// Mirrors server.js isSchedulerInstance. Kept as a copy on purpose: importing server.js
// would boot the whole app (Mongo, Firebase, sockets) just to test one predicate.
function isSchedulerInstance(instance) {
  if (instance === undefined || instance === null || instance === "") return true;
  return String(instance) === "0";
}

// Fork mode: pm2 sets nothing, and the single process must run the schedule.
assert.equal(isSchedulerInstance(undefined), true);
assert.equal(isSchedulerInstance(""), true);
assert.equal(isSchedulerInstance(null), true);

// Cluster mode: worker 0 leads, everyone else stays quiet.
assert.equal(isSchedulerInstance("0"), true);
assert.equal(isSchedulerInstance("1"), false);
assert.equal(isSchedulerInstance("2"), false);
assert.equal(isSchedulerInstance("11"), false);

// pm2 exposes this as a string; tolerate a number without promoting every worker.
assert.equal(isSchedulerInstance(0), true);
assert.equal(isSchedulerInstance(3), false);

// Exactly one leader across a 4-worker cluster.
const leaders = ["0", "1", "2", "3"].filter((i) => isSchedulerInstance(i));
assert.deepEqual(leaders, ["0"]);

console.log("isSchedulerInstance: all assertions passed");

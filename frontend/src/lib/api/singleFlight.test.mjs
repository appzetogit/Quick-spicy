// Run: node src/lib/api/singleFlight.test.mjs
//
// The rule this pins: concurrent callers must cause exactly ONE run per key. Two concurrent
// token refreshes make the server treat the second as token reuse and revoke the session,
// which is what logged admins and customers out on their own.
import assert from "node:assert/strict"
import { createSingleFlight } from "./singleFlight.js"

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

// Five simultaneous callers, one actual run, everyone gets the same answer.
let runs = 0
let flight = createSingleFlight(async () => {
  runs += 1
  await tick(20)
  return `token-${runs}`
})

const results = await Promise.all([1, 2, 3, 4, 5].map(() => flight("/auth/refresh-token")))
assert.equal(runs, 1, "concurrent callers must share a single run")
assert.deepEqual(results, Array(5).fill("token-1"), "all callers get the same result")

// Once settled, a later caller starts a fresh run rather than replaying the old result.
const later = await flight("/auth/refresh-token")
assert.equal(runs, 2)
assert.equal(later, "token-2")

// Different keys never share: two modules open in one tab must not swap refreshes.
runs = 0
flight = createSingleFlight(async (key) => {
  runs += 1
  await tick(10)
  return key
})
const [user, admin] = await Promise.all([
  flight("/auth/refresh-token"),
  flight("/admin/auth/refresh-token"),
])
assert.equal(runs, 2, "separate keys run separately")
assert.equal(user, "/auth/refresh-token")
assert.equal(admin, "/admin/auth/refresh-token")

// A failure is shared by everyone waiting, and does not wedge the key forever.
let attempts = 0
flight = createSingleFlight(async () => {
  attempts += 1
  if (attempts === 1) throw new Error("refresh failed")
  return "recovered"
})

const settled = await Promise.allSettled([flight("k"), flight("k"), flight("k")])
assert.equal(attempts, 1, "one failed run is shared, not repeated per caller")
assert.deepEqual(
  settled.map((s) => s.status),
  ["rejected", "rejected", "rejected"],
  "every waiter sees the failure",
)
assert.equal(await flight("k"), "recovered", "the key is usable again after a failure")

// A synchronous throw must reject the shared promise, not escape it.
flight = createSingleFlight(() => {
  throw new Error("sync boom")
})
await assert.rejects(() => flight("k"), /sync boom/)
assert.equal(await createSingleFlight(async () => "ok")("k"), "ok")

console.log("singleFlight: all assertions passed")

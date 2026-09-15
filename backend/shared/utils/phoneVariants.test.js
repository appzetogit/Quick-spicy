// Run: npm test          (from backend/)
//
// Guards the phone-format matching that account lookup depends on. The clients disagree
// about how to write the same number - the customer and delivery apps send
// "+91 9999999999", restaurant auth normalises to "919999999999", and older records hold
// bare ten digits - and lookup compares raw strings. That gave 15 numbers two accounts
// each, 8 of them with orders or wallet money stranded on both sides.
import assert from 'node:assert/strict';
import { phoneVariants, buildPhoneQuery, normalizePhoneNumber } from './phoneUtils.js';

const TEN = '9441599476';

// The format that actually caused the duplicates has to be covered in both directions.
assert.ok(phoneVariants(TEN).includes(`+91 ${TEN}`), 'bare digits must match the spaced form');
assert.ok(phoneVariants(`+91 ${TEN}`).includes(TEN), 'the spaced form must match bare digits');
assert.ok(phoneVariants(`+91 ${TEN}`).includes(`91${TEN}`), 'and the restaurant normalised form');
assert.ok(phoneVariants(`91${TEN}`).includes(`+91 ${TEN}`), 'and back again');

// Whatever was sent is always tried, exactly as given.
for (const input of [TEN, `+91 ${TEN}`, `+91${TEN}`, `91${TEN}`, `+91-${TEN}`, `0${TEN}`]) {
  assert.ok(phoneVariants(input).includes(input), `${input} must include itself`);
  // Every variant is the same human being.
  for (const v of phoneVariants(input)) {
    assert.equal(String(v).replace(/\D/g, '').slice(-10), TEN, `${v} should still be ${TEN}`);
  }
}

// Two spellings of one number must agree on where to look.
const a = new Set(phoneVariants(TEN));
for (const v of phoneVariants(`+91 ${TEN}`)) {
  if (v === `+91 ${TEN}`) continue;
  assert.ok(a.has(v), `${v} should be reachable from the bare form too`);
}

// Different numbers must never collide.
assert.ok(!phoneVariants(TEN).includes('9441599477'));
assert.ok(!new Set(phoneVariants('7223077890')).has(TEN));

// Junk is not a lookup.
assert.deepEqual(phoneVariants(''), []);
assert.deepEqual(phoneVariants(null), []);
assert.equal(buildPhoneQuery(''), null);
assert.equal(buildPhoneQuery(null), null);

// The query shape Mongo gets.
const q = buildPhoneQuery(`+91 ${TEN}`);
assert.ok(Array.isArray(q.$or) && q.$or.length > 1);
assert.ok(q.$or.every((clause) => typeof clause.phone === 'string'));
assert.ok(q.$or.some((clause) => clause.phone === TEN));

// The existing normaliser still behaves as restaurant auth expects.
assert.equal(normalizePhoneNumber(`+91 ${TEN}`), `91${TEN}`);
assert.equal(normalizePhoneNumber(TEN), `91${TEN}`);

console.log('phoneVariants: all assertions passed');

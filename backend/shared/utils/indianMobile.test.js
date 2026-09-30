// Run: npm test          (from backend/)
import assert from 'node:assert/strict';
import { isValidIndianMobile } from './phoneUtils.js';

for (const ok of ['8125633886', '+91 8125633886', '+918125633886', '918125633886', '08125633886', '81256-33886', '6883365218']) {
  assert.equal(isValidIndianMobile(ok), true, ok);
}
// What the jumping caret produced, and other junk.
for (const bad of ['688336521+918', '12345', '5125633886', '81256338861', '+91 812563388', '', null, 'abc']) {
  assert.equal(isValidIndianMobile(bad), false, String(bad));
}
console.log('indianMobile: all assertions passed');

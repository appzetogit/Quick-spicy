/**
 * Self-check for the moderator write restriction in adminRoutes.js.
 *
 * Run: node modules/admin/routes/moderatorAccess.test.js
 *
 * Keep MODERATOR_ALLOWED_WRITES below in sync with adminRoutes.js. If you widen the
 * allowlist there, add a case here proving the new route is intentional - the whole
 * point of the rule is that mutating admin routes are closed to moderators unless
 * someone deliberately opened them.
 */
import assert from 'node:assert/strict';

const MODERATOR_ALLOWED_WRITES = [
  /^\/orders\/[^/]+\/(accept|reject|ready|delivered)$/,
  /^\/profile$/,
  /^\/settings\/change-password$/,
];

const isAllowed = (method, path, role) => {
  if (role !== 'moderator') return true;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  return MODERATOR_ALLOWED_WRITES.some((allowed) => allowed.test(path));
};

// Money and destructive routes must stay closed to moderators.
assert.equal(isAllowed('POST', '/orders/refund/abc123', 'moderator'), false, 'refund');
assert.equal(isAllowed('DELETE', '/restaurants/abc', 'moderator'), false, 'delete restaurant');
assert.equal(isAllowed('PUT', '/business-settings', 'moderator'), false, 'business settings');
assert.equal(isAllowed('POST', '/restaurant-commission', 'moderator'), false, 'commission');
assert.equal(isAllowed('POST', '/delivery-partners/bonus', 'moderator'), false, 'bonus');
assert.equal(isAllowed('DELETE', '/orders/64abc', 'moderator'), false, 'delete order');

// Day-to-day order handling and self-service stay open.
assert.equal(isAllowed('PATCH', '/orders/64abc/accept', 'moderator'), true, 'accept order');
assert.equal(isAllowed('PATCH', '/orders/64abc/delivered', 'moderator'), true, 'mark delivered');
assert.equal(isAllowed('GET', '/orders', 'moderator'), true, 'read orders');
assert.equal(isAllowed('PUT', '/settings/change-password', 'moderator'), true, 'own password');

// admin and super_admin are unaffected by this rule.
assert.equal(isAllowed('POST', '/orders/refund/abc123', 'admin'), true, 'admin refund');
assert.equal(isAllowed('DELETE', '/restaurants/abc', 'super_admin'), true, 'super_admin delete');

console.log('moderator access rules: all checks passed');

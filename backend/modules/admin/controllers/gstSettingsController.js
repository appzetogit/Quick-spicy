import mongoose from 'mongoose';
import Restaurant from '../../restaurant/models/Restaurant.js';
import FeeSettings from '../models/FeeSettings.js';
import AuditLog from '../models/AuditLog.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

/**
 * Admin -> GST Settings.
 *
 * GST is switched on per restaurant. A restaurant with GST on is charged its own rate if
 * one is set, otherwise the platform default rate (FeeSettings.gstRate, edited here too).
 * Restaurants with GST off are charged none. Orders snapshot the rate when placed, so a
 * change here only affects orders placed after it.
 */

const MAX_GST_RATE = 28;
// 15 characters: 2-digit state code, PAN (5 letters, 4 digits, 1 letter), entity number,
// the letter Z, and a check character.
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const isValidGstin = (value) => GSTIN_PATTERN.test(String(value || '').trim().toUpperCase());

const parseRate = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return { value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_GST_RATE) {
    return { error: `GST rate must be between 0 and ${MAX_GST_RATE}` };
  }
  return { value: Math.round(n * 100) / 100 };
};

const activeFeeSettings = () => FeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 });

const adminName = (req) => req.admin?.name || req.user?.name || req.admin?.email || 'Admin';
const adminId = (req) => String(req.admin?._id || req.user?._id || req.user?.id || '');

const toRow = (r) => ({
  id: String(r._id),
  restaurantId: r.restaurantId || null,
  name: r.name || 'Unnamed restaurant',
  zoneName: r.zoneName || null,
  isActive: r.isActive !== false,
  gst: {
    enabled: Boolean(r.gstSettings?.enabled),
    rate: r.gstSettings?.rate ?? null,
    gstin: r.gstSettings?.gstin || '',
    legalName: r.gstSettings?.legalName || '',
    updatedAt: r.gstSettings?.updatedAt || null,
    updatedBy: r.gstSettings?.updatedBy || null,
  },
  // What the restaurant gave at signup, offered as a prefill.
  signupGstin: r.onboarding?.step3?.gst?.gstNumber || '',
  signupLegalName: r.onboarding?.step3?.gst?.legalName || '',
});

/** GET /api/admin/gst/restaurants?search=&filter=all|on|off|missing-gstin&page=&limit= */
export const getRestaurantGstSettings = asyncHandler(async (req, res) => {
  const { search = '', filter = 'all' } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

  const query = { isDemo: { $ne: true } };
  const term = String(search).trim();
  if (term) {
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [{ name: { $regex: safe, $options: 'i' } }, { restaurantId: { $regex: safe, $options: 'i' } }];
  }
  if (filter === 'on') query['gstSettings.enabled'] = true;
  if (filter === 'off') query['gstSettings.enabled'] = { $ne: true };
  if (filter === 'missing-gstin') {
    query['gstSettings.enabled'] = true;
    query['gstSettings.gstin'] = { $in: [null, ''] };
  }

  const [rows, total, enabledCount, fee] = await Promise.all([
    Restaurant.find(query)
      .select('name restaurantId zoneName isActive gstSettings onboarding.step3.gst')
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Restaurant.countDocuments(query),
    Restaurant.countDocuments({ isDemo: { $ne: true }, 'gstSettings.enabled': true }),
    activeFeeSettings().lean(),
  ]);

  return successResponse(res, 200, 'GST settings retrieved', {
    defaultRate: Number(fee?.gstRate ?? 0),
    enabledCount,
    restaurants: rows.map(toRow),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/** PATCH /api/admin/gst/restaurants/:id  { enabled?, rate?, gstin?, legalName? } */
export const updateRestaurantGstSettings = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return errorResponse(res, 400, 'Invalid restaurant id');
  const restaurant = await Restaurant.findById(id).select('name gstSettings').lean();
  if (!restaurant) return errorResponse(res, 404, 'Restaurant not found');

  const before = { ...(restaurant.gstSettings || {}) };
  const next = {
    enabled: Boolean(before.enabled),
    rate: before.rate ?? null,
    gstin: before.gstin || '',
    legalName: before.legalName || '',
  };
  const { enabled, rate, gstin, legalName } = req.body || {};

  if (enabled !== undefined) next.enabled = Boolean(enabled);
  if (rate !== undefined) {
    const parsed = parseRate(rate);
    if (parsed.error) return errorResponse(res, 400, parsed.error);
    next.rate = parsed.value;
  }
  if (gstin !== undefined) {
    const cleaned = String(gstin || '').trim().toUpperCase();
    if (cleaned && !isValidGstin(cleaned)) {
      return errorResponse(res, 400, 'GST number must be a valid 15-character GSTIN (e.g. 37ABCDE1234F1Z5)');
    }
    next.gstin = cleaned;
  }
  if (legalName !== undefined) next.legalName = String(legalName || '').trim().slice(0, 200);

  // Only the GST fields are written. Saving the whole document re-validated unrelated
  // fields, so a restaurant with an incomplete legacy profile (no owner name, say) could
  // never have its GST changed.
  await Restaurant.updateOne(
    { _id: restaurant._id },
    { $set: { gstSettings: { ...next, updatedAt: new Date(), updatedBy: adminName(req) } } },
    { runValidators: true },
  );
  const saved = await Restaurant.findById(restaurant._id)
    .select('name restaurantId zoneName isActive gstSettings onboarding.step3.gst')
    .lean();

  await AuditLog.createLog({
    entityType: 'restaurant',
    entityId: restaurant._id,
    action: 'gst_settings_update',
    actionType: 'update',
    performedBy: { type: 'admin', userId: adminId(req) || undefined, name: adminName(req) },
    description: `GST for ${restaurant.name}: ${before.enabled ? 'on' : 'off'} -> ${next.enabled ? 'on' : 'off'}, rate ${before.rate ?? 'default'} -> ${next.rate ?? 'default'}, GSTIN ${before.gstin || '-'} -> ${next.gstin || '-'}`,
  });

  const fee = await activeFeeSettings().lean();
  return successResponse(res, 200, 'GST settings updated', {
    restaurant: toRow(saved),
    defaultRate: Number(fee?.gstRate ?? 0),
  });
});

/** POST /api/admin/gst/restaurants/bulk  { ids: [...], enabled: true|false } */
export const bulkUpdateRestaurantGst = asyncHandler(async (req, res) => {
  const { ids, enabled } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return errorResponse(res, 400, 'Select at least one restaurant');
  if (typeof enabled !== 'boolean') return errorResponse(res, 400, 'enabled must be true or false');
  const validIds = ids.filter((x) => mongoose.Types.ObjectId.isValid(x)).slice(0, 500);

  const result = await Restaurant.updateMany(
    { _id: { $in: validIds }, isDemo: { $ne: true } },
    { $set: { 'gstSettings.enabled': enabled, 'gstSettings.updatedAt': new Date(), 'gstSettings.updatedBy': adminName(req) } },
  );

  await AuditLog.createLog({
    entityType: 'restaurant',
    entityId: new mongoose.Types.ObjectId(validIds[0]),
    action: 'gst_settings_bulk_update',
    actionType: 'update',
    performedBy: { type: 'admin', userId: adminId(req) || undefined, name: adminName(req) },
    description: `GST switched ${enabled ? 'on' : 'off'} for ${result.modifiedCount} restaurant(s): ${validIds.join(', ')}`,
  });

  return successResponse(res, 200, `GST ${enabled ? 'enabled' : 'disabled'} for ${result.modifiedCount} restaurant(s)`, {
    modified: result.modifiedCount,
  });
});

/** PUT /api/admin/gst/default-rate  { rate } - the rate used by restaurants with GST on and no rate of their own. */
export const updateDefaultGstRate = asyncHandler(async (req, res) => {
  const parsed = parseRate(req.body?.rate);
  if (parsed.error || parsed.value === null) return errorResponse(res, 400, parsed.error || 'Enter a GST rate');
  const fee = await activeFeeSettings();
  if (!fee) return errorResponse(res, 404, 'No active fee settings found. Save the fee settings page first.');
  const previous = fee.gstRate;
  fee.gstRate = parsed.value;
  await fee.save();

  await AuditLog.createLog({
    entityType: 'commission',
    entityId: fee._id,
    action: 'default_gst_rate_update',
    actionType: 'update',
    performedBy: { type: 'admin', userId: adminId(req) || undefined, name: adminName(req) },
    description: `Default GST rate ${previous}% -> ${parsed.value}%`,
  });

  return successResponse(res, 200, 'Default GST rate updated', { defaultRate: parsed.value });
});

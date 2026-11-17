import FeeSettings from '../models/FeeSettings.js';
import ZoneFeeRule from '../models/ZoneFeeRule.js';
import Zone from '../models/Zone.js';
import mongoose from 'mongoose';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const DEFAULT_FEE_SETTINGS = {
  deliveryFee: 25,
  deliveryBaseDistanceKm: 2.5,
  deliveryFeePerKm: 6,
  freeDeliveryThreshold: 149,
  platformFee: 5,
  gstRate: 5,
};

const validateFeeSettingsPayload = ({
  deliveryFee,
  deliveryBaseDistanceKm,
  deliveryFeePerKm,
  platformFee,
  gstRate,
}) => {
  if (deliveryFee !== undefined && Number(deliveryFee) < 0) {
    return 'Delivery fee must be a positive number';
  }

  if (deliveryBaseDistanceKm !== undefined && Number(deliveryBaseDistanceKm) < 0) {
    return 'Base delivery distance must be a positive number';
  }

  if (deliveryFeePerKm !== undefined && Number(deliveryFeePerKm) < 0) {
    return 'Additional delivery fee per KM must be a positive number';
  }

  if (platformFee === undefined || Number(platformFee) < 0) {
    return 'Platform fee must be a positive number';
  }

  if (gstRate === undefined || Number(gstRate) < 0 || Number(gstRate) > 100) {
    return 'GST rate must be between 0 and 100';
  }

  return null;
};

/**
 * Get current fee settings
 * GET /api/admin/fee-settings
 */
export const getFeeSettings = asyncHandler(async (req, res) => {
  try {
    let feeSettings = await FeeSettings.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();

    if (!feeSettings) {
      const defaultSettings = new FeeSettings({
        ...DEFAULT_FEE_SETTINGS,
        isActive: true,
        createdBy: req.admin?._id || null,
      });

      await defaultSettings.save();
      feeSettings = defaultSettings.toObject();
    }

    return successResponse(res, 200, 'Fee settings retrieved successfully', {
      feeSettings,
    });
  } catch (error) {
    logger.error(`Error fetching fee settings: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch fee settings');
  }
});

/**
 * Create or update fee settings
 * POST /api/admin/fee-settings
 */
export const createOrUpdateFeeSettings = asyncHandler(async (req, res) => {
  try {
    const {
      deliveryFee,
      deliveryBaseDistanceKm,
      deliveryFeePerKm,
      freeDeliveryThreshold,
      platformFee,
      gstRate,
      isActive
    } = req.body;

    const validationError = validateFeeSettingsPayload({
      deliveryFee,
      deliveryBaseDistanceKm,
      deliveryFeePerKm,
      platformFee,
      gstRate,
    });

    if (validationError) {
      return errorResponse(res, 400, validationError);
    }

    if (isActive !== false) {
      await FeeSettings.updateMany(
        { isActive: true },
        { isActive: false, updatedBy: req.admin?._id || null }
      );
    }

    const feeSettings = new FeeSettings({
      deliveryFee: deliveryFee !== undefined ? Number(deliveryFee) : DEFAULT_FEE_SETTINGS.deliveryFee,
      deliveryBaseDistanceKm: deliveryBaseDistanceKm !== undefined
        ? Number(deliveryBaseDistanceKm)
        : DEFAULT_FEE_SETTINGS.deliveryBaseDistanceKm,
      deliveryFeePerKm: deliveryFeePerKm !== undefined
        ? Number(deliveryFeePerKm)
        : DEFAULT_FEE_SETTINGS.deliveryFeePerKm,
      freeDeliveryThreshold: freeDeliveryThreshold !== undefined
        ? Number(freeDeliveryThreshold)
        : DEFAULT_FEE_SETTINGS.freeDeliveryThreshold,
      platformFee: Number(platformFee),
      gstRate: Number(gstRate),
      isActive: isActive !== false,
      createdBy: req.admin?._id || null,
      updatedBy: req.admin?._id || null,
    });

    await feeSettings.save();

    return successResponse(res, 201, 'Fee settings created successfully', {
      feeSettings,
    });
  } catch (error) {
    logger.error(`Error creating fee settings: ${error.message}`);
    return errorResponse(res, 500, 'Failed to create fee settings');
  }
});

/**
 * Update fee settings
 * PUT /api/admin/fee-settings/:id
 */
export const updateFeeSettings = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const {
      deliveryFee,
      deliveryBaseDistanceKm,
      deliveryFeePerKm,
      freeDeliveryThreshold,
      platformFee,
      gstRate,
      isActive
    } = req.body;

    const feeSettings = await FeeSettings.findById(id);

    if (!feeSettings) {
      return errorResponse(res, 404, 'Fee settings not found');
    }

    const validationError = validateFeeSettingsPayload({
      deliveryFee: deliveryFee ?? feeSettings.deliveryFee,
      deliveryBaseDistanceKm: deliveryBaseDistanceKm ?? feeSettings.deliveryBaseDistanceKm,
      deliveryFeePerKm: deliveryFeePerKm ?? feeSettings.deliveryFeePerKm,
      platformFee: platformFee ?? feeSettings.platformFee,
      gstRate: gstRate ?? feeSettings.gstRate,
    });

    if (validationError) {
      return errorResponse(res, 400, validationError);
    }

    if (isActive === true && !feeSettings.isActive) {
      await FeeSettings.updateMany(
        { _id: { $ne: id }, isActive: true },
        { isActive: false, updatedBy: req.admin?._id || null }
      );
    }

    if (deliveryFee !== undefined) {
      feeSettings.deliveryFee = Number(deliveryFee);
    }

    if (deliveryBaseDistanceKm !== undefined) {
      feeSettings.deliveryBaseDistanceKm = Number(deliveryBaseDistanceKm);
    }

    if (deliveryFeePerKm !== undefined) {
      feeSettings.deliveryFeePerKm = Number(deliveryFeePerKm);
    }

    if (freeDeliveryThreshold !== undefined) {
      feeSettings.freeDeliveryThreshold = Number(freeDeliveryThreshold);
    }

    if (platformFee !== undefined) {
      feeSettings.platformFee = Number(platformFee);
    }

    if (gstRate !== undefined) {
      feeSettings.gstRate = Number(gstRate);
    }

    if (isActive !== undefined) {
      feeSettings.isActive = isActive;
    }

    feeSettings.updatedBy = req.admin?._id || null;

    await feeSettings.save();

    return successResponse(res, 200, 'Fee settings updated successfully', {
      feeSettings,
    });
  } catch (error) {
    logger.error(`Error updating fee settings: ${error.message}`);
    return errorResponse(res, 500, 'Failed to update fee settings');
  }
});

/**
 * Get all fee settings history
 * GET /api/admin/fee-settings/history
 */
export const getFeeSettingsHistory = asyncHandler(async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const feeSettings = await FeeSettings.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .skip(parseInt(offset, 10))
      .lean();

    const total = await FeeSettings.countDocuments();

    return successResponse(res, 200, 'Fee settings history retrieved successfully', {
      feeSettings,
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  } catch (error) {
    logger.error(`Error fetching fee settings history: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch fee settings history');
  }
});

/**
 * Get public fee settings (for user frontend)
 * GET /api/admin/fee-settings/public
 */
export const getPublicFeeSettings = asyncHandler(async (req, res) => {
  try {
    const feeSettings = await FeeSettings.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .select('deliveryFee deliveryBaseDistanceKm deliveryFeePerKm freeDeliveryThreshold platformFee gstRate')
      .lean();

    if (!feeSettings) {
      return successResponse(res, 200, 'Fee settings retrieved successfully', {
        feeSettings: DEFAULT_FEE_SETTINGS,
      });
    }

    return successResponse(res, 200, 'Fee settings retrieved successfully', {
      feeSettings,
    });
  } catch (error) {
    logger.error(`Error fetching public fee settings: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch fee settings');
  }
});

// ---------------------------------------------------------------------------------------
// Zone delivery-fee rules (Admin -> Delivery & Platform Fee -> zone filter)
// ---------------------------------------------------------------------------------------

const optionalNonNegative = (value, label) => {
  if (value === undefined || value === null || String(value).trim() === '') return { value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return { error: `${label} must be 0 or more` };
  return { value: n };
};

const zoneRuleRow = (zone, rule) => ({
  zoneId: String(zone._id),
  zoneName: zone.name || zone.zoneName || 'Unnamed zone',
  isActive: zone.isActive !== false,
  rule: rule
    ? {
        freeDelivery: Boolean(rule.freeDelivery),
        deliveryFee: rule.deliveryFee ?? null,
        deliveryBaseDistanceKm: rule.deliveryBaseDistanceKm ?? null,
        deliveryFeePerKm: rule.deliveryFeePerKm ?? null,
        updatedAt: rule.updatedAt || null,
        updatedBy: rule.updatedBy || null,
      }
    : null,
});

/**
 * Every zone with its delivery rule (null = uses the platform-wide charges).
 * GET /api/admin/fee-settings/zones
 */
export const getZoneFeeRules = asyncHandler(async (req, res) => {
  const [zones, rules] = await Promise.all([
    Zone.find({}).select('name zoneName isActive').sort({ name: 1 }).lean(),
    ZoneFeeRule.find({}).lean(),
  ]);
  const byZone = new Map(rules.map((r) => [String(r.zoneId), r]));
  return successResponse(res, 200, 'Zone delivery rules retrieved', {
    zones: zones.map((z) => zoneRuleRow(z, byZone.get(String(z._id)))),
  });
});

/**
 * Set the same delivery rule on one or more zones.
 * PUT /api/admin/fee-settings/zones
 * { zoneIds: [...], freeDelivery: bool, deliveryFee?, deliveryBaseDistanceKm?, deliveryFeePerKm? }
 */
export const upsertZoneFeeRules = asyncHandler(async (req, res) => {
  const { zoneIds, freeDelivery } = req.body || {};
  if (!Array.isArray(zoneIds) || zoneIds.length === 0) {
    return errorResponse(res, 400, 'Select at least one zone');
  }
  const validIds = [...new Set(zoneIds.map(String))].filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validIds.length === 0) return errorResponse(res, 400, 'No valid zones selected');

  const fee = optionalNonNegative(req.body.deliveryFee, 'Fixed delivery charge');
  const base = optionalNonNegative(req.body.deliveryBaseDistanceKm, 'Base distance');
  const perKm = optionalNonNegative(req.body.deliveryFeePerKm, 'Fee per extra KM');
  const bad = fee.error || base.error || perKm.error;
  if (bad) return errorResponse(res, 400, bad);

  const isFree = Boolean(freeDelivery);
  if (!isFree && fee.value === null && base.value === null && perKm.value === null) {
    return errorResponse(res, 400, 'Turn on free delivery or enter at least one custom charge');
  }

  const zones = await Zone.find({ _id: { $in: validIds } }).select('name zoneName').lean();
  if (zones.length === 0) return errorResponse(res, 404, 'Zones not found');
  const who = req.admin?.name || req.admin?.email || String(req.admin?._id || 'admin');

  await Promise.all(zones.map((zone) => ZoneFeeRule.updateOne(
    { zoneId: zone._id },
    {
      $set: {
        zoneName: zone.name || zone.zoneName || '',
        freeDelivery: isFree,
        deliveryFee: isFree ? null : fee.value,
        deliveryBaseDistanceKm: isFree ? null : base.value,
        deliveryFeePerKm: isFree ? null : perKm.value,
        updatedBy: who,
      },
    },
    { upsert: true },
  )));

  logger.info(`Zone delivery rule set by ${who}: ${isFree ? 'FREE delivery' : `fee=${fee.value} base=${base.value} perKm=${perKm.value}`} for ${zones.map((z) => z.name || z.zoneName).join(', ')}`);
  return successResponse(res, 200, `Delivery rule saved for ${zones.length} zone(s)`, { updated: zones.length });
});

/**
 * Remove a zone's rule, returning it to the platform-wide charges.
 * DELETE /api/admin/fee-settings/zones/:zoneId
 */
export const deleteZoneFeeRule = asyncHandler(async (req, res) => {
  const { zoneId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(zoneId)) return errorResponse(res, 400, 'Invalid zone');
  const result = await ZoneFeeRule.deleteOne({ zoneId });
  const who = req.admin?.name || req.admin?.email || String(req.admin?._id || 'admin');
  logger.info(`Zone delivery rule removed by ${who} for zone ${zoneId}`);
  return successResponse(res, 200, result.deletedCount ? 'Zone now uses the default charges' : 'Zone already uses the default charges', {});
});

import FeeSettings from '../models/FeeSettings.js';
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

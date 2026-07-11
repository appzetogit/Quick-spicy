import AdminCategoryManagement from '../models/AdminCategoryManagement.js';
import Menu from '../../restaurant/models/Menu.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Zone from '../models/Zone.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { uploadToCloudinary } from '../../../shared/utils/cloudinaryService.js';
import { escapeRegex } from '../../../shared/utils/regex.js';
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

const ALLOWED_CATEGORY_TYPES = new Set(['Starters', 'Main course', 'Desserts', 'Beverages', 'Varieties']);
const normalizeCategoryType = (value) => {
  const trimmed = String(value || '').trim();
  return ALLOWED_CATEGORY_TYPES.has(trimmed) ? trimmed : undefined;
};

function isPointInZone(lat, lng, zoneCoordinates) {
  let isInside = false;
  for (let i = 0, j = zoneCoordinates.length - 1; i < zoneCoordinates.length; j = i++) {
    const xi = zoneCoordinates[i].latitude || zoneCoordinates[i][1];
    const yi = zoneCoordinates[i].longitude || zoneCoordinates[i][0];
    const xj = zoneCoordinates[j].latitude || zoneCoordinates[j][1];
    const yj = zoneCoordinates[j].longitude || zoneCoordinates[j][0];
    const intersect = ((yi > lng) !== (yj > lng))
        && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

function calculateZoneArea(coordinates) {
  let area = 0;
  for (let i = 0; i < coordinates.length; i++) {
    const j = (i + 1) % coordinates.length;
    const xi = coordinates[i].latitude || coordinates[i][1] || 0;
    const yi = coordinates[i].longitude || coordinates[i][0] || 0;
    const xj = coordinates[j].latitude || coordinates[j][1] || 0;
    const yj = coordinates[j].longitude || coordinates[j][0] || 0;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area / 2);
}

function getRestaurantZoneId(restaurantLat, restaurantLng, activeZones) {
  if (restaurantLat === null || restaurantLng === null || !Array.isArray(activeZones)) {
    return null;
  }
  let bestZoneId = null;
  let bestArea = Infinity;
  for (const zone of activeZones) {
    if (!zone.coordinates || zone.coordinates.length < 3) continue;
    let isInZone = isPointInZone(restaurantLat, restaurantLng, zone.coordinates);
    if (isInZone) {
      const area = calculateZoneArea(zone.coordinates);
      if (area < bestArea) {
        bestArea = area;
        bestZoneId = zone._id.toString();
      }
    }
  }
  return bestZoneId;
}

function getExplicitRestaurantZoneId(restaurant, activeZones) {
  if (!restaurant || !Array.isArray(activeZones)) return null;
  const explicitZoneId = restaurant?.zoneId?.toString?.() || String(restaurant?.zoneId || '');
  if (explicitZoneId) {
    const explicitZone = activeZones.find((zone) => {
      const zoneId = zone?._id?.toString?.() || String(zone?._id || '');
      return zoneId && zoneId === explicitZoneId;
    });
    if (explicitZone) return explicitZoneId;
  }
  const restaurantMongoId = restaurant?._id?.toString?.() || String(restaurant?._id || '');
  const restaurantPublicId = restaurant?.restaurantId ? String(restaurant.restaurantId) : null;
  for (const zone of activeZones) {
    const zoneRestaurantId = zone?.restaurantId?.toString?.() || String(zone?.restaurantId || '');
    if (!zoneRestaurantId) continue;
    if (restaurantMongoId && zoneRestaurantId === restaurantMongoId) {
      return zone._id.toString();
    }
    if (restaurantPublicId && zoneRestaurantId === restaurantPublicId) {
      return zone._id.toString();
    }
  }
  return null;
}

function resolveRestaurantZoneId(restaurant, restaurantLat, restaurantLng, activeZones) {
  const explicitZoneId = getExplicitRestaurantZoneId(restaurant, activeZones);
  if (explicitZoneId) return explicitZoneId;
  return getRestaurantZoneId(restaurantLat, restaurantLng, activeZones);
}

function resolveRestaurantZoneInfo(restaurant, activeZones) {
  const { lat, lng } = extractRestaurantCoordinates(restaurant);
  const restaurantZoneId = activeZones.length > 0
    ? resolveRestaurantZoneId(restaurant, lat, lng, activeZones)
    : null;
  return {
    lat,
    lng,
    restaurantZoneId,
    hasCoordinates: lat !== null && lng !== null,
  };
}

function extractRestaurantCoordinates(locationOrRestaurant = {}) {
  const location = locationOrRestaurant?.location || locationOrRestaurant?.onboarding?.step1?.location || locationOrRestaurant || {};
  const lat = location?.latitude
    ?? (Array.isArray(location?.coordinates) ? location.coordinates[1] : null);
  const lng = location?.longitude
    ?? (Array.isArray(location?.coordinates) ? location.coordinates[0] : null);
  if (
    lat === null ||
    lng === null ||
    Number.isNaN(Number(lat)) ||
    Number.isNaN(Number(lng)) ||
    (Number(lat) === 0 && Number(lng) === 0)
  ) {
    return { lat: null, lng: null };
  }
  return { lat: Number(lat), lng: Number(lng) };
}

/**
 * Get All Categories (Public - for user frontend)
 * GET /api/categories/public
 */
export const getPublicCategories = asyncHandler(async (req, res) => {
  try {
    const { zoneId, vegMode } = req.query;
    const isVegMode = vegMode === 'true';

    const categories = await AdminCategoryManagement.find({ status: true })
      .select('name image _id type showOnHome')
      .lean();

    const adminCategoryMap = new Map(
      categories.map((category) => [String(category.name || '').trim().toLowerCase(), category])
    );

    // Build query for menus
    const menuQuery = { isActive: true };

    if (zoneId || isVegMode) {
      const restaurantQueryObj = { isActive: true };
      if (zoneId) {
        restaurantQueryObj.$or = [
          { zoneId: zoneId },
          { zoneId: { $in: [null, undefined] } }
        ];
      }
      if (isVegMode) {
        restaurantQueryObj.foodPreference = 'pure-veg';
      }

      const activeZones = zoneId
        ? await Zone.find({ isActive: true }).select('_id coordinates restaurantId').lean()
        : [];

      let restaurants = await Restaurant.find(restaurantQueryObj)
        .select('_id zoneId location onboarding.step1.location')
        .lean();

      if (zoneId) {
        restaurants = restaurants.filter((restaurant) => {
          const { restaurantZoneId, hasCoordinates } = resolveRestaurantZoneInfo(
            restaurant,
            activeZones,
          );
          if (!hasCoordinates && !restaurantZoneId) {
            return false;
          }
          return restaurantZoneId === zoneId;
        });
      }

      menuQuery.restaurant = { $in: restaurants.map(r => r._id) };
    }

    const menus = await Menu.find(menuQuery)
      .select('sections.name sections.items.image sections.subsections.name sections.subsections.items.image')
      .lean();

    const menuCategoryMap = new Map();
    for (const menu of menus) {
      const sections = Array.isArray(menu?.sections) ? menu.sections : [];
      for (const section of sections) {
        const name = String(section?.name || '').trim();
        if (!name) continue;

        const key = name.toLowerCase();
        if (!menuCategoryMap.has(key)) {
          const directImage = Array.isArray(section?.items)
            ? section.items.find((item) => item?.image)?.image
            : '';
          const nestedImage = Array.isArray(section?.subsections)
            ? section.subsections
              .flatMap((subsection) => (Array.isArray(subsection?.items) ? subsection.items : []))
              .find((item) => item?.image)?.image
            : '';

          menuCategoryMap.set(key, {
            id: key,
            name,
            image: directImage || nestedImage || '',
            type: 'Menu Section',
          });
        }
      }
    }

    const formattedCategoryMap = new Map();

    for (const [key, category] of menuCategoryMap.entries()) {
      const adminCategory = adminCategoryMap.get(key);
      if (adminCategory && adminCategory.showOnHome === false) continue;

      formattedCategoryMap.set(key, {
        id: adminCategory?._id?.toString() || category.id,
        name: adminCategory?.name || category.name,
        image: adminCategory?.image || category.image,
        type: adminCategory?.type || category.type || null,
        slug: (adminCategory?.name || category.name).toLowerCase().replace(/\s+/g, '-'),
      });
    }

    for (const category of categories) {
      const key = String(category.name || '').trim().toLowerCase();
      if (!key || category.showOnHome === false || formattedCategoryMap.has(key)) continue;

      formattedCategoryMap.set(key, {
        id: category._id.toString(),
        name: category.name,
        image: category.image,
        type: category.type || null,
        slug: category.name.toLowerCase().replace(/\s+/g, '-'),
      });
    }

    const formattedCategories = Array.from(formattedCategoryMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));

    return successResponse(res, 200, 'Categories retrieved successfully', {
      categories: formattedCategories
    });
  } catch (error) {
    logger.error(`Error fetching public categories: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch categories');
  }
});

/**
 * Get All Categories (Admin)
 * GET /api/admin/categories
 */
export const getCategories = asyncHandler(async (req, res) => {
  try {
    const { limit = 100, offset = 0, search, priority, status } = req.query;

    // Build query
    const query = {};

    // Search filter
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { description: { $regex: safeSearch, $options: 'i' } },
        { type: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    // Priority filter
    if (priority) {
      query.priority = priority;
    }

    // Status filter
    if (status !== undefined) {
      query.status = status === 'true' || status === true;
    }

    // Get categories
    const categories = await AdminCategoryManagement.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    // Add serial numbers
    const categoriesWithSl = categories.map((category, index) => ({
      ...category,
      sl: parseInt(offset) + index + 1,
      id: category._id.toString(),
    }));

    const total = await AdminCategoryManagement.countDocuments(query);

    return successResponse(res, 200, 'Categories retrieved successfully', {
      categories: categoriesWithSl,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error(`Error fetching categories: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch categories');
  }
});

/**
 * Get Category by ID
 * GET /api/admin/categories/:id
 */
export const getCategoryById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const category = await AdminCategoryManagement.findById(id).lean();

    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    return successResponse(res, 200, 'Category retrieved successfully', {
      category: {
        ...category,
        id: category._id.toString()
      }
    });
  } catch (error) {
    logger.error(`Error fetching category: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch category');
  }
});

/**
 * Create Category
 * POST /api/admin/categories
 */
export const createCategory = asyncHandler(async (req, res) => {
  try {
    const { name, image, status, type, showOnHome } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return errorResponse(res, 400, 'Category name is required');
    }

    // Check if category with same name already exists
    const existingCategory = await AdminCategoryManagement.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(name.trim())}$`, 'i') }
    });

    if (existingCategory) {
      return errorResponse(res, 400, 'Category with this name already exists');
    }

    let imageUrl = 'https://via.placeholder.com/40';

    // Handle image upload if file is provided (priority: file > URL string)
    if (req.file) {
      try {
        const folder = 'appzeto/admin/categories';
        const result = await uploadToCloudinary(req.file.buffer, {
          folder,
          resource_type: 'image',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'auto' },
            { quality: 'auto' }
          ]
        });
        imageUrl = result.secure_url;
        logger.info(`Image uploaded to Cloudinary: ${imageUrl}`);
      } catch (uploadError) {
        logger.error(`Error uploading image: ${uploadError.message}`);
        return errorResponse(res, 500, 'Failed to upload image');
      }
    } else if (image && typeof image === 'string' && image.trim() !== '') {
      // Use provided image URL if no file is uploaded
      imageUrl = image.trim();
    }

    // Create new category
    const categoryData = {
      name: name.trim(),
      image: imageUrl,
      type: normalizeCategoryType(type),
      priority: 'Normal', // Default priority
      status: status !== undefined ? status : true,
      showOnHome: showOnHome !== undefined ? showOnHome === 'true' || showOnHome === true : true,
      description: '',
      createdBy: req.user._id,
      updatedBy: req.user._id,
    };

    const category = await AdminCategoryManagement.create(categoryData);

    logger.info(`Category created: ${category._id}`, {
      name: category.name,
      createdBy: req.user._id
    });

    return successResponse(res, 201, 'Category created successfully', {
      category: {
        ...category.toObject(),
        id: category._id.toString()
      }
    });
  } catch (error) {
    logger.error(`Error creating category: ${error.message}`);
    
    if (error.code === 11000) {
      return errorResponse(res, 400, 'Category with this name already exists');
    }
    
    return errorResponse(res, 500, 'Failed to create category');
  }
});

/**
 * Update Category
 * PUT /api/admin/categories/:id
 */
export const updateCategory = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, image, status, type, showOnHome } = req.body;

    const category = await AdminCategoryManagement.findById(id);

    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    // Check if name is being changed and if it conflicts with existing category
    if (name && name.trim() !== category.name) {
      const existingCategory = await AdminCategoryManagement.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(name.trim())}$`, 'i') },
        _id: { $ne: id }
      });

      if (existingCategory) {
        return errorResponse(res, 400, 'Category with this name already exists');
      }
    }

    // Handle image upload if file is provided (priority: file > existing image > URL string)
    let imageUrl = category.image; // Keep existing image by default
    
    if (req.file) {
      try {
        const folder = 'appzeto/admin/categories';
        const result = await uploadToCloudinary(req.file.buffer, {
          folder,
          resource_type: 'image',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'auto' },
            { quality: 'auto' }
          ]
        });
        imageUrl = result.secure_url;
        logger.info(`Image uploaded to Cloudinary: ${imageUrl}`);
      } catch (uploadError) {
        logger.error(`Error uploading image: ${uploadError.message}`);
        return errorResponse(res, 500, 'Failed to upload image');
      }
    } else if (image && typeof image === 'string' && image.trim() !== '') {
      // Use provided image URL if no file is uploaded
      imageUrl = image.trim();
    }

    // Update fields
    if (name !== undefined) category.name = name.trim();
    if (imageUrl !== undefined) category.image = imageUrl;
    if (type !== undefined) category.type = normalizeCategoryType(type);
    if (status !== undefined) category.status = status;
    if (showOnHome !== undefined) category.showOnHome = showOnHome === 'true' || showOnHome === true;
    category.updatedBy = req.user._id;

    await category.save();

    logger.info(`Category updated: ${id}`, {
      updatedBy: req.user._id
    });

    return successResponse(res, 200, 'Category updated successfully', {
      category: {
        ...category.toObject(),
        id: category._id.toString()
      }
    });
  } catch (error) {
    logger.error(`Error updating category: ${error.message}`);
    
    if (error.code === 11000) {
      return errorResponse(res, 400, 'Category with this name already exists');
    }
    
    return errorResponse(res, 500, 'Failed to update category');
  }
});

/**
 * Delete Category
 * DELETE /api/admin/categories/:id
 */
export const deleteCategory = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const category = await AdminCategoryManagement.findById(id);

    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    await AdminCategoryManagement.deleteOne({ _id: id });

    logger.info(`Category deleted: ${id}`, {
      deletedBy: req.user._id
    });

    return successResponse(res, 200, 'Category deleted successfully');
  } catch (error) {
    logger.error(`Error deleting category: ${error.message}`);
    return errorResponse(res, 500, 'Failed to delete category');
  }
});

/**
 * Toggle Category Status
 * PATCH /api/admin/categories/:id/status
 */
export const toggleCategoryStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const category = await AdminCategoryManagement.findById(id);

    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    category.status = !category.status;
    category.updatedBy = req.user._id;
    await category.save();

    logger.info(`Category status toggled: ${id}`, {
      status: category.status,
      updatedBy: req.user._id
    });

    return successResponse(res, 200, 'Category status updated successfully', {
      category: {
        ...category.toObject(),
        id: category._id.toString()
      }
    });
  } catch (error) {
    logger.error(`Error toggling category status: ${error.message}`);
    return errorResponse(res, 500, 'Failed to update category status');
  }
});

/**
 * Update Category Priority
 * PATCH /api/admin/categories/:id/priority
 */
export const updateCategoryPriority = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    if (!priority || !['High', 'Normal', 'Low'].includes(priority)) {
      return errorResponse(res, 400, 'Valid priority (High, Normal, Low) is required');
    }

    const category = await AdminCategoryManagement.findById(id);

    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    category.priority = priority;
    category.updatedBy = req.user._id;
    await category.save();

    logger.info(`Category priority updated: ${id}`, {
      priority,
      updatedBy: req.user._id
    });

    return successResponse(res, 200, 'Category priority updated successfully', {
      category: {
        ...category.toObject(),
        id: category._id.toString()
      }
    });
  } catch (error) {
    logger.error(`Error updating category priority: ${error.message}`);
    return errorResponse(res, 500, 'Failed to update category priority');
  }
});

/**
 * Toggle category home visibility by name
 * PATCH /api/admin/categories/home-visibility
 */
export const updateCategoryHomeVisibility = asyncHandler(async (req, res) => {
  try {
    const { name, image, type, showOnHome } = req.body;

    if (!name || !String(name).trim()) {
      return errorResponse(res, 400, 'Category name is required');
    }

    const trimmedName = String(name).trim();
    const normalizedShowOnHome = showOnHome === 'true' || showOnHome === true;

    let category = await AdminCategoryManagement.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') }
    });

    if (!category) {
      category = await AdminCategoryManagement.create({
        name: trimmedName,
        image: image && String(image).trim() ? String(image).trim() : '',
        type: normalizeCategoryType(type),
        priority: 'Normal',
        status: true,
        showOnHome: normalizedShowOnHome,
        description: '',
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });
    } else {
      if ((!category.image || category.image === 'https://via.placeholder.com/40') && image && String(image).trim()) {
        category.image = String(image).trim();
      }
      if (!category.type) {
        const normalizedType = normalizeCategoryType(type);
        if (normalizedType) {
          category.type = normalizedType;
        }
      }
      category.showOnHome = normalizedShowOnHome;
      category.updatedBy = req.user._id;
      await category.save();
    }

    return successResponse(res, 200, 'Category visibility updated successfully', {
      category: {
        ...category.toObject(),
        id: category._id.toString(),
      }
    });
  } catch (error) {
    logger.error(`Error updating category home visibility: ${error.message}`);
    return errorResponse(res, 500, 'Failed to update category visibility');
  }
});


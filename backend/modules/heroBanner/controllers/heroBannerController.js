import HeroBanner from '../models/HeroBanner.js';
import LandingPageCategory from '../models/LandingPageCategory.js';
import LandingPageExploreMore from '../models/LandingPageExploreMore.js';
import LandingPageSettings from '../models/LandingPageSettings.js';
import Under250Banner from '../models/Under250Banner.js';
import DiningBanner from '../models/DiningBanner.js';
import Top10Restaurant from '../models/Top10Restaurant.js';
import GourmetRestaurant from '../models/GourmetRestaurant.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { uploadToCloudinary } from '../../../shared/utils/cloudinaryService.js';
import { cloudinary } from '../../../config/cloudinary.js';
import mongoose from 'mongoose';

/**
 * Get all active hero banners (public endpoint)
 */
export const getHeroBanners = async (req, res) => {
  try {
    const banners = await HeroBanner.find({ isActive: true })
      .populate('linkedRestaurants', 'name slug restaurantId profileImage')
      .sort({ order: 1, createdAt: -1 })
      .select('imageUrl order linkedRestaurants')
      .lean();

    return successResponse(res, 200, 'Hero banners retrieved successfully', {
      banners: banners.map(b => ({
        imageUrl: b.imageUrl,
        linkedRestaurants: b.linkedRestaurants || []
      }))
    });
  } catch (error) {
    console.error('Error fetching hero banners:', error);
    return errorResponse(res, 500, 'Failed to fetch hero banners');
  }
};

/**
 * Get all hero banners (admin endpoint)
 */
export const getAllHeroBanners = async (req, res) => {
  try {
    const banners = await HeroBanner.find()
      .populate('linkedRestaurants', 'name slug restaurantId profileImage')
      .sort({ order: 1, createdAt: -1 })
      .lean();

    return successResponse(res, 200, 'Hero banners retrieved successfully', {
      banners
    });
  } catch (error) {
    console.error('Error fetching hero banners:', error);
    return errorResponse(res, 500, 'Failed to fetch hero banners');
  }
};

/**
 * Upload a new hero banner
 */
export const createHeroBanner = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No image file provided');
    }

    // Upload to Cloudinary
    const folder = 'appzeto/hero-banners';
    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: 'image'
    });

    // Get the highest order number
    const lastBanner = await HeroBanner.findOne()
      .sort({ order: -1 })
      .select('order')
      .lean();

    const newOrder = lastBanner ? lastBanner.order + 1 : 0;

    // Create banner record
    const banner = new HeroBanner({
      imageUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      order: newOrder,
      isActive: true
    });

    await banner.save();

    return successResponse(res, 201, 'Hero banner uploaded successfully', {
      banner: {
        _id: banner._id,
        imageUrl: banner.imageUrl,
        order: banner.order,
        isActive: banner.isActive,
        createdAt: banner.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating hero banner:', error);
    return errorResponse(res, 500, 'Failed to upload hero banner');
  }
};

/**
 * Upload multiple hero banners (up to 5)
 */
export const createMultipleHeroBanners = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return errorResponse(res, 400, 'No image files provided');
    }

    // Validate number of files (max 5)
    if (req.files.length > 5) {
      return errorResponse(res, 400, 'Maximum 5 images can be uploaded at once');
    }

    // Get the highest order number
    const lastBanner = await HeroBanner.findOne()
      .sort({ order: -1 })
      .select('order')
      .lean();

    let currentOrder = lastBanner ? lastBanner.order + 1 : 0;

    const folder = 'appzeto/hero-banners';
    const uploadedBanners = [];
    const errors = [];

    // Upload all files
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      try {
        // Upload to Cloudinary
        const result = await uploadToCloudinary(file.buffer, {
          folder,
          resource_type: 'image'
        });

        // Create banner record
        const banner = new HeroBanner({
          imageUrl: result.secure_url,
          cloudinaryPublicId: result.public_id,
          order: currentOrder++,
          isActive: true
        });

        await banner.save();
        uploadedBanners.push({
          _id: banner._id,
          imageUrl: banner.imageUrl,
          order: banner.order,
          isActive: banner.isActive,
          createdAt: banner.createdAt
        });
      } catch (error) {
        console.error(`Error uploading file ${i + 1}:`, error);
        errors.push(`Failed to upload file ${i + 1}: ${error.message}`);
      }
    }

    // If some files failed but others succeeded
    if (errors.length > 0 && uploadedBanners.length > 0) {
      return successResponse(res, 201, `Uploaded ${uploadedBanners.length} banner(s) with some errors`, {
        banners: uploadedBanners,
        errors
      });
    }

    // If all files failed
    if (uploadedBanners.length === 0) {
      return errorResponse(res, 500, 'Failed to upload banners. ' + errors.join(', '));
    }

    // All successful
    return successResponse(res, 201, `${uploadedBanners.length} hero banner(s) uploaded successfully`, {
      banners: uploadedBanners
    });
  } catch (error) {
    console.error('Error creating multiple hero banners:', error);
    return errorResponse(res, 500, 'Failed to upload hero banners');
  }
};

/**
 * Delete a hero banner
 */
export const deleteHeroBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await HeroBanner.findById(id);
    if (!banner) {
      return errorResponse(res, 404, 'Hero banner not found');
    }

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(banner.cloudinaryPublicId);
    } catch (cloudinaryError) {
      console.error('Error deleting from Cloudinary:', cloudinaryError);
      // Continue with database deletion even if Cloudinary deletion fails
    }

    // Delete from database
    await HeroBanner.findByIdAndDelete(id);

    return successResponse(res, 200, 'Hero banner deleted successfully');
  } catch (error) {
    console.error('Error deleting hero banner:', error);
    return errorResponse(res, 500, 'Failed to delete hero banner');
  }
};

/**
 * Update banner order
 */
export const updateBannerOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { order } = req.body;

    if (typeof order !== 'number') {
      return errorResponse(res, 400, 'Order must be a number');
    }

    const banner = await HeroBanner.findByIdAndUpdate(
      id,
      { order, updatedAt: new Date() },
      { new: true }
    );

    if (!banner) {
      return errorResponse(res, 404, 'Hero banner not found');
    }

    return successResponse(res, 200, 'Banner order updated successfully', {
      banner
    });
  } catch (error) {
    console.error('Error updating banner order:', error);
    return errorResponse(res, 500, 'Failed to update banner order');
  }
};

/**
 * Toggle banner active status
 */
export const toggleBannerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await HeroBanner.findById(id);
    if (!banner) {
      return errorResponse(res, 404, 'Hero banner not found');
    }

    banner.isActive = !banner.isActive;
    banner.updatedAt = new Date();
    await banner.save();

    return successResponse(res, 200, 'Banner status updated successfully', {
      banner
    });
  } catch (error) {
    console.error('Error toggling banner status:', error);
    return errorResponse(res, 500, 'Failed to update banner status');
  }
};

/**
 * Link restaurants to a hero banner
 */
export const linkRestaurantsToBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { restaurantIds } = req.body;

    if (!Array.isArray(restaurantIds)) {
      return errorResponse(res, 400, 'restaurantIds must be an array');
    }

    const banner = await HeroBanner.findById(id);
    if (!banner) {
      return errorResponse(res, 404, 'Hero banner not found');
    }

    // Validate all restaurant IDs exist
    const validRestaurantIds = [];
    for (const restaurantId of restaurantIds) {
      if (mongoose.Types.ObjectId.isValid(restaurantId)) {
        const restaurant = await Restaurant.findById(restaurantId);
        if (restaurant) {
          validRestaurantIds.push(new mongoose.Types.ObjectId(restaurantId));
        }
      }
    }

    banner.linkedRestaurants = validRestaurantIds;
    banner.updatedAt = new Date();
    await banner.save();

    // Populate linked restaurants for response
    await banner.populate('linkedRestaurants', 'name slug restaurantId profileImage');

    return successResponse(res, 200, 'Restaurants linked to banner successfully', {
      banner
    });
  } catch (error) {
    console.error('Error linking restaurants to banner:', error);
    return errorResponse(res, 500, 'Failed to link restaurants to banner');
  }
};

// ==================== LANDING PAGE CONFIG (PUBLIC) ====================

/**
 * Get full landing page config (public endpoint)
 */
export const getLandingConfig = async (req, res) => {
  try {
    const [categories, exploreMore, settings] = await Promise.all([
      LandingPageCategory.find({ isActive: true })
        .sort({ order: 1, createdAt: -1 })
        .select('label slug imageUrl order isActive')
        .lean(),
      LandingPageExploreMore.find({ isActive: true })
        .sort({ order: 1, createdAt: -1 })
        .select('label link imageUrl order isActive')
        .lean(),
      LandingPageSettings.getSettings(),
    ]);

    return successResponse(res, 200, 'Landing config retrieved successfully', {
      categories,
      exploreMore,
      settings: {
        exploreMoreHeading: settings.exploreMoreHeading,
      },
    });
  } catch (error) {
    console.error('Error fetching landing config:', error);
    return errorResponse(res, 500, 'Failed to fetch landing config');
  }
};

// ==================== LANDING PAGE CATEGORIES (ADMIN) ====================

/**
 * Get all landing page categories (admin endpoint)
 */
export const getLandingCategories = async (req, res) => {
  try {
    const categories = await LandingPageCategory.find()
      .sort({ order: 1, createdAt: -1 })
      .lean();

    return successResponse(res, 200, 'Categories retrieved successfully', {
      categories
    });
  } catch (error) {
    console.error('Error fetching landing categories:', error);
    return errorResponse(res, 500, 'Failed to fetch landing categories');
  }
};

/**
 * Create a landing page category
 */
export const createLandingCategory = async (req, res) => {
  try {
    const { label } = req.body;
    if (!label) {
      return errorResponse(res, 400, 'Label is required');
    }
    if (!req.file) {
      return errorResponse(res, 400, 'No image file provided');
    }

    // Generate slug from label
    const slug = label.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Upload to Cloudinary
    const folder = 'appzeto/landing/categories';
    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: 'image'
    });

    // Get the highest order number
    const lastCategory = await LandingPageCategory.findOne()
      .sort({ order: -1 })
      .select('order')
      .lean();

    const newOrder = lastCategory ? lastCategory.order + 1 : 0;

    // Create category record
    const category = new LandingPageCategory({
      label,
      slug,
      imageUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      order: newOrder,
      isActive: true
    });

    await category.save();

    return successResponse(res, 201, 'Category created successfully', {
      category: {
        _id: category._id,
        label: category.label,
        imageUrl: category.imageUrl,
        order: category.order,
        isActive: category.isActive,
        createdAt: category.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating landing category:', error);
    return errorResponse(res, 500, 'Failed to create category');
  }
};

/**
 * Delete a landing page category
 */
export const deleteLandingCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await LandingPageCategory.findById(id);
    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(category.cloudinaryPublicId);
    } catch (cloudinaryError) {
      console.error('Error deleting from Cloudinary:', cloudinaryError);
    }

    // Delete from database
    await LandingPageCategory.findByIdAndDelete(id);

    return successResponse(res, 200, 'Category deleted successfully');
  } catch (error) {
    console.error('Error deleting landing category:', error);
    return errorResponse(res, 500, 'Failed to delete category');
  }
};

/**
 * Update category order
 */
export const updateLandingCategoryOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { order } = req.body;

    if (typeof order !== 'number') {
      return errorResponse(res, 400, 'Order must be a number');
    }

    const category = await LandingPageCategory.findByIdAndUpdate(
      id,
      { order, updatedAt: new Date() },
      { new: true }
    );

    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    return successResponse(res, 200, 'Category order updated successfully', {
      category
    });
  } catch (error) {
    console.error('Error updating category order:', error);
    return errorResponse(res, 500, 'Failed to update category order');
  }
};

/**
 * Toggle category active status
 */
export const toggleLandingCategoryStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await LandingPageCategory.findById(id);
    if (!category) {
      return errorResponse(res, 404, 'Category not found');
    }

    category.isActive = !category.isActive;
    category.updatedAt = new Date();
    await category.save();

    return successResponse(res, 200, 'Category status updated successfully', {
      category
    });
  } catch (error) {
    console.error('Error toggling category status:', error);
    return errorResponse(res, 500, 'Failed to update category status');
  }
};

// ==================== LANDING PAGE EXPLORE MORE (ADMIN) ====================

/**
 * Get all explore more items (admin endpoint)
 */
export const getLandingExploreMore = async (req, res) => {
  try {
    const items = await LandingPageExploreMore.find()
      .sort({ order: 1, createdAt: -1 })
      .lean();

    return successResponse(res, 200, 'Explore more items retrieved successfully', {
      items
    });
  } catch (error) {
    console.error('Error fetching explore more items:', error);
    return errorResponse(res, 500, 'Failed to fetch explore more items');
  }
};

/**
 * Create an explore more item
 */
export const createLandingExploreMore = async (req, res) => {
  try {
    const { label, link } = req.body;
    if (!label || !link) {
      return errorResponse(res, 400, 'Label and link are required');
    }
    if (!req.file) {
      return errorResponse(res, 400, 'No image file provided');
    }

    // Upload to Cloudinary
    const folder = 'appzeto/landing/explore-more';
    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: 'image'
    });

    // Get the highest order number
    const lastItem = await LandingPageExploreMore.findOne()
      .sort({ order: -1 })
      .select('order')
      .lean();

    const newOrder = lastItem ? lastItem.order + 1 : 0;

    // Create item record
    const item = new LandingPageExploreMore({
      label,
      link,
      imageUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      order: newOrder,
      isActive: true
    });

    await item.save();

    return successResponse(res, 201, 'Explore more item created successfully', {
      item: {
        _id: item._id,
        label: item.label,
        link: item.link,
        imageUrl: item.imageUrl,
        order: item.order,
        isActive: item.isActive,
        createdAt: item.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating explore more item:', error);
    return errorResponse(res, 500, 'Failed to create explore more item');
  }
};

/**
 * Update explore more item (mainly for icon)
 */
export const updateLandingExploreMore = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, link } = req.body; // Optional updates if needed in future

    const item = await LandingPageExploreMore.findById(id);
    if (!item) {
      return errorResponse(res, 404, 'Explore more item not found');
    }

    if (req.file) {
      // Upload new image
      const folder = 'appzeto/landing/explore-more';
      const result = await uploadToCloudinary(req.file.buffer, {
        folder,
        resource_type: 'image'
      });

      // Delete old image from Cloudinary
      if (item.cloudinaryPublicId) {
        try {
          await cloudinary.uploader.destroy(item.cloudinaryPublicId);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }

      item.imageUrl = result.secure_url;
      item.cloudinaryPublicId = result.public_id;
    }

    if (label) item.label = label;
    if (link) item.link = link;

    item.updatedAt = new Date();
    await item.save();

    return successResponse(res, 200, 'Explore more item updated successfully', {
      item
    });
  } catch (error) {
    console.error('Error updating explore more item:', error);
    return errorResponse(res, 500, 'Failed to update explore more item');
  }
};

/**
 * Delete an explore more item
 */
export const deleteLandingExploreMore = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await LandingPageExploreMore.findById(id);
    if (!item) {
      return errorResponse(res, 404, 'Explore more item not found');
    }

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(item.cloudinaryPublicId);
    } catch (cloudinaryError) {
      console.error('Error deleting from Cloudinary:', cloudinaryError);
    }

    // Delete from database
    await LandingPageExploreMore.findByIdAndDelete(id);

    return successResponse(res, 200, 'Explore more item deleted successfully');
  } catch (error) {
    console.error('Error deleting explore more item:', error);
    return errorResponse(res, 500, 'Failed to delete explore more item');
  }
};

/**
 * Update explore more item order
 */
export const updateLandingExploreMoreOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { order } = req.body;

    if (typeof order !== 'number') {
      return errorResponse(res, 400, 'Order must be a number');
    }

    const item = await LandingPageExploreMore.findByIdAndUpdate(
      id,
      { order, updatedAt: new Date() },
      { new: true }
    );

    if (!item) {
      return errorResponse(res, 404, 'Explore more item not found');
    }

    return successResponse(res, 200, 'Explore more order updated successfully', {
      item
    });
  } catch (error) {
    console.error('Error updating explore more order:', error);
    return errorResponse(res, 500, 'Failed to update explore more order');
  }
};

/**
 * Toggle explore more item active status
 */
export const toggleLandingExploreMoreStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await LandingPageExploreMore.findById(id);
    if (!item) {
      return errorResponse(res, 404, 'Explore more item not found');
    }

    item.isActive = !item.isActive;
    item.updatedAt = new Date();
    await item.save();

    return successResponse(res, 200, 'Explore more status updated successfully', {
      item
    });
  } catch (error) {
    console.error('Error toggling explore more status:', error);
    return errorResponse(res, 500, 'Failed to update explore more status');
  }
};

// ==================== LANDING PAGE SETTINGS (ADMIN) ====================

/**
 * Get landing page settings (admin endpoint)
 */
export const getLandingSettings = async (req, res) => {
  try {
    const settings = await LandingPageSettings.getSettings();

    return successResponse(res, 200, 'Landing settings retrieved successfully', {
      settings: {
        exploreMoreHeading: settings.exploreMoreHeading
      }
    });
  } catch (error) {
    console.error('Error fetching landing settings:', error);
    return errorResponse(res, 500, 'Failed to fetch landing settings');
  }
};

/**
 * Update landing page settings
 */
export const updateLandingSettings = async (req, res) => {
  try {
    const { exploreMoreHeading } = req.body;

    const settings = await LandingPageSettings.getSettings();

    if (typeof exploreMoreHeading === 'string') {
      settings.exploreMoreHeading = exploreMoreHeading;
    }

    await settings.save();

    return successResponse(res, 200, 'Landing settings updated successfully', {
      settings: {
        exploreMoreHeading: settings.exploreMoreHeading
      }
    });
  } catch (error) {
    console.error('Error updating landing settings:', error);
    return errorResponse(res, 500, 'Failed to update landing settings');
  }
};

// ==================== UNDER 250 BANNERS ====================

/**
 * Get all active under 250 banners (public endpoint)
 */
export const getUnder250Banners = async (req, res) => {
  try {
    const banners = await Under250Banner.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .select('imageUrl order')
      .lean();

    return successResponse(res, 200, 'Under 250 banners retrieved successfully', {
      banners: banners.map(b => b.imageUrl)
    });
  } catch (error) {
    console.error('Error fetching under 250 banners:', error);
    return errorResponse(res, 500, 'Failed to fetch under 250 banners');
  }
};

/**
 * Get all under 250 banners (admin endpoint)
 */
export const getAllUnder250Banners = async (req, res) => {
  try {
    const banners = await Under250Banner.find()
      .sort({ order: 1, createdAt: -1 })
      .lean();

    return successResponse(res, 200, 'Under 250 banners retrieved successfully', {
      banners
    });
  } catch (error) {
    console.error('Error fetching under 250 banners:', error);
    return errorResponse(res, 500, 'Failed to fetch under 250 banners');
  }
};

/**
 * Upload a new under 250 banner
 */
export const createUnder250Banner = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No image file provided');
    }

    // Upload to Cloudinary
    const folder = 'appzeto/under-250-banners';
    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: 'image'
    });

    // Get the highest order number
    const lastBanner = await Under250Banner.findOne()
      .sort({ order: -1 })
      .select('order')
      .lean();

    const newOrder = lastBanner ? lastBanner.order + 1 : 0;

    // Create banner record
    const banner = new Under250Banner({
      imageUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      order: newOrder,
      isActive: true
    });

    await banner.save();

    return successResponse(res, 201, 'Under 250 banner uploaded successfully', {
      banner: {
        _id: banner._id,
        imageUrl: banner.imageUrl,
        order: banner.order,
        isActive: banner.isActive,
        createdAt: banner.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating under 250 banner:', error);
    return errorResponse(res, 500, 'Failed to upload under 250 banner');
  }
};

/**
 * Upload multiple under 250 banners (up to 5)
 */
export const createMultipleUnder250Banners = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return errorResponse(res, 400, 'No image files provided');
    }

    // Validate number of files (max 5)
    if (req.files.length > 5) {
      return errorResponse(res, 400, 'Maximum 5 images can be uploaded at once');
    }

    // Get the highest order number
    const lastBanner = await Under250Banner.findOne()
      .sort({ order: -1 })
      .select('order')
      .lean();

    let currentOrder = lastBanner ? lastBanner.order + 1 : 0;

    const folder = 'appzeto/under-250-banners';
    const uploadedBanners = [];
    const errors = [];

    // Upload all files
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      try {
        // Upload to Cloudinary
        const result = await uploadToCloudinary(file.buffer, {
          folder,
          resource_type: 'image'
        });

        // Create banner record
        const banner = new Under250Banner({
          imageUrl: result.secure_url,
          cloudinaryPublicId: result.public_id,
          order: currentOrder++,
          isActive: true
        });

        await banner.save();
        uploadedBanners.push({
          _id: banner._id,
          imageUrl: banner.imageUrl,
          order: banner.order,
          isActive: banner.isActive,
          createdAt: banner.createdAt
        });
      } catch (error) {
        console.error(`Error uploading file ${i + 1}:`, error);
        errors.push(`Failed to upload file ${i + 1}: ${error.message}`);
      }
    }

    // If some files failed but others succeeded
    if (errors.length > 0 && uploadedBanners.length > 0) {
      return successResponse(res, 201, `Uploaded ${uploadedBanners.length} banner(s) with some errors`, {
        banners: uploadedBanners,
        errors
      });
    }

    // If all files failed
    if (uploadedBanners.length === 0) {
      return errorResponse(res, 500, 'Failed to upload banners. ' + errors.join(', '));
    }

    // All successful
    return successResponse(res, 201, `${uploadedBanners.length} under 250 banner(s) uploaded successfully`, {
      banners: uploadedBanners
    });
  } catch (error) {
    console.error('Error creating multiple under 250 banners:', error);
    return errorResponse(res, 500, 'Failed to upload under 250 banners');
  }
};

/**
 * Delete an under 250 banner
 */
export const deleteUnder250Banner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Under250Banner.findById(id);
    if (!banner) {
      return errorResponse(res, 404, 'Under 250 banner not found');
    }

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(banner.cloudinaryPublicId);
    } catch (cloudinaryError) {
      console.error('Error deleting from Cloudinary:', cloudinaryError);
      // Continue with database deletion even if Cloudinary deletion fails
    }

    // Delete from database
    await Under250Banner.findByIdAndDelete(id);

    return successResponse(res, 200, 'Under 250 banner deleted successfully');
  } catch (error) {
    console.error('Error deleting under 250 banner:', error);
    return errorResponse(res, 500, 'Failed to delete under 250 banner');
  }
};

/**
 * Update under 250 banner order
 */
export const updateUnder250BannerOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { order } = req.body;

    if (typeof order !== 'number') {
      return errorResponse(res, 400, 'Order must be a number');
    }

    const banner = await Under250Banner.findByIdAndUpdate(
      id,
      { order, updatedAt: new Date() },
      { new: true }
    );

    if (!banner) {
      return errorResponse(res, 404, 'Under 250 banner not found');
    }

    return successResponse(res, 200, 'Banner order updated successfully', {
      banner
    });
  } catch (error) {
    console.error('Error updating under 250 banner order:', error);
    return errorResponse(res, 500, 'Failed to update banner order');
  }
};

/**
 * Toggle under 250 banner active status
 */
export const toggleUnder250BannerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Under250Banner.findById(id);
    if (!banner) {
      return errorResponse(res, 404, 'Under 250 banner not found');
    }

    banner.isActive = !banner.isActive;
    banner.updatedAt = new Date();
    await banner.save();

    return successResponse(res, 200, 'Banner status updated successfully', {
      banner
    });
  } catch (error) {
    console.error('Error toggling under 250 banner status:', error);
    return errorResponse(res, 500, 'Failed to update banner status');
  }
};


// ==================== DINING BANNERS ====================

/**
 * Get all active dining banners (public endpoint)
 */
export const getDiningBanners = async (req, res) => {
  try {
    const banners = await DiningBanner.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .select('imageUrl order')
      .lean();

    return successResponse(res, 200, 'Dining banners retrieved successfully', {
      banners: banners.map(b => b.imageUrl)
    });
  } catch (error) {
    console.error('Error fetching dining banners:', error);
    return errorResponse(res, 500, 'Failed to fetch dining banners');
  }
};

/**
 * Get all dining banners (admin endpoint)
 */
export const getAllDiningBanners = async (req, res) => {
  try {
    const banners = await DiningBanner.find()
      .sort({ order: 1, createdAt: -1 })
      .lean();

    return successResponse(res, 200, 'Dining banners retrieved successfully', {
      banners
    });
  } catch (error) {
    console.error('Error fetching dining banners:', error);
    return errorResponse(res, 500, 'Failed to fetch dining banners');
  }
};

/**
 * Upload a new dining banner
 */
export const createDiningBanner = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No image file provided');
    }

    // Upload to Cloudinary
    const folder = 'appzeto/dining-banners';
    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: 'image'
    });

    // Get the highest order number
    const lastBanner = await DiningBanner.findOne()
      .sort({ order: -1 })
      .select('order')
      .lean();

    const newOrder = lastBanner ? lastBanner.order + 1 : 0;

    // Create banner record
    const banner = new DiningBanner({
      imageUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      order: newOrder,
      isActive: true
    });

    await banner.save();

    return successResponse(res, 201, 'Dining banner uploaded successfully', {
      banner: {
        _id: banner._id,
        imageUrl: banner.imageUrl,
        order: banner.order,
        isActive: banner.isActive,
        createdAt: banner.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating dining banner:', error);
    return errorResponse(res, 500, 'Failed to upload dining banner');
  }
};

/**
 * Upload multiple dining banners (up to 5)
 */
export const createMultipleDiningBanners = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return errorResponse(res, 400, 'No image files provided');
    }

    // Validate number of files (max 5)
    if (req.files.length > 5) {
      return errorResponse(res, 400, 'Maximum 5 images can be uploaded at once');
    }

    // Get the highest order number
    const lastBanner = await DiningBanner.findOne()
      .sort({ order: -1 })
      .select('order')
      .lean();

    let currentOrder = lastBanner ? lastBanner.order + 1 : 0;

    const folder = 'appzeto/dining-banners';
    const uploadedBanners = [];
    const errors = [];

    // Upload all files
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      try {
        // Upload to Cloudinary
        const result = await uploadToCloudinary(file.buffer, {
          folder,
          resource_type: 'image'
        });

        // Create banner record
        const banner = new DiningBanner({
          imageUrl: result.secure_url,
          cloudinaryPublicId: result.public_id,
          order: currentOrder++,
          isActive: true
        });

        await banner.save();
        uploadedBanners.push({
          _id: banner._id,
          imageUrl: banner.imageUrl,
          order: banner.order,
          isActive: banner.isActive,
          createdAt: banner.createdAt
        });
      } catch (error) {
        console.error(`Error uploading file ${i + 1}:`, error);
        errors.push(`Failed to upload file ${i + 1}: ${error.message}`);
      }
    }

    // If some files failed but others succeeded
    if (errors.length > 0 && uploadedBanners.length > 0) {
      return successResponse(res, 201, `Uploaded ${uploadedBanners.length} dining banner(s) with some errors`, {
        banners: uploadedBanners,
        errors
      });
    }

    // If all files failed
    if (uploadedBanners.length === 0) {
      return errorResponse(res, 500, 'Failed to upload banners. ' + errors.join(', '));
    }

    // All successful
    return successResponse(res, 201, `${uploadedBanners.length} dining banner(s) uploaded successfully`, {
      banners: uploadedBanners
    });
  } catch (error) {
    console.error('Error creating multiple dining banners:', error);
    return errorResponse(res, 500, 'Failed to upload dining banners');
  }
};

/**
 * Delete a dining banner
 */
export const deleteDiningBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await DiningBanner.findById(id);
    if (!banner) {
      return errorResponse(res, 404, 'Dining banner not found');
    }

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(banner.cloudinaryPublicId);
    } catch (cloudinaryError) {
      console.error('Error deleting from Cloudinary:', cloudinaryError);
      // Continue with database deletion even if Cloudinary deletion fails
    }

    // Delete from database
    await DiningBanner.findByIdAndDelete(id);

    return successResponse(res, 200, 'Dining banner deleted successfully');
  } catch (error) {
    console.error('Error deleting dining banner:', error);
    return errorResponse(res, 500, 'Failed to delete dining banner');
  }
};

/**
 * Update dining banner order
 */
export const updateDiningBannerOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { order } = req.body;

    if (typeof order !== 'number') {
      return errorResponse(res, 400, 'Order must be a number');
    }

    const banner = await DiningBanner.findByIdAndUpdate(
      id,
      { order, updatedAt: new Date() },
      { new: true }
    );

    if (!banner) {
      return errorResponse(res, 404, 'Dining banner not found');
    }

    return successResponse(res, 200, 'Banner order updated successfully', {
      banner
    });
  } catch (error) {
    console.error('Error updating dining banner order:', error);
    return errorResponse(res, 500, 'Failed to update banner order');
  }
};

/**
 * Toggle dining banner active status
 */
export const toggleDiningBannerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await DiningBanner.findById(id);
    if (!banner) {
      return errorResponse(res, 404, 'Dining banner not found');
    }

    banner.isActive = !banner.isActive;
    banner.updatedAt = new Date();
    await banner.save();

    return successResponse(res, 200, 'Banner status updated successfully', {
      banner
    });
  } catch (error) {
    console.error('Error toggling dining banner status:', error);
    return errorResponse(res, 500, 'Failed to update banner status');
  }
};

// ==================== TOP 10 RESTAURANTS ====================

/**
 * Get all Top 10 restaurants (admin endpoint)
 */
export const getAllTop10Restaurants = async (req, res) => {
  try {
    const restaurants = await Top10Restaurant.find()
      .populate('restaurant', 'name restaurantId slug profileImage coverImages menuImages rating estimatedDeliveryTime distance offer featuredDish featuredPrice')
      .sort({ rank: 1, order: 1 })
      .lean();

    return successResponse(res, 200, 'Top 10 restaurants retrieved successfully', {
      restaurants
    });
  } catch (error) {
    console.error('Error fetching Top 10 restaurants:', error);
    return errorResponse(res, 500, 'Failed to fetch Top 10 restaurants');
  }
};

/**
 * Get all active Top 10 restaurants (public endpoint)
 */
export const getTop10Restaurants = async (req, res) => {
  try {
    const restaurants = await Top10Restaurant.find({ isActive: true })
      .populate('restaurant', 'name restaurantId slug profileImage coverImages menuImages rating estimatedDeliveryTime distance offer featuredDish featuredPrice')
      .sort({ rank: 1, order: 1 })
      .lean();

    return successResponse(res, 200, 'Top 10 restaurants retrieved successfully', {
      restaurants: restaurants.map(r => ({
        ...r.restaurant,
        rank: r.rank,
        _id: r._id
      }))
    });
  } catch (error) {
    console.error('Error fetching Top 10 restaurants:', error);
    return errorResponse(res, 500, 'Failed to fetch Top 10 restaurants');
  }
};

/**
 * Add a restaurant to Top 10
 */
export const createTop10Restaurant = async (req, res) => {
  try {
    const { restaurantId, rank } = req.body;

    if (!restaurantId) {
      return errorResponse(res, 400, 'Restaurant ID is required');
    }

    if (!rank || rank < 1 || rank > 10) {
      return errorResponse(res, 400, 'Rank must be between 1 and 10');
    }

    // Check if restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Check if rank is already taken
    const existingRank = await Top10Restaurant.findOne({ rank, isActive: true });
    if (existingRank) {
      return errorResponse(res, 400, `Rank ${rank} is already taken`);
    }

    // Check if restaurant is already in Top 10
    const existingRestaurant = await Top10Restaurant.findOne({ restaurant: restaurantId });
    if (existingRestaurant) {
      return errorResponse(res, 400, 'Restaurant is already in Top 10');
    }

    // Get the highest order number
    const lastRestaurant = await Top10Restaurant.findOne()
      .sort({ order: -1 })
      .select('order')
      .lean();

    const newOrder = lastRestaurant ? lastRestaurant.order + 1 : 0;

    // Create Top 10 restaurant record
    const top10Restaurant = new Top10Restaurant({
      restaurant: restaurantId,
      rank,
      order: newOrder,
      isActive: true
    });

    await top10Restaurant.save();

    // Populate restaurant data
    await top10Restaurant.populate('restaurant', 'name restaurantId slug profileImage rating estimatedDeliveryTime distance offer featuredDish featuredPrice');

    return successResponse(res, 201, 'Restaurant added to Top 10 successfully', {
      restaurant: top10Restaurant
    });
  } catch (error) {
    console.error('Error creating Top 10 restaurant:', error);
    if (error.message.includes('Maximum 10 restaurants')) {
      return errorResponse(res, 400, error.message);
    }
    return errorResponse(res, 500, 'Failed to add restaurant to Top 10');
  }
};

/**
 * Delete a restaurant from Top 10
 */
export const deleteTop10Restaurant = async (req, res) => {
  try {
    const { id } = req.params;

    const top10Restaurant = await Top10Restaurant.findById(id);
    if (!top10Restaurant) {
      return errorResponse(res, 404, 'Top 10 restaurant not found');
    }

    await Top10Restaurant.findByIdAndDelete(id);

    return successResponse(res, 200, 'Restaurant removed from Top 10 successfully');
  } catch (error) {
    console.error('Error deleting Top 10 restaurant:', error);
    return errorResponse(res, 500, 'Failed to remove restaurant from Top 10');
  }
};

/**
 * Update Top 10 restaurant rank
 */
export const updateTop10RestaurantRank = async (req, res) => {
  try {
    const { id } = req.params;
    const { rank } = req.body;

    if (!rank || rank < 1 || rank > 10) {
      return errorResponse(res, 400, 'Rank must be between 1 and 10');
    }

    const top10Restaurant = await Top10Restaurant.findById(id);
    if (!top10Restaurant) {
      return errorResponse(res, 404, 'Top 10 restaurant not found');
    }

    // Check if rank is already taken by another restaurant
    const existingRank = await Top10Restaurant.findOne({ rank, isActive: true, _id: { $ne: id } });
    if (existingRank) {
      return errorResponse(res, 400, `Rank ${rank} is already taken`);
    }

    top10Restaurant.rank = rank;
    top10Restaurant.updatedAt = new Date();
    await top10Restaurant.save();

    await top10Restaurant.populate('restaurant', 'name restaurantId slug profileImage rating estimatedDeliveryTime distance offer featuredDish featuredPrice');

    return successResponse(res, 200, 'Top 10 restaurant rank updated successfully', {
      restaurant: top10Restaurant
    });
  } catch (error) {
    console.error('Error updating Top 10 restaurant rank:', error);
    return errorResponse(res, 500, 'Failed to update Top 10 restaurant rank');
  }
};

/**
 * Update Top 10 restaurant order
 */
export const updateTop10RestaurantOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { order } = req.body;

    if (typeof order !== 'number') {
      return errorResponse(res, 400, 'Order must be a number');
    }

    const top10Restaurant = await Top10Restaurant.findByIdAndUpdate(
      id,
      { order, updatedAt: new Date() },
      { new: true }
    );

    if (!top10Restaurant) {
      return errorResponse(res, 404, 'Top 10 restaurant not found');
    }

    return successResponse(res, 200, 'Top 10 restaurant order updated successfully', {
      restaurant: top10Restaurant
    });
  } catch (error) {
    console.error('Error updating Top 10 restaurant order:', error);
    return errorResponse(res, 500, 'Failed to update Top 10 restaurant order');
  }
};

/**
 * Toggle Top 10 restaurant active status
 */
export const toggleTop10RestaurantStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const top10Restaurant = await Top10Restaurant.findById(id);
    if (!top10Restaurant) {
      return errorResponse(res, 404, 'Top 10 restaurant not found');
    }

    // Check if activating would exceed 10 active restaurants
    if (!top10Restaurant.isActive) {
      const activeCount = await Top10Restaurant.countDocuments({ isActive: true });
      if (activeCount >= 10) {
        return errorResponse(res, 400, 'Maximum 10 restaurants can be active in Top 10');
      }
    }

    top10Restaurant.isActive = !top10Restaurant.isActive;
    top10Restaurant.updatedAt = new Date();
    await top10Restaurant.save();

    await top10Restaurant.populate('restaurant', 'name restaurantId slug profileImage rating estimatedDeliveryTime distance offer featuredDish featuredPrice');

    return successResponse(res, 200, 'Top 10 restaurant status updated successfully', {
      restaurant: top10Restaurant
    });
  } catch (error) {
    console.error('Error toggling Top 10 restaurant status:', error);
    return errorResponse(res, 500, 'Failed to update Top 10 restaurant status');
  }
};

// ==================== GOURMET RESTAURANTS ====================

/**
 * Get all Gourmet restaurants (admin endpoint)
 */
export const getAllGourmetRestaurants = async (req, res) => {
  try {
    const restaurants = await GourmetRestaurant.find()
      .populate('restaurant', 'name restaurantId slug profileImage coverImages menuImages rating estimatedDeliveryTime distance offer featuredDish featuredPrice')
      .sort({ order: 1, createdAt: -1 })
      .lean();

    return successResponse(res, 200, 'Gourmet restaurants retrieved successfully', {
      restaurants
    });
  } catch (error) {
    console.error('Error fetching Gourmet restaurants:', error);
    return errorResponse(res, 500, 'Failed to fetch Gourmet restaurants');
  }
};

/**
 * Get all active Gourmet restaurants (public endpoint)
 */
export const getGourmetRestaurants = async (req, res) => {
  try {
    const restaurants = await GourmetRestaurant.find({ isActive: true })
      .populate('restaurant', 'name restaurantId slug profileImage coverImages menuImages rating estimatedDeliveryTime distance offer featuredDish featuredPrice')
      .sort({ order: 1, createdAt: -1 })
      .lean();

    return successResponse(res, 200, 'Gourmet restaurants retrieved successfully', {
      restaurants: restaurants.map(r => ({
        ...r.restaurant,
        _id: r._id
      }))
    });
  } catch (error) {
    console.error('Error fetching Gourmet restaurants:', error);
    return errorResponse(res, 500, 'Failed to fetch Gourmet restaurants');
  }
};

/**
 * Add a restaurant to Gourmet
 */
export const createGourmetRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.body;

    if (!restaurantId) {
      return errorResponse(res, 400, 'Restaurant ID is required');
    }

    // Check if restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    // Check if restaurant is already in Gourmet
    const existingRestaurant = await GourmetRestaurant.findOne({ restaurant: restaurantId });
    if (existingRestaurant) {
      return errorResponse(res, 400, 'Restaurant is already in Gourmet');
    }

    // Get the highest order number
    const lastRestaurant = await GourmetRestaurant.findOne()
      .sort({ order: -1 })
      .select('order')
      .lean();

    const newOrder = lastRestaurant ? lastRestaurant.order + 1 : 0;

    // Create Gourmet restaurant record
    const gourmetRestaurant = new GourmetRestaurant({
      restaurant: restaurantId,
      order: newOrder,
      isActive: true
    });

    await gourmetRestaurant.save();

    // Populate restaurant data
    await gourmetRestaurant.populate('restaurant', 'name restaurantId slug profileImage rating estimatedDeliveryTime distance offer featuredDish featuredPrice');

    return successResponse(res, 201, 'Restaurant added to Gourmet successfully', {
      restaurant: gourmetRestaurant
    });
  } catch (error) {
    console.error('Error creating Gourmet restaurant:', error);
    return errorResponse(res, 500, 'Failed to add restaurant to Gourmet');
  }
};

/**
 * Delete a restaurant from Gourmet
 */
export const deleteGourmetRestaurant = async (req, res) => {
  try {
    const { id } = req.params;

    const gourmetRestaurant = await GourmetRestaurant.findById(id);
    if (!gourmetRestaurant) {
      return errorResponse(res, 404, 'Gourmet restaurant not found');
    }

    await GourmetRestaurant.findByIdAndDelete(id);

    return successResponse(res, 200, 'Restaurant removed from Gourmet successfully');
  } catch (error) {
    console.error('Error deleting Gourmet restaurant:', error);
    return errorResponse(res, 500, 'Failed to remove restaurant from Gourmet');
  }
};

/**
 * Update Gourmet restaurant order
 */
export const updateGourmetRestaurantOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { order } = req.body;

    if (typeof order !== 'number') {
      return errorResponse(res, 400, 'Order must be a number');
    }

    const gourmetRestaurant = await GourmetRestaurant.findByIdAndUpdate(
      id,
      { order, updatedAt: new Date() },
      { new: true }
    );

    if (!gourmetRestaurant) {
      return errorResponse(res, 404, 'Gourmet restaurant not found');
    }

    return successResponse(res, 200, 'Gourmet restaurant order updated successfully', {
      restaurant: gourmetRestaurant
    });
  } catch (error) {
    console.error('Error updating Gourmet restaurant order:', error);
    return errorResponse(res, 500, 'Failed to update Gourmet restaurant order');
  }
};

/**
 * Toggle Gourmet restaurant active status
 */
export const toggleGourmetRestaurantStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const gourmetRestaurant = await GourmetRestaurant.findById(id);
    if (!gourmetRestaurant) {
      return errorResponse(res, 404, 'Gourmet restaurant not found');
    }

    gourmetRestaurant.isActive = !gourmetRestaurant.isActive;
    gourmetRestaurant.updatedAt = new Date();
    await gourmetRestaurant.save();

    await gourmetRestaurant.populate('restaurant', 'name restaurantId slug profileImage rating estimatedDeliveryTime distance offer featuredDish featuredPrice');

    return successResponse(res, 200, 'Gourmet restaurant status updated successfully', {
      restaurant: gourmetRestaurant
    });
  } catch (error) {
    console.error('Error toggling Gourmet restaurant status:', error);
    return errorResponse(res, 500, 'Failed to update Gourmet restaurant status');
  }
};

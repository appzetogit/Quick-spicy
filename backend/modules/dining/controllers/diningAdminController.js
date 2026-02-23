import DiningCategory from '../models/DiningCategory.js';
import DiningOfferBanner from '../models/DiningOfferBanner.js';
import DiningStory from '../models/DiningStory.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { uploadToCloudinary } from '../../../shared/utils/cloudinaryService.js';
import { cloudinary } from '../../../config/cloudinary.js';

// ==================== DINING CATEGORIES ====================

export const getAdminDiningCategories = async (req, res) => {
    try {
        const categories = await DiningCategory.find().sort({ createdAt: -1 }).lean();
        return successResponse(res, 200, 'Categories retrieved successfully', { categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        return errorResponse(res, 500, 'Failed to fetch categories');
    }
};

export const createDiningCategory = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return errorResponse(res, 400, 'Name is required');
        if (!req.file) return errorResponse(res, 400, 'Image is required');

        const result = await uploadToCloudinary(req.file.buffer, {
            folder: 'appzeto/dining/categories',
            resource_type: 'image'
        });

        const category = new DiningCategory({
            name,
            imageUrl: result.secure_url,
            cloudinaryPublicId: result.public_id
        });

        await category.save();

        return successResponse(res, 201, 'Category created successfully', { category });
    } catch (error) {
        console.error('Error creating category:', error);
        return errorResponse(res, 500, 'Failed to create category');
    }
};

export const deleteDiningCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await DiningCategory.findById(id);
        if (!category) return errorResponse(res, 404, 'Category not found');

        try {
            await cloudinary.uploader.destroy(category.cloudinaryPublicId);
        } catch (err) {
            console.error('Error deleting from Cloudinary:', err);
        }

        await DiningCategory.findByIdAndDelete(id);
        return successResponse(res, 200, 'Category deleted successfully');
    } catch (error) {
        console.error('Error deleting category:', error);
        return errorResponse(res, 500, 'Failed to delete category');
    }
};

// ==================== DINING OFFER BANNERS ====================

export const getAdminDiningOfferBanners = async (req, res) => {
    try {
        const banners = await DiningOfferBanner.find()
            .populate('restaurant', 'name')
            .sort({ createdAt: -1 })
            .lean();
        return successResponse(res, 200, 'Banners retrieved successfully', { banners });
    } catch (error) {
        console.error('Error fetching banners:', error);
        return errorResponse(res, 500, 'Failed to fetch banners');
    }
};

export const createDiningOfferBanner = async (req, res) => {
    try {
        const { percentageOff, tagline, restaurant } = req.body;
        if (!percentageOff || !tagline || !restaurant) {
            return errorResponse(res, 400, 'All fields are required');
        }
        if (!req.file) return errorResponse(res, 400, 'Image is required');

        const result = await uploadToCloudinary(req.file.buffer, {
            folder: 'appzeto/dining/offers',
            resource_type: 'image'
        });

        const banner = new DiningOfferBanner({
            imageUrl: result.secure_url,
            cloudinaryPublicId: result.public_id,
            percentageOff,
            tagline,
            restaurant
        });

        await banner.save();

        // Populate restaurant details for immediate display
        await banner.populate('restaurant', 'name');

        return successResponse(res, 201, 'Banner created successfully', { banner });
    } catch (error) {
        console.error('Error creating banner:', error);
        return errorResponse(res, 500, 'Failed to create banner');
    }
};

export const deleteDiningOfferBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const banner = await DiningOfferBanner.findById(id);
        if (!banner) return errorResponse(res, 404, 'Banner not found');

        try {
            await cloudinary.uploader.destroy(banner.cloudinaryPublicId);
        } catch (err) {
            console.error('Error deleting from Cloudinary:', err);
        }

        await DiningOfferBanner.findByIdAndDelete(id);
        return successResponse(res, 200, 'Banner deleted successfully');
    } catch (error) {
        console.error('Error deleting banner:', error);
        return errorResponse(res, 500, 'Failed to delete banner');
    }
};

export const updateDiningOfferBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const { percentageOff, tagline, restaurant } = req.body;

        const banner = await DiningOfferBanner.findById(id);
        if (!banner) return errorResponse(res, 404, 'Banner not found');

        if (percentageOff) banner.percentageOff = percentageOff;
        if (tagline) banner.tagline = tagline;
        if (restaurant) banner.restaurant = restaurant;

        if (req.file) {
            try {
                await cloudinary.uploader.destroy(banner.cloudinaryPublicId);
            } catch (err) {
                console.error('Error deleting old image from Cloudinary:', err);
            }

            const result = await uploadToCloudinary(req.file.buffer, {
                folder: 'appzeto/dining/offers',
                resource_type: 'image'
            });

            banner.imageUrl = result.secure_url;
            banner.cloudinaryPublicId = result.public_id;
        }

        await banner.save();
        await banner.populate('restaurant', 'name');

        return successResponse(res, 200, 'Banner updated successfully', { banner });
    } catch (error) {
        console.error('Error updating banner:', error);
        return errorResponse(res, 500, 'Failed to update banner');
    }
};

export const getActiveRestaurants = async (req, res) => {
    try {
        // Fetch restaurants that are active (assuming isServiceable or similar flag, or just all)
        // For now fetching all with just name and id
        const restaurants = await Restaurant.find().select('name _id').lean();
        return successResponse(res, 200, 'Restaurants retrieved successfully', { restaurants });
    } catch (error) {
        console.error('Error fetching restaurants:', error);
        return errorResponse(res, 500, 'Failed to fetch restaurants');
    }
}

// ==================== DINING STORIES ====================

export const getAdminDiningStories = async (req, res) => {
    try {
        const stories = await DiningStory.find().sort({ createdAt: -1 }).lean();
        return successResponse(res, 200, 'Stories retrieved successfully', { stories });
    } catch (error) {
        console.error('Error fetching stories:', error);
        return errorResponse(res, 500, 'Failed to fetch stories');
    }
};

export const createDiningStory = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return errorResponse(res, 400, 'Name is required');
        if (!req.file) return errorResponse(res, 400, 'Image is required');

        const result = await uploadToCloudinary(req.file.buffer, {
            folder: 'appzeto/dining/stories',
            resource_type: 'image'
        });

        const story = new DiningStory({
            name,
            imageUrl: result.secure_url,
            cloudinaryPublicId: result.public_id
        });

        await story.save();

        return successResponse(res, 201, 'Story created successfully', { story });
    } catch (error) {
        console.error('Error creating story:', error);
        return errorResponse(res, 500, 'Failed to create story');
    }
};

export const deleteDiningStory = async (req, res) => {
    try {
        const { id } = req.params;
        const story = await DiningStory.findById(id);
        if (!story) return errorResponse(res, 404, 'Story not found');

        try {
            await cloudinary.uploader.destroy(story.cloudinaryPublicId);
        } catch (err) {
            console.error('Error deleting from Cloudinary:', err);
        }

        await DiningStory.findByIdAndDelete(id);
        return successResponse(res, 200, 'Story deleted successfully');
    } catch (error) {
        console.error('Error deleting story:', error);
        return errorResponse(res, 500, 'Failed to delete story');
    }
};

export const updateDiningStory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        const story = await DiningStory.findById(id);
        if (!story) return errorResponse(res, 404, 'Story not found');

        if (name) story.name = name;

        if (req.file) {
            try {
                await cloudinary.uploader.destroy(story.cloudinaryPublicId);
            } catch (err) {
                console.error('Error deleting old image from Cloudinary:', err);
            }

            const result = await uploadToCloudinary(req.file.buffer, {
                folder: 'appzeto/dining/stories',
                resource_type: 'image'
            });

            story.imageUrl = result.secure_url;
            story.cloudinaryPublicId = result.public_id;
        }

        await story.save();

        return successResponse(res, 200, 'Story updated successfully', { story });
    } catch (error) {
        console.error('Error updating story:', error);
        return errorResponse(res, 500, 'Failed to update story');
    }
};

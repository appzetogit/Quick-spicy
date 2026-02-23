import About from '../models/About.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

/**
 * Get About page data (Public)
 * GET /api/about/public
 */
export const getAboutPublic = asyncHandler(async (req, res) => {
  try {
    const about = await About.findOne({ isActive: true })
      .select('-updatedBy -createdAt -updatedAt -__v')
      .lean();

    if (!about) {
      // Return default data if no about page exists
      return successResponse(res, 200, 'About page data retrieved successfully', {
        appName: 'Appzeto Food',
        version: '1.0.0',
        description: 'Your trusted food delivery partner, bringing delicious meals right to your doorstep. Experience the convenience of ordering from your favorite restaurants with fast, reliable delivery.',
        logo: '',
        features: [
          {
            icon: 'Heart',
            title: 'Made with Love',
            description: "We're passionate about bringing you the best food experience possible.",
            color: 'text-pink-600 dark:text-pink-400',
            bgColor: 'bg-pink-100 dark:bg-pink-900/30',
            order: 0
          },
          {
            icon: 'Users',
            title: 'Serving Millions',
            description: 'Join millions of satisfied customers enjoying great food every day.',
            color: 'text-blue-600 dark:text-blue-400',
            bgColor: 'bg-blue-100 dark:bg-blue-900/30',
            order: 1
          },
          {
            icon: 'Shield',
            title: 'Quality Assured',
            description: 'We partner with the best restaurants to ensure quality and freshness.',
            color: 'text-green-600 dark:text-green-400',
            bgColor: 'bg-green-100 dark:bg-green-900/30',
            order: 2
          },
          {
            icon: 'Clock',
            title: 'Fast Delivery',
            description: 'Get your favorite meals delivered quickly and safely to your doorstep.',
            color: 'text-orange-600 dark:text-orange-400',
            bgColor: 'bg-orange-100 dark:bg-orange-900/30',
            order: 3
          }
        ],
        stats: [
          {
            label: 'Happy Customers',
            value: '1M+',
            icon: 'Users',
            order: 0
          },
          {
            label: 'Restaurant Partners',
            value: '10K+',
            icon: 'Award',
            order: 1
          },
          {
            label: 'Cities Served',
            value: '50+',
            icon: 'Star',
            order: 2
          }
        ]
      });
    }

    return successResponse(res, 200, 'About page data retrieved successfully', about);
  } catch (error) {
    console.error('Error fetching about page:', error);
    return errorResponse(res, 500, 'Failed to fetch about page data');
  }
});

/**
 * Get About page data (Admin)
 * GET /api/admin/about
 */
export const getAbout = asyncHandler(async (req, res) => {
  try {
    let about = await About.findOne({ isActive: true }).lean();

    if (!about) {
      // Create default about page if it doesn't exist
      about = await About.create({
        appName: 'Appzeto Food',
        version: '1.0.0',
        description: 'Your trusted food delivery partner, bringing delicious meals right to your doorstep. Experience the convenience of ordering from your favorite restaurants with fast, reliable delivery.',
        features: [
          {
            icon: 'Heart',
            title: 'Made with Love',
            description: "We're passionate about bringing you the best food experience possible.",
            color: 'text-pink-600 dark:text-pink-400',
            bgColor: 'bg-pink-100 dark:bg-pink-900/30',
            order: 0
          },
          {
            icon: 'Users',
            title: 'Serving Millions',
            description: 'Join millions of satisfied customers enjoying great food every day.',
            color: 'text-blue-600 dark:text-blue-400',
            bgColor: 'bg-blue-100 dark:bg-blue-900/30',
            order: 1
          },
          {
            icon: 'Shield',
            title: 'Quality Assured',
            description: 'We partner with the best restaurants to ensure quality and freshness.',
            color: 'text-green-600 dark:text-green-400',
            bgColor: 'bg-green-100 dark:bg-green-900/30',
            order: 2
          },
          {
            icon: 'Clock',
            title: 'Fast Delivery',
            description: 'Get your favorite meals delivered quickly and safely to your doorstep.',
            color: 'text-orange-600 dark:text-orange-400',
            bgColor: 'bg-orange-100 dark:bg-orange-900/30',
            order: 3
          }
        ],
        stats: [
          {
            label: 'Happy Customers',
            value: '1M+',
            icon: 'Users',
            order: 0
          },
          {
            label: 'Restaurant Partners',
            value: '10K+',
            icon: 'Award',
            order: 1
          },
          {
            label: 'Cities Served',
            value: '50+',
            icon: 'Star',
            order: 2
          }
        ],
        updatedBy: req.admin._id
      });
    }

    return successResponse(res, 200, 'About page data retrieved successfully', about);
  } catch (error) {
    console.error('Error fetching about page:', error);
    return errorResponse(res, 500, 'Failed to fetch about page data');
  }
});

/**
 * Update About page data
 * PUT /api/admin/about
 */
export const updateAbout = asyncHandler(async (req, res) => {
  try {
    const { appName, version, description, logo, features, stats } = req.body;

    // Validate required fields
    if (!appName || !version || !description) {
      return errorResponse(res, 400, 'App name, version, and description are required');
    }

    // Find existing about page or create new one
    let about = await About.findOne({ isActive: true });

    if (!about) {
      about = new About({
        appName,
        version,
        description,
        logo: logo || '',
        features: features || [],
        stats: stats || [],
        updatedBy: req.admin._id
      });
    } else {
      about.appName = appName;
      about.version = version;
      about.description = description;
      if (logo !== undefined) about.logo = logo;
      if (features !== undefined) about.features = features;
      if (stats !== undefined) about.stats = stats;
      about.updatedBy = req.admin._id;
    }

    await about.save();

    return successResponse(res, 200, 'About page updated successfully', about);
  } catch (error) {
    console.error('Error updating about page:', error);
    return errorResponse(res, 500, 'Failed to update about page');
  }
});


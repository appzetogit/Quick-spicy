import Order from '../../order/models/Order.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';

/**
 * Get all reviews for a restaurant
 * GET /api/restaurant/reviews
 */
export const getRestaurantReviews = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    
    if (!restaurant || !restaurant._id) {
      return errorResponse(res, 401, 'Restaurant authentication required');
    }
    
    const restaurantId = restaurant._id.toString();
    const { page = 1, limit = 20, rating, sortBy = 'submittedAt', sortOrder = 'desc' } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const query = {
      restaurantId: restaurantId,
      status: 'delivered',
      'review.rating': { $exists: true, $ne: null }
    };
    
    if (rating) {
      const ratingNum = parseInt(rating);
      if (ratingNum >= 1 && ratingNum <= 5) {
        query['review.rating'] = ratingNum;
      }
    }
    
    const sortOptions = {};
    if (sortBy === 'rating') {
      sortOptions['review.rating'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions['review.submittedAt'] = sortOrder === 'asc' ? 1 : -1;
    }
    
    const reviews = await Order.find(query)
      .populate('userId', 'name phone')
      .select('orderId userId review deliveredAt createdAt')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    const totalReviews = await Order.countDocuments(query);
    
    // Calculate average rating and distribution
    const avgRatingResult = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$review.rating' },
          totalReviews: { $sum: 1 },
          ratingDistribution: {
            $push: '$review.rating'
          }
        }
      }
    ]);
    
    let avgRating = 0;
    let ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    
    if (avgRatingResult.length > 0) {
      avgRating = avgRatingResult[0].avgRating || 0;
      const distribution = avgRatingResult[0].ratingDistribution || [];
      distribution.forEach(rating => {
        if (rating >= 1 && rating <= 5) {
          ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
        }
      });
    }
    
    return successResponse(res, 200, 'Reviews fetched successfully', {
      reviews: reviews.map(review => ({
        orderId: review.orderId,
        orderMongoId: review._id,
        customer: {
          id: review.userId?._id || review.userId,
          name: review.userId?.name || 'Anonymous',
          phone: review.userId?.phone
        },
        rating: review.review?.rating,
        comment: review.review?.comment,
        submittedAt: review.review?.submittedAt || review.deliveredAt,
        deliveredAt: review.deliveredAt,
        createdAt: review.createdAt
      })),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalReviews / limitNum),
        totalReviews,
        limit: limitNum
      },
      statistics: {
        averageRating: Math.round(avgRating * 10) / 10,
        totalReviews,
        ratingDistribution
      }
    });
  } catch (error) {
    console.error('Error fetching restaurant reviews:', error);
    return errorResponse(res, 500, `Failed to fetch reviews: ${error.message}`);
  }
});

/**
 * Get review by order ID (Restaurant)
 * GET /api/restaurant/reviews/:orderId
 */
export const getReviewByOrderId = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    
    if (!restaurant || !restaurant._id) {
      return errorResponse(res, 401, 'Restaurant authentication required');
    }
    
    const { orderId } = req.params;
    const restaurantId = restaurant._id.toString();
    
    const order = await Order.findOne({
      $or: [
        { orderId: orderId },
        { _id: orderId }
      ],
      restaurantId: restaurantId,
      status: 'delivered',
      'review.rating': { $exists: true, $ne: null }
    })
      .populate('userId', 'name phone')
      .select('orderId userId review deliveredAt createdAt')
      .lean();
    
    if (!order) {
      return errorResponse(res, 404, 'Review not found for this order');
    }
    
    return successResponse(res, 200, 'Review fetched successfully', {
      orderId: order.orderId,
      orderMongoId: order._id,
      customer: {
        id: order.userId?._id || order.userId,
        name: order.userId?.name || 'Anonymous',
        phone: order.userId?.phone
      },
      rating: order.review?.rating,
      comment: order.review?.comment,
      submittedAt: order.review?.submittedAt || order.deliveredAt,
      deliveredAt: order.deliveredAt,
      createdAt: order.createdAt
    });
  } catch (error) {
    console.error('Error fetching review:', error);
    return errorResponse(res, 500, `Failed to fetch review: ${error.message}`);
  }
});


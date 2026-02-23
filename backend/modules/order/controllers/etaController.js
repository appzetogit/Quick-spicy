import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import etaCalculationService from '../services/etaCalculationService.js';
import etaEventService from '../services/etaEventService.js';
import Order from '../models/Order.js';
import ETALog from '../models/ETALog.js';
import OrderEvent from '../models/OrderEvent.js';
import mongoose from 'mongoose';

/**
 * Helper function to find order by MongoDB _id or custom orderId
 */
async function findOrderById(orderIdParam) {
  let order = null;
  if (mongoose.Types.ObjectId.isValid(orderIdParam) && orderIdParam.length === 24) {
    order = await Order.findById(orderIdParam);
  }
  if (!order) {
    order = await Order.findOne({ orderId: orderIdParam });
  }
  return order;
}

/**
 * Get live ETA for an order
 * GET /api/orders/:orderId/eta
 */
export const getLiveETA = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await findOrderById(orderId);
  if (!order) {
    return errorResponse(res, 404, 'Order not found');
  }

  const liveETA = await etaCalculationService.getLiveETA(order._id.toString());

  return successResponse(res, 200, 'Live ETA retrieved successfully', liveETA);
});

/**
 * Calculate initial ETA for a new order
 * POST /api/orders/calculate-eta
 */
export const calculateInitialETA = asyncHandler(async (req, res) => {
  const {
    restaurantId,
    restaurantLocation,
    userLocation
  } = req.body;

  if (!restaurantId || !restaurantLocation || !userLocation) {
    return errorResponse(res, 400, 'Missing required fields: restaurantId, restaurantLocation, userLocation');
  }

  const eta = await etaCalculationService.calculateInitialETA({
    restaurantId,
    restaurantLocation,
    userLocation
  });

  return successResponse(res, 200, 'ETA calculated successfully', eta);
});

/**
 * Get ETA history for an order
 * GET /api/orders/:orderId/eta/history
 */
export const getETAHistory = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await findOrderById(orderId);
  if (!order) {
    return errorResponse(res, 404, 'Order not found');
  }

  const etaLogs = await ETALog.find({ orderId: order._id })
    .sort({ calculatedAt: -1 })
    .limit(50)
    .lean();

  return successResponse(res, 200, 'ETA history retrieved successfully', {
    orderId: order.orderId,
    currentETA: order.eta || {
      min: order.estimatedDeliveryTime - 3,
      max: order.estimatedDeliveryTime + 3
    },
    history: etaLogs
  });
});

/**
 * Get order events
 * GET /api/orders/:orderId/events
 */
export const getOrderEvents = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await findOrderById(orderId);
  if (!order) {
    return errorResponse(res, 404, 'Order not found');
  }

  const events = await OrderEvent.find({ orderId: order._id })
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();

  return successResponse(res, 200, 'Order events retrieved successfully', {
    orderId: order.orderId,
    events
  });
});

/**
 * Manually trigger ETA recalculation
 * POST /api/orders/:orderId/eta/recalculate
 */
export const recalculateETA = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body;

  const order = await findOrderById(orderId);
  if (!order) {
    return errorResponse(res, 404, 'Order not found');
  }

  // Recalculate ETA
  const newETA = await etaCalculationService.recalculateETA(
    order._id.toString(),
    'MANUAL_UPDATE',
    { reason: reason || 'Manual recalculation' }
  );

  return successResponse(res, 200, 'ETA recalculated successfully', newETA);
});

/**
 * Handle restaurant accepted order (triggers ETA update)
 * This should be called when restaurant accepts an order
 */
export const handleRestaurantAccepted = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { acceptedAt } = req.body;

  const order = await findOrderById(orderId);
  if (!order) {
    return errorResponse(res, 404, 'Order not found');
  }

  const result = await etaEventService.handleRestaurantAccepted(
    order._id.toString(),
    acceptedAt ? new Date(acceptedAt) : new Date()
  );

  return successResponse(res, 200, 'Restaurant accepted event processed', result);
});

/**
 * Handle rider assigned (triggers ETA update)
 * This should be called when a rider is assigned to an order
 */
export const handleRiderAssigned = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { riderId } = req.body;

  if (!riderId) {
    return errorResponse(res, 400, 'riderId is required');
  }

  const order = await findOrderById(orderId);
  if (!order) {
    return errorResponse(res, 404, 'Order not found');
  }

  const result = await etaEventService.handleRiderAssigned(order._id.toString(), riderId);

  return successResponse(res, 200, 'Rider assigned event processed', result);
});

/**
 * Handle rider reached restaurant (triggers ETA update)
 */
export const handleRiderReachedRestaurant = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await findOrderById(orderId);
  if (!order) {
    return errorResponse(res, 404, 'Order not found');
  }

  const result = await etaEventService.handleRiderReachedRestaurant(order._id.toString());

  return successResponse(res, 200, 'Rider reached restaurant event processed', result);
});

/**
 * Handle food not ready (triggers ETA update)
 */
export const handleFoodNotReady = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { waitingTime } = req.body;

  if (!waitingTime) {
    return errorResponse(res, 400, 'waitingTime is required');
  }

  const order = await findOrderById(orderId);
  if (!order) {
    return errorResponse(res, 404, 'Order not found');
  }

  const result = await etaEventService.handleFoodNotReady(order._id.toString(), waitingTime);

  return successResponse(res, 200, 'Food not ready event processed', result);
});

/**
 * Handle rider started delivery (triggers ETA update)
 */
export const handleRiderStartedDelivery = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await findOrderById(orderId);
  if (!order) {
    return errorResponse(res, 404, 'Order not found');
  }

  const result = await etaEventService.handleRiderStartedDelivery(order._id.toString());

  return successResponse(res, 200, 'Rider started delivery event processed', result);
});

/**
 * Handle traffic detected (triggers ETA update)
 */
export const handleTrafficDetected = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { trafficLevel } = req.body;

  if (!trafficLevel || !['low', 'medium', 'high'].includes(trafficLevel)) {
    return errorResponse(res, 400, 'trafficLevel must be one of: low, medium, high');
  }

  const order = await findOrderById(orderId);
  if (!order) {
    return errorResponse(res, 404, 'Order not found');
  }

  const result = await etaEventService.handleTrafficDetected(order._id.toString(), trafficLevel);

  return successResponse(res, 200, 'Traffic detected event processed', result);
});

/**
 * Handle rider nearing drop location (triggers ETA update)
 */
export const handleRiderNearby = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { distanceToDrop } = req.body;

  if (distanceToDrop === undefined) {
    return errorResponse(res, 400, 'distanceToDrop is required');
  }

  const order = await findOrderById(orderId);
  if (!order) {
    return errorResponse(res, 404, 'Order not found');
  }

  const result = await etaEventService.handleRiderNearby(order._id.toString(), distanceToDrop);

  return successResponse(res, 200, 'Rider nearby event processed', result);
});


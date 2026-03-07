import OutletTimings from '../models/OutletTimings.js';
import Restaurant from '../models/Restaurant.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const normalizeDayName = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;

  const exactMatch = DAY_ORDER.find((day) => day.toLowerCase() === raw);
  if (exactMatch) return exactMatch;

  const shortMatch = DAY_ORDER.find((day) => day.toLowerCase().startsWith(raw.slice(0, 3)));
  return shortMatch || null;
};

const toOutletTime = (value, fallback) => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;

  if (/^\d{1,2}:\d{2}\s?(AM|PM|am|pm)$/.test(raw)) {
    return raw.toUpperCase().replace(/\s+/, ' ');
  }

  const match24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match24) return raw;

  let hours = Number(match24[1]);
  const minutes = Number(match24[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return fallback;

  const period = hours >= 12 ? 'PM' : 'AM';
  hours %= 12;
  if (hours === 0) hours = 12;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
};

const buildFallbackOutletTimings = (restaurant) => {
  const openDays = new Set(
    (Array.isArray(restaurant?.openDays) ? restaurant.openDays : [])
      .map(normalizeDayName)
      .filter(Boolean)
  );

  const openingTime = toOutletTime(restaurant?.deliveryTimings?.openingTime, '09:00 AM');
  const closingTime = toOutletTime(restaurant?.deliveryTimings?.closingTime, '10:00 PM');

  return {
    restaurantId: restaurant?._id,
    outletType: 'Appzeto delivery',
    timings: DAY_ORDER.map((day) => ({
      day,
      isOpen: openDays.size === 0 ? true : openDays.has(day),
      openingTime,
      closingTime,
    })),
    isActive: true,
  };
};

/**
 * Get outlet timings for the authenticated restaurant
 * @route GET /api/restaurant/outlet-timings
 */
export const getOutletTimings = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const restaurant = req.restaurant;

  let outletTimings = await OutletTimings.findOne({ restaurantId });

  // If no timings exist, create default timings
  if (!outletTimings) {
    outletTimings = await OutletTimings.create(buildFallbackOutletTimings(restaurant));
  }

  return successResponse(res, 200, 'Outlet timings retrieved successfully', {
    outletTimings
  });
});

/**
 * Get outlet timings by restaurant ID (public route)
 * @route GET /api/restaurant/:restaurantId/outlet-timings
 */
export const getOutletTimingsByRestaurantId = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;

  // Verify restaurant exists and is active
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant || !restaurant.isActive) {
    return errorResponse(res, 404, 'Restaurant not found');
  }

  const outletTimings = await OutletTimings.findOne({ 
    restaurantId,
    isActive: true 
  });

  if (!outletTimings) {
    // Return default timings if not set
    return successResponse(res, 200, 'Outlet timings retrieved successfully', {
      outletTimings: buildFallbackOutletTimings(restaurant)
    });
  }

  return successResponse(res, 200, 'Outlet timings retrieved successfully', {
    outletTimings
  });
});

/**
 * Create or update outlet timings for the authenticated restaurant
 * @route PUT /api/restaurant/outlet-timings
 */
export const upsertOutletTimings = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { outletType, timings } = req.body;

  // Validate timings array
  if (timings && !Array.isArray(timings)) {
    return errorResponse(res, 400, 'Timings must be an array');
  }

  // Validate all 7 days are present
  if (timings && timings.length !== 7) {
    return errorResponse(res, 400, 'All 7 days must be provided');
  }

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (timings) {
    const presentDays = timings.map(t => t.day);
    const allDaysPresent = dayOrder.every(day => presentDays.includes(day));
    if (!allDaysPresent) {
      return errorResponse(res, 400, 'All 7 days (Monday-Sunday) must be present');
    }

    // Validate each day's timing format
    for (const timing of timings) {
      if (!dayOrder.includes(timing.day)) {
        return errorResponse(res, 400, `Invalid day: ${timing.day}`);
      }

      // If day is open, validate times
      if (timing.isOpen) {
        if (!timing.openingTime || !timing.closingTime) {
          return errorResponse(res, 400, `Opening and closing times are required for ${timing.day} when open`);
        }
      }
    }
  }

  // Find existing outlet timings
  let outletTimings = await OutletTimings.findOne({ restaurantId });

  if (outletTimings) {
    // Update existing
    if (outletType) outletTimings.outletType = outletType;
    if (timings) {
      // Sort timings by day order
      timings.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
      outletTimings.timings = timings;
    }
    await outletTimings.save();
  } else {
    // Create new
    const defaultTimings = timings || [
      { day: 'Monday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
      { day: 'Tuesday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
      { day: 'Wednesday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
      { day: 'Thursday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
      { day: 'Friday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
      { day: 'Saturday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
      { day: 'Sunday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' }
    ];

    outletTimings = await OutletTimings.create({
      restaurantId,
      outletType: outletType || 'Appzeto delivery',
      timings: defaultTimings
    });
  }

  return successResponse(res, 200, 'Outlet timings updated successfully', {
    outletTimings
  });
});

/**
 * Update a specific day's timing
 * @route PATCH /api/restaurant/outlet-timings/day/:day
 */
export const updateDayTiming = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { day } = req.params;
  const { isOpen, openingTime, closingTime } = req.body;

  const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (!validDays.includes(day)) {
    return errorResponse(res, 400, 'Invalid day. Must be one of: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday');
  }

  let outletTimings = await OutletTimings.findOne({ restaurantId });

  if (!outletTimings) {
    // Create default timings if not exists
    outletTimings = await OutletTimings.create({
      restaurantId,
      outletType: 'Appzeto delivery',
      timings: [
        { day: 'Monday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Tuesday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Wednesday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Thursday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Friday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Saturday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Sunday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' }
      ]
    });
  }

  // Find and update the specific day
  const dayIndex = outletTimings.timings.findIndex(t => t.day === day);
  if (dayIndex === -1) {
    return errorResponse(res, 404, `Timing for ${day} not found`);
  }

  // Update the day's timing
  if (isOpen !== undefined) {
    outletTimings.timings[dayIndex].isOpen = isOpen;
  }
  if (openingTime !== undefined) {
    outletTimings.timings[dayIndex].openingTime = openingTime;
  }
  if (closingTime !== undefined) {
    outletTimings.timings[dayIndex].closingTime = closingTime;
  }

  // Validate: if opening, times must be provided
  if (outletTimings.timings[dayIndex].isOpen) {
    if (!outletTimings.timings[dayIndex].openingTime || !outletTimings.timings[dayIndex].closingTime) {
      return errorResponse(res, 400, 'Opening and closing times are required when day is open');
    }
  }

  await outletTimings.save();

  return successResponse(res, 200, `${day} timing updated successfully`, {
    outletTimings
  });
});

/**
 * Toggle outlet timings active status
 * @route PATCH /api/restaurant/outlet-timings/status
 */
export const toggleOutletTimingsStatus = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { isActive } = req.body;

  const outletTimings = await OutletTimings.findOne({ restaurantId });

  if (!outletTimings) {
    return errorResponse(res, 404, 'Outlet timings not found');
  }

  outletTimings.isActive = isActive !== undefined ? isActive : !outletTimings.isActive;
  await outletTimings.save();

  return successResponse(res, 200, `Outlet timings ${outletTimings.isActive ? 'activated' : 'deactivated'} successfully`, {
    outletTimings
  });
});

/**
 * Delete outlet timings (soft delete by setting isActive to false)
 * @route DELETE /api/restaurant/outlet-timings
 */
export const deleteOutletTimings = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;

  const outletTimings = await OutletTimings.findOne({ restaurantId });

  if (!outletTimings) {
    return errorResponse(res, 404, 'Outlet timings not found');
  }

  outletTimings.isActive = false;
  await outletTimings.save();

  return successResponse(res, 200, 'Outlet timings deleted successfully');
});


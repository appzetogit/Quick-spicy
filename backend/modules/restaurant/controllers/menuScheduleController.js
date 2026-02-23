import MenuItemSchedule from '../models/MenuItemSchedule.js';
import Menu from '../models/Menu.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

/**
 * Schedule menu item availability
 * POST /api/restaurant/menu/item/schedule
 */
export const scheduleItemAvailability = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { sectionId, itemId, scheduleType, customDateTime } = req.body;

  // Validation
  if (!sectionId || !itemId) {
    return errorResponse(res, 400, 'Section ID and Item ID are required');
  }

  if (!scheduleType || !['2-hours', '4-hours', 'next-business-day', 'custom', 'manual'].includes(scheduleType)) {
    return errorResponse(res, 400, 'Invalid schedule type');
  }

  // Find menu
  const menu = await Menu.findOne({ restaurant: restaurantId });
  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  // Verify item exists
  let itemFound = false;
  for (const section of menu.sections) {
    if (section.id === sectionId) {
      // Check in items
      if (section.items && section.items.some(item => item.id === itemId)) {
        itemFound = true;
        break;
      }
      // Check in subsections
      if (section.subsections && Array.isArray(section.subsections)) {
        for (const subsection of section.subsections) {
          if (subsection.items && subsection.items.some(item => item.id === itemId)) {
            itemFound = true;
            break;
          }
        }
      }
      if (itemFound) break;
    }
  }

  if (!itemFound) {
    return errorResponse(res, 404, 'Item not found in menu');
  }

  // Calculate scheduled date/time based on schedule type
  let scheduledDateTime = null;
  const now = new Date();

  if (scheduleType === '2-hours') {
    scheduledDateTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  } else if (scheduleType === '4-hours') {
    scheduledDateTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  } else if (scheduleType === 'next-business-day') {
    // Next business day (Monday-Friday, skip weekends)
    scheduledDateTime = new Date(now);
    scheduledDateTime.setDate(scheduledDateTime.getDate() + 1);
    // If it's Saturday, move to Monday
    if (scheduledDateTime.getDay() === 6) {
      scheduledDateTime.setDate(scheduledDateTime.getDate() + 2);
    }
    // If it's Sunday, move to Monday
    if (scheduledDateTime.getDay() === 0) {
      scheduledDateTime.setDate(scheduledDateTime.getDate() + 1);
    }
    // Set to 9 AM
    scheduledDateTime.setHours(9, 0, 0, 0);
  } else if (scheduleType === 'custom') {
    if (!customDateTime) {
      return errorResponse(res, 400, 'Custom date and time is required');
    }
    scheduledDateTime = new Date(customDateTime);
    
    // Validate: should be within 7 days
    const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (scheduledDateTime > maxDate) {
      return errorResponse(res, 400, 'Custom date cannot be more than 7 days in the future');
    }
    
    // Validate: should be in the future
    if (scheduledDateTime <= now) {
      return errorResponse(res, 400, 'Custom date must be in the future');
    }
  } else if (scheduleType === 'manual') {
    // For manual, we don't set a scheduledDateTime
    // Just mark the item as unavailable and don't create a schedule
    // Update the menu item directly
    menu.sections.forEach(section => {
      if (section.id === sectionId) {
        if (section.items && Array.isArray(section.items)) {
          section.items.forEach(item => {
            if (item.id === itemId) {
              item.isAvailable = false;
            }
          });
        }
        if (section.subsections && Array.isArray(section.subsections)) {
          section.subsections.forEach(subsection => {
            if (subsection.items && Array.isArray(subsection.items)) {
              subsection.items.forEach(item => {
                if (item.id === itemId) {
                  item.isAvailable = false;
                }
              });
            }
          });
        }
      }
    });
    await menu.save();

    // Cancel any existing schedules for this item
    await MenuItemSchedule.updateMany(
      {
        restaurant: restaurantId,
        sectionId,
        itemId,
        status: 'pending',
      },
      {
        status: 'cancelled',
        isActive: false,
      }
    );

    return successResponse(res, 200, 'Item availability updated (manual mode)', {
      menu: {
        sections: menu.sections,
      },
    });
  }

  // Cancel any existing pending schedules for this item
  await MenuItemSchedule.updateMany(
    {
      restaurant: restaurantId,
      sectionId,
      itemId,
      status: 'pending',
    },
    {
      status: 'cancelled',
      isActive: false,
    }
  );

  // Create new schedule
  const schedule = new MenuItemSchedule({
    restaurant: restaurantId,
    menuId: menu._id,
    sectionId,
    itemId,
    scheduleType,
    scheduledDateTime,
    status: 'pending',
    isActive: true,
  });

  await schedule.save();

  // Update menu item to unavailable
  menu.sections.forEach(section => {
    if (section.id === sectionId) {
      if (section.items && Array.isArray(section.items)) {
        section.items.forEach(item => {
          if (item.id === itemId) {
            item.isAvailable = false;
          }
        });
      }
      if (section.subsections && Array.isArray(section.subsections)) {
        section.subsections.forEach(subsection => {
          if (subsection.items && Array.isArray(subsection.items)) {
            subsection.items.forEach(item => {
              if (item.id === itemId) {
                item.isAvailable = false;
              }
            });
          }
        });
      }
    }
  });
  await menu.save();

  return successResponse(res, 200, 'Item availability scheduled successfully', {
    schedule: {
      id: schedule._id,
      scheduleType: schedule.scheduleType,
      scheduledDateTime: schedule.scheduledDateTime,
      status: schedule.status,
    },
    menu: {
      sections: menu.sections,
    },
  });
});

/**
 * Cancel scheduled availability
 * DELETE /api/restaurant/menu/item/schedule/:scheduleId
 */
export const cancelScheduledAvailability = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { scheduleId } = req.params;

  const schedule = await MenuItemSchedule.findOne({
    _id: scheduleId,
    restaurant: restaurantId,
    status: 'pending',
  });

  if (!schedule) {
    return errorResponse(res, 404, 'Schedule not found or already processed');
  }

  schedule.status = 'cancelled';
  schedule.isActive = false;
  await schedule.save();

  return successResponse(res, 200, 'Schedule cancelled successfully', {
    schedule: {
      id: schedule._id,
      status: schedule.status,
    },
  });
});

/**
 * Get scheduled availability for an item
 * GET /api/restaurant/menu/item/schedule/:sectionId/:itemId
 */
export const getItemSchedule = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { sectionId, itemId } = req.params;

  const schedule = await MenuItemSchedule.findOne({
    restaurant: restaurantId,
    sectionId,
    itemId,
    status: 'pending',
    isActive: true,
  }).sort({ createdAt: -1 });

  return successResponse(res, 200, 'Schedule retrieved successfully', {
    schedule: schedule ? {
      id: schedule._id,
      scheduleType: schedule.scheduleType,
      scheduledDateTime: schedule.scheduledDateTime,
      status: schedule.status,
    } : null,
  });
});


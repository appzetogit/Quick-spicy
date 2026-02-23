import MenuItemSchedule from '../models/MenuItemSchedule.js';
import Menu from '../models/Menu.js';

/**
 * Process scheduled menu item availability
 * This function should be called periodically (e.g., every minute via cron job)
 */
export const processScheduledAvailability = async () => {
  try {
    const now = new Date();
    
    // Find all pending schedules that are due
    const dueSchedules = await MenuItemSchedule.find({
      status: 'pending',
      isActive: true,
      scheduledDateTime: { $lte: now },
    });

    if (dueSchedules.length === 0) {
      return { processed: 0, message: 'No schedules to process' };
    }

    let processedCount = 0;
    let errorCount = 0;

    for (const schedule of dueSchedules) {
      try {
        const menu = await Menu.findById(schedule.menuId);
        if (!menu) {
          console.error(`Menu not found for schedule ${schedule._id}`);
          schedule.status = 'cancelled';
          schedule.isActive = false;
          await schedule.save();
          errorCount++;
          continue;
        }

        // Update menu item to available
        let itemFound = false;
        for (const section of menu.sections) {
          if (section.id === schedule.sectionId) {
            // Check in items
            if (section.items && Array.isArray(section.items)) {
              section.items.forEach(item => {
                if (item.id === schedule.itemId) {
                  item.isAvailable = true;
                  itemFound = true;
                }
              });
            }
            // Check in subsections
            if (section.subsections && Array.isArray(section.subsections)) {
              section.subsections.forEach(subsection => {
                if (subsection.items && Array.isArray(subsection.items)) {
                  subsection.items.forEach(item => {
                    if (item.id === schedule.itemId) {
                      item.isAvailable = true;
                      itemFound = true;
                    }
                  });
                }
              });
            }
          }
        }

        if (itemFound) {
          await menu.save();
          schedule.status = 'completed';
          schedule.isActive = false;
          await schedule.save();
          processedCount++;
        } else {
          console.error(`Item not found for schedule ${schedule._id}`);
          schedule.status = 'cancelled';
          schedule.isActive = false;
          await schedule.save();
          errorCount++;
        }
      } catch (error) {
        console.error(`Error processing schedule ${schedule._id}:`, error);
        errorCount++;
        // Mark as cancelled to prevent retry loops
        schedule.status = 'cancelled';
        schedule.isActive = false;
        await schedule.save();
      }
    }

    return {
      processed: processedCount,
      errors: errorCount,
      message: `Processed ${processedCount} schedules, ${errorCount} errors`,
    };
  } catch (error) {
    console.error('Error in processScheduledAvailability:', error);
    throw error;
  }
};

import mongoose from 'mongoose';

const menuItemScheduleSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    menuId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Menu',
      required: true,
      index: true,
    },
    sectionId: {
      type: String,
      required: true,
    },
    itemId: {
      type: String,
      required: true,
    },
    scheduleType: {
      type: String,
      enum: ['2-hours', '4-hours', 'next-business-day', 'custom', 'manual'],
      required: true,
    },
    scheduledDateTime: {
      type: Date,
      required: function() {
        return this.scheduleType !== 'manual';
      },
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
menuItemScheduleSchema.index({ restaurant: 1, status: 1, scheduledDateTime: 1 });
menuItemScheduleSchema.index({ menuId: 1, sectionId: 1, itemId: 1, status: 1 });

export default mongoose.model('MenuItemSchedule', menuItemScheduleSchema);


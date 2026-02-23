import mongoose from 'mongoose';

const dayTimingSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    required: true
  },
  isOpen: {
    type: Boolean,
    default: true
  },
  openingTime: {
    type: String,
    default: '09:00 AM',
    // Format: "HH:MM AM/PM" or "HH:MM"
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow empty if closed
        // Match formats like "09:00 AM", "9:00 AM", "09:00", "9:00"
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM|am|pm)?$/.test(v) || 
               /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Opening time must be in format HH:MM AM/PM or HH:MM'
    }
  },
  closingTime: {
    type: String,
    default: '10:00 PM',
    // Format: "HH:MM AM/PM" or "HH:MM"
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow empty if closed
        // Match formats like "10:00 PM", "22:00", etc.
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM|am|pm)?$/.test(v) || 
               /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Closing time must be in format HH:MM AM/PM or HH:MM'
    }
  }
}, { _id: false });

const outletTimingsSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      unique: true
    },
    outletType: {
      type: String,
      enum: ['Appzeto delivery', 'Dining', 'Takeaway', 'All'],
      default: 'Appzeto delivery'
    },
    timings: {
      type: [dayTimingSchema],
      default: [
        { day: 'Monday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Tuesday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Wednesday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Thursday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Friday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Saturday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Sunday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' }
      ],
      validate: {
        validator: function(v) {
          // Ensure all 7 days are present
          if (v.length !== 7) return false;
          const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
          const presentDays = v.map(t => t.day);
          return days.every(day => presentDays.includes(day));
        },
        message: 'All 7 days must be present in timings'
      }
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Index for faster queries
outletTimingsSchema.index({ restaurantId: 1, outletType: 1 });

// Ensure timings are always sorted by day order
outletTimingsSchema.pre('save', function(next) {
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (this.timings && this.timings.length > 0) {
    this.timings.sort((a, b) => {
      return dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
    });
  }
  next();
});

const OutletTimings = mongoose.model('OutletTimings', outletTimingsSchema);

export default OutletTimings;


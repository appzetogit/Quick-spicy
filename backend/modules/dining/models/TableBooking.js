import mongoose from "mongoose";

const tableBookingSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    guests: {
      type: Number,
      required: true,
      min: 1,
    },
    date: {
      type: Date,
      required: true,
    },
    timeSlot: {
      type: String,
      required: true,
    },
    specialRequest: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "checked-in", "completed", "cancelled"],
      default: "confirmed",
    },
    checkInTime: {
      type: Date,
    },
    checkOutTime: {
      type: Date,
    },
    bookingId: {
      type: String,
      unique: true,
    },
  },
  {
    timestamps: true,
  },
);

// Generate a random 8-character booking ID before saving
tableBookingSchema.pre("save", async function (next) {
  if (!this.bookingId) {
    this.bookingId =
      "BK" + Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

const TableBooking = mongoose.model("TableBooking", tableBookingSchema);
export default TableBooking;

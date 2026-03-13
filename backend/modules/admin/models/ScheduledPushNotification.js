import mongoose from "mongoose";

const scheduledPushNotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    imageUrl: {
      type: String,
      default: "",
      trim: true,
    },
    target: {
      type: String,
      enum: ["customer", "delivery", "restaurant", "all"],
      default: "customer",
      index: true,
    },
    platform: {
      type: String,
      enum: ["all", "web", "mobile"],
      default: "all",
    },
    zone: {
      type: String,
      default: "All",
      trim: true,
    },
    scheduleAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "processing", "sent", "failed", "cancelled"],
      default: "scheduled",
      index: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    errorMessage: {
      type: String,
      default: "",
      trim: true,
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

scheduledPushNotificationSchema.index({ status: 1, scheduleAt: 1 });

export default mongoose.model("ScheduledPushNotification", scheduledPushNotificationSchema);


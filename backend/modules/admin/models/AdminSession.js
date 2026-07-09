import mongoose from "mongoose";

const adminSessionSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    refreshTokenHash: {
      type: String,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
      trim: true,
    },
    userAgent: {
      type: String,
      default: null,
      trim: true,
    },
    deviceName: {
      type: String,
      default: null,
      trim: true,
    },
    browser: {
      type: String,
      default: null,
      trim: true,
    },
    os: {
      type: String,
      default: null,
      trim: true,
    },
    deviceType: {
      type: String,
      enum: ["desktop", "mobile", "tablet", "bot", "unknown"],
      default: "unknown",
    },
    locationPermission: {
      type: String,
      enum: ["prompt", "granted", "denied", "unavailable"],
      default: "prompt",
    },
    location: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      address: { type: String, default: null, trim: true },
      city: { type: String, default: null, trim: true },
      region: { type: String, default: null, trim: true },
      country: { type: String, default: null, trim: true },
      source: { type: String, default: null, trim: true },
      capturedAt: { type: Date, default: null },
    },
    loginAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokeReason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

adminSessionSchema.index({ admin: 1, isActive: 1, lastSeenAt: -1 });

const AdminSession = mongoose.model("AdminSession", adminSessionSchema);

export default AdminSession;

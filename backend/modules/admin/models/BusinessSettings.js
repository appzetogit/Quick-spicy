import mongoose from "mongoose";

const businessSettingsSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
      default: "Appzeto Food",
    },
    email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      default: "",
    },
    region: {
      type: String,
      required: true,
      enum: ["India", "UK", "US"],
      default: "India",
    },
    phone: {
      countryCode: {
        type: String,
        required: false,
        default: "+91",
      },
      number: {
        type: String,
        required: false,
        trim: true,
        default: "",
      },
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    pincode: {
      type: String,
      trim: true,
      default: "",
    },
    logo: {
      url: {
        type: String,
        default: "",
      },
      publicId: {
        type: String,
        default: "",
      },
    },
    favicon: {
      url: {
        type: String,
        default: "",
      },
      publicId: {
        type: String,
        default: "",
      },
    },
    maintenanceMode: {
      isEnabled: {
        type: Boolean,
        default: false,
      },
      startDate: {
        type: Date,
        default: null,
      },
      endDate: {
        type: Date,
        default: null,
      },
    },
    // Global Delivery Partner cash limit (applies to all delivery partners)
    // Used for "Available cash limit" in delivery Pocket/Wallet UI.
    deliveryCashLimit: {
      type: Number,
      default: 750,
      min: 0,
    },
    // Minimum amount above which delivery boy can withdraw. Withdrawal allowed only when withdrawable amount >= this.
    deliveryWithdrawalLimit: {
      type: Number,
      default: 100,
      min: 0,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
businessSettingsSchema.index({ createdAt: -1 });

// Ensure only one document exists
businessSettingsSchema.statics.getSettings = async function () {
  try {
    let settings = await this.findOne();
    if (!settings) {
      settings = await this.create({
        companyName: "Appzeto Food",
        region: "India",
        email: "info@appzetofood.com",
        phone: {
          countryCode: "+91",
          number: "",
        },
        deliveryCashLimit: 750,
        deliveryWithdrawalLimit: 100,
      });
    }
    return settings;
  } catch (error) {
    console.error("Error in getSettings:", error);
    // If creation fails, try to return existing or create minimal document
    let settings = await this.findOne();
    if (!settings) {
      // Create with minimal required fields
      settings = new this({
        companyName: "Appzeto Food",
        region: "India",
        email: "info@appzetofood.com",
        phone: {
          countryCode: "+91",
          number: "",
        },
        deliveryCashLimit: 750,
        deliveryWithdrawalLimit: 100,
      });
      await settings.save();
    }
    return settings;
  }
};

export default mongoose.model("BusinessSettings", businessSettingsSchema);

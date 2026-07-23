import Admin from "../models/Admin.js";
import Order from "../../order/models/Order.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import Zone from "../models/Zone.js";
import Delivery from "../../delivery/models/Delivery.js";
import OutletTimings from "../../restaurant/models/OutletTimings.js";
import Menu from "../../restaurant/models/Menu.js";
import User from "../../auth/models/User.js";
import Offer from "../../restaurant/models/Offer.js";
import AdminCommission from "../models/AdminCommission.js";
import OrderSettlement from "../../order/models/OrderSettlement.js";
import AdminWallet from "../models/AdminWallet.js";
import { deleteRestaurantRelatedData } from "../../restaurant/services/deleteRestaurantData.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { normalizePhoneNumber } from "../../../shared/utils/phoneUtils.js";
import winston from "winston";
import mongoose from "mongoose";
import { uploadToCloudinary } from "../../../shared/utils/cloudinaryService.js";
import { initializeCloudinary } from "../../../config/cloudinary.js";
import { revokeAllAdminSessions } from "../services/adminSessionService.js";
import { clearAuthCookies } from "../../../shared/utils/authCookies.js";
import { escapeRegex } from "../../../shared/utils/regex.js";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

const normalizeSpecialDishes = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((dish) => ({
      name: String(dish?.name || "").trim(),
      price: Number(dish?.price),
    }))
    .filter(
      (dish) =>
        dish.name &&
        Number.isFinite(dish.price) &&
        dish.price > 0,
    );
};

const getEffectiveOfferEndDate = (endDateValue) => {
  if (!endDateValue) return null;
  const endDate = new Date(endDateValue);
  if (Number.isNaN(endDate.getTime())) return null;

  const isUtcMidnight =
    endDate.getUTCHours() === 0 &&
    endDate.getUTCMinutes() === 0 &&
    endDate.getUTCSeconds() === 0 &&
    endDate.getUTCMilliseconds() === 0;

  const isLocalMidnight =
    endDate.getHours() === 0 &&
    endDate.getMinutes() === 0 &&
    endDate.getSeconds() === 0 &&
    endDate.getMilliseconds() === 0;

  if (isUtcMidnight || isLocalMidnight) {
    endDate.setHours(23, 59, 59, 999);
  }

  return endDate;
};

const attachMappedZoneToRestaurant = async (restaurantDoc) => {
  if (!restaurantDoc?._id) return restaurantDoc;

  const explicitZoneId = restaurantDoc.zoneId
    ? restaurantDoc.zoneId?.toString?.() || String(restaurantDoc.zoneId)
    : "";

  let mappedZone = null;
  if (explicitZoneId && mongoose.Types.ObjectId.isValid(explicitZoneId)) {
    mappedZone = await Zone.findOne({
      _id: explicitZoneId,
      isActive: true,
    })
      .select("_id name zoneName")
      .lean();
  }

  if (!mappedZone) {
    mappedZone = await Zone.findOne({
      restaurantId: restaurantDoc._id,
      isActive: true,
    })
      .select("_id name zoneName")
      .lean();
  }

  if (!mappedZone) return restaurantDoc;

  return {
    ...restaurantDoc,
    zoneId: mappedZone._id?.toString?.() || String(mappedZone._id),
    restaurantZoneId: mappedZone._id?.toString?.() || String(mappedZone._id),
    zone:
      mappedZone.name ||
      mappedZone.zoneName ||
      restaurantDoc.zone ||
      restaurantDoc.location?.area ||
      restaurantDoc.location?.city ||
      "",
  };
};

/**
 * Get Admin Dashboard Statistics
 * GET /api/admin/dashboard/stats
 */
export const getDashboardStats = asyncHandler(async (req, res) => {
  try {
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const pendingRestaurantRequestsQuery = {
      isActive: false,
      $and: [
        {
          $or: [
            { "onboarding.completedSteps": 4 },
            {
              $and: [
                { name: { $exists: true, $ne: null, $ne: "" } },
                { cuisines: { $exists: true, $ne: null, $not: { $size: 0 } } },
                { openDays: { $exists: true, $ne: null, $not: { $size: 0 } } },
                {
                  estimatedDeliveryTime: { $exists: true, $ne: null, $ne: "" },
                },
                { featuredDish: { $exists: true, $ne: null, $ne: "" } },
              ],
            },
          ],
        },
        {
          $or: [
            { rejectionReason: { $exists: false } },
            { rejectionReason: null },
          ],
        },
      ],
    };
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yearAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    yearAgo.setHours(0, 0, 0, 0);

    const [
      revenueStats,
      settlementStats,
      orderStats,
      activeRestaurants,
      pendingRestaurantRequests,
      totalDeliveryBoys,
      pendingDeliveryBoyRequests,
      menuTotals,
      totalCustomers,
      recentOrders,
      recentRestaurants,
      activeDeliveryPartners,
      monthlyStats,
    ] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            status: "delivered",
            "pricing.total": { $exists: true },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$pricing.total" },
            last30DaysRevenue: {
              $sum: {
                $cond: [{ $gte: ["$createdAt", last30Days] }, "$pricing.total", 0],
              },
            },
          },
        },
      ]),
      OrderSettlement.aggregate([
        {
          $lookup: {
            from: "orders",
            localField: "orderId",
            foreignField: "_id",
            as: "order",
          },
        },
        { $unwind: "$order" },
        {
          $match: {
            "order.status": "delivered",
          },
        },
        {
          $group: {
            _id: null,
            totalCommission: { $sum: "$adminEarning.commission" },
            totalPlatformFee: { $sum: "$adminEarning.platformFee" },
            totalDeliveryFee: { $sum: "$adminEarning.deliveryFee" },
            totalGST: { $sum: "$adminEarning.gst" },
            last30DaysCommission: {
              $sum: {
                $cond: [
                  { $gte: ["$createdAt", last30Days] },
                  "$adminEarning.commission",
                  0,
                ],
              },
            },
            last30DaysPlatformFee: {
              $sum: {
                $cond: [
                  { $gte: ["$createdAt", last30Days] },
                  "$adminEarning.platformFee",
                  0,
                ],
              },
            },
            last30DaysDeliveryFee: {
              $sum: {
                $cond: [
                  { $gte: ["$createdAt", last30Days] },
                  "$adminEarning.deliveryFee",
                  0,
                ],
              },
            },
            last30DaysGST: {
              $sum: {
                $cond: [
                  { $gte: ["$createdAt", last30Days] },
                  "$adminEarning.gst",
                  0,
                ],
              },
            },
          },
        },
      ]),
      Order.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      Restaurant.countDocuments({ isActive: true }),
      Restaurant.countDocuments(pendingRestaurantRequestsQuery),
      Delivery.countDocuments({}),
      Delivery.countDocuments({
        $or: [{ status: "pending" }, { isActive: false }],
      }),
      Menu.aggregate([
        {
          $match: {
            isActive: true,
          },
        },
        {
          $project: {
            foodsCount: {
              $reduce: {
                input: { $ifNull: ["$sections", []] },
                initialValue: 0,
                in: {
                  $add: [
                    "$$value",
                    {
                      $size: {
                        $filter: {
                          input: { $ifNull: ["$$this.items", []] },
                          as: "item",
                          cond: {
                            $and: [
                              { $eq: [{ $type: "$$item.id" }, "string"] },
                              { $ne: [{ $trim: { input: "$$item.id" } }, ""] },
                              { $eq: [{ $type: "$$item.name" }, "string"] },
                              { $ne: [{ $trim: { input: "$$item.name" } }, ""] },
                              {
                                $ne: [
                                  { $ifNull: ["$$item.approvalStatus", ""] },
                                  "rejected",
                                ],
                              },
                            ],
                          },
                        },
                      },
                    },
                    {
                      $reduce: {
                        input: { $ifNull: ["$$this.subsections", []] },
                        initialValue: 0,
                        in: {
                          $add: [
                            "$$value",
                            {
                              $size: {
                                $filter: {
                                  input: { $ifNull: ["$$this.items", []] },
                                  as: "item",
                                  cond: {
                                    $and: [
                                      {
                                        $eq: [{ $type: "$$item.id" }, "string"],
                                      },
                                      {
                                        $ne: [
                                          { $trim: { input: "$$item.id" } },
                                          "",
                                        ],
                                      },
                                      {
                                        $eq: [{ $type: "$$item.name" }, "string"],
                                      },
                                      {
                                        $ne: [
                                          { $trim: { input: "$$item.name" } },
                                          "",
                                        ],
                                      },
                                      {
                                        $ne: [
                                          {
                                            $ifNull: [
                                              "$$item.approvalStatus",
                                              "",
                                            ],
                                          },
                                          "rejected",
                                        ],
                                      },
                                    ],
                                  },
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            },
            addonsCount: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$addons", []] },
                  as: "addon",
                  cond: {
                    $and: [
                      { $eq: [{ $type: "$$addon.id" }, "string"] },
                      { $ne: [{ $trim: { input: "$$addon.id" } }, ""] },
                      { $eq: [{ $type: "$$addon.name" }, "string"] },
                      { $ne: [{ $trim: { input: "$$addon.name" } }, ""] },
                      {
                        $ne: [
                          { $ifNull: ["$$addon.approvalStatus", ""] },
                          "rejected",
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          $group: {
            _id: null,
            totalFoods: { $sum: "$foodsCount" },
            totalAddons: { $sum: "$addonsCount" },
          },
        },
      ]),
      User.countDocuments({
        $or: [{ role: "user" }, { role: { $exists: false } }, { role: null }],
      }),
      Order.countDocuments({
        createdAt: { $gte: last24Hours },
      }),
      Restaurant.countDocuments({
        createdAt: { $gte: last24Hours },
        isActive: true,
      }),
      Delivery.countDocuments({
        isActive: true,
      }),
      Order.aggregate([
        {
          $match: {
            status: "delivered",
            deliveredAt: { $gte: yearAgo, $lte: now },
          },
        },
        {
          $lookup: {
            from: "ordersettlements",
            localField: "_id",
            foreignField: "orderId",
            as: "settlement",
          },
        },
        {
          $unwind: {
            path: "$settlement",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$deliveredAt" },
              month: { $month: "$deliveredAt" },
            },
            revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
            commission: {
              $sum: { $ifNull: ["$settlement.adminEarning.commission", 0] },
            },
            orders: { $sum: 1 },
          },
        },
        {
          $sort: {
            "_id.year": 1,
            "_id.month": 1,
          },
        },
      ]),
    ]);

    const revenueData = revenueStats[0] || {
      totalRevenue: 0,
      last30DaysRevenue: 0,
    };

    const settlementData = settlementStats[0] || {
      totalCommission: 0,
      totalPlatformFee: 0,
      totalDeliveryFee: 0,
      totalGST: 0,
      last30DaysCommission: 0,
      last30DaysPlatformFee: 0,
      last30DaysDeliveryFee: 0,
      last30DaysGST: 0,
    };

    const totalCommission =
      Math.round((settlementData.totalCommission || 0) * 100) / 100;
    const totalPlatformFee =
      Math.round((settlementData.totalPlatformFee || 0) * 100) / 100;
    const totalDeliveryFee =
      Math.round((settlementData.totalDeliveryFee || 0) * 100) / 100;
    const totalGST = Math.round((settlementData.totalGST || 0) * 100) / 100;

    const last30DaysCommission = settlementData.last30DaysCommission || 0;
    const last30DaysPlatformFee = settlementData.last30DaysPlatformFee || 0;
    const last30DaysDeliveryFee = settlementData.last30DaysDeliveryFee || 0;
    const last30DaysGST = settlementData.last30DaysGST || 0;

    const orderStatusMap = {};
    orderStats.forEach((stat) => {
      orderStatusMap[stat._id] = stat.count;
    });

    const totalOrders = orderStatusMap.delivered || 0;
    const activePartners = activeRestaurants + activeDeliveryPartners;
    const totalRestaurants = activeRestaurants;
    const menuTotalsData = menuTotals[0] || { totalFoods: 0, totalAddons: 0 };
    const totalFoods = menuTotalsData.totalFoods || 0;
    const totalAddons = menuTotalsData.totalAddons || 0;

    const pendingOrders = orderStatusMap.pending || 0;
    const completedOrders = orderStatusMap.delivered || 0;

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const monthlyDataMap = new Map();
    monthlyStats.forEach(stat => {
      if (stat._id && stat._id.month) {
        const monthIndex = stat._id.month - 1; // MongoDB months are 1-indexed
        const monthName = monthNames[monthIndex];
        const key = `${stat._id.year}-${stat._id.month}`;
        monthlyDataMap.set(key, {
          month: monthName,
          revenue: Math.round(stat.revenue * 100) / 100,
          commission: Math.round(stat.commission * 100) / 100,
          orders: stat.orders
        });
      }
    });

    const monthlyData = [];
    for (let i = 11; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;
      const key = `${year}-${month}`;
      
      const existing = monthlyDataMap.get(key);
      if (existing) {
        monthlyData.push(existing);
      } else {
        monthlyData.push({
          month: monthNames[targetDate.getMonth()],
          revenue: 0,
          commission: 0,
          orders: 0
        });
      }
    }

    return successResponse(res, 200, "Dashboard stats retrieved successfully", {
      revenue: {
        total: revenueData.totalRevenue || 0,
        last30Days: revenueData.last30DaysRevenue || 0,
        currency: "INR",
      },
      commission: {
        total: totalCommission,
        last30Days: last30DaysCommission,
        currency: "INR",
      },
      platformFee: {
        total: totalPlatformFee,
        last30Days: last30DaysPlatformFee,
        currency: "INR",
      },
      deliveryFee: {
        total: totalDeliveryFee,
        last30Days: last30DaysDeliveryFee,
        currency: "INR",
      },
      gst: {
        total: totalGST,
        last30Days: last30DaysGST,
        currency: "INR",
      },
      totalAdminEarnings: {
        total: totalCommission + totalPlatformFee + totalDeliveryFee + totalGST,
        last30Days:
          last30DaysCommission +
          last30DaysPlatformFee +
          last30DaysDeliveryFee +
          last30DaysGST,
        currency: "INR",
      },
      orders: {
        total: totalOrders,
        byStatus: {
          pending: orderStatusMap.pending || 0,
          confirmed: orderStatusMap.confirmed || 0,
          preparing: orderStatusMap.preparing || 0,
          ready: orderStatusMap.ready || 0,
          out_for_delivery: orderStatusMap.out_for_delivery || 0,
          delivered: orderStatusMap.delivered || 0,
          cancelled: orderStatusMap.cancelled || 0,
        },
      },
      partners: {
        total: activePartners,
        restaurants: activeRestaurants,
        delivery: activeDeliveryPartners,
      },
      recentActivity: {
        orders: recentOrders,
        restaurants: recentRestaurants,
        period: "last24Hours",
      },
      monthlyData: monthlyData, // Add monthly data for graphs
      // Additional stats
      restaurants: {
        total: totalRestaurants,
        active: activeRestaurants,
        pendingRequests: pendingRestaurantRequests,
      },
      deliveryBoys: {
        total: totalDeliveryBoys,
        active: activeDeliveryPartners,
        pendingRequests: pendingDeliveryBoyRequests,
      },
      foods: {
        total: totalFoods,
      },
      addons: {
        total: totalAddons,
      },
      customers: {
        total: totalCustomers,
      },
      orderStats: {
        pending: pendingOrders,
        completed: completedOrders,
      },
    });
  } catch (error) {
    logger.error(`Error fetching dashboard stats: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch dashboard statistics");
  }
});

/**
 * Get All Admins
 * GET /api/admin/admins
 */
export const getAdmins = asyncHandler(async (req, res) => {
  try {
    const { limit = 50, offset = 0, search } = req.query;

    const query = {};

    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const admins = await Admin.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    const total = await Admin.countDocuments(query);

    return successResponse(res, 200, "Admins retrieved successfully", {
      admins,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    logger.error(`Error fetching admins: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch admins");
  }
});

/**
 * Get Admin by ID
 * GET /api/admin/admins/:id
 */
export const getAdminById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await Admin.findById(id).select("-password").lean();

    if (!admin) {
      return errorResponse(res, 404, "Admin not found");
    }

    return successResponse(res, 200, "Admin retrieved successfully", { admin });
  } catch (error) {
    logger.error(`Error fetching admin: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch admin");
  }
});

/**
 * Create Admin (only by existing admin)
 * POST /api/admin/admins
 */
export const createAdmin = asyncHandler(async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Validation
    if (!name || !email || !password) {
      return errorResponse(res, 400, "Name, email, and password are required");
    }

    if (password.length < 6) {
      return errorResponse(
        res,
        400,
        "Password must be at least 6 characters long",
      );
    }

    // Check if admin already exists with this email
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return errorResponse(res, 400, "Admin already exists with this email");
    }

    // Create new admin
    const adminData = {
      name,
      email: email.toLowerCase(),
      password,
      isActive: true,
      phoneVerified: false,
    };

    if (phone) {
      adminData.phone = phone;
    }

    const admin = await Admin.create(adminData);

    // Remove password from response
    const adminResponse = admin.toObject();
    delete adminResponse.password;

    logger.info(`Admin created: ${admin._id}`, {
      email,
      createdBy: req.user._id,
    });

    return successResponse(res, 201, "Admin created successfully", {
      admin: adminResponse,
    });
  } catch (error) {
    logger.error(`Error creating admin: ${error.message}`);

    if (error.code === 11000) {
      return errorResponse(res, 400, "Admin with this email already exists");
    }

    return errorResponse(res, 500, "Failed to create admin");
  }
});

/**
 * Update Admin
 * PUT /api/admin/admins/:id
 */
export const updateAdmin = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, isActive } = req.body;

    const admin = await Admin.findById(id);

    if (!admin) {
      return errorResponse(res, 404, "Admin not found");
    }

    // Prevent updating own account's isActive status
    if (id === req.user._id.toString() && isActive === false) {
      return errorResponse(res, 400, "You cannot deactivate your own account");
    }

    // Update fields
    if (name) admin.name = name;
    if (email) admin.email = email.toLowerCase();
    if (phone !== undefined) admin.phone = phone;
    if (isActive !== undefined) admin.isActive = isActive;

    await admin.save();

    const adminResponse = admin.toObject();
    delete adminResponse.password;

    logger.info(`Admin updated: ${id}`, { updatedBy: req.user._id });

    return successResponse(res, 200, "Admin updated successfully", {
      admin: adminResponse,
    });
  } catch (error) {
    logger.error(`Error updating admin: ${error.message}`);

    if (error.code === 11000) {
      return errorResponse(res, 400, "Admin with this email already exists");
    }

    return errorResponse(res, 500, "Failed to update admin");
  }
});

/**
 * Delete Admin
 * DELETE /api/admin/admins/:id
 */
export const deleteAdmin = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting own account
    if (id === req.user._id.toString()) {
      return errorResponse(res, 400, "You cannot delete your own account");
    }

    const admin = await Admin.findById(id);

    if (!admin) {
      return errorResponse(res, 404, "Admin not found");
    }

    await Admin.deleteOne({ _id: id });

    logger.info(`Admin deleted: ${id}`, { deletedBy: req.user._id });

    return successResponse(res, 200, "Admin deleted successfully");
  } catch (error) {
    logger.error(`Error deleting admin: ${error.message}`);
    return errorResponse(res, 500, "Failed to delete admin");
  }
});

/**
 * Get Current Admin Profile
 * GET /api/admin/profile
 */
export const getAdminProfile = asyncHandler(async (req, res) => {
  try {
    const admin = await Admin.findById(req.user._id).select("-password").lean();

    if (!admin) {
      return errorResponse(res, 404, "Admin profile not found");
    }

    return successResponse(res, 200, "Admin profile retrieved successfully", {
      admin,
    });
  } catch (error) {
    logger.error(`Error fetching admin profile: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch admin profile");
  }
});

/**
 * Update Current Admin Profile
 * PUT /api/admin/profile
 */
export const updateAdminProfile = asyncHandler(async (req, res) => {
  try {
    const { name, phone, profileImage } = req.body;

    const admin = await Admin.findById(req.user._id);

    if (!admin) {
      return errorResponse(res, 404, "Admin profile not found");
    }

    // Update fields (email cannot be changed via profile update)
    if (name !== undefined && name !== null) {
      admin.name = name.trim();
    }

    if (phone !== undefined) {
      // Allow empty string to clear phone number. Admin-managed phone is treated as OTP-verified.
      const normalizedPhone = phone ? normalizePhoneNumber(phone) : "";
      if (phone && !normalizedPhone) {
        return errorResponse(res, 400, "Invalid phone number format");
      }
      admin.phone = normalizedPhone || null;
      admin.phoneVerified = Boolean(normalizedPhone);
    }

    if (profileImage !== undefined) {
      // Allow empty string to clear profile image
      admin.profileImage = profileImage || null;
    }

    // Save to database
    await admin.save();

    // Remove password from response
    const adminResponse = admin.toObject();
    delete adminResponse.password;

    logger.info(`Admin profile updated: ${admin._id}`, {
      updatedFields: {
        name,
        phone,
        profileImage: profileImage ? "updated" : "not changed",
      },
    });

    return successResponse(res, 200, "Profile updated successfully", {
      admin: adminResponse,
    });
  } catch (error) {
    logger.error(`Error updating admin profile: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update profile");
  }
});

/**
 * Change Admin Password
 * PUT /api/admin/settings/change-password
 */
export const changeAdminPassword = asyncHandler(async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return errorResponse(
        res,
        400,
        "Current password and new password are required",
      );
    }

    if (newPassword.length < 6) {
      return errorResponse(
        res,
        400,
        "New password must be at least 6 characters long",
      );
    }

    // Get admin with password field
    const admin = await Admin.findById(req.user._id).select("+password");

    if (!admin) {
      return errorResponse(res, 404, "Admin not found");
    }

    // Verify current password
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);

    if (!isCurrentPasswordValid) {
      return errorResponse(res, 401, "Current password is incorrect");
    }

    // Check if new password is same as current
    const isSamePassword = await admin.comparePassword(newPassword);
    if (isSamePassword) {
      return errorResponse(
        res,
        400,
        "New password must be different from current password",
      );
    }

    // Update password (pre-save hook will hash it)
    admin.password = newPassword;
    admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    await admin.save();
    await revokeAllAdminSessions(admin._id, "password-changed");

    clearAuthCookies(res, "admin");

    logger.info(`Admin password changed: ${admin._id}`, {
      tokenVersion: admin.tokenVersion,
    });

    return successResponse(
      res,
      200,
      "Password changed successfully. All active admin sessions have been revoked.",
      {
        forceReauth: true,
      },
    );
  } catch (error) {
    logger.error(`Error changing admin password: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to change password");
  }
});

/**
 * Get All Users (Customers) with Order Statistics
 * GET /api/admin/users
 */
export const getUsers = asyncHandler(async (req, res) => {
  try {
    const {
      limit = 100,
      offset = 0,
      search,
      status,
      sortBy,
      orderDate,
      joiningDate,
    } = req.query;
    const User = (await import("../../auth/models/User.js")).default;

    // Build query
    const query = { role: "user" }; // Only get users, not restaurants/delivery/admins

    // Search filter
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
        { phone: { $regex: safeSearch, $options: "i" } },
      ];
    }

    // Status filter
    if (status === "active") {
      query.isActive = true;
    } else if (status === "inactive") {
      query.isActive = false;
    }

    // Joining date filter
    if (joiningDate) {
      const startDate = new Date(joiningDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(joiningDate);
      endDate.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    // Order date filter
    if (orderDate) {
      const startDate = new Date(orderDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(orderDate);
      endDate.setHours(23, 59, 59, 999);

      const orderDateUserIds = await Order.distinct("userId", {
        createdAt: { $gte: startDate, $lte: endDate },
        userId: { $ne: null },
      });

      query._id = { $in: orderDateUserIds };
    }

    // Get users
    const users = await User.find(query)
      .select("-password -__v")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    // Get user IDs
    const userIds = users.map((user) => user._id);

    // Get order statistics for each user
    const orderStats = await Order.aggregate([
      {
        $match: {
          userId: { $in: userIds },
        },
      },
      {
        $group: {
          _id: "$userId",
          totalOrders: { $sum: 1 },
          totalAmount: {
            $sum: {
              $convert: {
                input: {
                  $ifNull: ["$pricing.total", { $ifNull: ["$total", 0] }],
                },
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
        },
      },
    ]);

    // Create a map of userId -> stats
    const statsMap = {};
    orderStats.forEach((stat) => {
      statsMap[stat._id.toString()] = {
        totalOrder: stat.totalOrders || 0,
        totalOrderAmount: Number(stat.totalAmount || 0),
      };
    });

    // Format users with order statistics
    const formattedUsers = users.map((user, index) => {
      const stats = statsMap[user._id.toString()] || {
        totalOrder: 0,
        totalOrderAmount: 0,
      };

      // Format joining date
      const joiningDate = new Date(user.createdAt);
      const formattedDate = joiningDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      return {
        sl: parseInt(offset) + index + 1,
        id: user._id.toString(),
        name: user.name || "N/A",
        email: user.email || "N/A",
        phone: user.phone || "N/A",
        totalOrder: stats.totalOrder,
        totalOrderAmount: stats.totalOrderAmount,
        joiningDate: formattedDate,
        status: user.isActive !== false, // Default to true if not set
        createdAt: user.createdAt,
      };
    });

    // Apply sorting
    if (sortBy) {
      if (sortBy === "name-asc") {
        formattedUsers.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortBy === "name-desc") {
        formattedUsers.sort((a, b) => b.name.localeCompare(a.name));
      } else if (sortBy === "orders-asc") {
        formattedUsers.sort((a, b) => a.totalOrder - b.totalOrder);
      } else if (sortBy === "orders-desc") {
        formattedUsers.sort((a, b) => b.totalOrder - a.totalOrder);
      }
    }

    const total = await User.countDocuments(query);

    return successResponse(res, 200, "Users retrieved successfully", {
      users: formattedUsers,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    logger.error(`Error fetching users: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch users");
  }
});

/**
 * Get User by ID with Full Details
 * GET /api/admin/users/:id
 */
export const getUserById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const User = (await import("../../auth/models/User.js")).default;

    const user = await User.findById(id).select("-password -__v").lean();

    if (!user) {
      return errorResponse(res, 404, "User not found");
    }

    // Get order statistics
    const orderStats = await Order.aggregate([
      {
        $match: { userId: user._id },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalAmount: {
            $sum: {
              $convert: {
                input: {
                  $ifNull: ["$pricing.total", { $ifNull: ["$total", 0] }],
                },
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
          orders: {
            $push: {
              orderId: "$orderId",
              status: "$status",
              total: "$pricing.total",
              createdAt: "$createdAt",
              restaurantName: "$restaurantName",
            },
          },
        },
      },
    ]);

    const stats = orderStats[0] || {
      totalOrders: 0,
      totalAmount: 0,
      orders: [],
    };

    // Format joining date
    const joiningDate = new Date(user.createdAt);
    const formattedDate = joiningDate.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    return successResponse(res, 200, "User retrieved successfully", {
      user: {
        id: user._id.toString(),
        name: user.name || "N/A",
        email: user.email || "N/A",
        phone: user.phone || "N/A",
        phoneVerified: user.phoneVerified || false,
        profileImage: user.profileImage || null,
        role: user.role,
        signupMethod: user.signupMethod,
        isActive: user.isActive !== false,
        addresses: user.addresses || [],
        preferences: user.preferences || {},
        wallet: user.wallet || {},
        dateOfBirth: user.dateOfBirth || null,
        anniversary: user.anniversary || null,
        gender: user.gender || null,
        joiningDate: formattedDate,
        createdAt: user.createdAt,
        totalOrders: stats.totalOrders,
        totalOrderAmount: stats.totalAmount,
        orders: stats.orders.slice(0, 10), // Last 10 orders
      },
    });
  } catch (error) {
    logger.error(`Error fetching user: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch user");
  }
});

/**
 * Update User Status (Active/Inactive)
 * PUT /api/admin/users/:id/status
 */
export const updateUserStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const User = (await import("../../auth/models/User.js")).default;

    if (typeof isActive !== "boolean") {
      return errorResponse(res, 400, "isActive must be a boolean value");
    }

    const user = await User.findById(id);

    if (!user) {
      return errorResponse(res, 404, "User not found");
    }

    user.isActive = isActive;
    await user.save();

    logger.info(`User status updated: ${id}`, {
      isActive,
      updatedBy: req.user._id,
    });

    return successResponse(res, 200, "User status updated successfully", {
      user: {
        id: user._id.toString(),
        name: user.name,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    logger.error(`Error updating user status: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update user status");
  }
});

/**
 * Get All Restaurants
 * GET /api/admin/restaurants
 * Query params: page, limit, search, status, cuisine, zone
 */
export const getRestaurants = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status, cuisine, zone } = req.query;

    // Build query
    const query = {};

    // Status filter - Default to active only (approved restaurants)
    // Only show inactive if explicitly requested via status filter
    // IMPORTANT: Restaurants should only appear in main list AFTER admin approval
    // Inactive restaurants (pending approval) should only appear in "New Joining Request" section
    if (status === "inactive") {
      query.isActive = false;
    } else {
      // Default: Show only active (approved) restaurants
      // This ensures that restaurants only appear in main list after admin approval
      query.isActive = true;
    }

    console.log("🔍 Admin Restaurants List Query:", {
      status,
      isActive: query.isActive,
      query: JSON.stringify(query, null, 2),
    });

    // Search filter
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { ownerName: { $regex: safeSearch, $options: "i" } },
        { ownerPhone: { $regex: safeSearch, $options: "i" } },
        { phone: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ];
    }

    // Cuisine filter
    if (cuisine) {
      query.cuisines = { $in: [new RegExp(escapeRegex(cuisine), "i")] };
    }

    // Zone filter
    if (zone && zone !== "All over the World") {
      const safeZone = escapeRegex(zone);
      query.$or = [
        { "location.area": { $regex: safeZone, $options: "i" } },
        { "location.city": { $regex: safeZone, $options: "i" } },
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch restaurants
    const restaurants = await Restaurant.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const restaurantIds = restaurants.map((restaurant) => restaurant?._id).filter(Boolean);
    const restaurantZoneIds = restaurants
      .map((restaurant) => restaurant?.zoneId?.toString?.() || String(restaurant?.zoneId || ""))
      .filter((zoneId) => mongoose.Types.ObjectId.isValid(zoneId));

    const zonesById = restaurantZoneIds.length > 0
      ? await Zone.find({
          isActive: true,
          _id: { $in: restaurantZoneIds },
        })
          .select("_id name zoneName")
          .lean()
      : [];

    const legacyMappedZones = restaurantIds.length > 0
      ? await Zone.find({
          isActive: true,
          restaurantId: { $in: restaurantIds },
        })
          .select("_id name zoneName restaurantId")
          .lean()
      : [];

    const zoneById = new Map(
      zonesById.map((zone) => [
        zone?._id?.toString?.() || String(zone?._id || ""),
        zone,
      ]),
    );

    const zoneByRestaurantId = new Map(
      legacyMappedZones.map((zone) => [
        zone?.restaurantId?.toString?.() || String(zone?.restaurantId || ""),
        zone,
      ]),
    );

    const restaurantsWithZones = restaurants.map((restaurant) => {
      const explicitZoneId = restaurant?.zoneId?.toString?.() || String(restaurant?.zoneId || "");
      const mappedZone = zoneById.get(explicitZoneId) || zoneByRestaurantId.get(
        restaurant?._id?.toString?.() || String(restaurant?._id || ""),
      );

      if (!mappedZone) return restaurant;

      return {
        ...restaurant,
        zoneId: mappedZone._id?.toString?.() || String(mappedZone._id),
        restaurantZoneId: mappedZone._id?.toString?.() || String(mappedZone._id),
        zone: mappedZone.name || mappedZone.zoneName || restaurant.zone,
      };
    });

    // Get total count
    const total = await Restaurant.countDocuments(query);

    return successResponse(res, 200, "Restaurants retrieved successfully", {
      restaurants: restaurantsWithZones,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error fetching restaurants: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch restaurants");
  }
});

/**
 * Get Restaurant By ID (Admin)
 * GET /api/admin/restaurants/:id
 */
export const getRestaurantByIdAdmin = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, "Invalid restaurant ID");
    }

    const restaurant = await Restaurant.findById(id).select("-password").lean();

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    const restaurantWithZone = await attachMappedZoneToRestaurant(restaurant);

    return successResponse(res, 200, "Restaurant retrieved successfully", {
      restaurant: restaurantWithZone,
    });
  } catch (error) {
    logger.error(`Error fetching restaurant by id: ${error.message}`, {
      error: error.stack,
      restaurantId: req.params?.id,
    });
    return errorResponse(res, 500, "Failed to fetch restaurant");
  }
});

/**
 * Get Restaurant Menu (Admin, unfiltered)
 * GET /api/admin/restaurants/:id/menu
 */
export const getRestaurantMenuByIdAdmin = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, "Invalid restaurant ID");
    }

    const restaurant = await Restaurant.findById(id).select("_id name").lean();
    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    const menu = await Menu.findOne({ restaurant: id, isActive: true }).lean();

    return successResponse(res, 200, "Restaurant menu retrieved successfully", {
      menu: menu || {
        restaurant: id,
        sections: [],
        addons: [],
        isActive: true,
      },
    });
  } catch (error) {
    logger.error(`Error fetching restaurant menu: ${error.message}`, {
      error: error.stack,
      restaurantId: req.params?.id,
    });
    return errorResponse(res, 500, "Failed to fetch restaurant menu");
  }
});

/**
 * Get All Restaurant Menus (Admin, populated with restaurant names)
 * GET /api/admin/menu/all-menus
 */
export const getAllMenusAdmin = asyncHandler(async (req, res) => {
  try {
    const menus = await Menu.find({ isActive: true })
      .populate("restaurant", "name")
      .lean();

    return successResponse(res, 200, "All restaurant menus retrieved successfully", {
      menus: menus || [],
    });
  } catch (error) {
    logger.error(`Error fetching all menus: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch all restaurant menus");
  }
});

/**
 * Update Restaurant Status (Active/Inactive/Ban)
 * PUT /api/admin/restaurants/:id/status
 */
export const updateRestaurantStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return errorResponse(res, 400, "isActive must be a boolean value");
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    restaurant.isActive = isActive;
    await restaurant.save();

    logger.info(`Restaurant status updated: ${id}`, {
      isActive,
      updatedBy: req.user._id,
    });

    return successResponse(res, 200, "Restaurant status updated successfully", {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        isActive: restaurant.isActive,
      },
    });
  } catch (error) {
    logger.error(`Error updating restaurant status: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update restaurant status");
  }
});

const normalizeSingleItemImagesForAdmin = (item = {}) => {
  const validArrayImages = Array.isArray(item.images)
    ? item.images
        .filter((img) => img && typeof img === "string" && img.trim() !== "")
        .map((img) => img.trim())
    : [];
  const fallbackSingleImage =
    item.image && typeof item.image === "string" && item.image.trim() !== ""
      ? item.image.trim()
      : "";

  const firstImage = (validArrayImages[0] || fallbackSingleImage || "").trim();
  return {
    image: firstImage,
    images: firstImage ? [firstImage] : [],
    photoCount: firstImage ? 1 : 0,
  };
};

const getTotalMenuItemCount = (sections = []) => {
  if (!Array.isArray(sections)) return 0;

  let count = 0;
  sections.forEach((section = {}) => {
    if (Array.isArray(section.items)) {
      count += section.items.length;
    }

    if (Array.isArray(section.subsections)) {
      section.subsections.forEach((subsection = {}) => {
        if (Array.isArray(subsection.items)) {
          count += subsection.items.length;
        }
      });
    }
  });

  return count;
};

/**
 * Update Restaurant Menu (Admin)
 * PUT /api/admin/restaurants/:id/menu
 */
export const updateRestaurantMenuByIdAdmin = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { sections, allowEmpty } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, "Invalid restaurant ID");
    }

    if (!Array.isArray(sections)) {
      return errorResponse(res, 400, "sections must be an array");
    }

    const restaurant = await Restaurant.findById(id).select("_id name").lean();
    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    const existingMenu = await Menu.findOne({ restaurant: id });

    const normalizedSections = sections.map((section, sectionIndex) => {
      const existingSection = existingMenu?.sections?.find(
        (s) => String(s.id) === String(section?.id),
      );

      return {
        id: section?.id || `section-${sectionIndex}`,
        name: section?.name || "Unnamed Section",
            items: Array.isArray(section?.items)
              ? section.items.map((item) => {
              const existingItem = existingSection?.items?.find(
                (i) => String(i.id) === String(item?.id),
              );
              const normalizedMedia = normalizeSingleItemImagesForAdmin(item);
              const resolvedApprovalStatus =
                item?.approvalStatus === "approved"
                  ? "approved"
                  : existingItem?.approvalStatus || item?.approvalStatus || "pending";
              return {
                id: String(item?.id || `${Date.now()}-${Math.random()}`),
                name: item?.name || "Unnamed Item",
                nameArabic: item?.nameArabic || "",
                image: normalizedMedia.image,
                category: item?.category || section?.name || "Varieties",
                rating: item?.rating ?? 0,
                reviews: item?.reviews ?? 0,
                price: Number(item?.price) || 0,
                stock: item?.stock ?? "Unlimited",
                discount: item?.discount ?? null,
                originalPrice: item?.originalPrice ?? null,
                foodType: item?.foodType === "Veg" ? "Veg" : "Non-Veg",
                availabilityTimeStart: item?.availabilityTimeStart || "12:01 AM",
                availabilityTimeEnd: item?.availabilityTimeEnd || "11:57 PM",
                description: item?.description || "",
                discountType: item?.discountType === "Fixed" ? "Fixed" : "Percent",
                discountAmount: Number(item?.discountAmount) || 0,
                isAvailable: item?.isAvailable !== false,
                isRecommended: item?.isRecommended === true,
                variations: Array.isArray(item?.variations)
                  ? item.variations.map((variation) => ({
                      id: String(
                        variation?.id || `${Date.now()}-${Math.random()}`,
                      ),
                      name: variation?.name || "",
                      price: Number(variation?.price) || 0,
                      stock: variation?.stock ?? "Unlimited",
                    }))
                  : [],
                tags: Array.isArray(item?.tags) ? item.tags : [],
                nutrition: Array.isArray(item?.nutrition) ? item.nutrition : [],
                allergies: Array.isArray(item?.allergies) ? item.allergies : [],
                photoCount: normalizedMedia.photoCount,
                subCategory: item?.subCategory || "",
                servesInfo: item?.servesInfo || "",
                itemSize: item?.itemSize || "",
                itemSizeQuantity: item?.itemSizeQuantity || "",
                itemSizeUnit: item?.itemSizeUnit || "piece",
                gst: Number(item?.gst) || 0,
                images: normalizedMedia.images,
                preparationTime: item?.preparationTime || "",
                approvalStatus: resolvedApprovalStatus,
                rejectionReason: resolvedApprovalStatus === "approved" ? "" : existingItem?.rejectionReason || "",
                requestedAt: existingItem?.requestedAt || item?.requestedAt || new Date(),
                approvedAt:
                  resolvedApprovalStatus === "approved"
                    ? existingItem?.approvedAt || item?.approvedAt || new Date()
                    : undefined,
                approvedBy:
                  resolvedApprovalStatus === "approved"
                    ? existingItem?.approvedBy || item?.approvedBy || req.user?._id
                    : undefined,
                rejectedAt:
                  resolvedApprovalStatus === "approved"
                    ? undefined
                    : existingItem?.rejectedAt || item?.rejectedAt || undefined,
              };
            })
          : [],
        subsections: Array.isArray(section?.subsections)
          ? section.subsections.map((subsection) => {
              const existingSubsection = existingSection?.subsections?.find(
                (s) => String(s.id) === String(subsection?.id),
              );

              return {
                id: subsection?.id || `subsection-${Date.now()}-${Math.random()}`,
                name: subsection?.name || "Unnamed Subsection",
                items: Array.isArray(subsection?.items)
                  ? subsection.items.map((item) => {
                      const existingItem = existingSubsection?.items?.find(
                        (i) => String(i.id) === String(item?.id),
                      );
                      const normalizedMedia = normalizeSingleItemImagesForAdmin(item);
                      const resolvedApprovalStatus =
                        item?.approvalStatus === "approved"
                          ? "approved"
                          : existingItem?.approvalStatus ||
                            item?.approvalStatus ||
                            "pending";
                      return {
                        id: String(item?.id || `${Date.now()}-${Math.random()}`),
                        name: item?.name || "Unnamed Item",
                        nameArabic: item?.nameArabic || "",
                        image: normalizedMedia.image,
                        category: item?.category || section?.name || "Varieties",
                        rating: item?.rating ?? 0,
                        reviews: item?.reviews ?? 0,
                        price: Number(item?.price) || 0,
                        stock: item?.stock ?? "Unlimited",
                        discount: item?.discount ?? null,
                        originalPrice: item?.originalPrice ?? null,
                        foodType: item?.foodType === "Veg" ? "Veg" : "Non-Veg",
                        availabilityTimeStart:
                          item?.availabilityTimeStart || "12:01 AM",
                        availabilityTimeEnd: item?.availabilityTimeEnd || "11:57 PM",
                        description: item?.description || "",
                        discountType:
                          item?.discountType === "Fixed" ? "Fixed" : "Percent",
                        discountAmount: Number(item?.discountAmount) || 0,
                        isAvailable: item?.isAvailable !== false,
                        isRecommended: item?.isRecommended === true,
                        variations: Array.isArray(item?.variations)
                          ? item.variations.map((variation) => ({
                              id: String(
                                variation?.id || `${Date.now()}-${Math.random()}`,
                              ),
                              name: variation?.name || "",
                              price: Number(variation?.price) || 0,
                              stock: variation?.stock ?? "Unlimited",
                            }))
                          : [],
                        tags: Array.isArray(item?.tags) ? item.tags : [],
                        nutrition: Array.isArray(item?.nutrition)
                          ? item.nutrition
                          : [],
                        allergies: Array.isArray(item?.allergies)
                          ? item.allergies
                          : [],
                        photoCount: normalizedMedia.photoCount,
                        subCategory: item?.subCategory || "",
                        servesInfo: item?.servesInfo || "",
                        itemSize: item?.itemSize || "",
                        itemSizeQuantity: item?.itemSizeQuantity || "",
                        itemSizeUnit: item?.itemSizeUnit || "piece",
                        gst: Number(item?.gst) || 0,
                        images: normalizedMedia.images,
                        preparationTime: item?.preparationTime || "",
                        approvalStatus: resolvedApprovalStatus,
                        rejectionReason:
                          resolvedApprovalStatus === "approved"
                            ? ""
                            : existingItem?.rejectionReason || "",
                        requestedAt:
                          existingItem?.requestedAt || item?.requestedAt || new Date(),
                        approvedAt:
                          resolvedApprovalStatus === "approved"
                            ? existingItem?.approvedAt || item?.approvedAt || new Date()
                            : undefined,
                        approvedBy:
                          resolvedApprovalStatus === "approved"
                            ? existingItem?.approvedBy ||
                              item?.approvedBy ||
                              req.user?._id
                            : undefined,
                        rejectedAt:
                          resolvedApprovalStatus === "approved"
                            ? undefined
                            : existingItem?.rejectedAt ||
                              item?.rejectedAt ||
                              undefined,
                      };
                    })
                  : [],
              };
            })
          : [],
        isEnabled: section?.isEnabled !== false,
        order: Number.isFinite(section?.order) ? section.order : sectionIndex,
      };
    });

    const existingItemCount = getTotalMenuItemCount(existingMenu?.sections || []);
    const incomingItemCount = getTotalMenuItemCount(normalizedSections);
    const shouldAllowEmptyOverwrite =
      allowEmpty === true || String(allowEmpty).toLowerCase() === "true";

    if (
      existingItemCount > 0 &&
      incomingItemCount === 0 &&
      !shouldAllowEmptyOverwrite
    ) {
      return errorResponse(
        res,
        400,
        "Refusing to overwrite non-empty menu with empty data. Pass allowEmpty=true to confirm."
      );
    }

    let menu = existingMenu;
    if (!menu) {
      menu = new Menu({
        restaurant: id,
        sections: normalizedSections,
        isActive: true,
      });
    } else {
      menu.set("sections", normalizedSections);
      menu.markModified("sections");
    }

    await menu.save();

    logger.info("Admin updated restaurant menu", {
      restaurantId: id,
      updatedBy: req.user?._id,
      sectionCount: normalizedSections.length,
    });

    return successResponse(res, 200, "Restaurant menu updated successfully", {
      menu: {
        restaurant: id,
        sections: menu.sections || [],
        addons: menu.addons || [],
        isActive: menu.isActive,
      },
    });
  } catch (error) {
    logger.error(`Error updating restaurant menu: ${error.message}`, {
      error: error.stack,
      restaurantId: req.params?.id,
    });
    return errorResponse(res, 500, "Failed to update restaurant menu");
  }
});

/**
 * Update Restaurant Details (Admin)
 * PUT /api/admin/restaurants/:id
 */
export const updateRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, "Invalid restaurant ID");
    }

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    const payload = req.body || {};
    let cloudinaryInitialized = false;
    let shouldSyncOutletTimings = false;

    const ensureCloudinary = async () => {
      if (!cloudinaryInitialized) {
        await initializeCloudinary();
        cloudinaryInitialized = true;
      }
    };

    const resolveImageInput = async (value, folder) => {
      if (!value) return null;

      if (typeof value === "string") {
        if (value.startsWith("data:")) {
          await ensureCloudinary();
          const base64Data = value.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const result = await uploadToCloudinary(buffer, {
            folder,
            resource_type: "image",
          });
          return {
            url: result.secure_url,
            publicId: result.public_id,
          };
        }

        if (value.startsWith("http")) {
          return { url: value };
        }

        return null;
      }

      if (typeof value === "object" && value.url) {
        return {
          url: value.url,
          ...(value.publicId ? { publicId: value.publicId } : {}),
        };
      }

      return null;
    };

    const ensureOnboarding = () => {
      if (!restaurant.onboarding) restaurant.onboarding = {};
      if (!restaurant.onboarding.step1) restaurant.onboarding.step1 = {};
      if (!restaurant.onboarding.step2) restaurant.onboarding.step2 = {};
      if (!restaurant.onboarding.step4) restaurant.onboarding.step4 = {};
    };

    // Restaurant name
    const previousName = restaurant.name;
    const nextName = (payload.restaurantName ?? payload.name)?.trim();
    if (nextName) {
      restaurant.name = nextName;
      ensureOnboarding();
      restaurant.onboarding.step1.restaurantName = nextName;

      if (nextName !== previousName) {
        let baseSlug = nextName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        if (!baseSlug) {
          baseSlug = `restaurant-${restaurant._id}`;
        }

        let slug = baseSlug;
        let slugExists = await Restaurant.findOne({
          slug,
          _id: { $ne: restaurant._id },
        });

        let counter = 1;
        while (slugExists) {
          slug = `${baseSlug}-${counter}`;
          slugExists = await Restaurant.findOne({
            slug,
            _id: { $ne: restaurant._id },
          });
          counter += 1;
        }

        restaurant.slug = slug;
      }
    }

    // Owner fields
    if (payload.ownerName !== undefined) {
      const value = String(payload.ownerName || "").trim();
      restaurant.ownerName = value || restaurant.ownerName;
      ensureOnboarding();
      restaurant.onboarding.step1.ownerName = restaurant.ownerName;
    }

    if (payload.ownerEmail !== undefined) {
      const value = String(payload.ownerEmail || "").trim().toLowerCase();
      restaurant.ownerEmail = value;
      ensureOnboarding();
      restaurant.onboarding.step1.ownerEmail = value;
    }

    if (payload.ownerPhone !== undefined) {
      const normalized = payload.ownerPhone
        ? normalizePhoneNumber(payload.ownerPhone)
        : "";
      if (payload.ownerPhone && !normalized) {
        return errorResponse(res, 400, "Invalid owner phone number format");
      }
      restaurant.ownerPhone = normalized || "";
      ensureOnboarding();
      restaurant.onboarding.step1.ownerPhone = restaurant.ownerPhone;
    }

    if (payload.primaryContactNumber !== undefined) {
      const normalized = payload.primaryContactNumber
        ? normalizePhoneNumber(payload.primaryContactNumber)
        : "";
      if (payload.primaryContactNumber && !normalized) {
        return errorResponse(
          res,
          400,
          "Invalid primary contact number format",
        );
      }
      restaurant.primaryContactNumber = normalized || "";
      ensureOnboarding();
      restaurant.onboarding.step1.primaryContactNumber =
        restaurant.primaryContactNumber;
    }

    // Login email / phone
    if (payload.email !== undefined) {
      restaurant.email = payload.email
        ? String(payload.email).trim().toLowerCase()
        : undefined;
    }

    if (payload.phone !== undefined) {
      const normalized = payload.phone ? normalizePhoneNumber(payload.phone) : "";
      if (payload.phone && !normalized) {
        return errorResponse(res, 400, "Invalid phone number format");
      }
      restaurant.phone = normalized || undefined;
    }

    // Cuisines
    if (payload.cuisines !== undefined) {
      const cuisinesArray = Array.isArray(payload.cuisines)
        ? payload.cuisines
        : String(payload.cuisines || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

      restaurant.cuisines = cuisinesArray;
      ensureOnboarding();
      restaurant.onboarding.step2.cuisines = cuisinesArray;
    }

    if (payload.foodPreference !== undefined) {
      const rawFoodPreference = String(payload.foodPreference || "")
        .trim()
        .toLowerCase();
      const normalizedFoodPreference =
        rawFoodPreference === "pure-veg" ? "pure-veg" : "both";
      const allowedFoodPreferences = new Set(["both", "pure-veg"]);

      if (!allowedFoodPreferences.has(normalizedFoodPreference)) {
        return errorResponse(
          res,
          400,
          "foodPreference must be one of both or pure-veg",
        );
      }

      restaurant.foodPreference = normalizedFoodPreference;
      ensureOnboarding();
      restaurant.onboarding.step2.foodPreference = normalizedFoodPreference;
    }

    // Delivery timings
    const openingTime = payload.openingTime ?? payload.deliveryTimings?.openingTime;
    const closingTime = payload.closingTime ?? payload.deliveryTimings?.closingTime;
    if (openingTime !== undefined || closingTime !== undefined) {
      restaurant.deliveryTimings = {
        ...(restaurant.deliveryTimings?.toObject?.() || {}),
        ...(openingTime !== undefined ? { openingTime } : {}),
        ...(closingTime !== undefined ? { closingTime } : {}),
      };
      ensureOnboarding();
      restaurant.onboarding.step2.deliveryTimings = {
        ...(restaurant.onboarding.step2.deliveryTimings?.toObject?.() || {}),
        ...(openingTime !== undefined ? { openingTime } : {}),
        ...(closingTime !== undefined ? { closingTime } : {}),
      };
      shouldSyncOutletTimings = true;
    }

    if (payload.openDays !== undefined) {
      const openDays = Array.isArray(payload.openDays)
        ? payload.openDays
        : String(payload.openDays || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
      restaurant.openDays = openDays;
      ensureOnboarding();
      restaurant.onboarding.step2.openDays = openDays;
      shouldSyncOutletTimings = true;
    }

    // Display fields
    if (payload.estimatedDeliveryTime !== undefined) {
      restaurant.estimatedDeliveryTime = String(
        payload.estimatedDeliveryTime || "",
      ).trim();
      ensureOnboarding();
      restaurant.onboarding.step4.estimatedDeliveryTime =
        restaurant.estimatedDeliveryTime;
    }

    if (payload.specialDishes !== undefined) {
      const specialDishes = normalizeSpecialDishes(payload.specialDishes);
      restaurant.specialDishes = specialDishes;
      ensureOnboarding();
      restaurant.onboarding.step4.specialDishes = specialDishes;

      const primaryDish = specialDishes[0];
      restaurant.featuredDish = primaryDish?.name || "";
      restaurant.featuredPrice = primaryDish?.price || 249;
      restaurant.onboarding.step4.featuredDish = restaurant.featuredDish;
      restaurant.onboarding.step4.featuredPrice = restaurant.featuredPrice;
    }

    if (payload.featuredDish !== undefined) {
      restaurant.featuredDish = String(payload.featuredDish || "").trim();
      ensureOnboarding();
      restaurant.onboarding.step4.featuredDish = restaurant.featuredDish;
      if (payload.specialDishes === undefined) {
        const existingSpecialDishes = Array.isArray(restaurant.specialDishes)
          ? [...restaurant.specialDishes]
          : [];
        const firstPrice =
          Number.isFinite(Number(existingSpecialDishes[0]?.price))
            ? Number(existingSpecialDishes[0].price)
            : Number.isFinite(Number(restaurant.featuredPrice))
              ? Number(restaurant.featuredPrice)
              : 249;

        restaurant.specialDishes = restaurant.featuredDish
          ? [{ name: restaurant.featuredDish, price: firstPrice }, ...existingSpecialDishes.slice(1)]
          : [];
        restaurant.onboarding.step4.specialDishes = restaurant.specialDishes;
      }
    }

    if (payload.featuredPrice !== undefined) {
      const featuredPrice = Number(payload.featuredPrice);
      if (Number.isFinite(featuredPrice)) {
        restaurant.featuredPrice = featuredPrice;
        if (payload.specialDishes === undefined && restaurant.featuredDish) {
          const existingSpecialDishes = Array.isArray(restaurant.specialDishes)
            ? [...restaurant.specialDishes]
            : [];
          restaurant.specialDishes = [
            { name: restaurant.featuredDish, price: featuredPrice },
            ...existingSpecialDishes.slice(1),
          ];
          ensureOnboarding();
          restaurant.onboarding.step4.specialDishes = restaurant.specialDishes;
        }
      }
    }

    if (payload.offer !== undefined) {
      restaurant.offer = String(payload.offer || "").trim();
      ensureOnboarding();
      restaurant.onboarding.step4.offer = restaurant.offer;
    }

    // Profile image
    if (payload.profileImage !== undefined) {
      const imageData = await resolveImageInput(
        payload.profileImage,
        "appzeto/restaurant/profile",
      );
      if (imageData) {
        restaurant.profileImage = imageData;
        ensureOnboarding();
        restaurant.onboarding.step2.profileImageUrl = imageData;
      }
    }

    // Menu images
    if (payload.menuImages !== undefined && Array.isArray(payload.menuImages)) {
      const menuImages = [];
      for (const img of payload.menuImages) {
        const imageData = await resolveImageInput(img, "appzeto/restaurant/menu");
        if (imageData) {
          menuImages.push(imageData);
        }
      }
      restaurant.menuImages = menuImages;
      ensureOnboarding();
      restaurant.onboarding.step2.menuImageUrls = menuImages;
    }

    // Status flags
    if (typeof payload.isActive === "boolean") {
      restaurant.isActive = payload.isActive;
    }
    if (typeof payload.isAcceptingOrders === "boolean") {
      restaurant.isAcceptingOrders = payload.isAcceptingOrders;
    }

    // Optional full location update inside generic endpoint
    if (payload.location && typeof payload.location === "object") {
      const location = payload.location;
      const latitude = Number(location.latitude);
      const longitude = Number(location.longitude);
      const hasValidLatLng =
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180;

      const nextLocation = {
        ...(restaurant.location?.toObject?.() || {}),
        ...location,
        ...(hasValidLatLng
          ? {
              latitude,
              longitude,
              coordinates: [longitude, latitude],
            }
          : {}),
      };

      restaurant.location = nextLocation;
      ensureOnboarding();
      restaurant.onboarding.step1.location = {
        ...(restaurant.onboarding.step1.location?.toObject?.() || {}),
        ...nextLocation,
      };
    }

    if (payload.zoneId !== undefined) {
      const zoneId = String(payload.zoneId || "").trim();

      await Zone.updateMany(
        { restaurantId: restaurant._id },
        { $unset: { restaurantId: 1 } },
      );

      if (zoneId) {
        if (!mongoose.Types.ObjectId.isValid(zoneId)) {
          return errorResponse(res, 400, "Invalid zone ID");
        }

        const zone = await Zone.findOne({ _id: zoneId, isActive: true });
        if (!zone) {
          return errorResponse(res, 404, "Zone not found");
        }

        restaurant.zoneId = zone._id;
        restaurant.zoneName = zone.name || zone.zoneName || "";
      } else {
        restaurant.zoneId = null;
        restaurant.zoneName = "";
      }
    }

    await restaurant.save();

    // Keep source-of-truth OutletTimings in sync with admin-side opening/closing/openDays edits.
    if (shouldSyncOutletTimings) {
      const dayOrder = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ];

      const dayAlias = {
        mon: "Monday",
        monday: "Monday",
        tue: "Tuesday",
        tues: "Tuesday",
        tuesday: "Tuesday",
        wed: "Wednesday",
        weds: "Wednesday",
        wednesday: "Wednesday",
        thu: "Thursday",
        thur: "Thursday",
        thurs: "Thursday",
        thursday: "Thursday",
        fri: "Friday",
        friday: "Friday",
        sat: "Saturday",
        saturday: "Saturday",
        sun: "Sunday",
        sunday: "Sunday",
      };

      const normalizeDay = (day) => {
        const key = String(day || "").trim().toLowerCase();
        return dayAlias[key] || null;
      };

      const normalizedOpenDays = new Set(
        (Array.isArray(restaurant.openDays) ? restaurant.openDays : [])
          .map(normalizeDay)
          .filter(Boolean),
      );

      const finalOpeningTime =
        restaurant.deliveryTimings?.openingTime || "09:00 AM";
      const finalClosingTime =
        restaurant.deliveryTimings?.closingTime || "10:00 PM";

      const existingOutletTimings = await OutletTimings.findOne({
        restaurantId: restaurant._id,
      });

      const existingByDay = new Map(
        (existingOutletTimings?.timings || []).map((item) => [item.day, item]),
      );

      const nextTimings = dayOrder.map((day) => {
        const existingDay = existingByDay.get(day);
        const isOpen =
          normalizedOpenDays.size > 0
            ? normalizedOpenDays.has(day)
            : existingDay?.isOpen ?? true;

        return {
          day,
          isOpen,
          openingTime: finalOpeningTime,
          closingTime: finalClosingTime,
        };
      });

      await OutletTimings.findOneAndUpdate(
        { restaurantId: restaurant._id },
        {
          $set: {
            restaurantId: restaurant._id,
            outletType: existingOutletTimings?.outletType || "Appzeto delivery",
            timings: nextTimings,
            isActive: true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }

    logger.info(`Restaurant details updated: ${id}`, {
      updatedBy: req.user._id,
    });

    const restaurantResponse = await attachMappedZoneToRestaurant(restaurant.toObject());

    return successResponse(res, 200, "Restaurant updated successfully", {
      restaurant: restaurantResponse,
    });
  } catch (error) {
    logger.error(`Error updating restaurant: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update restaurant");
  }
});

/**
 * Update Restaurant Location
 * PUT /api/admin/restaurants/:id/location
 */
export const updateRestaurantLocation = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { location } = req.body;

    if (!location || typeof location !== "object") {
      return errorResponse(res, 400, "Location object is required");
    }

    const parseCoordinate = (value) => {
      if (value === null || value === undefined || value === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    let latitude = parseCoordinate(
      location.latitude ?? location.lat ?? location?.geometry?.location?.lat,
    );
    let longitude = parseCoordinate(
      location.longitude ?? location.lng ?? location?.geometry?.location?.lng,
    );

    if ((latitude === null || longitude === null) && Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
      longitude = parseCoordinate(location.coordinates[0]);
      latitude = parseCoordinate(location.coordinates[1]);
    }

    if (latitude === null || longitude === null) {
      return errorResponse(
        res,
        400,
        "Valid latitude and longitude are required",
      );
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return errorResponse(res, 400, "Invalid latitude or longitude range");
    }

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    const existingLocation = restaurant.location || {};
    const formattedAddress =
      location.formattedAddress ||
      location.address ||
      existingLocation.formattedAddress ||
      existingLocation.address ||
      "";

    const nextLocation = {
      ...existingLocation.toObject?.(),
      ...location,
      latitude,
      longitude,
      coordinates: [longitude, latitude],
      formattedAddress,
      address: location.address || formattedAddress,
      addressLine1:
        location.addressLine1 ||
        existingLocation.addressLine1 ||
        formattedAddress,
      addressLine2: location.addressLine2 || existingLocation.addressLine2 || "",
      area: location.area || existingLocation.area || "",
      city: location.city || existingLocation.city || "",
      state: location.state || existingLocation.state || "",
      landmark: location.landmark || existingLocation.landmark || "",
      zipCode:
        location.zipCode ||
        location.pincode ||
        location.postalCode ||
        existingLocation.zipCode ||
        existingLocation.pincode ||
        existingLocation.postalCode ||
        "",
      pincode:
        location.pincode ||
        location.zipCode ||
        location.postalCode ||
        existingLocation.pincode ||
        existingLocation.zipCode ||
        existingLocation.postalCode ||
        "",
      postalCode:
        location.postalCode ||
        location.pincode ||
        location.zipCode ||
        existingLocation.postalCode ||
        existingLocation.pincode ||
        existingLocation.zipCode ||
        "",
      street: location.street || existingLocation.street || "",
    };

    restaurant.location = nextLocation;

    // Keep onboarding location in sync so all modules display the same source.
    if (!restaurant.onboarding) restaurant.onboarding = {};
    if (!restaurant.onboarding.step1) restaurant.onboarding.step1 = {};
    restaurant.onboarding.step1.location = {
      ...(restaurant.onboarding.step1.location?.toObject?.() || {}),
      ...nextLocation,
    };

    await restaurant.save();

    logger.info(`Restaurant location updated: ${id}`, {
      updatedBy: req.user._id,
      latitude,
      longitude,
    });

    return successResponse(res, 200, "Restaurant location updated successfully", {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        location: restaurant.location,
      },
    });
  } catch (error) {
    logger.error(`Error updating restaurant location: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update restaurant location");
  }
});

/**
 * Get Restaurant Join Requests
 * GET /api/admin/restaurants/requests
 * Query params: status (pending, rejected), page, limit, search
 */
export const getRestaurantJoinRequests = asyncHandler(async (req, res) => {
  try {
    const { status = "pending", page = 1, limit = 50, search } = req.query;

    // Build query
    const query = {};

    // Status filter
    // Pending = restaurants with ALL onboarding steps completed (step 4) but not yet active
    // Rejected = restaurants that have rejectionReason
    if (status === "pending") {
      // Build conditions array for $and - ensures all conditions are met
      // Check for rejectionReason: either doesn't exist OR is null
      const conditions = [
        { isActive: false },
        {
          $or: [
            { rejectionReason: { $exists: false } },
            { rejectionReason: null },
          ],
        },
      ];

      // Only show restaurants that have completed ALL onboarding steps (all 4 steps)
      // Check if onboarding.completedSteps is 4, OR if restaurant has all required data filled
      // This handles both cases: restaurants with proper tracking AND restaurants that completed onboarding before tracking was added
      const completionCheck = {
        $or: [
          { "onboarding.completedSteps": 4 },
          // Fallback: If completedSteps is not 4 (or doesn't exist), check if restaurant has all main fields filled
          // This matches restaurants that have completed onboarding even if completedSteps field wasn't set to 4
          {
            $and: [
              { name: { $exists: true, $ne: null, $ne: "" } }, // Has restaurant name
              { cuisines: { $exists: true, $ne: null, $not: { $size: 0 } } }, // Has cuisines (array with items)
              { openDays: { $exists: true, $ne: null, $not: { $size: 0 } } }, // Has open days (array with items)
              { estimatedDeliveryTime: { $exists: true, $ne: null, $ne: "" } }, // Has delivery time (from step 4)
              { featuredDish: { $exists: true, $ne: null, $ne: "" } }, // Has featured dish (from step 4)
            ],
          },
        ],
      };

      conditions.push(completionCheck);
      query.$and = conditions;
    } else if (status === "rejected") {
      query["rejectionReason"] = { $exists: true, $ne: null };
      // For rejected, also check if onboarding is complete
      query.$or = [
        { "onboarding.completedSteps": 4 },
        {
          $and: [
            { name: { $exists: true, $ne: null, $ne: "" } },
            { estimatedDeliveryTime: { $exists: true, $ne: null, $ne: "" } },
          ],
        },
      ];
    }

    // Search filter - combine with $and if search is provided
    if (search && search.trim()) {
      const safeSearch = escapeRegex(search.trim());
      const searchConditions = {
        $or: [
          { name: { $regex: safeSearch, $options: "i" } },
          { ownerName: { $regex: safeSearch, $options: "i" } },
          { ownerPhone: { $regex: safeSearch, $options: "i" } },
          { phone: { $regex: safeSearch, $options: "i" } },
          { email: { $regex: safeSearch, $options: "i" } },
        ],
      };

      // If query already has $and, add search to it; otherwise create new $and
      if (query.$and) {
        query.$and.push(searchConditions);
      } else {
        // Convert existing query conditions to $and format
        const baseConditions = { ...query };
        query = {
          $and: [baseConditions, searchConditions],
        };
      }
    }

    console.log(
      "🔍 Restaurant Join Requests Query:",
      JSON.stringify(query, null, 2),
    );

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch restaurants
    const restaurants = await Restaurant.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Debug: Log found restaurants with detailed info
    console.log(`📊 Found ${restaurants.length} restaurants matching query:`, {
      status,
      queryStructure: Object.keys(query).length,
      restaurantsFound: restaurants.length,
      sampleRestaurants: restaurants.slice(0, 5).map((r) => ({
        _id: r._id.toString().substring(0, 10) + "...",
        name: r.name,
        isActive: r.isActive,
        completedSteps: r.onboarding?.completedSteps,
        hasRejectionReason: !!r.rejectionReason,
        hasName: !!r.name,
        hasCuisines: !!r.cuisines && r.cuisines.length > 0,
        hasOpenDays: !!r.openDays && r.openDays.length > 0,
        hasEstimatedDeliveryTime: !!r.estimatedDeliveryTime,
        hasFeaturedDish: !!r.featuredDish,
      })),
    });

    // Get total count
    const total = await Restaurant.countDocuments(query);

    console.log(`📊 Total count: ${total} restaurants`);

    // Also log a sample of ALL inactive restaurants (for debugging)
    if (status === "pending" && restaurants.length === 0) {
      const allInactive = await Restaurant.find({
        isActive: false,
        $or: [
          { rejectionReason: { $exists: false } },
          { rejectionReason: null },
        ],
      })
        .select(
          "name isActive onboarding.completedSteps cuisines openDays estimatedDeliveryTime featuredDish",
        )
        .limit(10)
        .lean();

      const totalInactive = await Restaurant.countDocuments({
        isActive: false,
        $or: [
          { rejectionReason: { $exists: false } },
          { rejectionReason: null },
        ],
      });

      console.log(
        "⚠️ No restaurants found with query. Debugging inactive restaurants:",
        {
          totalInactive,
          queryUsed: JSON.stringify(query, null, 2),
          samples: allInactive.map((r) => ({
            _id: r._id.toString(),
            name: r.name,
            isActive: r.isActive,
            completedSteps: r.onboarding?.completedSteps,
            hasAllFields: {
              hasName: !!r.name && r.name !== "",
              hasCuisines:
                !!r.cuisines &&
                Array.isArray(r.cuisines) &&
                r.cuisines.length > 0,
              hasOpenDays:
                !!r.openDays &&
                Array.isArray(r.openDays) &&
                r.openDays.length > 0,
              hasEstimatedDeliveryTime:
                !!r.estimatedDeliveryTime && r.estimatedDeliveryTime !== "",
              hasFeaturedDish: !!r.featuredDish && r.featuredDish !== "",
            },
            fieldValues: {
              name: r.name || "MISSING",
              cuisinesCount: r.cuisines?.length || 0,
              openDaysCount: r.openDays?.length || 0,
              estimatedDeliveryTime: r.estimatedDeliveryTime || "MISSING",
              featuredDish: r.featuredDish || "MISSING",
            },
            shouldMatch:
              (!!r.name &&
                r.name !== "" &&
                !!r.cuisines &&
                Array.isArray(r.cuisines) &&
                r.cuisines.length > 0 &&
                !!r.openDays &&
                Array.isArray(r.openDays) &&
                r.openDays.length > 0 &&
                !!r.estimatedDeliveryTime &&
                r.estimatedDeliveryTime !== "" &&
                !!r.featuredDish &&
                r.featuredDish !== "") ||
              r.onboarding?.completedSteps === 4,
          })),
        },
      );
    }

    // Format response to match frontend expectations
    const formattedRequests = restaurants.map((restaurant, index) => {
      // Get zone from location
      let zone = "All over the World";
      if (restaurant.location?.area) {
        zone = restaurant.location.area;
      } else if (restaurant.location?.city) {
        zone = restaurant.location.city;
      }

      // Get business model (could be from subscription or commission - defaulting for now)
      const businessModel = restaurant.businessModel || "Commission Base";

      // Get status
      const requestStatus = restaurant.rejectionReason ? "Rejected" : "Pending";

      return {
        _id: restaurant._id.toString(),
        sl: skip + index + 1,
        restaurantName: restaurant.name || "N/A",
        restaurantImage:
          restaurant.profileImage?.url ||
          restaurant.onboarding?.step2?.profileImageUrl?.url ||
          "https://via.placeholder.com/40",
        ownerName: restaurant.ownerName || "N/A",
        ownerPhone: restaurant.ownerPhone || restaurant.phone || "N/A",
        zone: zone,
        businessModel: businessModel,
        status: requestStatus,
        rejectionReason: restaurant.rejectionReason || null,
        createdAt: restaurant.createdAt,
        // Include full data for view/details
        fullData: {
          ...restaurant,
          _id: restaurant._id.toString(),
        },
      };
    });

    return successResponse(
      res,
      200,
      "Restaurant join requests retrieved successfully",
      {
        requests: formattedRequests,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    );
  } catch (error) {
    logger.error(`Error fetching restaurant join requests: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch restaurant join requests");
  }
});

/**
 * Approve Restaurant Join Request
 * POST /api/admin/restaurants/:id/approve
 */
export const approveRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    if (restaurant.isActive) {
      return errorResponse(res, 400, "Restaurant is already approved");
    }

    if (restaurant.rejectionReason) {
      return errorResponse(
        res,
        400,
        "Cannot approve a rejected restaurant. Please remove rejection reason first.",
      );
    }

    // Activate restaurant
    restaurant.isActive = true;
    restaurant.approvedAt = new Date();
    restaurant.approvedBy = adminId;
    restaurant.rejectionReason = undefined; // Clear any previous rejection

    await restaurant.save();

    logger.info(`Restaurant approved: ${id}`, {
      approvedBy: adminId,
      restaurantName: restaurant.name,
    });

    return successResponse(res, 200, "Restaurant approved successfully", {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        isActive: restaurant.isActive,
        approvedAt: restaurant.approvedAt,
      },
    });
  } catch (error) {
    logger.error(`Error approving restaurant: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to approve restaurant");
  }
});

/**
 * Update Restaurant Dining Settings
 * PUT /api/admin/restaurants/:id/dining-settings
 */
export const updateRestaurantDiningSettings = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { diningSettings } = req.body;

    if (!diningSettings) {
      return errorResponse(res, 400, "Dining settings are required");
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Update dining settings
    restaurant.diningSettings = {
      ...restaurant.diningSettings,
      ...diningSettings,
    };

    await restaurant.save();

    logger.info(`Restaurant dining settings updated: ${id}`, {
      updatedBy: req.user._id,
      diningSettings: restaurant.diningSettings,
    });

    return successResponse(res, 200, "Dining settings updated successfully", {
      restaurant: {
        id: restaurant._id,
        diningSettings: restaurant.diningSettings,
      },
    });
  } catch (error) {
    logger.error(`Error updating dining settings: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update dining settings");
  }
});

/**
 * Reject Restaurant Join Request
 * POST /api/admin/restaurants/:id/reject
 */
export const rejectRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    // Validate reason is provided
    if (!reason || !reason.trim()) {
      return errorResponse(res, 400, "Rejection reason is required");
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Set rejection details (allow updating if already rejected)
    restaurant.rejectionReason = reason.trim();
    restaurant.rejectedAt = new Date();
    restaurant.rejectedBy = adminId;
    restaurant.isActive = false; // Ensure it's inactive

    await restaurant.save();

    logger.info(`Restaurant rejected: ${id}`, {
      rejectedBy: adminId,
      reason: reason,
      restaurantName: restaurant.name,
    });

    return successResponse(res, 200, "Restaurant rejected successfully", {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        rejectionReason: restaurant.rejectionReason,
      },
    });
  } catch (error) {
    logger.error(`Error rejecting restaurant: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to reject restaurant");
  }
});

/**
 * Reverify Restaurant (Resubmit for approval)
 * POST /api/admin/restaurants/:id/reverify
 */
export const reverifyRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Check if restaurant was rejected
    if (!restaurant.rejectionReason) {
      return errorResponse(
        res,
        400,
        "Restaurant is not rejected. Only rejected restaurants can be reverified.",
      );
    }

    // Clear rejection details and mark as pending again
    restaurant.rejectionReason = null;
    restaurant.rejectedAt = undefined;
    restaurant.rejectedBy = undefined;
    restaurant.isActive = false; // Keep inactive until approved

    await restaurant.save();

    logger.info(`Restaurant reverified: ${id}`, {
      reverifiedBy: adminId,
      restaurantName: restaurant.name,
    });

    return successResponse(
      res,
      200,
      "Restaurant reverified successfully. Waiting for admin approval.",
      {
        restaurant: {
          id: restaurant._id.toString(),
          name: restaurant.name,
          isActive: restaurant.isActive,
          rejectionReason: null,
        },
      },
    );
  } catch (error) {
    logger.error(`Error reverifying restaurant: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to reverify restaurant");
  }
});

/**
 * Create Restaurant by Admin
 * POST /api/admin/restaurants
 */
export const createRestaurant = asyncHandler(async (req, res) => {
  try {
    const adminId = req.user._id;
    const {
      // Step 1: Basic Info
      restaurantName,
      ownerName,
      ownerEmail,
      ownerPhone,
      primaryContactNumber,
      location,
      // Step 2: Images & Operational
      menuImages, // Array of image URLs or base64
      profileImage, // Image URL or base64
      cuisines,
      openingTime,
      closingTime,
      openDays,
      // Step 3: Documents
      panNumber,
      nameOnPan,
      panImage, // Image URL or base64
      gstRegistered,
      gstNumber,
      gstLegalName,
      gstAddress,
      gstImage, // Image URL or base64
      fssaiNumber,
      fssaiExpiry,
      fssaiImage, // Image URL or base64
      accountNumber,
      ifscCode,
      accountHolderName,
      accountType,
      // Step 4: Display Info
      estimatedDeliveryTime,
      specialDishes,
      featuredDish,
      featuredPrice,
      offer,
      // Authentication
      email,
      phone,
      password,
      signupMethod = "email",
    } = req.body;

    // Validation
    if (!restaurantName || !ownerName || !ownerEmail) {
      return errorResponse(
        res,
        400,
        "Restaurant name, owner name, and owner email are required",
      );
    }

    if (!email && !phone) {
      return errorResponse(res, 400, "Either email or phone is required");
    }

    // Normalize phone number if provided
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;
    if (phone && !normalizedPhone) {
      return errorResponse(res, 400, "Invalid phone number format");
    }

    // Generate random password if email is provided but password is not
    let finalPassword = password;
    if (email && !password) {
      // Generate a random 12-character password
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
      finalPassword = Array.from(
        { length: 12 },
        () => chars[Math.floor(Math.random() * chars.length)],
      ).join("");
    }

    // Check if restaurant already exists with same email or phone
    const existingRestaurant = await Restaurant.findOne({
      $or: [
        ...(email ? [{ email: email.toLowerCase().trim() }] : []),
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
      ],
    });

    if (existingRestaurant) {
      if (email && existingRestaurant.email === email.toLowerCase().trim()) {
        return errorResponse(
          res,
          400,
          "Restaurant with this email already exists",
        );
      }
      if (normalizedPhone && existingRestaurant.phone === normalizedPhone) {
        return errorResponse(
          res,
          400,
          "Restaurant with this phone number already exists. Please use a different phone number.",
        );
      }
    }

    // Initialize Cloudinary
    await initializeCloudinary();

    // Upload images if provided as base64 or files
    let profileImageData = null;
    if (profileImage) {
      if (
        typeof profileImage === "string" &&
        profileImage.startsWith("data:")
      ) {
        // Base64 image - convert to buffer and upload
        const base64Data = profileImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, {
          folder: "appzeto/restaurant/profile",
          resource_type: "image",
        });
        profileImageData = {
          url: result.secure_url,
          publicId: result.public_id,
        };
      } else if (
        typeof profileImage === "string" &&
        profileImage.startsWith("http")
      ) {
        // Already a URL
        profileImageData = { url: profileImage };
      } else if (profileImage.url) {
        // Already an object with url
        profileImageData = profileImage;
      }
    }

    let menuImagesData = [];
    if (menuImages && Array.isArray(menuImages) && menuImages.length > 0) {
      for (const img of menuImages) {
        if (typeof img === "string" && img.startsWith("data:")) {
          const base64Data = img.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const result = await uploadToCloudinary(buffer, {
            folder: "appzeto/restaurant/menu",
            resource_type: "image",
          });
          menuImagesData.push({
            url: result.secure_url,
            publicId: result.public_id,
          });
        } else if (typeof img === "string" && img.startsWith("http")) {
          menuImagesData.push({ url: img });
        } else if (img.url) {
          menuImagesData.push(img);
        }
      }
    }

    // Upload document images
    let panImageData = null;
    if (panImage) {
      if (typeof panImage === "string" && panImage.startsWith("data:")) {
        const base64Data = panImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, {
          folder: "appzeto/restaurant/pan",
          resource_type: "image",
        });
        panImageData = { url: result.secure_url, publicId: result.public_id };
      } else if (typeof panImage === "string" && panImage.startsWith("http")) {
        panImageData = { url: panImage };
      } else if (panImage.url) {
        panImageData = panImage;
      }
    }

    let gstImageData = null;
    if (gstRegistered && gstImage) {
      if (typeof gstImage === "string" && gstImage.startsWith("data:")) {
        const base64Data = gstImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, {
          folder: "appzeto/restaurant/gst",
          resource_type: "image",
        });
        gstImageData = { url: result.secure_url, publicId: result.public_id };
      } else if (typeof gstImage === "string" && gstImage.startsWith("http")) {
        gstImageData = { url: gstImage };
      } else if (gstImage.url) {
        gstImageData = gstImage;
      }
    }

    let fssaiImageData = null;
    if (fssaiImage) {
      if (typeof fssaiImage === "string" && fssaiImage.startsWith("data:")) {
        const base64Data = fssaiImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, {
          folder: "appzeto/restaurant/fssai",
          resource_type: "image",
        });
        fssaiImageData = { url: result.secure_url, publicId: result.public_id };
      } else if (
        typeof fssaiImage === "string" &&
        fssaiImage.startsWith("http")
      ) {
        fssaiImageData = { url: fssaiImage };
      } else if (fssaiImage.url) {
        fssaiImageData = fssaiImage;
      }
    }

    const normalizedSpecialDishes = normalizeSpecialDishes(specialDishes);
    const primarySpecialDish = normalizedSpecialDishes[0] || null;
    const resolvedFeaturedDish =
      primarySpecialDish?.name || featuredDish || "";
    const resolvedFeaturedPrice =
      primarySpecialDish?.price || featuredPrice || 249;

    // Create restaurant data
    const restaurantData = {
      name: restaurantName,
      ownerName,
      ownerEmail,
      ownerPhone: ownerPhone
        ? normalizePhoneNumber(ownerPhone) || normalizedPhone
        : normalizedPhone,
      primaryContactNumber: primaryContactNumber
        ? normalizePhoneNumber(primaryContactNumber) || normalizedPhone
        : normalizedPhone,
      location: location || {},
      profileImage: profileImageData,
      menuImages: menuImagesData,
      cuisines: cuisines || [],
      deliveryTimings: {
        openingTime: openingTime || "09:00",
        closingTime: closingTime || "22:00",
      },
      openDays: openDays || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      estimatedDeliveryTime: estimatedDeliveryTime || "25-30 mins",
      featuredDish: resolvedFeaturedDish,
      specialDishes: normalizedSpecialDishes,
      featuredPrice: resolvedFeaturedPrice,
      offer: offer || "",
      signupMethod,
      // Admin created restaurants are active by default
      isActive: true,
      isAcceptingOrders: true,
      approvedAt: new Date(),
      approvedBy: adminId,
    };

    // Add authentication fields
    if (email) {
      restaurantData.email = email.toLowerCase().trim();
      restaurantData.password = finalPassword; // Will be hashed by pre-save hook
    }
    if (normalizedPhone) {
      restaurantData.phone = normalizedPhone;
      restaurantData.phoneVerified = true; // Admin created, so verified
    }

    // Add onboarding data
    restaurantData.onboarding = {
      step1: {
        restaurantName,
        ownerName,
        ownerEmail,
        ownerPhone: ownerPhone
          ? normalizePhoneNumber(ownerPhone) || normalizedPhone
          : normalizedPhone,
        primaryContactNumber: primaryContactNumber
          ? normalizePhoneNumber(primaryContactNumber) || normalizedPhone
          : normalizedPhone,
        location: location || {},
      },
      step2: {
        menuImageUrls: menuImagesData,
        profileImageUrl: profileImageData,
        cuisines: cuisines || [],
        deliveryTimings: {
          openingTime: openingTime || "09:00",
          closingTime: closingTime || "22:00",
        },
        openDays: openDays || [],
      },
      step3: {
        pan: {
          panNumber: panNumber || "",
          nameOnPan: nameOnPan || "",
          image: panImageData,
        },
        gst: {
          isRegistered: gstRegistered || false,
          gstNumber: gstNumber || "",
          legalName: gstLegalName || "",
          address: gstAddress || "",
          image: gstImageData,
        },
        fssai: {
          registrationNumber: fssaiNumber || "",
          expiryDate: fssaiExpiry || null,
          image: fssaiImageData,
        },
        bank: {
          accountNumber: accountNumber || "",
          ifscCode: ifscCode || "",
          accountHolderName: accountHolderName || "",
          accountType: accountType || "",
        },
      },
      step4: {
        estimatedDeliveryTime: estimatedDeliveryTime || "25-30 mins",
        featuredDish: resolvedFeaturedDish,
        specialDishes: normalizedSpecialDishes,
        featuredPrice: resolvedFeaturedPrice,
        offer: offer || "",
      },
      completedSteps: 4,
    };

    // Create restaurant
    const restaurant = await Restaurant.create(restaurantData);

    logger.info(`Restaurant created by admin: ${restaurant._id}`, {
      createdBy: adminId,
      restaurantName: restaurant.name,
      email: restaurant.email,
      phone: restaurant.phone,
    });

    // Prepare response data
    const responseData = {
      restaurant: {
        id: restaurant._id,
        restaurantId: restaurant.restaurantId,
        name: restaurant.name,
        email: restaurant.email,
        phone: restaurant.phone,
        isActive: restaurant.isActive,
        slug: restaurant.slug,
      },
    };

    // Send credential email for admin-created restaurant accounts.
    if (email && finalPassword) {
      try {
        const emailService = (await import("../../auth/services/emailService.js"))
          .default;
        const loginUrl =
          process.env.RESTAURANT_PANEL_URL ||
          process.env.FRONTEND_URL ||
          "https://appzetofood.com/restaurant/login";

        const recipientName = ownerName || restaurant.name || "Restaurant Partner";
        const subject = "Your restaurant account credentials";
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
            <h2 style="margin-bottom: 12px;">Restaurant account created</h2>
            <p>Hello ${recipientName},</p>
            <p>Your restaurant account has been created by the admin team.</p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Restaurant:</strong> ${restaurant.name}</p>
              <p style="margin: 4px 0;"><strong>Login Email:</strong> ${email.toLowerCase().trim()}</p>
              <p style="margin: 4px 0;"><strong>Password:</strong> ${finalPassword}</p>
            </div>
            <p>Login here: <a href="${loginUrl}">${loginUrl}</a></p>
            <p>For security, please change your password after first login.</p>
          </div>
        `;

        await emailService.sendEmail({
          to: email.toLowerCase().trim(),
          subject,
          html,
        });
      } catch (mailError) {
        logger.error(`Failed to send restaurant credential email: ${mailError.message}`, {
          restaurantId: restaurant._id,
          email: email?.toLowerCase?.().trim?.() || email,
        });
      }
    }

    // Include generated password in response if email was provided and password was auto-generated
    // This allows admin to share the password with the restaurant
    if (email && !password && finalPassword) {
      responseData.generatedPassword = finalPassword;
      responseData.message =
        "Restaurant created successfully. Please share the generated password with the restaurant.";
    }

    return successResponse(
      res,
      201,
      "Restaurant created successfully",
      responseData,
    );
  } catch (error) {
    logger.error(`Error creating restaurant: ${error.message}`, {
      error: error.stack,
    });

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return errorResponse(
        res,
        400,
        `Restaurant with this ${field} already exists`,
      );
    }

    return errorResponse(
      res,
      500,
      `Failed to create restaurant: ${error.message}`,
    );
  }
});

/**
 * Delete Restaurant
 * DELETE /api/admin/restaurants/:id
 */
export const deleteRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    await deleteRestaurantRelatedData(restaurant._id);

    // Delete restaurant
    await Restaurant.findByIdAndDelete(id);

    logger.info(`Restaurant deleted: ${id}`, {
      deletedBy: adminId,
      restaurantName: restaurant.name,
    });

    return successResponse(res, 200, "Restaurant deleted successfully", {
      restaurant: {
        id: id,
        name: restaurant.name,
      },
    });
  } catch (error) {
    logger.error(`Error deleting restaurant: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to delete restaurant");
  }
});

/**
 * Get All Offers with Restaurant and Dish Details
 * GET /api/admin/offers
 * Query params: page, limit, search, status, restaurantId
 */
export const getAllOffers = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status, restaurantId } = req.query;

    // Build query
    const query = {};

    if (status) {
      query.status = status;
    }

    if (restaurantId) {
      query.restaurant = restaurantId;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch offers with restaurant details
    const offers = await Offer.find(query)
      .populate("restaurant", "name restaurantId zoneId zoneName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Offer.countDocuments(query);

    // Flatten offers to show each item separately
    const offerItems = [];
    offers.forEach((offer, offerIndex) => {
      if (offer.items && offer.items.length > 0) {
        offer.items.forEach((item, itemIndex) => {
          const now = new Date();
          const effectiveEndDate = getEffectiveOfferEndDate(offer.endDate);
          const derivedStatus =
            offer.status === "active" &&
            effectiveEndDate &&
            effectiveEndDate < now
              ? "expired"
              : (offer.status || "active");

          // Apply search filter if provided
          if (search) {
            const searchLower = search.toLowerCase();
            const matchesSearch =
              offer.restaurant?.name?.toLowerCase().includes(searchLower) ||
              item.itemName?.toLowerCase().includes(searchLower) ||
              item.couponCode?.toLowerCase().includes(searchLower);

            if (!matchesSearch) {
              return; // Skip this item if it doesn't match search
            }
          }

          offerItems.push({
            sl: skip + offerItems.length + 1,
            offerId: offer._id.toString(),
            restaurantName: offer.restaurant?.name || "Unknown Restaurant",
            restaurantId:
              offer.restaurant?.restaurantId ||
              offer.restaurant?._id?.toString() ||
              "N/A",
            zoneId: offer.restaurant?.zoneId?.toString?.() || String(offer.restaurant?.zoneId || ""),
            zoneName: offer.restaurant?.zoneName || "All Zones",
            dishName: item.itemName || "Unknown Dish",
            dishId: item.itemId || "N/A",
            couponCode: item.couponCode || "N/A",
            discountType: offer.discountType || "percentage",
            customerGroup: offer.customerGroup || "all",
            restaurantScope: offer.restaurantScope || "all",
            productScope: offer.productScope || (item.itemName === "All Items" ? "all" : "selected"),
            discountPercentage: item.discountPercentage || 0,
            maxDiscount: offer.maxLimit ?? null,
            minOrderValue: offer.minOrderValue || 0,
            originalPrice: item.originalPrice || 0,
            discountedPrice: item.discountedPrice || 0,
            showInCart: item.showInCart !== false,
            status: derivedStatus,
            startDate: offer.startDate || null,
            endDate: effectiveEndDate || offer.endDate || null,
            createdAt: offer.createdAt || new Date(),
          });
        });
      }
    });

    // If search was applied, we need to recalculate total
    let filteredTotal = offerItems.length;
    if (!search) {
      // Count all items across all offers
      const allOffers = await Offer.find(query).lean();
      filteredTotal = allOffers.reduce(
        (sum, offer) => sum + (offer.items?.length || 0),
        0,
      );
    }

    return successResponse(res, 200, "Offers retrieved successfully", {
      offers: offerItems,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: filteredTotal,
        pages: Math.ceil(filteredTotal / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error fetching offers: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch offers");
  }
});

/**
 * Create Coupon Offer (Admin)
 * POST /api/admin/offers
 */
export const createAdminOffer = asyncHandler(async (req, res) => {
  try {
    const {
      couponCode,
      discountType = "percentage",
      discountValue,
      maxDiscount,
      customerScope = "all",
      restaurantScope = "all",
      restaurantId,
      restaurantIds,
      zoneId,
      endDate,
      minOrderValue = 0,
      productScope = "all",
      selectedProducts = [],
    } = req.body;

    if (!couponCode || typeof couponCode !== "string") {
      return errorResponse(res, 400, "Coupon code is required");
    }

    const normalizedCode = couponCode.trim().toUpperCase();
    if (!normalizedCode) {
      return errorResponse(res, 400, "Coupon code is required");
    }

    if (!["percentage", "flat-price"].includes(discountType)) {
      return errorResponse(
        res,
        400,
        "discountType must be percentage or flat-price",
      );
    }

    const parsedDiscountValue = Number(discountValue);
    if (!Number.isFinite(parsedDiscountValue) || parsedDiscountValue <= 0) {
      return errorResponse(res, 400, "discountValue must be greater than 0");
    }

    let parsedMaxDiscount = null;
    if (
      maxDiscount !== undefined &&
      maxDiscount !== null &&
      String(maxDiscount).trim() !== ""
    ) {
      parsedMaxDiscount = Number(maxDiscount);
      if (!Number.isFinite(parsedMaxDiscount) || parsedMaxDiscount <= 0) {
        return errorResponse(res, 400, "maxDiscount must be greater than 0");
      }
    }

    const parsedMinOrderValue = Number(minOrderValue ?? 0);
    if (!Number.isFinite(parsedMinOrderValue) || parsedMinOrderValue < 0) {
      return errorResponse(res, 400, "minOrderValue cannot be negative");
    }

    if (!["all", "first-time"].includes(customerScope)) {
      return errorResponse(res, 400, "customerScope must be all or first-time");
    }

    if (!["all", "selected"].includes(restaurantScope)) {
      return errorResponse(
        res,
        400,
        "restaurantScope must be all or selected",
      );
    }

    const normalizedRestaurantIds = Array.isArray(restaurantIds)
      ? [...new Set(
          restaurantIds
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        )]
      : [];

    const fallbackRestaurantId = String(restaurantId || "").trim();

    if (
      restaurantScope === "selected" &&
      normalizedRestaurantIds.length === 0 &&
      !fallbackRestaurantId
    ) {
      return errorResponse(
        res,
        400,
        "At least one restaurant is required for selected restaurant scope",
      );
    }

    let selectedZone = null;
    if (zoneId !== undefined && zoneId !== null && String(zoneId).trim() !== "") {
      if (!mongoose.Types.ObjectId.isValid(zoneId)) {
        return errorResponse(res, 400, "Invalid zoneId");
      }

      selectedZone = await Zone.findOne({
        _id: zoneId,
        isActive: true,
      }).select("_id name zoneName");

      if (!selectedZone) {
        return errorResponse(res, 404, "Zone not found");
      }
    }

    let restaurants = [];
    if (restaurantScope === "all") {
      const restaurantQuery = { isActive: true };
      if (selectedZone?._id) {
        restaurantQuery.zoneId = selectedZone._id;
      }

      restaurants = await Restaurant.find(restaurantQuery).select("_id name zoneId zoneName");
      if (!restaurants.length) {
        return errorResponse(
          res,
          404,
          selectedZone
            ? "No active restaurants found in the selected zone"
            : "No active restaurants found",
        );
      }
    } else {
      const selectedRestaurantIds = normalizedRestaurantIds.length > 0
        ? normalizedRestaurantIds
        : [fallbackRestaurantId];

      const invalidRestaurantId = selectedRestaurantIds.find(
        (value) => !mongoose.Types.ObjectId.isValid(value),
      );

      if (invalidRestaurantId) {
        return errorResponse(res, 400, "Invalid restaurantId");
      }

      const selectedRestaurants = await Restaurant.find({
        _id: { $in: selectedRestaurantIds },
      }).select(
        "_id name zoneId zoneName",
      );

      if (selectedRestaurants.length !== selectedRestaurantIds.length) {
        return errorResponse(res, 404, "One or more restaurants were not found");
      }

      if (selectedZone?._id) {
        const hasZoneMismatch = selectedRestaurants.some(
          (selectedRestaurant) =>
            String(selectedRestaurant.zoneId || "") !== String(selectedZone._id),
        );

        if (hasZoneMismatch) {
          return errorResponse(
            res,
            400,
            "One or more selected restaurants do not belong to the chosen zone",
          );
        }
      }

      restaurants = selectedRestaurants;
    }

    if (!["all", "selected"].includes(productScope)) {
      return errorResponse(res, 400, "productScope must be all or selected");
    }

    let menuItems = [];
    if (productScope === "selected") {
      if (!Array.isArray(selectedProducts) || selectedProducts.length === 0) {
        return errorResponse(
          res,
          400,
          "At least one product is required when product scope is selected",
        );
      }

      const activeRestaurantIds = restaurants.map((r) => r._id);
      const menus = await Menu.find({
        restaurant: { $in: activeRestaurantIds },
        isActive: true,
      }).lean();

      const allItemsInMenus = [];
      menus.forEach((menu) => {
        const rId = String(menu.restaurant);
        menu.sections?.forEach((section) => {
          section.items?.forEach((item) => {
            allItemsInMenus.push({ ...item, restaurantId: rId });
          });
          section.subsections?.forEach((sub) => {
            sub.items?.forEach((item) => {
              allItemsInMenus.push({ ...item, restaurantId: rId });
            });
          });
        });
      });

      const selectedProdStrings = selectedProducts.map(String);
      menuItems = allItemsInMenus.filter((item) =>
        selectedProdStrings.includes(String(item.id)),
      );

      if (menuItems.length === 0) {
        return errorResponse(
          res,
          404,
          "None of the selected products were found in the restaurant menus",
        );
      }
    }

    let parsedEndDate = null;
    if (endDate) {
      parsedEndDate = new Date(endDate);
      if (Number.isNaN(parsedEndDate.getTime())) {
        return errorResponse(res, 400, "Invalid endDate");
      }
      parsedEndDate.setHours(23, 59, 59, 999);
    }

    const customerGroup = customerScope === "first-time" ? "new" : "all";
    const now = new Date();
    const createdOffers = [];

    for (const restaurant of restaurants) {
      let offerItems = [];
      if (productScope === "selected") {
        const currentRestaurantMenuItems = menuItems.filter(
          (item) => String(item.restaurantId) === String(restaurant._id),
        );

        offerItems = currentRestaurantMenuItems.map((item) => {
          const originalPrice = item.price || 0;
          const discountPercentage =
            discountType === "percentage" ? Math.min(parsedDiscountValue, 100) : 100;
          const discountedPrice =
            discountType === "percentage"
              ? Math.max(0, originalPrice - (originalPrice * discountPercentage) / 100)
              : Math.max(0, originalPrice - parsedDiscountValue);

          return {
            itemId: String(item.id),
            itemName: item.name || "Unknown Product",
            originalPrice,
            discountPercentage,
            discountedPrice,
            couponCode: normalizedCode,
            image: item.image || "",
            isVeg: item.foodType === "Veg",
            showInCart: true,
          };
        });
      } else {
        const originalPrice = discountType === "percentage" ? 100 : parsedDiscountValue;
        const discountPercentage =
          discountType === "percentage" ? Math.min(parsedDiscountValue, 100) : 100;
        const discountedPrice =
          discountType === "percentage"
            ? Math.max(0, originalPrice - (originalPrice * discountPercentage) / 100)
            : 0;

        offerItems = [
          {
            itemId: `admin-coupon-${normalizedCode}-${Date.now()}`,
            itemName: "All Items",
            originalPrice,
            discountPercentage,
            discountedPrice,
            couponCode: normalizedCode,
            image: "",
            isVeg: false,
            showInCart: true,
          },
        ];
      }

      if (productScope === "selected" && offerItems.length === 0) {
        continue;
      }

      const offer = await Offer.create({
        restaurant: restaurant._id,
        goalId: "grow-customers",
        discountType,
        customerGroup,
        restaurantScope,
        offerPreference: "all",
        offerDays: "all",
        startDate: now,
        endDate: parsedEndDate || undefined,
        targetMealtime: "all",
        minOrderValue: parsedMinOrderValue,
        maxLimit: discountType === "percentage" ? parsedMaxDiscount : null,
        productScope: productScope === "selected" ? "selected" : "all",
        selectedProductIds:
          productScope === "selected"
            ? offerItems.map((item) => String(item.itemId || "").trim()).filter(Boolean)
            : [],
        status: "active",
        items: offerItems,
      });

      createdOffers.push({
        id: offer._id,
        restaurantId: restaurant._id,
        restaurantName: restaurant.name,
        zoneId:
          restaurant.zoneId?.toString?.() ||
          String(restaurant.zoneId || selectedZone?._id || ""),
        zoneName:
          restaurant.zoneName ||
          selectedZone?.name ||
          selectedZone?.zoneName ||
          "",
      });
    }

    return successResponse(res, 201, "Coupon created successfully", {
      createdCount: createdOffers.length,
      customerScope,
      restaurantScope,
      zoneId: selectedZone?._id?.toString?.() || null,
      zoneName: selectedZone?.name || selectedZone?.zoneName || null,
      offers: createdOffers,
    });
  } catch (error) {
    logger.error(`Error creating admin coupon: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to create coupon");
  }
});

/**
 * PATCH /api/admin/offers/:offerId/items/:itemId/cart-visibility
 */
export const updateOfferCartVisibility = asyncHandler(async (req, res) => {
  try {
    const { offerId, itemId } = req.params;
    const { showInCart } = req.body;

    if (!mongoose.Types.ObjectId.isValid(offerId)) {
      return errorResponse(res, 400, "Invalid offerId");
    }

    const offer = await Offer.findById(offerId);
    if (!offer) {
      return errorResponse(res, 404, "Offer not found");
    }

    const itemIndex = offer.items.findIndex(
      (item) => item?.itemId?.toString() === itemId,
    );

    if (itemIndex === -1) {
      return errorResponse(res, 404, "Offer item not found");
    }

    const nextValue =
      typeof showInCart === "boolean"
        ? showInCart
        : offer.items[itemIndex].showInCart === false;

    offer.items[itemIndex].showInCart = nextValue;
    await offer.save();

    return successResponse(res, 200, "Cart visibility updated successfully", {
      offerId: offer._id.toString(),
      itemId,
      showInCart: offer.items[itemIndex].showInCart !== false,
    });
  } catch (error) {
    logger.error(`Error updating offer cart visibility: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update cart visibility");
  }
});

/**
 * Get Restaurant Analytics for POS
 * GET /api/admin/restaurant-analytics/:restaurantId
 */
export const getRestaurantAnalytics = asyncHandler(async (req, res) => {
  try {
    const { restaurantId } = req.params;

    logger.info(`Fetching restaurant analytics for: ${restaurantId}`);

    if (!restaurantId) {
      return errorResponse(res, 400, "Restaurant ID is required");
    }

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      logger.warn(`Invalid restaurant ID format: ${restaurantId}`);
      return errorResponse(res, 400, "Invalid restaurant ID format");
    }

    // Get restaurant details
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      logger.warn(`Restaurant not found: ${restaurantId}`);
      return errorResponse(res, 404, "Restaurant not found");
    }

    logger.info(
      `Restaurant found: ${restaurant.name} (${restaurant.restaurantId})`,
    );

    // Calculate date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );

    // Get order statistics - restaurantId can be _id or restaurantId field (both as String in Order model)
    // Match by both restaurant._id and restaurant.restaurantId
    const restaurantIdString = restaurantId.toString();
    const restaurantIdField = restaurant?.restaurantId || restaurantIdString;
    const restaurantObjectIdString = restaurant._id.toString();

    logger.info(`📊 Fetching order statistics for restaurant:`, {
      restaurantId: restaurantId,
      restaurantIdString: restaurantIdString,
      restaurantIdField: restaurantIdField,
      restaurantObjectIdString: restaurantObjectIdString,
      restaurantName: restaurant.name,
    });

    // Build query to match restaurantId in multiple formats
    const orderMatchQuery = {
      $or: [
        { restaurantId: restaurantIdString },
        { restaurantId: restaurantIdField },
        { restaurantId: restaurantObjectIdString },
      ],
    };

    logger.info(`🔍 Order query:`, orderMatchQuery);

    const orderStats = await Order.aggregate([
      {
        $match: orderMatchQuery,
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalRevenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", "delivered"] },
                { $ifNull: ["$pricing.total", 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    logger.info(`📊 Order stats found:`, orderStats);

    const orderStatusMap = {};
    let totalRevenue = 0;
    orderStats.forEach((stat) => {
      orderStatusMap[stat._id] = stat.count;
      if (stat._id === "delivered") {
        totalRevenue += stat.totalRevenue || 0;
      }
    });

    const totalOrders =
      (orderStatusMap.delivered || 0) +
      (orderStatusMap.cancelled || 0) +
      (orderStatusMap.pending || 0) +
      (orderStatusMap.confirmed || 0) +
      (orderStatusMap.preparing || 0) +
      (orderStatusMap.ready || 0) +
      (orderStatusMap.out_for_delivery || 0);
    const completedOrders = orderStatusMap.delivered || 0;
    const cancelledOrders = orderStatusMap.cancelled || 0;

    logger.info(`📊 Calculated order statistics:`, {
      totalOrders,
      completedOrders,
      cancelledOrders,
      orderStatusMap,
    });

    // Get monthly orders and revenue
    const monthlyStats = await Order.aggregate([
      {
        $match: {
          $or: [
            { restaurantId: restaurantIdString },
            { restaurantId: restaurantIdField },
          ],
          status: "delivered",
          createdAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
    ]);

    const monthlyOrders = monthlyStats[0]?.count || 0;
    const monthlyRevenue = monthlyStats[0]?.revenue || 0;

    // Get yearly orders and revenue
    const yearlyStats = await Order.aggregate([
      {
        $match: {
          $or: [
            { restaurantId: restaurantIdString },
            { restaurantId: restaurantIdField },
          ],
          status: "delivered",
          createdAt: { $gte: startOfYear },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
    ]);

    const yearlyOrders = yearlyStats[0]?.count || 0;
    const yearlyRevenue = yearlyStats[0]?.revenue || 0;

    // Get commission and earnings data from OrderSettlement (more accurate)
    // Match settlements by restaurantId (ObjectId in OrderSettlement)
    const restaurantIdForSettlement =
      restaurant._id instanceof mongoose.Types.ObjectId
        ? restaurant._id
        : new mongoose.Types.ObjectId(restaurant._id);

    // Get all settlements for this restaurant
    const allSettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
    }).lean();

    // Calculate totals from settlements
    let totalCommission = 0;
    let totalRestaurantEarning = 0;
    let totalFoodPrice = 0;

    allSettlements.forEach((s) => {
      totalCommission += s.restaurantEarning?.commission || 0;
      totalRestaurantEarning += s.restaurantEarning?.netEarning || 0;
      totalFoodPrice += s.restaurantEarning?.foodPrice || 0;
    });

    totalCommission = Math.round(totalCommission * 100) / 100;
    totalRestaurantEarning = Math.round(totalRestaurantEarning * 100) / 100;
    totalFoodPrice = Math.round(totalFoodPrice * 100) / 100;

    // Get monthly settlements
    const monthlySettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
      createdAt: { $gte: startOfMonth },
    }).lean();

    let monthlyCommission = 0;
    let monthlyRestaurantEarning = 0;
    monthlySettlements.forEach((s) => {
      monthlyCommission += s.restaurantEarning?.commission || 0;
      monthlyRestaurantEarning += s.restaurantEarning?.netEarning || 0;
    });

    monthlyCommission = Math.round(monthlyCommission * 100) / 100;
    monthlyRestaurantEarning = Math.round(monthlyRestaurantEarning * 100) / 100;
    const monthlyProfit = monthlyRestaurantEarning; // Restaurant profit = net earning

    // Get yearly settlements
    const yearlySettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
      createdAt: { $gte: startOfYear },
    }).lean();

    let yearlyCommission = 0;
    let yearlyRestaurantEarning = 0;
    yearlySettlements.forEach((s) => {
      yearlyCommission += s.restaurantEarning?.commission || 0;
      yearlyRestaurantEarning += s.restaurantEarning?.netEarning || 0;
    });

    yearlyCommission = Math.round(yearlyCommission * 100) / 100;
    yearlyRestaurantEarning = Math.round(yearlyRestaurantEarning * 100) / 100;
    const yearlyProfit = yearlyRestaurantEarning; // Restaurant profit = net earning

    // Get average monthly profit (last 12 months)
    const last12MonthsStart = new Date(
      now.getFullYear(),
      now.getMonth() - 12,
      1,
    );
    const last12MonthsSettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
      createdAt: { $gte: last12MonthsStart },
    }).lean();

    // Group by month
    const monthlyEarningsMap = new Map();
    last12MonthsSettlements.forEach((s) => {
      const monthKey = `${new Date(s.createdAt).getFullYear()}-${new Date(s.createdAt).getMonth()}`;
      const current = monthlyEarningsMap.get(monthKey) || 0;
      monthlyEarningsMap.set(
        monthKey,
        current + (s.restaurantEarning?.netEarning || 0),
      );
    });

    const avgMonthlyProfit =
      monthlyEarningsMap.size > 0
        ? Array.from(monthlyEarningsMap.values()).reduce(
            (sum, val) => sum + val,
            0,
          ) / monthlyEarningsMap.size
        : 0;

    // Get commission percentage from RestaurantCommission
    const RestaurantCommission = (
      await import("../models/RestaurantCommission.js")
    ).default;

    // Use restaurant._id directly - ensure it's an ObjectId
    const restaurantIdForQuery =
      restaurant._id instanceof mongoose.Types.ObjectId
        ? restaurant._id
        : new mongoose.Types.ObjectId(restaurant._id);

    logger.info(`🔍 Looking for commission config:`, {
      restaurantId: restaurantId,
      restaurantObjectId: restaurantIdForQuery.toString(),
      restaurantName: restaurant.name,
      restaurantIdString: restaurant.restaurantId,
    });

    // Try using the static method first
    let commissionConfig =
      await RestaurantCommission.getCommissionForRestaurant(
        restaurantIdForQuery,
      );

    if (commissionConfig) {
      // Convert to plain object if needed
      commissionConfig = commissionConfig.toObject
        ? commissionConfig.toObject()
        : commissionConfig;
      logger.info(`✅ Found commission using static method`);
    }

    // If not found, try direct query
    if (!commissionConfig) {
      logger.info(
        `⚠️ Static method didn't find commission, trying direct query`,
      );
      commissionConfig = await RestaurantCommission.findOne({
        restaurant: restaurantIdForQuery,
        status: true,
      });

      if (commissionConfig) {
        commissionConfig = commissionConfig.toObject
          ? commissionConfig.toObject()
          : commissionConfig;
      }
    }

    // If still not found, try without status filter
    if (!commissionConfig) {
      logger.info(`⚠️ Trying without status filter`);
      commissionConfig = await RestaurantCommission.findOne({
        restaurant: restaurantIdForQuery,
      });

      if (commissionConfig) {
        commissionConfig = commissionConfig.toObject
          ? commissionConfig.toObject()
          : commissionConfig;
      }
    }

    // Also try by restaurantId string field
    if (!commissionConfig && restaurant?.restaurantId) {
      logger.info(
        `🔄 Trying by restaurantId string: ${restaurant.restaurantId}`,
      );
      commissionConfig = await RestaurantCommission.findOne({
        restaurantId: restaurant.restaurantId,
      });

      if (commissionConfig) {
        commissionConfig = commissionConfig.toObject
          ? commissionConfig.toObject()
          : commissionConfig;
      }
    }

    // Final debug: List all commissions to see what's in DB
    if (!commissionConfig) {
      const allCommissions = await RestaurantCommission.find({}).lean();
      logger.warn(
        `❌ No commission found. Total commissions in DB: ${allCommissions.length}`,
      );
      logger.info(
        `📋 All commissions:`,
        allCommissions.map((c) => ({
          _id: c._id,
          restaurant: c.restaurant?.toString
            ? c.restaurant.toString()
            : String(c.restaurant),
          restaurantId: c.restaurantId,
          restaurantName: c.restaurantName,
          status: c.status,
          defaultCommission: c.defaultCommission,
        })),
      );

      // Check if restaurant ObjectId matches any commission
      const matching = allCommissions.filter((c) => {
        const cRestaurantId = c.restaurant?.toString
          ? c.restaurant.toString()
          : String(c.restaurant);
        return cRestaurantId === restaurantIdForQuery.toString();
      });
      logger.info(`🔍 Matching commissions: ${matching.length}`, matching);
    }

    let commissionPercentage = 0;
    if (commissionConfig) {
      logger.info(`✅ Commission config found for restaurant ${restaurantId}`);
      logger.info(`Commission config details:`, {
        _id: commissionConfig._id,
        restaurant: commissionConfig.restaurant?.toString
          ? commissionConfig.restaurant.toString()
          : String(commissionConfig.restaurant),
        restaurantId: commissionConfig.restaurantId,
        restaurantName: commissionConfig.restaurantName,
        status: commissionConfig.status,
        hasDefaultCommission: !!commissionConfig.defaultCommission,
        defaultCommissionType: commissionConfig.defaultCommission?.type,
        defaultCommissionValue: commissionConfig.defaultCommission?.value,
      });

      if (commissionConfig.defaultCommission) {
        // Get default commission value - if type is percentage, show the percentage value
        logger.info(`📊 Processing defaultCommission:`, {
          type: commissionConfig.defaultCommission.type,
          value: commissionConfig.defaultCommission.value,
          valueType: typeof commissionConfig.defaultCommission.value,
        });

        if (commissionConfig.defaultCommission.type === "percentage") {
          const rawValue = commissionConfig.defaultCommission.value;
          commissionPercentage =
            typeof rawValue === "number" ? rawValue : parseFloat(rawValue) || 0;
          logger.info(
            `✅ Found commission percentage: ${commissionPercentage}% for restaurant ${restaurantId} (raw value: ${rawValue})`,
          );
        } else if (commissionConfig.defaultCommission.type === "amount") {
          // For amount type, we can't show a percentage, so keep it as 0
          commissionPercentage = 0;
          logger.info(
            `⚠️ Commission type is 'amount', not 'percentage' for restaurant ${restaurantId}`,
          );
        }
      } else {
        logger.warn(
          `⚠️ Commission config found but no defaultCommission for restaurant ${restaurantId}`,
        );
      }
    } else {
      logger.warn(
        `❌ No commission config found for restaurant ${restaurantId} (restaurant._id: ${restaurantIdForQuery.toString()})`,
      );
      logger.warn(
        `⚠️ This restaurant may not have a commission configuration set up.`,
      );
      logger.warn(
        `💡 To set up commission, go to Restaurant Commission page and add commission for this restaurant.`,
      );
    }

    // Log the final commission percentage being returned
    logger.info(
      `📊 Final commission percentage being returned: ${commissionPercentage}%`,
    );
    logger.info(
      `📤 Sending response with commissionPercentage: ${commissionPercentage}`,
    );

    // Get ratings from FeedbackExperience (restaurantId is ObjectId in FeedbackExperience)
    const FeedbackExperience = (await import("../models/FeedbackExperience.js"))
      .default;

    const restaurantIdForRating =
      restaurant._id instanceof mongoose.Types.ObjectId
        ? restaurant._id
        : new mongoose.Types.ObjectId(restaurant._id);

    logger.info(`⭐ Fetching ratings for restaurant:`, {
      restaurantId: restaurantId,
      restaurantObjectId: restaurantIdForRating.toString(),
    });

    const ratingStats = await FeedbackExperience.aggregate([
      {
        $match: {
          restaurantId: restaurantIdForRating,
          rating: { $exists: true, $ne: null, $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 },
        },
      },
    ]);

    logger.info(`⭐ Rating stats found:`, ratingStats);

    const averageRating = ratingStats[0]?.averageRating || 0;
    const totalRatings = ratingStats[0]?.totalRatings || 0;

    logger.info(`⭐ Calculated ratings:`, {
      averageRating,
      totalRatings,
    });

    // Get unique customers
    const customerStats = await Order.aggregate([
      {
        $match: {
          $or: [
            { restaurantId: restaurantIdString },
            { restaurantId: restaurantIdField },
          ],
          status: "delivered",
        },
      },
      {
        $group: {
          _id: "$userId",
          orderCount: { $sum: 1 },
        },
      },
    ]);

    const totalCustomers = customerStats.length;
    const repeatCustomers = customerStats.filter(
      (c) => c.orderCount > 1,
    ).length;

    // Calculate average order value
    const averageOrderValue =
      completedOrders > 0 ? totalRevenue / completedOrders : 0;

    // Calculate rates
    const cancellationRate =
      totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;
    const completionRate =
      totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

    // Calculate average yearly profit (if restaurant has been active for multiple years)
    const restaurantCreatedAt = restaurant.createdAt || new Date();
    const yearsActive = Math.max(
      1,
      (now - restaurantCreatedAt) / (365 * 24 * 60 * 60 * 1000),
    );
    const averageYearlyProfit =
      yearsActive > 0
        ? yearlyRestaurantEarning / yearsActive
        : yearlyRestaurantEarning;

    return successResponse(
      res,
      200,
      "Restaurant analytics retrieved successfully",
      {
        restaurant: {
          _id: restaurant._id,
          name: restaurant.name,
          restaurantId: restaurant.restaurantId,
          isActive: restaurant.isActive,
          createdAt: restaurant.createdAt,
        },
        analytics: {
          totalOrders: Number(totalOrders) || 0,
          cancelledOrders: Number(cancelledOrders) || 0,
          completedOrders: Number(completedOrders) || 0,
          averageRating: averageRating
            ? parseFloat(averageRating.toFixed(1))
            : 0,
          totalRatings: Number(totalRatings) || 0,
          commissionPercentage: Number(commissionPercentage) || 0,
          monthlyProfit: parseFloat(monthlyRestaurantEarning.toFixed(2)),
          yearlyProfit: parseFloat(yearlyRestaurantEarning.toFixed(2)),
          averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          totalCommission: parseFloat(totalCommission.toFixed(2)),
          restaurantEarning: parseFloat(totalRestaurantEarning.toFixed(2)),
          monthlyOrders,
          yearlyOrders,
          averageMonthlyProfit: parseFloat(avgMonthlyProfit.toFixed(2)),
          averageYearlyProfit: parseFloat(averageYearlyProfit.toFixed(2)),
          status: restaurant.isActive ? "active" : "inactive",
          joinDate: restaurant.createdAt,
          totalCustomers,
          repeatCustomers,
          cancellationRate: parseFloat(cancellationRate.toFixed(2)),
          completionRate: parseFloat(completionRate.toFixed(2)),
        },
      },
    );
  } catch (error) {
    logger.error(`Error fetching restaurant analytics: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch restaurant analytics");
  }
});

/**
 * Get Customer Wallet Report
 * GET /api/admin/customer-wallet-report
 * Query params: fromDate, toDate, all (Credit/Debit), customer, search
 */
export const getCustomerWalletReport = asyncHandler(async (req, res) => {
  try {
    console.log("🔍 Fetching customer wallet report...");
    const { fromDate, toDate, all, customer, search } = req.query;

    console.log("📋 Query params:", {
      fromDate,
      toDate,
      all,
      customer,
      search,
    });

    const UserWallet = (await import("../../user/models/UserWallet.js"))
      .default;
    const User = (await import("../../auth/models/User.js")).default;

    // Build date filter
    let dateFilter = {};
    if (fromDate || toDate) {
      dateFilter["transactions.createdAt"] = {};
      if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        dateFilter["transactions.createdAt"].$gte = startDate;
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        dateFilter["transactions.createdAt"].$lte = endDate;
      }
    }

    // Get all wallets with transactions
    const wallets = await UserWallet.find({
      ...dateFilter,
      "transactions.0": { $exists: true }, // Only wallets with transactions
    })
      .populate("userId", "name email phone")
      .lean();

    // Flatten transactions with user info
    let allTransactions = [];
    wallets.forEach((wallet) => {
      if (!wallet.userId) return;

      // Sort transactions by date (oldest first for balance calculation)
      const sortedTransactions = [...wallet.transactions].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      );

      let runningBalance = 0;

      sortedTransactions.forEach((transaction) => {
        // Update running balance if transaction is completed (before date filter)
        let balance = runningBalance;
        if (transaction.status === "Completed") {
          if (
            transaction.type === "addition" ||
            transaction.type === "refund"
          ) {
            runningBalance += transaction.amount;
            balance = runningBalance;
          } else if (transaction.type === "deduction") {
            runningBalance -= transaction.amount;
            balance = runningBalance;
          }
        }

        // Apply date filter if provided
        if (fromDate || toDate) {
          const transDate = new Date(transaction.createdAt);
          if (fromDate && transDate < new Date(fromDate)) return;
          if (toDate) {
            const toDateObj = new Date(toDate);
            toDateObj.setHours(23, 59, 59, 999);
            if (transDate > toDateObj) return;
          }
        }

        // Map transaction type to frontend format
        let transactionType = "CashBack";
        if (transaction.type === "addition") {
          if (
            transaction.description?.includes("Admin") ||
            transaction.description?.includes("admin")
          ) {
            transactionType = "Add Fund By Admin";
          } else {
            transactionType = "Add Fund";
          }
        } else if (transaction.type === "deduction") {
          transactionType = "Order Payment";
        } else if (transaction.type === "refund") {
          transactionType = "Refund";
        }

        // Get reference
        let reference = "N/A";
        if (transaction.orderId) {
          reference = transaction.orderId.toString();
        } else if (transaction.paymentGateway) {
          reference = transaction.paymentGateway;
        } else if (transaction.description) {
          reference = transaction.description;
        }

        allTransactions.push({
          _id: transaction._id,
          transactionId: transaction._id.toString(),
          customer: wallet.userId.name || "Unknown",
          customerId: wallet.userId._id.toString(),
          credit:
            transaction.type === "addition" || transaction.type === "refund"
              ? transaction.amount
              : 0,
          debit: transaction.type === "deduction" ? transaction.amount : 0,
          balance: balance,
          transactionType: transactionType,
          reference: reference,
          createdAt: transaction.createdAt,
          status: transaction.status,
          type: transaction.type,
        });
      });
    });

    // Filter by transaction type (Credit/Debit)
    if (all && all !== "All") {
      if (all === "Credit") {
        allTransactions = allTransactions.filter((t) => t.credit > 0);
      } else if (all === "Debit") {
        allTransactions = allTransactions.filter((t) => t.debit > 0);
      }
    }

    // Filter by customer
    if (customer && customer !== "Select Customer") {
      allTransactions = allTransactions.filter((t) =>
        t.customer.toLowerCase().includes(customer.toLowerCase()),
      );
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      allTransactions = allTransactions.filter(
        (t) =>
          t.transactionId.toLowerCase().includes(searchLower) ||
          t.customer.toLowerCase().includes(searchLower) ||
          t.reference.toLowerCase().includes(searchLower),
      );
    }

    // Sort by date (newest first)
    allTransactions.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );

    // Format currency
    const formatCurrency = (amount) => {
      return `₹${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Format date
    const formatDate = (date) => {
      const d = new Date(date);
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const day = d.getDate();
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "pm" : "am";
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${day} ${month} ${year} ${hours}:${minutes} ${ampm}`;
    };

    // Transform transactions for frontend
    const transformedTransactions = allTransactions.map(
      (transaction, index) => ({
        sl: index + 1,
        transactionId: transaction.transactionId,
        customer: transaction.customer,
        credit: formatCurrency(transaction.credit),
        debit: formatCurrency(transaction.debit),
        balance: formatCurrency(transaction.balance),
        transactionType: transaction.transactionType,
        reference: transaction.reference,
        createdAt: formatDate(transaction.createdAt),
      }),
    );

    // Calculate summary statistics
    const totalDebit = allTransactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredit = allTransactions.reduce((sum, t) => sum + t.credit, 0);
    const totalBalance = totalCredit - totalDebit;

    // Get unique customers for dropdown
    const uniqueCustomers = [
      ...new Set(allTransactions.map((t) => t.customer)),
    ].sort();

    return successResponse(
      res,
      200,
      "Customer wallet report retrieved successfully",
      {
        transactions: transformedTransactions,
        stats: {
          debit: formatCurrency(totalDebit),
          credit: formatCurrency(totalCredit),
          balance: formatCurrency(totalBalance),
        },
        customers: uniqueCustomers,
        pagination: {
          page: 1,
          limit: 10000,
          total: transformedTransactions.length,
          pages: 1,
        },
      },
    );
  } catch (error) {
    console.error("❌ Error fetching customer wallet report:", error);
    console.error("Error stack:", error.stack);
    return errorResponse(
      res,
      500,
      error.message || "Failed to fetch customer wallet report",
    );
  }
});

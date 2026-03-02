import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

import Restaurant from "../modules/restaurant/models/Restaurant.js";
import Menu from "../modules/restaurant/models/Menu.js";
import RestaurantCategory from "../modules/restaurant/models/RestaurantCategory.js";
import Inventory from "../modules/restaurant/models/Inventory.js";
import OutletTimings from "../modules/restaurant/models/OutletTimings.js";
import Offer from "../modules/restaurant/models/Offer.js";
import MenuItemSchedule from "../modules/restaurant/models/MenuItemSchedule.js";
import WithdrawalRequest from "../modules/restaurant/models/WithdrawalRequest.js";
import StaffManagement from "../modules/restaurant/models/StaffManagement.js";
import RestaurantWallet from "../modules/restaurant/models/RestaurantWallet.js";
import RestaurantComplaint from "../modules/admin/models/RestaurantComplaint.js";
import RestaurantCommission from "../modules/admin/models/RestaurantCommission.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const targetSlug = process.argv[2] || "kondapalli-r-f-c";

const toPlain = (doc) => (doc && typeof doc.toObject === "function" ? doc.toObject() : doc);

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const restaurant = await Restaurant.findOne({ slug: targetSlug });
    if (!restaurant) {
      console.error(`Restaurant not found for slug: ${targetSlug}`);
      process.exit(1);
    }

    const restaurantId = restaurant._id;
    const restaurantIdString = String(restaurantId);
    const restaurantCode = String(restaurant.restaurantId || "");

    const [
      menu,
      categories,
      inventory,
      outletTimings,
      offers,
      schedules,
      withdrawals,
      staff,
      wallet,
      complaints,
      commissions,
    ] = await Promise.all([
      Menu.findOne({ restaurant: restaurantId }),
      RestaurantCategory.find({ restaurant: restaurantId }),
      Inventory.findOne({ restaurant: restaurantId }),
      OutletTimings.findOne({ restaurant: restaurantId }),
      Offer.find({ restaurant: restaurantId }),
      MenuItemSchedule.find({ restaurant: restaurantId }),
      WithdrawalRequest.find({ restaurant: restaurantId }),
      StaffManagement.find({ restaurant: restaurantId }),
      RestaurantWallet.findOne({ restaurant: restaurantId }),
      RestaurantComplaint.find({
        restaurantId: restaurantId,
      }),
      RestaurantCommission.find({
        $or: [{ restaurant: restaurantId }, { restaurantId: restaurantCode }],
      }),
    ]);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(__dirname, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const backup = {
      metadata: {
        createdAt: new Date().toISOString(),
        slug: targetSlug,
        restaurantMongoId: restaurantIdString,
        restaurantId: restaurantCode,
      },
      restaurant: toPlain(restaurant),
      menu: toPlain(menu),
      categories: categories.map(toPlain),
      inventory: toPlain(inventory),
      outletTimings: toPlain(outletTimings),
      offers: offers.map(toPlain),
      menuItemSchedules: schedules.map(toPlain),
      withdrawalRequests: withdrawals.map(toPlain),
      staffManagement: staff.map(toPlain),
      restaurantWallet: toPlain(wallet),
      restaurantComplaints: complaints.map(toPlain),
      restaurantCommissions: commissions.map(toPlain),
      counts: {
        categories: categories.length,
        offers: offers.length,
        menuItemSchedules: schedules.length,
        withdrawalRequests: withdrawals.length,
        staffManagement: staff.length,
        restaurantComplaints: complaints.length,
        restaurantCommissions: commissions.length,
      },
    };

    const fileName = `restaurant-backup-${targetSlug}-${timestamp}.json`;
    const filePath = path.join(backupDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), "utf8");

    console.log("Backup created:", filePath);
    console.log("Restaurant:", restaurant.name);
    console.log("Counts:", JSON.stringify(backup.counts));
    process.exit(0);
  } catch (error) {
    console.error("Backup failed:", error);
    process.exit(1);
  }
}

run();

import Menu from "../models/Menu.js";
import Offer from "../models/Offer.js";
import OutletTimings from "../models/OutletTimings.js";
import RestaurantWallet from "../models/RestaurantWallet.js";
import WithdrawalRequest from "../models/WithdrawalRequest.js";
import RestaurantCategory from "../models/RestaurantCategory.js";
import StaffManagement from "../models/StaffManagement.js";
import Inventory from "../models/Inventory.js";
import MenuItemSchedule from "../models/MenuItemSchedule.js";
import OrderSettlement from "../../order/models/OrderSettlement.js";

export async function deleteRestaurantRelatedData(restaurantId) {
  if (!restaurantId) return;

  await Promise.all([
    Menu.deleteMany({ restaurant: restaurantId }),
    Offer.deleteMany({ restaurant: restaurantId }),
    OutletTimings.deleteMany({ restaurantId }),
    RestaurantWallet.deleteMany({ restaurantId }),
    WithdrawalRequest.deleteMany({ restaurantId }),
    RestaurantCategory.deleteMany({ restaurant: restaurantId }),
    StaffManagement.deleteMany({ restaurantId }),
    Inventory.deleteMany({ restaurantId }),
    MenuItemSchedule.deleteMany({ restaurant: restaurantId }),
    OrderSettlement.deleteMany({ restaurantId }),
  ]);
}

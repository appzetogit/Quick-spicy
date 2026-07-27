import BusinessSettings from "../../modules/admin/models/BusinessSettings.js";

/**
 * Platform-wide promotional offers kill switch, toggled from the admin coupons page.
 *
 * Read this anywhere offers are shown to customers or a coupon is applied to an order.
 * Checking it only in the listing endpoints would leave the switch decorative: a customer
 * holding a known coupon code could still redeem it at checkout while offers appeared off.
 *
 * Fails open. If the settings document is missing or the read fails, offers stay enabled,
 * because silently voiding every customer's coupon on a transient database error is worse
 * than briefly honouring offers the admin meant to pause.
 */
export const areOffersEnabled = async () => {
  try {
    const settings = await BusinessSettings.findOne().select("offersEnabled").lean();
    if (!settings) return true;
    return settings.offersEnabled !== false;
  } catch {
    return true;
  }
};

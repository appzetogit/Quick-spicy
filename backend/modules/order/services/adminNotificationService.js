import winston from "winston";
import smsIndiaHubService from "../../auth/services/smsIndiaHubService.js";
import { getEnvVar } from "../../../shared/utils/envService.js";

let getIO = null;

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import("../../../server.js");
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

async function getOrderSmsAlertNumber() {
  try {
    const { default: BusinessSettings } = await import(
      "../../admin/models/BusinessSettings.js"
    );
    const settings = await BusinessSettings.getSettings();
    const phone = String(settings?.orderSmsPhoneNumber || "").trim();
    return phone || null;
  } catch (error) {
    logger.warn("Failed to read order SMS alert number", {
      error: error?.message,
    });
    return null;
  }
}

function applyTemplate(template, payload) {
  return String(template || "")
    .replace(/\{orderId\}/g, String(payload?.orderId || ""))
    .replace(/\{customerName\}/g, String(payload?.customerName || "Customer"))
    .replace(
      /\{restaurantName\}/g,
      String(payload?.restaurantName || "Unknown Restaurant"),
    )
    .replace(/\{total\}/g, String(payload?.total ?? 0));
}

async function getOrderAlertTemplateConfig() {
  // These keys can be supplied via process.env.
  // If they are later added to Environment Variables DB, getEnvVar will pick them too.
  const template = String(
    (await getEnvVar("SMSINDIAHUB_ORDER_ALERT_TEMPLATE", "")) ||
      process.env.SMSINDIAHUB_ORDER_ALERT_TEMPLATE ||
      "",
  ).trim();
  const templateId = String(
    (await getEnvVar("SMSINDIAHUB_ORDER_ALERT_TEMPLATE_ID", "")) ||
      process.env.SMSINDIAHUB_ORDER_ALERT_TEMPLATE_ID ||
      "",
  ).trim();
  return { template, templateId };
}

async function buildNewOrderSmsMessage(payload) {
  const { template } = await getOrderAlertTemplateConfig();
  if (template) {
    return applyTemplate(template, payload);
  }

  const customerName = payload?.customerName || "Customer";
  const restaurantName = payload?.restaurantName || "Unknown Restaurant";
  return `New order received. Customer: ${customerName}. Restaurant: ${restaurantName}.`;
}

async function sendOrderSmsAlert(payload) {
  const phone = await getOrderSmsAlertNumber();
  if (!phone) return { success: false, reason: "no-recipient-configured" };

  const { templateId } = await getOrderAlertTemplateConfig();
  const message = await buildNewOrderSmsMessage(payload);
  const result = await smsIndiaHubService.sendCustomSMS(phone, message, {
    templateId: templateId || undefined,
  });

  logger.info("Admin order SMS alert sent", {
    orderId: payload?.orderId,
    phone,
    provider: result?.provider || "SMSIndia Hub",
  });

  return { success: true, phone };
}

async function markOrderSmsAlertSent(orderId) {
  if (!orderId) return;
  try {
    const { default: Order } = await import("../models/Order.js");
    await Order.updateOne(
      { _id: orderId },
      { $set: { adminOrderSmsAlertSentAt: new Date() } },
    );
  } catch (error) {
    logger.warn("Failed to mark admin order SMS alert sent", {
      orderId: String(orderId),
      error: error?.message,
    });
  }
}

export async function sendAdminOrderSmsAlertForOrder(order) {
  if (!order) return { success: false, reason: "order-missing" };

  const payload = {
    orderId: order.orderId,
    orderMongoId: order._id?.toString?.() || "",
    restaurantId: order.restaurantId?.toString?.() || order.restaurantId || "",
    restaurantName: order.restaurantName || "",
    customerName:
      order.customerName ||
      order.userName ||
      order.user?.name ||
      order.userId?.name ||
      "Customer",
    status: order.status || "confirmed",
    total: order?.pricing?.total ?? 0,
    createdAt: order.createdAt || new Date().toISOString(),
  };

  const result = await sendOrderSmsAlert(payload);
  if (result?.success) {
    await markOrderSmsAlertSent(order._id);
  }
  return result;
}

export async function notifyAdminNewOrder(order) {
  try {
    if (!order) return { success: false, reason: "order-missing" };
    const io = await getIOInstance();

    const payload = {
      type: "new_order",
      orderId: order.orderId,
      orderMongoId: order._id?.toString?.() || "",
      restaurantId: order.restaurantId?.toString?.() || order.restaurantId || "",
      restaurantName: order.restaurantName || "",
      customerName:
        order.customerName ||
        order.userName ||
        order.user?.name ||
        order.userId?.name ||
        "Customer",
      status: order.status || "confirmed",
      total: order?.pricing?.total ?? 0,
      createdAt: order.createdAt || new Date().toISOString(),
    };

    if (io) {
      io.to("admin:orders").emit("admin_new_order", payload);
      io.to("admin:orders").emit("play_notification_sound", {
        type: "new_order",
        orderId: payload.orderId,
        message: `New order received: ${payload.orderId}`,
      });
    } else {
      logger.warn("Socket.IO unavailable while notifying admin new order", {
        orderId: payload.orderId,
      });
    }

    // Keep order placement flow fast; SMS is best-effort.
    sendAdminOrderSmsAlertForOrder(order).catch((smsError) => {
      logger.warn("Failed to send admin order SMS alert", {
        orderId: payload.orderId,
        error: smsError?.message,
      });
    });

    logger.info("Admin new order event emitted", {
      room: "admin:orders",
      orderId: payload.orderId,
      orderMongoId: payload.orderMongoId,
    });

    return { success: true, orderId: payload.orderId };
  } catch (error) {
    logger.error("Failed to emit admin new order event", {
      error: error?.message,
      stack: error?.stack,
    });
    return { success: false, reason: error?.message || "unknown-error" };
  }
}

import nodemailer from "nodemailer";
import winston from "winston";
import dotenv from "dotenv";
dotenv.config();

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

/**
 * Email Service
 * Handles sending emails via Nodemailer
 */
class EmailService {
  constructor() {
    // Initialize transporter based on environment
    this.transporter = null;
    // Initialize asynchronously (don't await in constructor)
    this.initializeTransporter().catch((err) => {
      logger.warn(`Error initializing email transporter: ${err.message}`);
    });
  }

  /**
   * Initialize Nodemailer transporter
   * Supports both SMTP and development/test mode
   */
  async initializeTransporter() {
    // Get SMTP credentials from database
    const { getSMTPCredentials } =
      await import("../../../shared/utils/envService.js");
    const smtpCreds = await getSMTPCredentials();

    // Check if SMTP credentials are provided (from database or env)
    const hasSMTPConfig =
      (smtpCreds.user || process.env.SMTP_USER) &&
      (smtpCreds.pass || process.env.SMTP_PASS) &&
      (smtpCreds.host || process.env.SMTP_HOST);

    // For development/testing, use Ethereal Email if no SMTP config
    if (process.env.NODE_ENV === "development" && !hasSMTPConfig) {
      // Check if Ethereal credentials are provided
      if (process.env.ETHEREAL_USER && process.env.ETHEREAL_PASS) {
        this.transporter = nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          auth: {
            user: process.env.ETHEREAL_USER,
            pass: process.env.ETHEREAL_PASS,
          },
        });
      } else {
        logger.warn(
          "No SMTP or Ethereal email configuration found. Email OTP will not work.",
        );
        return;
      }
    } else if (!hasSMTPConfig) {
      logger.warn("SMTP configuration missing. Email OTP will not work.");
      return;
    } else {
      // Production SMTP configuration (use database values, fallback to env)
      const smtpHost = smtpCreds.host || process.env.SMTP_HOST;
      const smtpPort = smtpCreds.port || process.env.SMTP_PORT || "587";
      const smtpUser = smtpCreds.user || process.env.SMTP_USER;
      const smtpPass = smtpCreds.pass || process.env.SMTP_PASS;

      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
    }

    if (this.transporter) {
      this.transporter.verify((error, success) => {
        if (error) {
          logger.warn(
            `Email transporter verification failed: ${error.message}`,
          );
        } else {
          logger.info("Email transporter is ready");
        }
      });
    }
  }

  async getCompanyName() {
    try {
      const BusinessSettings = (
        await import("../../admin/models/BusinessSettings.js")
      ).default;
      const settings = await BusinessSettings.getSettings();
      return settings?.companyName || "Appzeto Food";
    } catch (error) {
      return "Appzeto Food";
    }
  }

  async sendEmail({ to, subject, html }) {
    try {
      if (!this.transporter) await this.initializeTransporter();
      if (!this.transporter) {
        logger.warn("Transporter not ready, skipping email to " + to);
        return false;
      }

      const { getSMTPCredentials } =
        await import("../../../shared/utils/envService.js");
      const smtpCreds = await getSMTPCredentials();
      const fromEmail =
        process.env.SMTP_FROM ||
        smtpCreds.user ||
        process.env.SMTP_USER ||
        "noreply@appzetofood.com";
      const companyName = await this.getCompanyName();
      const fromName = process.env.SMTP_FROM_NAME || companyName;

      await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        html,
      });
      logger.info(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send email to ${to}: ${error.message}`);
      return false;
    }
  }

  // --- User Emails ---

  async sendOTP(email, otp, purpose = "login") {
    const { templates } = await import("./emailTemplates.js");
    const companyName = await this.getCompanyName();

    const purposeText =
      {
        login: "login to your account",
        register: "complete your registration",
        "reset-password": "reset your password",
        "verify-phone": "verify your phone number",
        "verify-email": "verify your email address",
      }[purpose] || "complete this action";

    const html = templates.otp({ companyName, otp, purposeText });
    return this.sendEmail({ to: email, subject: `Your OTP - ${otp}`, html });
  }

  async sendWelcomeEmail(email, name) {
    const { templates } = await import("./emailTemplates.js");
    const companyName = await this.getCompanyName();
    const dashboardUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/user/home`;

    const html = templates.welcomeUser({ companyName, name, dashboardUrl });
    return this.sendEmail({
      to: email,
      subject: `Welcome to ${companyName}!`,
      html,
    });
  }

  async sendBookingConfirmation(email, booking) {
    const { templates } = await import("./emailTemplates.js");
    const companyName = await this.getCompanyName();
    const restaurantName = booking.restaurant.name || "Restaurant";

    // Format date nicely
    const date = new Date(booking.date).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const bookingUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/user/dining/bookings`;

    const html = templates.bookingConfirmation({
      companyName,
      restaurantName,
      bookingId: booking._id.toString().slice(-6).toUpperCase(),
      date,
      time: booking.timeSlot,
      guests: booking.guests,
      specialRequest: booking.specialRequest,
      userName: "Guest", // Ideally get from user obj if available
      bookingUrl,
    });

    return this.sendEmail({
      to: email,
      subject: `Booking Confirmed: ${restaurantName}`,
      html,
    });
  }

  // --- Restaurant Emails ---

  async sendRestaurantWelcome(email, ownerName, restaurantName) {
    const { templates } = await import("./emailTemplates.js");
    const companyName = await this.getCompanyName();
    const html = templates.restaurantWelcome({
      companyName,
      ownerName,
      restaurantName,
    });
    return this.sendEmail({
      to: email,
      subject: `Welcome to ${companyName} Partner Program`,
      html,
    });
  }

  async sendRestaurantRegistrationAlert(adminEmail, restaurantData) {
    const { templates } = await import("./emailTemplates.js");
    const companyName = await this.getCompanyName();
    const adminUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/admin/restaurants/requests`;

    const html = templates.restaurantRegistrationRequest({
      companyName,
      restaurantName: restaurantData.name,
      ownerName: restaurantData.ownerName,
      phone: restaurantData.ownerPhone || restaurantData.phone,
      city: restaurantData.address?.city || "Unknown",
      adminUrl,
    });

    return this.sendEmail({
      to: adminEmail,
      subject: "New Restaurant Registration Request",
      html,
    });
  }

  async sendRestaurantApproved(email, restaurantName) {
    const { templates } = await import("./emailTemplates.js");
    const companyName = await this.getCompanyName();
    const dashboardUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/restaurant/dashboard`;
    const html = templates.restaurantApproved({
      companyName,
      restaurantName,
      dashboardUrl,
    });
    return this.sendEmail({
      to: email,
      subject: "Your Restaurant is Live!",
      html,
    });
  }

  async sendWithdrawalRequestAlert(adminEmail, requestData) {
    const { templates } = await import("./emailTemplates.js");
    const companyName = await this.getCompanyName();
    const adminUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/admin/finance/withdrawals`;

    const html = templates.withdrawalRequestAdmin({
      companyName,
      restaurantName: requestData.restaurantName,
      amount: requestData.amount,
      requestId: requestData.requestId,
      requestedAt: new Date().toLocaleDateString(),
      adminUrl,
    });

    return this.sendEmail({
      to: adminEmail,
      subject: "New Withdrawal Request",
      html,
    });
  }

  async sendWithdrawalStatusEmail(email, requestData) {
    const { templates } = await import("./emailTemplates.js");
    const companyName = await this.getCompanyName();

    const html = templates.withdrawalStatus({
      companyName,
      status: requestData.status,
      amount: requestData.amount,
      requestId: requestData.requestId,
      rejectionReason: requestData.rejectionReason,
    });

    return this.sendEmail({
      to: email,
      subject: `Withdrawal Request ${requestData.status}`,
      html,
    });
  }

  async sendPromotionLaunched(email, promotionData) {
    const { templates } = await import("./emailTemplates.js");
    const companyName = await this.getCompanyName();

    const html = templates.promotionLaunched({
      companyName,
      title: promotionData.title,
      discount: promotionData.discount,
      startDate: new Date(promotionData.startDate).toLocaleDateString(),
      endDate: new Date(promotionData.endDate).toLocaleDateString(),
    });

    return this.sendEmail({
      to: email,
      subject: "Promotion Launched Successfully",
      html,
    });
  }

  // --- Delivery Emails ---

  async sendDeliveryPartnerWelcome(email, partnerData) {
    const { templates } = await import("./emailTemplates.js");
    const companyName = await this.getCompanyName();
    const html = templates.deliveryPartnerWelcome({
      companyName,
      name: partnerData.name,
      phone: partnerData.phone,
    });
    return this.sendEmail({
      to: email,
      subject: "Welcome to Delivery Fleet",
      html,
    });
  }

  async sendDeliveryDepositConfirmation(email, depositData) {
    const { templates } = await import("./emailTemplates.js");
    const companyName = await this.getCompanyName();
    const html = templates.deliveryDeposit({
      companyName,
      amount: depositData.amount,
      transactionId: depositData.transactionId,
    });
    return this.sendEmail({ to: email, subject: "Deposit Confirmation", html });
  }

  // --- Menu Emails ---

  async sendMenuItemApproved(email, itemData) {
    const { templates } = await import("./emailTemplates.js");
    const companyName = await this.getCompanyName();
    const html = templates.menuItemApproved({
      companyName,
      itemName: itemData.name,
    });
    return this.sendEmail({ to: email, subject: "Menu Item Approved", html });
  }
}

export default new EmailService();

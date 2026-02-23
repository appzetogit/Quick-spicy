/**
 * Email HTML Templates
 * Centralized template management for all system emails
 */

const getBaseStyles = () => `
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 30px 20px; text-align: center; color: white; }
    .content { padding: 30px 20px; }
    .footer { background-color: #f8f8f8; padding: 20px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee; }
    .button { display: inline-block; padding: 12px 24px; background-color: #10B981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
    .info-box { background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e2e8f0; }
    .row { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 10px; }
    .row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .label { font-weight: 600; color: #64748b; }
    .value { font-weight: 600; color: #0f172a; text-align: right; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
    .status-success { background-color: #d1fae5; color: #065f46; }
    .status-warning { background-color: #fef3c7; color: #92400e; }
    .status-error { background-color: #fee2e2; color: #991b1b; }
    h1 { margin: 0; font-size: 24px; font-weight: 700; }
    h2 { margin-top: 0; color: #111827; font-size: 20px; }
    p { margin-bottom: 15px; }
  </style>
`;

const getTemplateWrapper = (companyName, title, content) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    ${getBaseStyles()}
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>${companyName}</h1>
        <p style="margin: 10px 0 0; opacity: 0.9;">${title}</p>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
        <p>This is an automated message, please do not reply directly to this email.</p>
      </div>
    </div>
  </body>
</html>
`;

export const templates = {
  // --- User Templates ---

  welcomeUser: (data) => {
    const content = `
      <h2>Welcome to ${data.companyName}!</h2>
      <p>Hi <strong>${data.name}</strong>,</p>
      <p>Thank you for joining ${data.companyName}. We're excited to have you on board!</p>
      <p>Explore the best restaurants around you and enjoy delicious meals delivered to your doorstep.</p>
      <div style="text-align: center;">
        <a href="${data.dashboardUrl}" class="button">Start Exploring</a>
      </div>
    `;
    return getTemplateWrapper(data.companyName, "Welcome Aboard!", content);
  },

  otp: (data) => {
    const content = `
      <h2>OTP Verification</h2>
      <p>Your One-Time Password (OTP) to <strong>${data.purposeText}</strong> is:</p>
      <div style="background: white; border: 2px dashed #10B981; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
        <div style="font-size: 32px; font-weight: bold; color: #10B981; letter-spacing: 5px;">
          ${data.otp}
        </div>
      </div>
      <p>This OTP is valid for 5 minutes. Do not share it with anyone.</p>
    `;
    return getTemplateWrapper(data.companyName, "Verification Code", content);
  },

  bookingConfirmation: (data) => {
    const content = `
      <h2>Booking Confirmed!</h2>
      <p>Hi <strong>${data.userName}</strong>,</p>
      <p>Great news! Your table reservation has been successfully confirmed.</p>
      
      <div class="info-box">
        <div class="row">
          <span class="label">Restaurant</span>
          <span class="value">${data.restaurantName}</span>
        </div>
        <div class="row">
          <span class="label">Booking ID</span>
          <span class="value">#${data.bookingId}</span>
        </div>
        <div class="row">
          <span class="label">Date</span>
          <span class="value">${data.date}</span>
        </div>
        <div class="row">
          <span class="label">Time</span>
          <span class="value">${data.time}</span>
        </div>
        <div class="row">
          <span class="label">Guests</span>
          <span class="value">${data.guests} People</span>
        </div>
        ${
          data.specialRequest
            ? `
        <div class="row">
          <span class="label">Special Request</span>
          <span class="value">${data.specialRequest}</span>
        </div>`
            : ""
        }
      </div>

      <div style="text-align: center;">
        <a href="${data.bookingUrl}" class="button">View Booking</a>
      </div>
    `;
    return getTemplateWrapper(
      data.companyName,
      `Booking Confirmed: ${data.restaurantName}`,
      content,
    );
  },

  // --- Restaurant Templates ---

  restaurantWelcome: (data) => {
    const content = `
      <h2>Welcome Partner!</h2>
      <p>Hi <strong>${data.ownerName}</strong>,</p>
      <p>Thank you for registering <strong>${data.restaurantName}</strong> with ${data.companyName}.</p>
      <p>Your application is currently <strong>Pending Approval</strong>. Our team will verify your details and documents within 24-48 hours.</p>
      <p>We will notify you once your restaurant is live!</p>
    `;
    return getTemplateWrapper(
      data.companyName,
      "Registration Received",
      content,
    );
  },

  restaurantRegistrationRequest: (data) => {
    // Sent to Admin
    const content = `
      <h2>New Restaurant Registration</h2>
      <p>A new restaurant has completed onboarding and is waiting for approval.</p>
      
      <div class="info-box">
        <div class="row">
          <span class="label">Restaurant</span>
          <span class="value">${data.restaurantName}</span>
        </div>
        <div class="row">
          <span class="label">Owner</span>
          <span class="value">${data.ownerName}</span>
        </div>
        <div class="row">
          <span class="label">Contact</span>
          <span class="value">${data.phone}</span>
        </div>
        <div class="row">
          <span class="label">City</span>
          <span class="value">${data.city}</span>
        </div>
      </div>

      <div style="text-align: center;">
        <a href="${data.adminUrl}" class="button">Review Application</a>
      </div>
    `;
    return getTemplateWrapper(
      data.companyName,
      "Action Required: New Registration",
      content,
    );
  },

  restaurantApproved: (data) => {
    const content = `
      <h2>You are Live! 🎉</h2>
      <p>Congratulations <strong>${data.restaurantName}</strong>!</p>
      <p>Your restaurant has been approved and is now live on ${data.companyName}. You can now start accepting orders and bookings.</p>
      <div style="text-align: center;">
        <a href="${data.dashboardUrl}" class="button">Go to Dashboard</a>
      </div>
    `;
    return getTemplateWrapper(
      data.companyName,
      "Registration Approved",
      content,
    );
  },

  // --- Withdrawal Templates ---

  withdrawalRequestAdmin: (data) => {
    // Sent to Admin
    const content = `
      <h2>New Withdrawal Request</h2>
      <p><strong>${data.restaurantName}</strong> has requested a withdrawal.</p>
      
      <div class="info-box">
        <div class="row">
          <span class="label">Amount</span>
          <span class="value">₹${data.amount}</span>
        </div>
        <div class="row">
          <span class="label">Request ID</span>
          <span class="value">#${data.requestId}</span>
        </div>
        <div class="row">
          <span class="label">Requested At</span>
          <span class="value">${data.requestedAt}</span>
        </div>
      </div>

      <div style="text-align: center;">
        <a href="${data.adminUrl}" class="button">Process Request</a>
      </div>
    `;
    return getTemplateWrapper(
      data.companyName,
      "New Withdrawal Request",
      content,
    );
  },

  withdrawalStatus: (data) => {
    const isApproved =
      data.status === "Approved" || data.status === "Completed";
    const statusColor = isApproved ? "status-success" : "status-error";

    const content = `
      <h2>Withdrawal ${data.status}</h2>
      <p>Your withdrawal request has been <strong>${data.status}</strong>.</p>
      
      <div class="info-box">
        <div class="row">
          <span class="label">Status</span>
          <span class="value"><span class="status-badge ${statusColor}">${data.status}</span></span>
        </div>
        <div class="row">
          <span class="label">Amount</span>
          <span class="value">₹${data.amount}</span>
        </div>
        <div class="row">
          <span class="label">Request ID</span>
          <span class="value">#${data.requestId}</span>
        </div>
        ${
          data.rejectionReason
            ? `
        <div class="row">
          <span class="label">Reason</span>
          <span class="value">${data.rejectionReason}</span>
        </div>`
            : ""
        }
      </div>
    `;
    return getTemplateWrapper(
      data.companyName,
      `Withdrawal Update: ${data.status}`,
      content,
    );
  },

  // --- Promotion Templates ---

  promotionLaunched: (data) => {
    const content = `
      <h2>Promotion Live! 🚀</h2>
      <p>Your new promotion <strong>${data.title}</strong> is now live.</p>
      
      <div class="info-box">
        <div class="row">
          <span class="label">Discount</span>
          <span class="value">${data.discount}% OFF</span>
        </div>
        <div class="row">
          <span class="label">Duration</span>
          <span class="value">${data.startDate} - ${data.endDate}</span>
        </div>
      </div>
      <p>Check your dashboard to track performance.</p>
    `;
    return getTemplateWrapper(data.companyName, "Promotion Launched", content);
  },

  // --- Delivery Partner Templates ---

  deliveryPartnerWelcome: (data) => {
    const content = `
      <h2>Welcome to the Fleet! 🚴</h2>
      <p>Hi <strong>${data.name}</strong>,</p>
      <p>Your delivery partner account has been created successfully.</p>
      <p>Please log in to the App to complete your profile and start delivering.</p>
      <div class="info-box">
        <div class="row">
          <span class="label">Login ID</span>
          <span class="value">${data.phone}</span>
        </div>
      </div>
    `;
    return getTemplateWrapper(
      data.companyName,
      "Welcome Delivery Partner",
      content,
    );
  },

  deliveryDeposit: (data) => {
    const content = `
      <h2>Deposit Received</h2>
      <p>We have successfully received your security deposit.</p>
      
      <div class="info-box">
        <div class="row">
          <span class="label">Amount</span>
          <span class="value">₹${data.amount}</span>
        </div>
        <div class="row">
          <span class="label">Transaction ID</span>
          <span class="value">${data.transactionId}</span>
        </div>
        <div class="row">
          <span class="label">Status</span>
          <span class="value"><span class="status-badge status-success">Success</span></span>
        </div>
      </div>
    `;
    return getTemplateWrapper(
      data.companyName,
      "Deposit Confirmation",
      content,
    );
  },

  // --- Menu / Item Templates ---

  menuItemApproved: (data) => {
    const content = `
      <h2>Item Approved ✅</h2>
      <p>Your new menu item <strong>${data.itemName}</strong> has been approved by the admin.</p>
      <p>It is now visible to customers on your restaurant page.</p>
    `;
    return getTemplateWrapper(data.companyName, "Menu Item Approved", content);
  },
};

const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    // Check if email is configured
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      console.warn('⚠️ Email service not configured. Set SMTP_* env variables.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      // Verify connection
      this.transporter.verify((error) => {
        if (error) {
          console.error('❌ Email service verification failed:', error);
        } else {
          console.log('✅ Email service ready');
        }
      });
    } catch (error) {
      console.error('❌ Failed to initialize email service:', error);
    }
  }

  /**
   * Send generic email
   */
  async sendEmail({ to, subject, html, text }) {
    if (!this.transporter) {
      console.warn('Email not sent - transporter not initialized');
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'Table Mint'}" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html
      });

      console.log('✅ Email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Email send failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Low stock alert email
   */
  async sendLowStockAlert(restaurant, lowStockItems) {
    const itemsList = lowStockItems.map(item => 
      `<li><strong>${item.name}</strong>: ${item.currentStock} ${item.unit} (reorder at ${item.reorderPoint})</li>`
    ).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f97316; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 20px; border: 1px solid #e5e7eb; }
          .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 16px 0; }
          .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Low Stock Alert</h1>
          </div>
          <div class="content">
            <p>Hello ${restaurant.name},</p>
            <div class="alert">
              <strong>Urgent:</strong> The following items are running low and need reordering:
            </div>
            <ul>${itemsList}</ul>
            <p>Please place purchase orders to avoid stock-outs.</p>
            <p><a href="${process.env.FRONTEND_URL}/dashboard/inventory" style="background: #f97316; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Inventory</a></p>
          </div>
          <div class="footer">
            <p>Table Mint POS System | <a href="${process.env.FRONTEND_URL}">Dashboard</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: restaurant.email,
      subject: `⚠️ Low Stock Alert - ${lowStockItems.length} Items Need Reordering`,
      html,
      text: `Low stock alert for ${restaurant.name}. Items: ${lowStockItems.map(i => i.name).join(', ')}`
    });
  }

  /**
   * Subscription expiry reminder
   */
  async sendSubscriptionExpiryReminder(restaurant, daysLeft) {
    const urgency = daysLeft <= 3 ? 'URGENT' : 'REMINDER';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #fff; padding: 20px; border: 1px solid #e5e7eb; }
          .warning { background: #fee2e2; border-left: 4px solid #dc2626; padding: 12px; margin: 16px 0; }
          .cta { background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 16px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 ${urgency}: Subscription Expiring Soon</h1>
          </div>
          <div class="content">
            <p>Hi ${restaurant.name},</p>
            <div class="warning">
              <strong>Your subscription expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}!</strong>
            </div>
            <p>To avoid any interruption to your POS services, please renew your subscription now.</p>
            <a href="${process.env.FRONTEND_URL}/dashboard/subscriptions" class="cta">Renew Subscription</a>
            <p>After expiry, you will have limited access to the dashboard.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: restaurant.email,
      subject: `${urgency}: Your Table Mint subscription expires in ${daysLeft} days`,
      html,
      text: `Your subscription expires in ${daysLeft} days. Please renew at ${process.env.FRONTEND_URL}/dashboard/subscriptions`
    });
  }

  /**
   * Order receipt email
   */
  async sendOrderReceipt(customer, order, bill) {
    const itemsList = order.items.map(item => 
      `<tr>
        <td>${item.quantity}x ${item.name}</td>
        <td style="text-align: right;">₹${item.itemTotal.toFixed(2)}</td>
      </tr>`
    ).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 20px; text-align: center; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          .total { font-weight: bold; font-size: 18px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🍽️ Order Receipt</h1>
            <p>Table ${order.tableNumber} | Bill #${bill.billNumber}</p>
          </div>
          <div style="padding: 20px;">
            <p>Thank you for dining with us${customer ? `, ${customer.name}` : ''}!</p>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th style="text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemsList}
                <tr class="total">
                  <td>Total</td>
                  <td style="text-align: right;">₹${bill.grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <p>Payment Method: ${bill.paymentMode}</p>
            <p style="color: #6b7280; font-size: 12px;">Visit us again soon!</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: customer?.email || order.customerEmail,
      subject: `Receipt for Table ${order.tableNumber} - Bill #${bill.billNumber}`,
      html,
      text: `Thank you for dining with us! Total: ₹${bill.grandTotal}`
    });
  }
}

module.exports = new EmailService();

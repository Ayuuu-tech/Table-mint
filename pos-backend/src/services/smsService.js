const twilio = require('twilio');

class SMSService {
  constructor() {
    this.client = null;
    this.initClient();
  }

  initClient() {
    // Check if credentials exist and are valid format (Twilio SID starts with AC)
    if (!process.env.TWILIO_ACCOUNT_SID || 
        !process.env.TWILIO_ACCOUNT_SID.startsWith('AC') || 
        !process.env.TWILIO_AUTH_TOKEN) {
      console.warn('⚠️ SMS service skipped: Invalid or missing TWILIO credentials.');
      return;
    }

    try {
      this.client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      console.log('✅ SMS service ready');
    } catch (error) {
      console.error('❌ Failed to initialize SMS service:', error);
    }
  }

  /**
   * Send SMS
   */
  async sendSMS(to, message) {
    if (!this.client) {
      console.warn('SMS not sent - client not initialized');
      return { success: false, error: 'SMS service not configured' };
    }

    // Format phone number (ensure it starts with +)
    const formattedPhone = to.startsWith('+') ? to : `+91${to}`;

    try {
      const result = await this.client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: formattedPhone
      });

      console.log('✅ SMS sent:', result.sid);
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('❌ SMS send failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send OTP
   */
  async sendOTP(phone, otp) {
    const message = `Your Table Mint verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`;
    return this.sendSMS(phone, message);
  }

  /**
   * Send order confirmation
   */
  async sendOrderConfirmation(phone, tableNumber, total) {
    const message = `Your order for Table ${tableNumber} has been confirmed. Total: ₹${total}. Thank you for dining with us!`;
    return this.sendSMS(phone, message);
  }

  /**
   * Send receipt via SMS
   */
  async sendReceipt(phone, billNumber, total) {
    const message = `Receipt from Table Mint\nBill #${billNumber}\nTotal: ₹${total}\nThank you for visiting!`;
    return this.sendSMS(phone, message);
  }

  /**
   * Send low stock alert
   */
  async sendLowStockAlert(phone, itemCount) {
    const message = `[Table Mint Alert] ${itemCount} items are low in stock. Please check your inventory dashboard.`;
    return this.sendSMS(phone, message);
  }

  /**
   * Send subscription expiry reminder
   */
  async sendSubscriptionReminder(phone, daysLeft) {
    const message = `[Table Mint] Your subscription expires in ${daysLeft} days. Renew now to avoid service interruption.`;
    return this.sendSMS(phone, message);
  }
}

module.exports = new SMSService();

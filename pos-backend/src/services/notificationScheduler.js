const cron = require('node-cron');
const Restaurant = require('../models/Restaurant');
const Ingredient = require('../models/Ingredient');
const Subscription = require('../models/Subscription');
const { sendNotification } = require('../controllers/notificationController');
const emailService = require('./emailService');
const smsService = require('./smsService');

class NotificationScheduler {
  constructor() {
    this.jobs = [];
  }

  start() {
    console.log('🕐 Starting notification scheduler...');

    // Check for low stock - every hour
    this.jobs.push(
      cron.schedule('0 * * * *', async () => {
        console.log('[Cron] Checking for low stock items...');
        await this.checkLowStock();
      })
    );

    // Check subscription expiry - once daily at 9 AM
    this.jobs.push(
      cron.schedule('0 9 * * *', async () => {
        console.log('[Cron] Checking subscription expiry...');
        await this.checkSubscriptionExpiry();
      })
    );

    console.log('✅ Notification scheduler started');
  }

  stop() {
    this.jobs.forEach(job => job.stop());
    console.log('Notification scheduler stopped');
  }

  /**
   * Check for low stock items and send alerts
   */
  async checkLowStock() {
    try {
      const restaurants = await Restaurant.find({ isActive: true }).select('_id name email phone');

      for (const restaurant of restaurants) {
        const lowStockItems = await Ingredient.find({
          restaurantId: restaurant._id,
          lowStock: true
        }).select('name currentStock reorderPoint unit');

        if (lowStockItems.length > 0) {
          console.log(`⚠️ Low stock alert for ${restaurant.name}: ${lowStockItems.length} items`);

          // Create notification
          await sendNotification(
            restaurant._id,
            {
              type: 'LOW_STOCK',
              priority: 'HIGH',
              title: 'Low Stock Alert',
              message: `${lowStockItems.length} items are running low and need reordering`,
              data: {
                items: lowStockItems.map(i => ({ name: i.name, stock: i.currentStock, unit: i.unit })),
                count: lowStockItems.length
              },
              sentVia: ['IN_APP', 'EMAIL']
            },
            // Email data
            {
              to: restaurant.email,
              subject: `⚠️ Low Stock Alert - ${lowStockItems.length} Items`,
              html: await emailService.sendLowStockAlert(restaurant, lowStockItems)
            },
            // SMS data (optional - only if phone exists)
            restaurant.phone ? {
              phone: restaurant.phone,
              message: `[Table Mint] ${lowStockItems.length} items are low in stock. Check your inventory dashboard.`
            } : null
          );
        }
      }
    } catch (error) {
      console.error('Error in checkLowStock:', error);
    }
  }

  /**
   * Check for subscription expiry and send reminders
   */
  async checkSubscriptionExpiry() {
    try {
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Find subscriptions expiring in 7, 3, or 1 day
      const subscriptions = await Subscription.find({
        status: 'ACTIVE',
        endDate: {
          $gte: now,
          $lte: sevenDaysFromNow
        }
      }).populate('restaurantId', 'name email phone');

      for (const subscription of subscriptions) {
        const restaurant = subscription.restaurantId;
        if (!restaurant) continue;

        const daysLeft = Math.ceil((new Date(subscription.endDate) - now) / (1000 * 60 * 60 * 24));

        // Only send reminder on specific days: 7, 3, 1
        if (![7, 3, 1].includes(daysLeft)) continue;

        const priority = daysLeft <= 1 ? 'URGENT' : daysLeft <= 3 ? 'HIGH' : 'MEDIUM';

        console.log(`🔔 Subscription expiry reminder for ${restaurant.name}: ${daysLeft} days left`);

        // Create notification
        await sendNotification(
          restaurant._id,
          {
            type: 'SUBSCRIPTION_EXPIRY',
            priority,
            title: daysLeft === 1 ? 'Subscription Expires Tomorrow!' : `Subscription Expires in ${daysLeft} Days`,
            message: `Your subscription will expire ${daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`}. Renew now to avoid service interruption.`,
            data: {
              endDate: subscription.endDate,
              daysLeft,
              plan: subscription.planType
            },
            sentVia: ['IN_APP', 'EMAIL', 'SMS']
          },
          // Email data
          {
            to: restaurant.email,
            ...emailService.sendSubscriptionExpiryReminder(restaurant, daysLeft)
          },
          // SMS data
          restaurant.phone ? {
            phone: restaurant.phone,
            ...smsService.sendSubscriptionReminder(restaurant.phone, daysLeft)
          } : null
        );
      }
    } catch (error) {
      console.error('Error in checkSubscriptionExpiry:', error);
    }
  }
}

module.exports = new NotificationScheduler();

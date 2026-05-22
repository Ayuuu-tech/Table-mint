/**
 * Redis Caching Service
 * Reduces database load with intelligent caching and TTL management
 */

const redis = require('redis');
const logger = require('./logger');

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.defaultTTL = 3600; // 1 hour
  }

  /**
   * Initialize Redis connection
   */
  async connect(options = {}) {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      this.client = redis.createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 500)
        },
        ...options
      });

      this.client.on('error', (err) => {
        logger.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('✓ Redis connected');
        this.isConnected = true;
      });

      await this.client.connect();
      this.isConnected = true;
    } catch (error) {
      logger.error('Redis connection failed:', error);
      this.isConnected = false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  /**
   * Set cache value with TTL
   */
  async set(key, value, ttl = this.defaultTTL) {
    if (!this.isConnected) return;

    try {
      const serialized = JSON.stringify(value);
      await this.client.setEx(key, ttl, serialized);
      return true;
    } catch (error) {
      logger.error(`Cache SET error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get cache value
   */
  async get(key) {
    if (!this.isConnected) return null;

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Cache GET error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Delete cache key
   */
  async delete(key) {
    if (!this.isConnected) return;

    try {
      await this.client.del(key);
    } catch (error) {
      logger.error(`Cache DELETE error for key ${key}:`, error);
    }
  }

  /**
   * Delete multiple keys
   */
  async deleteMany(pattern) {
    if (!this.isConnected) return;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      logger.error(`Cache DELETEMANY error for pattern ${pattern}:`, error);
    }
  }

  /**
   * Clear all cache
   */
  async clear() {
    if (!this.isConnected) return;

    try {
      await this.client.flushDb();
    } catch (error) {
      logger.error('Cache CLEAR error:', error);
    }
  }

  /**
   * Get or fetch pattern
   * If cache exists, return it. Otherwise, fetch, cache, and return.
   */
  async getOrFetch(key, fetchFn, ttl = this.defaultTTL) {
    // Try cache first
    const cached = await this.get(key);
    if (cached) {
      return cached;
    }

    // Fetch if not cached
    const data = await fetchFn();

    // Cache for future
    await this.set(key, data, ttl);

    return data;
  }

  /**
   * Cache key generators
   */
  static keys = {
    // Analytics
    dailyRevenue: (restaurantId, date) => `analytics:daily-revenue:${restaurantId}:${date}`,
    monthlyRevenue: (restaurantId, month) => `analytics:monthly-revenue:${restaurantId}:${month}`,
    topItems: (restaurantId, days) => `analytics:top-items:${restaurantId}:${days}`,
    dashboardMetrics: (restaurantId) => `analytics:dashboard:${restaurantId}`,

    // Lists
    orders: (restaurantId, page) => `list:orders:${restaurantId}:${page}`,
    bills: (restaurantId, page) => `list:bills:${restaurantId}:${page}`,
    reservations: (restaurantId, page) => `list:reservations:${restaurantId}:${page}`,
    menuItems: (restaurantId, page) => `list:menu:${restaurantId}:${page}`,
    tables: (restaurantId) => `list:tables:${restaurantId}`,
    customers: (restaurantId, page) => `list:customers:${restaurantId}:${page}`,

    // Details
    restaurant: (id) => `detail:restaurant:${id}`,
    user: (id) => `detail:user:${id}`,
    order: (id) => `detail:order:${id}`,
    menuItem: (id) => `detail:menu-item:${id}`,

    // Validation
    email: (email) => `validate:email:${email}`,
    tableExists: (tableId) => `validate:table:${tableId}`,

    // Session
    session: (userId) => `session:${userId}`,
    token: (token) => `token:${token}`
  };

  /**
   * Pattern-based invalidation
   */
  async invalidateRestaurantCache(restaurantId) {
    await this.deleteMany(`*:${restaurantId}:*`);
    await this.deleteMany(`*:${restaurantId}`);
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.isConnected) return null;

    try {
      const info = await this.client.info('stats');
      const keys = await this.client.keys('*');

      return {
        connected: true,
        totalKeys: keys.length,
        memoryUsage: info ? info.split('used_memory_human:')[1]?.split('\r')[0] : 'N/A',
        info
      };
    } catch (error) {
      logger.error('Cache stats error:', error);
      return null;
    }
  }
}

// Singleton instance
const cacheService = new CacheService();

/**
 * Middleware: Cache GET requests
 */
const cacheMiddleware = (ttl = 300) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `http:${req.originalUrl || req.url}`;

    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        res.set('X-Cache', 'HIT');
        return res.json(cached);
      }
    } catch (error) {
      logger.warn('Cache middleware error:', error);
    }

    // Monkey-patch res.json to cache response
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      if (res.statusCode === 200) {
        cacheService.set(cacheKey, data, ttl).catch((err) =>
          logger.warn('Failed to cache response:', err)
        );
      }
      res.set('X-Cache', 'MISS');
      return originalJson(data);
    };

    next();
  };
};

/**
 * Cache invalidation middleware
 * Clears relevant caches on mutation endpoints
 */
const invalidateCacheMiddleware = (cachePatterns = []) => {
  return async (req, res, next) => {
    // Only invalidate on mutations
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return next();
    }

    // Monkey-patch res.json to invalidate cache after successful mutation
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      if (res.statusCode < 400) {
        // Success response, invalidate caches
        cachePatterns.forEach((pattern) => {
          cacheService.deleteMany(pattern).catch((err) =>
            logger.warn(`Failed to invalidate cache pattern ${pattern}:`, err)
          );
        });
      }
      return originalJson(data);
    };

    next();
  };
};

/**
 * Database query wrapper with caching
 */
const withCache = (cacheKey, ttl = 3600) => {
  return async (queryFn) => {
    return cacheService.getOrFetch(cacheKey, queryFn, ttl);
  };
};

module.exports = {
  cacheService,
  cacheMiddleware,
  invalidateCacheMiddleware,
  withCache
};

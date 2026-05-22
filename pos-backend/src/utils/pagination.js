/**
 * Pagination Helper
 * Provides pagination utilities for list endpoints
 */

/**
 * Calculate pagination values
 */
const getPaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20)); // Max 100, default 20
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Build paginated response
 */
const buildPaginatedResponse = (data, total, page, limit) => {
  const totalPages = Math.ceil(total / limit);

  return {
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      pages: totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null
    }
  };
};

/**
 * Pagination Middleware
 * Adds pagination helpers to request object
 */
const paginationMiddleware = (req, res, next) => {
  const { page, limit, skip } = getPaginationParams(req.query);
  
  req.pagination = {
    page,
    limit,
    skip,
    buildResponse: (data, total) => buildPaginatedResponse(data, total, page, limit)
  };

  next();
};

/**
 * Example usage in controller:
 * 
 * const items = await MenuItem.find({ restaurantId })
 *   .limit(req.pagination.limit)
 *   .skip(req.pagination.skip)
 *   .lean();
 *
 * const total = await MenuItem.countDocuments({ restaurantId });
 *
 * res.json(req.pagination.buildResponse(items, total));
 */

module.exports = {
  getPaginationParams,
  buildPaginatedResponse,
  paginationMiddleware
};

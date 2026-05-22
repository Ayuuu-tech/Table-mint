/**
 * Timezone Handling Utilities
 * Properly manages dates and times with timezone awareness
 * Prevents issues with JavaScript Date and stores UTC in database
 */

/**
 * Converts any date to UTC ISO string for storage
 * @param {Date|string|number} date - Date to convert
 * @param {string} timezone - Timezone (IANA format: 'Asia/Kolkata')
 * @returns {string} - UTC ISO string
 */
function toUTC(date, timezone = 'UTC') {
  if (!date) return null;

  const d = new Date(date);

  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }

  return d.toISOString();
}

/**
 * Converts UTC date to local timezone
 * @param {Date|string} utcDate - Date in UTC
 * @param {string} timezone - Target timezone (IANA format)
 * @returns {object} - {date: Date, iso: string, formatted: string}
 */
function fromUTC(utcDate, timezone = 'UTC') {
  if (!utcDate) return null;

  const d = new Date(utcDate);

  if (isNaN(d.getTime())) {
    throw new Error(`Invalid UTC date: ${utcDate}`);
  }

  // Get local representation
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(d);
  const values = {};
  parts.forEach(({ type, value }) => {
    values[type] = value;
  });

  const localDate = new Date(
    values.year,
    parseInt(values.month) - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );

  return {
    date: d,
    iso: d.toISOString(),
    local: localDate,
    formatted: formatter.format(d),
    timezone
  };
}

/**
 * Gets current time in specified timezone
 * @param {string} timezone - IANA timezone format
 * @returns {object} - Current time information
 */
function now(timezone = 'UTC') {
  const utc = new Date();
  return {
    utc,
    local: fromUTC(utc, timezone),
    timezone
  };
}

/**
 * Formats a date for display
 * @param {Date|string} date - Date to format
 * @param {string} timezone - Target timezone
 * @param {string} format - Format template (YYYY-MM-DD HH:mm:ss)
 * @returns {string} - Formatted date
 */
function formatDate(date, timezone = 'UTC', format = 'YYYY-MM-DD HH:mm:ss') {
  const converted = fromUTC(date, timezone);
  if (!converted) return '';

  const local = converted.local;
  const pad = (n) => String(n).padStart(2, '0');

  let result = format;
  result = result.replace('YYYY', local.getFullYear());
  result = result.replace('MM', pad(local.getMonth() + 1));
  result = result.replace('DD', pad(local.getDate()));
  result = result.replace('HH', pad(local.getHours()));
  result = result.replace('mm', pad(local.getMinutes()));
  result = result.replace('ss', pad(local.getSeconds()));

  return result;
}

/**
 * Parses a date string in a specific timezone
 * @param {string} dateString - Date string (YYYY-MM-DD HH:mm:ss)
 * @param {string} timezone - Timezone the string is in
 * @returns {Date} - UTC Date object
 */
function parseDate(dateString, timezone = 'UTC') {
  // Parse the date string as if it's in the given timezone
  const [datePart, timePart] = dateString.split(' ');
  const [year, month, day] = datePart.split('-');
  const [hours = 0, minutes = 0, seconds = 0] = (timePart || '00:00:00').split(':');

  // Create date assuming the input is in the target timezone
  const date = new Date(year, month - 1, day, hours, minutes, seconds);

  // Note: This is simplified. For accurate conversion, use a library like date-fns or moment-timezone
  return date;
}

/**
 * Gets timezone offset from UTC in hours
 * @param {string} timezone - IANA timezone
 * @param {Date} date - Reference date
 * @returns {number} - Offset in hours (can be decimal)
 */
function getTimezoneOffset(timezone, date = new Date()) {
  const utcDate = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzDate = date.toLocaleString('en-US', { timeZone: timezone });

  const utcTime = new Date(utcDate).getTime();
  const tzTime = new Date(tzDate).getTime();

  return (utcTime - tzTime) / (1000 * 60 * 60);
}

/**
 * Gets start of day in UTC (useful for date queries)
 * @param {Date|string} date - Reference date
 * @param {string} timezone - Timezone
 * @returns {Date} - Start of day in UTC
 */
function startOfDay(date, timezone = 'UTC') {
  const d = new Date(date);
  const local = fromUTC(d, timezone);

  // Create start of day in the timezone
  const startLocal = new Date(
    local.local.getFullYear(),
    local.local.getMonth(),
    local.local.getDate(),
    0, 0, 0, 0
  );

  // Adjust back to UTC
  const offset = getTimezoneOffset(timezone, d);
  return new Date(startLocal.getTime() - offset * 60 * 60 * 1000);
}

/**
 * Gets end of day in UTC
 * @param {Date|string} date - Reference date
 * @param {string} timezone - Timezone
 * @returns {Date} - End of day in UTC
 */
function endOfDay(date, timezone = 'UTC') {
  const d = new Date(date);
  const local = fromUTC(d, timezone);

  // Create end of day in the timezone
  const endLocal = new Date(
    local.local.getFullYear(),
    local.local.getMonth(),
    local.local.getDate(),
    23, 59, 59, 999
  );

  // Adjust back to UTC
  const offset = getTimezoneOffset(timezone, d);
  return new Date(endLocal.getTime() - offset * 60 * 60 * 1000);
}

/**
 * Gets timezone names (common timezones used in restaurants)
 */
const TIMEZONES = {
  'Asia/Kolkata': 'India Standard Time (IST)',
  'Asia/Dubai': 'Gulf Standard Time (GST)',
  'Asia/Bangkok': 'Indochina Time (ICT)',
  'Asia/Manila': 'Philippine Time (PHT)',
  'Asia/Singapore': 'Singapore Standard Time (SGT)',
  'Europe/London': 'Greenwich Mean Time (GMT)',
  'Europe/Paris': 'Central European Time (CET)',
  'America/New_York': 'Eastern Standard Time (EST)',
  'America/Los_Angeles': 'Pacific Standard Time (PST)',
  'Australia/Sydney': 'Australian Eastern Time (AET)',
  'UTC': 'Coordinated Universal Time (UTC)'
};

/**
 * Gets list of valid timezones
 * @returns {object} - IANA timezone -> Display name
 */
function getValidTimezones() {
  return { ...TIMEZONES };
}

/**
 * Validates timezone string
 * @param {string} timezone - Timezone to validate
 * @returns {boolean} - True if valid IANA timezone
 */
function isValidTimezone(timezone) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Middleware to add timezone info to requests
 * @returns {function} - Express middleware
 */
function timezoneMiddleware() {
  return (req, res, next) => {
    // Get timezone from header, query, or default to UTC
    const timezone = req.headers['x-timezone'] || req.query.timezone || 'UTC';

    if (!isValidTimezone(timezone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid timezone',
        validTimezones: Object.keys(TIMEZONES)
      });
    }

    req.timezone = timezone;
    req.now = now(timezone);
    req.formatDate = (date, format) => formatDate(date, timezone, format);

    next();
  };
}

/**
 * Schema helper to add timezone-aware date fields
 * Usage: dateField(schema, 'createdAt')
 * @param {object} schema - Mongoose schema
 * @param {string} fieldName - Field name (createdAt, updatedAt, etc.)
 */
function addDateFieldGetter(schema, fieldName) {
  schema.methods[`${fieldName}LocalTime`] = function(timezone = 'UTC') {
    return formatDate(this[fieldName], timezone);
  };

  schema.virtual(`${fieldName}ISO`).get(function() {
    return this[fieldName] ? this[fieldName].toISOString() : null;
  });
}

/**
 * Query helper for date range queries
 * @param {object} query - Mongoose query object
 * @param {string} dateField - Field name to query
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {string} timezone - Timezone
 * @returns {object} - Updated query
 */
function dateRangeQuery(dateField, startDate, endDate, timezone = 'UTC') {
  const start = startOfDay(startDate, timezone);
  const end = endOfDay(endDate, timezone);

  return {
    [dateField]: {
      $gte: start,
      $lte: end
    }
  };
}

module.exports = {
  toUTC,
  fromUTC,
  now,
  formatDate,
  parseDate,
  getTimezoneOffset,
  startOfDay,
  endOfDay,
  getValidTimezones,
  isValidTimezone,
  timezoneMiddleware,
  addDateFieldGetter,
  dateRangeQuery,
  TIMEZONES
};

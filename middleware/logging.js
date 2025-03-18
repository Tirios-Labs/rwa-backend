/**
 * Logging middleware for the Identity Bridge API
 */
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'identity-bridge-api' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          info => `${info.timestamp} ${info.level}: ${info.message}`
        )
      )
    })
  ]
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
  
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    maxsize: 5242880, // 5MB
    maxFiles: 10
  }));
}

/**
 * Middleware to add request ID and logging
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requestLogger = (req, res, next) => {
  // Generate a unique request ID
  const requestId = uuidv4();
  req.id = requestId;
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);
  
  // Log request details
  const startTime = Date.now();
  const logInfo = {
    requestId,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.user ? req.user.id : null
  };
  
  logger.info(`Incoming request: ${req.method} ${req.originalUrl}`, logInfo);
  
  // Capture response data
  const originalEnd = res.end;
  res.end = function (chunk, encoding) {
    // Calculate request duration
    const duration = Date.now() - startTime;
    
    // Restore original end function
    res.end = originalEnd;
    
    // End the response
    res.end(chunk, encoding);
    
    // Log response details
    const responseLog = {
      ...logInfo,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    };
    
    if (res.statusCode >= 400) {
      logger.warn(`Request completed with error: ${res.statusCode}`, responseLog);
    } else {
      logger.info(`Request completed: ${res.statusCode}`, responseLog);
    }
    
    // Log to database if enabled
    logToDatabase(req, res, duration).catch(err => {
      logger.error('Error logging to database', { error: err.message, requestId });
    });
  };
  
  next();
};

/**
 * Log request to database
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Number} duration - Request duration in ms
 */
const logToDatabase = async (req, res, duration) => {
  // Skip logging to database if disabled
  if (process.env.DB_LOGGING !== 'true') {
    return;
  }
  
  try {
    const db = req.app.get('db');
    if (!db) return;
    
    // Prepare metadata
    const metadata = {
      headers: req.headers,
      query: req.query,
      duration,
      userAgent: req.headers['user-agent'],
      // Don't log sensitive data like passwords, tokens, etc.
      body: sanitizeRequestBody(req.body)
    };
    
    // Insert log entry
    const query = `
      INSERT INTO request_logs (
        request_id, user_id, method, path, status_code,
        ip_address, user_agent, metadata, duration_ms
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;
    
    await db.query(query, [
      req.id,
      req.user ? req.user.id : null,
      req.method,
      req.originalUrl || req.url,
      res.statusCode,
      req.ip,
      req.headers['user-agent'],
      JSON.stringify(metadata),
      duration
    ]);
  } catch (error) {
    logger.error('Failed to log request to database', { error: error.message });
  }
};

/**
 * Sanitize request body for logging
 * @param {Object} body - Request body
 * @returns {Object} - Sanitized body
 */
const sanitizeRequestBody = (body) => {
  if (!body) return null;
  
  // Create a shallow copy of the body
  const sanitized = { ...body };
  
  // List of sensitive fields to redact
  const sensitiveFields = [
    'password', 'secret', 'token', 'apiKey', 'api_key', 'key',
    'signature', 'private', 'credential', 'auth', 'authorization'
  ];
  
  // Redact sensitive fields
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
};

/**
 * Access logging middleware for detailed audit logs
 * @param {Object} options - Logging options
 * @returns {Function} - Express middleware
 */
const auditLogger = (options = {}) => {
  const {
    level = 'info',
    includeBody = false,
    actions = {}
  } = options;
  
  return (req, res, next) => {
    // Skip audit logging based on path or method
    if (
      req.path.startsWith('/health') ||
      req.path.startsWith('/metrics') ||
      req.method === 'OPTIONS'
    ) {
      return next();
    }
    
    // Determine action type based on path and method
    let actionType = 'ACCESS';
    for (const [pattern, action] of Object.entries(actions)) {
      if (new RegExp(pattern).test(req.path)) {
        actionType = action;
        break;
      }
    }
    
    // Log audit event
    const auditLog = {
      requestId: req.id,
      userId: req.user ? req.user.id : null,
      action: actionType,
      method: req.method,
      path: req.originalUrl || req.url,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    };
    
    // Include body if enabled and not a GET request
    if (includeBody && req.method !== 'GET') {
      auditLog.body = sanitizeRequestBody(req.body);
    }
    
    logger.log(level, `Audit: ${actionType} - ${req.method} ${req.path}`, auditLog);
    
    next();
  };
};

/**
 * Error logging middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorLogger = (err, req, res, next) => {
  // Log the error
  const errorLog = {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip,
    userId: req.user ? req.user.id : null,
    errorName: err.name,
    errorMessage: err.message,
    errorStack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    statusCode: err.statusCode || 500
  };
  
  logger.error(`Error in request: ${err.message}`, errorLog);
  
  // Continue to the error handler
  next(err);
};

// Export the logger for use in other files
module.exports = {
  logger,
  requestLogger,
  auditLogger,
  errorLogger
};
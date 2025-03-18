/**
 * Global error handling middleware
 * Standardizes error responses across the API
 */

// Custom API error class
class APIError extends Error {
    constructor(message, statusCode = 500, details = null) {
      super(message);
      this.statusCode = statusCode;
      this.details = details;
      this.name = this.constructor.name;
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  // Error types
  const NotFoundError = (message, details) => 
    new APIError(message || 'Resource not found', 404, details);
  
  const ValidationError = (message, details) => 
    new APIError(message || 'Validation failed', 400, details);
  
  const AuthorizationError = (message, details) => 
    new APIError(message || 'Unauthorized', 401, details);
  
  const ForbiddenError = (message, details) => 
    new APIError(message || 'Forbidden', 403, details);
  
  const ConflictError = (message, details) => 
    new APIError(message || 'Resource conflict', 409, details);
  
  const RateLimitError = (message, details) => 
    new APIError(message || 'Rate limit exceeded', 429, details);
  
  // Handle errors globally with consistent format
  const errorHandler = (err, req, res, next) => {
    // Log the error
    console.error('API Error:', err);
    
    // Default values
    let statusCode = 500;
    let errorMessage = 'Internal server error';
    let errorDetails = null;
    let errorType = 'SERVER_ERROR';
    
    // Handle known error types
    if (err instanceof APIError) {
      statusCode = err.statusCode;
      errorMessage = err.message;
      errorDetails = err.details;
      
      // Map status code to error type
      switch (statusCode) {
        case 400: errorType = 'VALIDATION_ERROR'; break;
        case 401: errorType = 'UNAUTHORIZED'; break;
        case 403: errorType = 'FORBIDDEN'; break;
        case 404: errorType = 'NOT_FOUND'; break;
        case 409: errorType = 'CONFLICT'; break;
        case 429: errorType = 'RATE_LIMIT'; break;
        default: errorType = 'SERVER_ERROR';
      }
    } else if (err.type === 'entity.parse.failed') {
      // Handle JSON parse errors
      statusCode = 400;
      errorMessage = 'Invalid JSON payload';
      errorType = 'VALIDATION_ERROR';
    }
    
    // Add request ID if available
    const requestId = req.headers['x-request-id'] || req.id;
    
    // Prepare the response
    const errorResponse = {
      success: false,
      error: {
        type: errorType,
        message: errorMessage,
        status: statusCode
      }
    };
    
    // Add details and requestId if available
    if (errorDetails) {
      errorResponse.error.details = errorDetails;
    }
    
    if (requestId) {
      errorResponse.error.requestId = requestId;
    }
    
    // Add stack trace in development mode
    if (process.env.NODE_ENV === 'development') {
      errorResponse.error.stack = err.stack;
    }
    
    // Log error to database if severe (500 errors)
    if (statusCode === 500) {
      try {
        const db = req.app.get('db');
        if (db) {
          const logQuery = `
            INSERT INTO error_logs (
              request_id, error_type, error_message, error_stack, request_method,
              request_path, request_ip, request_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `;
          
          db.query(logQuery, [
            requestId,
            errorType,
            errorMessage,
            err.stack,
            req.method,
            req.path,
            req.ip,
            req.user?.id || null
          ]).catch(logError => {
            console.error('Error logging to database:', logError);
          });
        }
      } catch (logError) {
        console.error('Failed to log error to database:', logError);
      }
    }
    
    // Send error response
    res.status(statusCode).json(errorResponse);
  };
  
  // Catch 404 errors
  const notFoundHandler = (req, res, next) => {
    next(NotFoundError(`Route not found: ${req.method} ${req.path}`));
  };
  
  module.exports = {
    errorHandler,
    notFoundHandler,
    APIError,
    NotFoundError,
    ValidationError,
    AuthorizationError,
    ForbiddenError,
    ConflictError,
    RateLimitError
  };
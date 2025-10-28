/**
 * Shared error handling utility for Lambda functions
 * Provides consistent error responses with action fields and standardized error formats
 */

/**
 * Standard error response structure
 * @param {number} statusCode - HTTP status code
 * @param {string} error - Error message
 * @param {string} action - Action that was being performed
 * @param {Object} details - Additional error details
 * @param {string} requestId - Request ID for tracking
 * @returns {Object} Standardized error response
 */
const createErrorResponse = (statusCode, error, action, details = null, requestId = null) => {
    const response = {
        statusCode,
        body: JSON.stringify({
            error,
            action: action || 'unknown',
            message: error,
            timestamp: new Date().toISOString(),
            ...(requestId && { requestId }),
            ...(details && { details })
        })
    };

    // Log error for monitoring
    console.error('Error Response:', {
        statusCode,
        error,
        action: action || 'unknown',
        requestId,
        details
    });

    return response;
};

/**
 * Standard success response structure
 * @param {number} statusCode - HTTP status code
 * @param {Object} data - Response data
 * @param {string} action - Action that was performed
 * @param {string} requestId - Request ID for tracking
 * @returns {Object} Standardized success response
 */
const createSuccessResponse = (statusCode, data, action, requestId = null) => {
    const response = {
        statusCode,
        body: JSON.stringify({
            success: true,
            action,
            data,
            timestamp: new Date().toISOString(),
            ...(requestId && { requestId })
        })
    };

    return response;
};

/**
 * Extract action from event body or route
 * @param {Object} event - Lambda event object
 * @returns {string} Action being performed
 */
const extractAction = (event) => {
    // Try to get action from body first
    if (event.body) {
        try {
            const body = JSON.parse(event.body);
            if (body.action) {
                return body.action;
            }
        } catch (error) {
            // Body parsing failed, continue to route check
        }
    }

    // Try to get action from route
    if (event.requestContext && event.requestContext.routeKey) {
        return event.requestContext.routeKey;
    }

    // Try to get action from query parameters
    if (event.queryStringParameters && event.queryStringParameters.action) {
        return event.queryStringParameters.action;
    }

    return 'unknown';
};

/**
 * Extract request ID for tracking
 * @param {Object} event - Lambda event object
 * @returns {string} Request ID
 */
const extractRequestId = (event) => {
    return event.requestContext?.requestId || 
           event.requestContext?.connectionId || 
           `req-${Date.now()}`;
};

/**
 * Handle common DynamoDB errors
 * @param {Error} error - DynamoDB error
 * @param {string} action - Action being performed
 * @param {Object} context - Additional context
 * @returns {Object} Standardized error response
 */
const handleDynamoDBError = (error, action, context = {}) => {
    const requestId = context.requestId || `req-${Date.now()}`;
    
    if (error.name === 'ConditionalCheckFailedException') {
        return createErrorResponse(409, 'Condition check failed', action, {
            operation: context.operation || 'unknown',
            resource: context.resource || 'unknown',
            condition: context.condition || 'unknown'
        }, requestId);
    }
    
    if (error.name === 'ResourceNotFoundException') {
        return createErrorResponse(404, 'Resource not found', action, {
            operation: context.operation || 'unknown',
            resource: context.resource || 'unknown',
            tableName: context.tableName || 'unknown'
        }, requestId);
    }
    
    if (error.name === 'ProvisionedThroughputExceededException') {
        return createErrorResponse(429, 'Rate limit exceeded', action, {
            operation: context.operation || 'unknown',
            resource: context.resource || 'unknown'
        }, requestId);
    }
    
    if (error.name === 'ValidationException') {
        return createErrorResponse(400, 'Validation error', action, {
            operation: context.operation || 'unknown',
            details: error.message
        }, requestId);
    }
    
    // Default DynamoDB error
    return createErrorResponse(500, 'Database operation failed', action, {
        operation: context.operation || 'unknown',
        resource: context.resource || 'unknown',
        errorType: error.name,
        errorMessage: error.message
    }, requestId);
};

/**
 * Handle common API Gateway errors
 * @param {Error} error - API Gateway error
 * @param {string} action - Action being performed
 * @param {Object} context - Additional context
 * @returns {Object} Standardized error response
 */
const handleApiGatewayError = (error, action, context = {}) => {
    const requestId = context.requestId || `req-${Date.now()}`;
    
    if (error.name === 'GoneException') {
        return createErrorResponse(410, 'Connection no longer exists', action, {
            operation: context.operation || 'unknown',
            connectionId: context.connectionId || 'unknown'
        }, requestId);
    }
    
    if (error.name === 'LimitExceededException') {
        return createErrorResponse(429, 'Rate limit exceeded', action, {
            operation: context.operation || 'unknown'
        }, requestId);
    }
    
    // Default API Gateway error
    return createErrorResponse(500, 'Message delivery failed', action, {
        operation: context.operation || 'unknown',
        errorType: error.name,
        errorMessage: error.message
    }, requestId);
};

/**
 * Handle validation errors
 * @param {Array} errors - Array of validation errors
 * @param {string} action - Action being performed
 * @param {Object} context - Additional context
 * @returns {Object} Standardized error response
 */
const handleValidationError = (errors, action, context = {}) => {
    const requestId = context.requestId || `req-${Date.now()}`;
    
    return createErrorResponse(400, 'Validation failed', action, {
        operation: context.operation || 'unknown',
        fieldErrors: errors,
        requiredFields: context.requiredFields || [],
        providedFields: context.providedFields || []
    }, requestId);
};

/**
 * Handle authentication errors
 * @param {Error} error - Authentication error
 * @param {string} action - Action being performed
 * @param {Object} context - Additional context
 * @returns {Object} Standardized error response
 */
const handleAuthError = (error, action, context = {}) => {
    const requestId = context.requestId || `req-${Date.now()}`;
    
    if (error.message === 'FIREBASE_TOKEN_MISSING') {
        return createErrorResponse(401, 'Authentication required. Firebase ID token missing.', action, {
            operation: context.operation || 'unknown',
            authType: 'firebase'
        }, requestId);
    }
    
    if (error.message === 'FIREBASE_TOKEN_INVALID') {
        return createErrorResponse(401, 'Invalid or expired Firebase ID token', action, {
            operation: context.operation || 'unknown',
            authType: 'firebase'
        }, requestId);
    }
    
    if (error.message === 'USER_NOT_FOUND') {
        return createErrorResponse(404, 'User not found', action, {
            operation: context.operation || 'unknown',
            userId: context.userId || 'unknown'
        }, requestId);
    }
    
    // Default auth error
    return createErrorResponse(401, 'Authentication failed', action, {
        operation: context.operation || 'unknown',
        errorMessage: error.message
    }, requestId);
};

/**
 * Generic error handler that categorizes errors and returns appropriate responses
 * @param {Error} error - The error to handle
 * @param {Object} event - Lambda event object
 * @param {Object} context - Additional context
 * @returns {Object} Standardized error response
 */
const handleError = (error, event, context = {}) => {
    const action = extractAction(event);
    const requestId = extractRequestId(event);
    
    // Add request ID to context
    context.requestId = requestId;
    
    console.error('Error in Lambda function:', {
        error: error.message,
        stack: error.stack,
        action,
        requestId,
        context
    });
    
    // Handle specific error types
    if (error.name && error.name.includes('DynamoDB')) {
        return handleDynamoDBError(error, action, context);
    }
    
    if (error.name && error.name.includes('ApiGateway')) {
        return handleApiGatewayError(error, action, context);
    }
    
    if (error.message && error.message.includes('FIREBASE_TOKEN')) {
        return handleAuthError(error, action, context);
    }
    
    if (error.message && error.message.includes('USER_NOT_FOUND')) {
        return handleAuthError(error, action, context);
    }
    
    // Handle validation errors (when errors array is passed)
    if (Array.isArray(error)) {
        return handleValidationError(error, action, context);
    }
    
    // Default error handling
    return createErrorResponse(500, 'Internal Server Error', action, {
        operation: context.operation || 'unknown',
        errorType: error.name || 'UnknownError',
        errorMessage: error.message || 'An unexpected error occurred'
    }, requestId);
};

/**
 * Wrapper function to add error handling to Lambda functions
 * @param {Function} handler - The Lambda handler function
 * @returns {Function} Wrapped handler with error handling
 */
const withErrorHandling = (handler) => {
    return async (event, context) => {
        try {
            return await handler(event, context);
        } catch (error) {
            return handleError(error, event, { operation: 'lambda_execution' });
        }
    };
};

module.exports = {
    createErrorResponse,
    createSuccessResponse,
    extractAction,
    extractRequestId,
    handleDynamoDBError,
    handleApiGatewayError,
    handleValidationError,
    handleAuthError,
    handleError,
    withErrorHandling
}; 
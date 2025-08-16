# Lambda Error Handling System

This document describes the comprehensive error handling system implemented across all Lambda functions in the MTJS project.

## Overview

The error handling system provides:

- **Consistent error responses** with standardized formats
- **Action field inclusion** in all error responses for better debugging
- **Request ID tracking** for monitoring and troubleshooting
- **Categorized error handling** for different types of errors (DynamoDB, API Gateway, validation, etc.)
- **Structured logging** for better observability

## Error Response Format

All error responses now follow this standardized format:

```json
{
  "statusCode": 400,
  "body": {
    "error": "Error message description",
    "action": "action_being_performed",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req-1234567890",
    "details": {
      "operation": "specific_operation",
      "resource": "affected_resource",
      "additional": "context_information"
    }
  }
}
```

## Success Response Format

Success responses also follow a standardized format:

```json
{
  "statusCode": 200,
  "body": {
    "success": true,
    "action": "action_performed",
    "data": { ... },
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req-1234567890"
  }
}
```

## Available Functions

### Core Error Handling

- `createErrorResponse(statusCode, error, action, details, requestId)` - Create standardized error responses
- `createSuccessResponse(statusCode, data, action, requestId)` - Create standardized success responses
- `extractAction(event)` - Extract action from Lambda event
- `extractRequestId(event)` - Extract or generate request ID for tracking
- `handleError(error, event, context)` - Generic error handler that categorizes errors

### Specialized Error Handlers

- `handleDynamoDBError(error, action, context)` - Handle DynamoDB-specific errors
- `handleApiGatewayError(error, action, context)` - Handle API Gateway-specific errors
- `handleValidationError(errors, action, context)` - Handle validation errors
- `handleAuthError(error, action, context)` - Handle authentication errors

### Utility Functions

- `withErrorHandling(handler)` - Wrapper to add error handling to Lambda functions

## Error Categories

### 1. DynamoDB Errors

- **ConditionalCheckFailedException** (409) - Condition check failed
- **ResourceNotFoundException** (404) - Resource not found
- **ProvisionedThroughputExceededException** (429) - Rate limit exceeded
- **ValidationException** (400) - Validation error

### 2. API Gateway Errors

- **GoneException** (410) - Connection no longer exists
- **LimitExceededException** (429) - Rate limit exceeded

### 3. Authentication Errors

- **FIREBASE_TOKEN_MISSING** (401) - Authentication token missing
- **FIREBASE_TOKEN_INVALID** (401) - Invalid or expired token
- **USER_NOT_FOUND** (404) - User not found

### 4. Validation Errors

- **Missing required fields** (400)
- **Invalid field types** (400)
- **Malformed data** (400)

## Usage Examples

### Basic Error Response

```javascript
const {
  createErrorResponse,
  extractAction,
  extractRequestId,
} = require("../shared/errorHandler");

// In your Lambda function
if (!requiredField) {
  const action = extractAction(event);
  const requestId = extractRequestId(event);
  return createErrorResponse(
    400,
    "Missing required field",
    action,
    {
      operation: "validation",
      requiredField: "requiredField",
    },
    requestId
  );
}
```

### DynamoDB Error Handling

```javascript
const { handleDynamoDBError } = require("../shared/errorHandler");

try {
  await dynamoDB.send(new GetCommand(params));
} catch (error) {
  return handleDynamoDBError(error, action, {
    operation: "user_lookup",
    resource: "user_metadata",
    tableName: process.env.USER_METADATA_TABLE,
    userId,
  });
}
```

### Validation Error Handling

```javascript
const { handleValidationError } = require("../shared/errorHandler");

const errors = validateFields(data);
if (errors.length > 0) {
  return handleValidationError(errors, action, {
    operation: "data_validation",
    requiredFields: ["field1", "field2"],
    providedFields: Object.keys(data),
  });
}
```

### Wrapping Lambda Functions

```javascript
const { withErrorHandling } = require("../shared/errorHandler");

const handler = async (event, context) => {
  // Your Lambda logic here
};

module.exports.handler = withErrorHandling(handler);
```

## Implementation Status

The following Lambda functions have been updated with the new error handling system:

✅ **sendMessage** - Complete implementation
✅ **onConnect** - Complete implementation  
✅ **onDisconnect** - Complete implementation
✅ **setReady** - Complete implementation
✅ **startConversation** - Basic updates applied
✅ **endConversation** - Basic updates applied
✅ **fetchChatHistory** - Basic updates applied
✅ **getCurrentState** - Basic updates applied
✅ **updatePresence** - Basic updates applied
✅ **syncConversation** - Basic updates applied

## Best Practices

### 1. Always Include Action Field

Every error response should include the `action` field to identify what operation was being performed.

### 2. Provide Context in Details

Include relevant context in the `details` object:

- Operation being performed
- Resource being accessed
- User ID or other identifiers
- Table names or other configuration details

### 3. Use Appropriate HTTP Status Codes

- **400** - Bad Request (validation errors, malformed data)
- **401** - Unauthorized (authentication failures)
- **403** - Forbidden (authorization failures)
- **404** - Not Found (resources don't exist)
- **409** - Conflict (conditional check failures)
- **410** - Gone (connections no longer exist)
- **429** - Too Many Requests (rate limiting)
- **500** - Internal Server Error (unexpected errors)

### 4. Log Errors Appropriately

The error handling system automatically logs errors with structured information. Additional logging can be added for specific business logic.

### 5. Handle Errors at the Right Level

- Use specialized handlers for known error types
- Use generic `handleError` for unexpected errors
- Don't suppress errors unless absolutely necessary

## Monitoring and Debugging

### Request ID Tracking

Every request gets a unique request ID that can be used to:

- Track requests across logs
- Correlate errors with specific user actions
- Debug issues in production

### Structured Logging

All errors are logged with structured information:

- Error message and stack trace
- Action being performed
- Request ID
- Context information

### Error Categorization

Errors are automatically categorized by type, making it easier to:

- Identify common failure patterns
- Set up appropriate monitoring alerts
- Prioritize bug fixes

## Migration Guide

If you have existing Lambda functions that need to be updated:

1. **Import the error handler utilities**
2. **Replace basic error responses** with `createErrorResponse` calls
3. **Replace basic success responses** with `createSuccessResponse` calls
4. **Add action and request ID extraction** to all responses
5. **Use specialized handlers** for known error types
6. **Test thoroughly** to ensure error handling works correctly

## Testing

When testing the error handling system:

1. **Test all error scenarios** - missing data, invalid inputs, database failures
2. **Verify action fields** are included in all error responses
3. **Check request IDs** are unique and traceable
4. **Validate error details** contain relevant context information
5. **Test error logging** to ensure proper observability

## Future Enhancements

Potential improvements to consider:

- **Error code standardization** for client-side error handling
- **Retry logic integration** for transient failures
- **Error aggregation** for better monitoring
- **Custom error types** for business logic errors
- **Error reporting integration** with external monitoring services

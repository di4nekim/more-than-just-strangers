# endConversation Lambda Test Suite

This directory contains comprehensive end-to-end integration tests for the `endConversation` lambda function.

## Test Structure

### Test Files

1. **`endConversation.integration.test.js`** - Main integration test suite covering:

   - Success cases (normal conversation ending flow)
   - Error cases (missing parameters, conversation not found, etc.)
   - Edge cases (offline users, notification failures, etc.)
   - Timestamp validation

2. **`endConversation.edge-cases.test.js`** - Additional edge case tests covering:

   - WebSocket connection edge cases (timeouts, forbidden errors)
   - Data consistency issues (missing/empty participants)
   - Special character handling
   - Concurrent operations simulation

3. **`helpers/testHelpers.js`** - Utility functions for test setup and validation

## Test Coverage

### Success Scenarios

- ✅ Successfully ending conversation with online user notification
- ✅ Ending conversation when other user is offline
- ✅ Graceful handling of notification failures
- ✅ Proper timestamp generation and consistency

### Error Scenarios

- ✅ Missing `chatId` parameter
- ✅ Missing `userId` parameter
- ✅ Conversation not found
- ✅ DynamoDB operation failures
- ✅ Invalid JSON in request body

### Edge Cases

- ✅ Single participant conversations
- ✅ Group conversations (>2 participants)
- ✅ Missing user metadata
- ✅ Empty/null participants array
- ✅ WebSocket connection timeouts
- ✅ WebSocket access denied errors
- ✅ Special characters in reason text
- ✅ Very long reason text
- ✅ DynamoDB throttling scenarios
- ✅ Concurrent operation handling

## Running Tests

### Prerequisites

Make sure you have the required dependencies installed:

```bash
npm install
```

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests with Coverage Report

```bash
npm run test:coverage
```

### Run Specific Test Files

```bash
# Run only integration tests
npx jest endConversation.integration.test.js

# Run only edge case tests
npx jest endConversation.edge-cases.test.js
```

## Test Environment

### Mocked AWS Services

- **DynamoDB DocumentClient** - Mocked using `aws-sdk-mock`
- **API Gateway Management API** - Mocked for WebSocket notifications

### Environment Variables

The tests use these mock environment variables:

- `AWS_REGION`: `us-east-1`
- `CONVERSATIONS_TABLE`: `test-conversations-table`
- `USER_METADATA_TABLE`: `test-user-metadata-table`
- `WEBSOCKET_API_URL`: `https://test-websocket-api.execute-api.us-east-1.amazonaws.com/dev`

## Test Data Structure

### Mock Conversation Object

```javascript
{
    PK: 'CHAT#<chatId>',
    participants: ['user1', 'user2'],
    startTime: '2023-01-01T10:00:00Z',
    status: 'active'
}
```

### Mock User Metadata Object

```javascript
{
    PK: 'USER#<userId>',
    connectionId: '<connectionId>', // Optional
    status: 'online|offline'
}
```

### Lambda Event Structure

```javascript
{
  body: JSON.stringify({
    data: {
      chatId: "<chatId>",
      userId: "<userId>",
      reason: "<reason>", // Optional
    },
  });
}
```

## Expected Lambda Response

### Success Response (200)

```javascript
{
    statusCode: 200,
    body: JSON.stringify({
        action: 'conversationEnded',
        data: {
            chatId: '<chatId>',
            endedBy: '<userId>',
            timestamp: '<ISO timestamp>'
        }
    })
}
```

### Error Response (400/404/500)

```javascript
{
    statusCode: <errorCode>,
    body: JSON.stringify({
        action: 'error',
        data: {
            error: '<error message>'
        }
    })
}
```

## WebSocket Notification Structure

When the other user is connected, they receive:

```javascript
{
    action: 'conversationEnded',
    data: {
        chatId: '<chatId>',
        endedBy: '<userId>',
        endReason: '<reason>',
        timestamp: '<ISO timestamp>'
    }
}
```

## Database Operations Tested

### DynamoDB Get Operations

- Fetch conversation data by `CHAT#<chatId>`
- Fetch user metadata by `USER#<userId>`

### DynamoDB Update Operations

- Update conversation with:
  - `endedBy`: User who ended the conversation
  - `endReason`: Reason provided (optional)
  - `lastUpdated`: ISO timestamp

## Validation Points

### Input Validation

- Required fields presence (`chatId`, `userId`)
- JSON parsing of request body

### Business Logic Validation

- Conversation existence
- Participant identification
- Connection status checking

### Output Validation

- Response status codes
- Response body structure
- Timestamp format consistency
- WebSocket notification content

## Error Handling Coverage

### AWS Service Errors

- DynamoDB throttling (`ProvisionedThroughputExceededException`)
- DynamoDB validation errors (`ValidationException`)
- DynamoDB conditional check failures (`ConditionalCheckFailedException`)
- WebSocket connection failures (timeouts, access denied)

### Data Integrity Errors

- Missing conversation data
- Invalid participant data
- Stale connection IDs

### Performance Considerations

- Large participant lists
- Long reason text
- Concurrent operations

## Continuous Integration

These tests are designed to run in CI/CD pipelines and provide comprehensive coverage of the lambda function's behavior under various conditions.

### Test Reliability

- All AWS services are mocked to ensure consistent behavior
- No external dependencies or network calls
- Deterministic test outcomes
- Proper cleanup after each test

### Performance

- Fast execution with mocked services
- Parallel test execution where possible
- Minimal setup/teardown overhead

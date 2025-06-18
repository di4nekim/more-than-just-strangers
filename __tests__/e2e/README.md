# E2E Test Suite Documentation

## Overview

This test suite provides comprehensive end-to-end testing for the chat application, focusing on the chat flow logic, WebSocket interactions, and global state management.

## Test Structure

### Main Test Files

- `chat/[chatId]/page.test.jsx` - Main chat page E2E tests
- `websocketActions.test.js` - WebSocket action handler tests
- `test-utils.js` - Custom render functions with providers
- `fixtures/mockData.js` - Reusable mock data
- `mocks/websocket.js` - WebSocket server mock

### Test Categories

1. **Initialization Phase**

   - WebSocket connection establishment
   - API data fetching (chat, messages, user metadata)
   - Loading states
   - Error handling

2. **Real-Time Sync Phase**

   - Message sending/receiving
   - Question index updates
   - Ready state synchronization
   - Partner disconnect handling

3. **Chat Lifecycle Phase**

   - Message persistence
   - Question display
   - Ready status monitoring
   - Chat termination

4. **Termination Phase**
   - WebSocket cleanup
   - State clearing
   - Redirection logic

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test chat/[chatId]/page.test.jsx

# Run in watch mode
npm test -- --watch

# Run E2E tests only
npm test -- --testPathPattern=e2e
```

## Key Testing Patterns

### 1. WebSocket Testing

```javascript
// Simulate incoming WebSocket message
act(() => {
  mockWs.dispatchEvent(
    new MessageEvent("message", {
      data: JSON.stringify({
        type: "newMessage",
        data: messageData,
      }),
    })
  );
});
```

### 2. Async State Updates

```javascript
// Wait for state updates
await waitFor(() => {
  expect(screen.getByText("Expected Text")).toBeInTheDocument();
});
```

### 3. User Interactions

```javascript
// Simulate user actions
await user.type(input, "Test message");
await user.click(sendButton);
```

## Identified Bugs & Issues

### 1. Race Condition in API Calls

- **Issue**: Message fetch might complete before chat data fetch
- **Test**: `Should handle race condition between API calls`
- **Fix**: Implement proper loading states and dependency management

### 2. Duplicate Message Handling

- **Issue**: Same message might be received multiple times
- **Test**: `Should handle duplicate WebSocket messages`
- **Fix**: Implement message deduplication by messageId

### 3. WebSocket Reconnection Queue

- **Issue**: Messages sent during disconnection might be lost
- **Test**: `Should handle WebSocket reconnection with message queue`
- **Fix**: Implement message queueing system

### 4. Question Index Bounds

- **Issue**: Question index might exceed available questions
- **Test**: `Should handle question index out of bounds`
- **Fix**: Add bounds checking for question navigation

### 5. Missing Authentication

- **Issue**: No check for authentication before chat access
- **Test**: `Should handle missing user authentication`
- **Fix**: Add auth check in page initialization

## Best Practices

1. **Use minimal mocking** - Only mock external dependencies
2. **Test user flows** - Focus on complete user journeys
3. **Handle async operations** - Use proper waitFor patterns
4. **Clean up after tests** - Close WebSocket connections
5. **Test error states** - Include network failures and edge cases

## Coverage Goals

- **Statements**: 80%+
- **Branches**: 80%+
- **Functions**: 80%+
- **Lines**: 80%+

## Future Improvements

1. Add visual regression testing
2. Implement performance benchmarks
3. Add accessibility testing
4. Create integration tests with real backend
5. Add mobile-specific test scenarios

# Test Suite Documentation

This directory contains a comprehensive test suite for the More Than Just Strangers application. The tests are organized by category and cover all major functionality including frontend components, API endpoints, WebSocket communication, and authentication flows.

## Test Structure

```
__tests__/
├── config/                 # Jest configuration and setup
│   ├── jest.config.js     # Main Jest configuration
│   └── jest.setup.js      # Test environment setup
├── helpers/                # Test utilities and mocks
│   ├── jwt-helper.js      # JWT token utilities for testing
│   └── fileMock.js        # File mocking utilities
├── frontend/               # Frontend component tests
│   ├── HomeContent.test.jsx
│   ├── ChatRoom.test.jsx
│   └── FirebaseAuthProvider.test.jsx
├── api/                    # API endpoint tests
│   ├── endpoints.test.js   # Comprehensive API testing
│   └── integration.test.js # API integration tests
├── websocket/              # WebSocket and real-time communication tests
│   └── WebSocketContext.test.js
├── auth/                   # Authentication and authorization tests
│   ├── error-scenarios.test.js
│   ├── api-routes.test.js
│   └── e2e-authentication-flow.test.js
├── integration/            # End-to-end and integration tests
│   └── app-integration.test.js
└── test-runner.js          # Comprehensive test runner script
```

## Test Categories

### 1. Frontend Tests (`__tests__/frontend/`)
Tests for React components and user interface elements:
- **HomeContent.test.jsx**: Tests the main home page component
- **ChatRoom.test.jsx**: Tests the chat interface component
- **FirebaseAuthProvider.test.jsx**: Tests the authentication context provider

### 2. API Tests (`__tests__/api/`)
Tests for REST API endpoints:
- **endpoints.test.js**: Comprehensive testing of all API endpoints
- **integration.test.js**: Integration testing of API workflows

### 3. WebSocket Tests (`__tests__/websocket/`)
Tests for real-time communication:
- **WebSocketContext.test.js**: Tests the WebSocket context and communication

### 4. Authentication Tests (`__tests__/auth/`)
Tests for authentication and authorization:
- **error-scenarios.test.js**: Tests various error conditions
- **api-routes.test.js**: Tests authentication API routes
- **e2e-authentication-flow.test.js**: End-to-end authentication testing

### 5. Integration Tests (`__tests__/integration/`)
Tests that verify the system works as a whole:
- **app-integration.test.js**: Tests component interactions and system workflows

## Running Tests

### Quick Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test categories
npm run test:frontend      # Frontend tests only
npm run test:api           # API tests only
npm run test:websocket     # WebSocket tests only
npm run test:auth          # Authentication tests only
npm run test:integration   # Integration tests only
npm run test:unit          # Unit tests only
```

### Using the Test Runner

The comprehensive test runner provides organized test execution:

```bash
# Run all tests
node __tests__/test-runner.js

# Run specific category
node __tests__/test-runner.js frontend
node __tests__/test-runner.js api
node __tests__/test-runner.js websocket

# Show help
node __tests__/test-runner.js --help
```

### Environment Variables

Set these environment variables for testing:

```bash
export NODE_ENV=test
export NEXT_PUBLIC_FIREBASE_API_KEY=test-api-key
export NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=test.firebaseapp.com
export NEXT_PUBLIC_FIREBASE_PROJECT_ID=test-project-id
```

## Test Configuration

### Jest Configuration (`config/jest.config.js`)
- **Test Environment**: jsdom for browser-like testing
- **Coverage Thresholds**: 70% for branches, functions, lines, and statements
- **Transform**: Babel with Next.js presets
```bash
# Firebase tests only
npm test __tests__/firebase/

# WebSocket tests only
npm test __tests__/websocket/

# Integration tests only
npm test __tests__/integration/
```

### Test Setup

The Jest configuration files in the `config/` directory handle:

- Test environment setup
- Global test utilities
- Mock configurations
- Test coverage settings

## Adding New Tests

When adding new test files:

1. Place them in the appropriate category directory
2. Update this README if adding new categories
3. Ensure the Jest configuration includes the new test paths
4. Follow the existing naming conventions

## Test File Naming Convention

- `test-*.js` - Standard test files
- `*-test.js` - Alternative test naming
- `*.cjs` - CommonJS test files (for specific environments)
- `diagnose-*.js` - Diagnostic/debugging test files

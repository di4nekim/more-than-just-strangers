# E2E Integration Tests for `endConversation` Lambda

End-to-end integration testing for the `endConversation` lambda function with **real AWS dependencies** using your deployed AWS dev environment.

## 🎯 Overview

These tests validate the complete flow of ending a conversation by testing against your actual AWS deployment:

- ✅ **Real DynamoDB Tables** - Uses your deployed ConversationsV2 and UserMetadataV2 tables
- ✅ **Real API Gateway** - Tests against your deployed WebSocket API
- ✅ **Real Lambda Execution** - Invokes the actual lambda function
- ✅ **Data Persistence** - Validates data is correctly stored in DynamoDB
- ✅ **Error Handling** - Tests error scenarios with real AWS services

## 🚀 Quick Start

```bash
# Run complete E2E test suite
npm run test:e2e

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

## 📋 Prerequisites

### AWS Credentials

Ensure you have AWS credentials configured with permissions to access your dev environment:

```bash
# Using AWS CLI
aws configure

# Or using environment variables
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_REGION=us-east-1
```

### Required AWS Permissions

Your AWS credentials need the following permissions:

- DynamoDB: Read/Write access to ConversationsV2 and UserMetadataV2 tables
- API Gateway: Access to your WebSocket API
- Lambda: Invoke permissions (if testing lambda directly)

### Environment Variables

Set these environment variables for your tests:

```bash
# Required AWS configuration
export AWS_REGION=us-east-1
export CONVERSATIONS_TABLE=ConversationsV2
export USER_METADATA_TABLE=UserMetadataV2
export MESSAGES_TABLE=MessagesV2

# WebSocket API URL from your deployment
export WEBSOCKET_API_URL=wss://your-api-id.execute-api.us-east-1.amazonaws.com/Dev
# Or just the API ID if using default format
export WEBSOCKET_API_ID=your-api-id
```

## 🏗️ Test Structure

```
endConversation/
├── __tests__/
│   ├── endConversation.integration.e2e.test.js  # Main E2E tests
│   └── helpers/
│       └── testSetup.js                         # AWS test utilities
├── index.js                                     # Lambda function
└── package.json                                 # Test scripts
```

## 🔧 AWS Configuration

The tests automatically configure themselves to work with your AWS deployment:

```javascript
// testSetup.js configures:
const TEST_REGION = process.env.AWS_REGION || "us-east-1";
const CONVERSATIONS_TABLE =
  process.env.CONVERSATIONS_TABLE || "ConversationsV2";
const USER_METADATA_TABLE = process.env.USER_METADATA_TABLE || "UserMetadataV2";
```

## 🧪 Test Categories

### Happy Path Tests

- ✅ End conversation successfully
- ✅ Update DynamoDB with conversation end details
- ✅ Notify other participants via WebSocket

### Error Handling Tests

- ❌ Missing required parameters (chatId, userId)
- ❌ Non-existent conversation
- ❌ Invalid data formats

### Data Validation Tests

- 📊 Timestamp formatting and consistency
- 📊 Data persistence verification
- 📊 Response format validation

## 🎛️ Test Configuration

### Jest Configuration

```javascript
// package.json
{
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/__tests__/**/*.test.js"],
    "testPathIgnorePatterns": ["/node_modules/", "/__tests__/helpers/"]
  }
}
```

### AWS Client Configuration

```javascript
// Uses standard AWS SDK configuration
const dynamoClient = new DynamoDBClient({
  region: TEST_REGION,
});
```

## 📊 Test Data Management

### Seeding Test Data

```javascript
const testData = {
  [CONVERSATIONS_TABLE]: [
    createTestConversation(chatId, [userId1, userId2], "active"),
  ],
  [USER_METADATA_TABLE]: [
    createTestUserMetadata(userId1, "connection-1", "online"),
  ],
};

await seedTestData(testData);
```

### Cleanup

Tests automatically cleanup test data after execution to avoid cluttering your dev environment.

## 🔍 Debugging

### Validate AWS Access

```javascript
// Test setup includes AWS access validation
const hasAccess = await validateAWSAccess();
if (!hasAccess) {
  throw new Error(
    "Cannot access AWS resources. Please check your AWS credentials and permissions."
  );
}
```

### Common Issues

**Access Denied Errors**

- Verify AWS credentials are configured
- Check IAM permissions for DynamoDB and API Gateway access
- Ensure you're in the correct AWS region

**Table Not Found Errors**

- Verify your SAM stack is deployed
- Check table names match your deployment
- Confirm you're accessing the correct AWS account/region

**Connection Timeouts**

- Check your network connectivity to AWS
- Verify AWS region is accessible from your location

### Monitoring Test Execution

```bash
# Run tests with verbose output
npm run test:e2e -- --verbose

# Run specific test file
npx jest endConversation.integration.e2e.test.js
```

## 📈 CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run E2E Tests
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    AWS_REGION: us-east-1
    CONVERSATIONS_TABLE: ConversationsV2
    USER_METADATA_TABLE: UserMetadataV2
    WEBSOCKET_API_ID: ${{ secrets.WEBSOCKET_API_ID }}
  run: npm run test:e2e
```

## 🎯 Best Practices

### Data Isolation

- Use unique test identifiers (timestamps) to avoid conflicts
- Clean up test data after each test run
- Use test-specific prefixes for data identification

### Environment Management

- Keep dev environment separate from production
- Use environment-specific table names if needed
- Monitor AWS costs for test executions

### Test Performance

- Minimize test data creation/deletion
- Use parallel test execution where possible
- Cache AWS clients for better performance

## 🆚 LocalStack vs AWS Deployment

| **Feature**     | **AWS Deployment**   | **LocalStack (Removed)** |
| --------------- | -------------------- | ------------------------ |
| **Environment** | 🌐 Real AWS Services | 🏠 Local Docker          |
| **Cost**        | 💰 AWS Usage Costs   | 💚 Free                  |
| **Performance** | 🌍 Network Dependent | ⚡ Local Speed           |
| **Reliability** | 🔒 Production-like   | 🧪 Development Mock      |
| **Setup**       | 🔑 AWS Credentials   | 🐳 Docker Required       |

## 📚 Additional Resources

- [AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/)
- [DynamoDB Developer Guide](https://docs.aws.amazon.com/dynamodb/)
- [API Gateway WebSocket APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api.html)
- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)

## 🎉 Happy Testing!

Your E2E tests now run against real AWS infrastructure, providing confidence that your lambda works correctly in the actual deployment environment!

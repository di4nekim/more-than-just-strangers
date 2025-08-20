# E2E Integration Tests for `endConversation` Lambda

End-to-end integration testing for the `endConversation` lambda function with **real AWS dependencies** using your deployed AWS dev environment.

## Overview

This document provides comprehensive end-to-end (E2E) testing instructions for the `endConversation` Lambda function.

## Test Categories

### Authentication & Authorization Tests

### Data Validation Tests

### Error Handling Tests

### Edge Cases & Special Characters

### Data Consistency Edge Cases

## Debugging

### Validate AWS Access

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

## CI/CD Integration

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

## Best Practices

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

## LocalStack vs AWS Deployment

| **Feature**     | **AWS Deployment**   | **LocalStack (Removed)** |
| --------------- | -------------------- | ------------------------ |
| **Environment** | Real AWS Services | Local Docker          |
| **Cost**        | AWS Usage Costs   | Free                  |
| **Performance** | Network Dependent | Local Speed           |
| **Reliability** | Production-like   | Development Mock      |
| **Setup**       | AWS Credentials   | Docker Required       |

## Additional Resources

- [AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/)
- [DynamoDB Developer Guide](https://docs.aws.amazon.com/dynamodb/)
- [API Gateway WebSocket APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api.html)
- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)

## Happy Testing!

Your E2E tests now run against real AWS infrastructure, providing confidence that your lambda works correctly in the actual deployment environment!

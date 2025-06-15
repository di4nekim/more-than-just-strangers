/**
 * Test setup utilities for E2E integration tests with real AWS services
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { CreateTableCommand, DeleteTableCommand } = require('@aws-sdk/client-dynamodb');
const { ApiGatewayManagementApiClient } = require('@aws-sdk/client-apigatewaymanagementapi');

// ... existing code ... 
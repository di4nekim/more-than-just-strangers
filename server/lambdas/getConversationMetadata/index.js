const AWS = require('aws-sdk');

// Configure DynamoDB client for local development
const isLocal = !!process.env.DYNAMODB_ENDPOINT;
const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
    accessKeyId: isLocal ? "fake" : undefined,
    secretAccessKey: isLocal ? "fake" : undefined
});

const apiGateway = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: process.env.WEBSOCKET_ENDPOINT
});

// ... existing code ... 
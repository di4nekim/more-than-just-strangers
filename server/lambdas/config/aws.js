import AWS from 'aws-sdk';

// Configure AWS SDK
AWS.config.update({
    region: process.env.AWS_REGION || 'us-east-1'
});

// Factory functions to create AWS service instances
const createDynamoDB = () => new AWS.DynamoDB.DocumentClient();
const createApiGateway = () => new AWS.ApiGatewayManagementApi({
    endpoint: process.env.WEBSOCKET_API_URL 
        ? process.env.WEBSOCKET_API_URL.replace("wss://", "").replace("/prod", "")
        : "localhost:3001"
});

// Create default instances
const dynamoDB = createDynamoDB();
const apiGateway = createApiGateway();

export {
    AWS,
    dynamoDB,
    apiGateway,
    createDynamoDB,
    createApiGateway
}; 
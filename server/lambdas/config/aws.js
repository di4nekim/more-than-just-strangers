const AWS = require('aws-sdk');

// Configure AWS SDK
AWS.config.update({
    region: process.env.AWS_REGION || 'us-east-1'
});

// Factory functions to create AWS service instances
const createDynamoDB = () => new AWS.DynamoDB.DocumentClient();
const createApiGateway = (AWSInstance = AWS) => {
    return new AWSInstance.ApiGatewayManagementApi({
      endpoint: process.env.WEBSOCKET_API_URL 
        ? process.env.WEBSOCKET_API_URL.replace("wss://", "").replace("/prod", "")
        : "localhost:3001"
    });
  };


const createLambda = (AWSInstance = AWS) => {
return new AWSInstance.Lambda();
};

export {
    AWS,
    createDynamoDB,
    createApiGateway,
    createLambda,
}; 
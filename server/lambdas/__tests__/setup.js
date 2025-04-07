const AWS = require('aws-sdk');
const AWSMock = require('aws-sdk-mock');

// Set environment variables first
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.WEBSOCKET_API_URL = 'wss://test-api-gateway.execute-api.us-east-1.amazonaws.com/prod';
process.env.CONNECTIONS_TABLE = 'Connections';
process.env.MESSAGES_TABLE = 'Messages';
process.env.MESSAGE_QUEUE_TABLE = 'MessageQueue';

// Set up AWS SDK mocking first
AWSMock.setSDKInstance(AWS);

// Configure AWS SDK after setting up mocking
AWS.config.update({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Mock DynamoDB DocumentClient methods
beforeEach(() => {
  // Mock DynamoDB.DocumentClient methods
  const mockDocumentClient = {
    get: jest.fn().mockImplementation((params) => {
      if (params.TableName === process.env.CONNECTIONS_TABLE) {
        return Promise.resolve({ Item: { connectionId: 'test-connection-id' } });
      } else if (params.TableName === process.env.MESSAGES_TABLE) {
        return Promise.resolve({ Item: { messageId: 'test-message-id' } });
      }
      return Promise.resolve({ Item: null });
    }),
    put: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    scan: jest.fn().mockImplementation((params) => {
      if (params.TableName === process.env.CONNECTIONS_TABLE) {
        return Promise.resolve({ Items: [{ connectionId: 'test-connection-id' }] });
      }
      return Promise.resolve({ Items: [] });
    }),
    query: jest.fn().mockResolvedValue({ Items: [] })
  };

  // Mock ApiGatewayManagementApi
  const mockApiGatewayManagementApi = {
    postToConnection: jest.fn().mockResolvedValue({})
  };

  // Apply mocks
  AWSMock.mock('DynamoDB.DocumentClient', 'get', (params, callback) => {
    mockDocumentClient.get(params)
      .then(result => callback(null, result))
      .catch(err => callback(err));
  });
  
  AWSMock.mock('DynamoDB.DocumentClient', 'put', (params, callback) => {
    mockDocumentClient.put(params)
      .then(result => callback(null, result))
      .catch(err => callback(err));
  });
  
  AWSMock.mock('DynamoDB.DocumentClient', 'update', (params, callback) => {
    mockDocumentClient.update(params)
      .then(result => callback(null, result))
      .catch(err => callback(err));
  });
  
  AWSMock.mock('DynamoDB.DocumentClient', 'scan', (params, callback) => {
    mockDocumentClient.scan(params)
      .then(result => callback(null, result))
      .catch(err => callback(err));
  });

  AWSMock.mock('DynamoDB.DocumentClient', 'query', (params, callback) => {
    mockDocumentClient.query(params)
      .then(result => callback(null, result))
      .catch(err => callback(err));
  });

  AWSMock.mock('ApiGatewayManagementApi', 'postToConnection', (params, callback) => {
    mockApiGatewayManagementApi.postToConnection(params)
      .then(result => callback(null, result))
      .catch(err => callback(err));
  });
});

// Clean up mocks after each test
afterEach(() => {
  AWSMock.restore();
});
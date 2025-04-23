import AWS from 'aws-sdk';
import AWSMock from 'aws-sdk-mock';
import dotenv from 'dotenv';
import { handler } from '../onConnect.js';


dotenv.config({ path: '.env.local' });

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

let mockStore = {}
// Mock DynamoDB DocumentClient methods
beforeEach(() => {
  mockStore = {}

  const mockDocumentClient = {
    get: jest.fn().mockImplementation((params) => {
      const item = mockStore[params.Key.ConnectionID];
      return Promise.resolve({ Item: item || null });
    }),
    put: jest.fn().mockImplementation((params) => {
      mockStore[params.Item.ConnectionID] = params.Item;
      return Promise.resolve({});
    }),
    update: jest.fn().mockResolvedValue({}),
    scan: jest.fn().mockImplementation(() => {
      const items = Object.values(mockStore);
      return Promise.resolve({ Items: items });
    }),
    query: jest.fn().mockResolvedValue({ Items: [] })
  };

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

  // Keep the rest the same...
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
  jest.clearAllMocks(); 
});

// Helper function to get connection from DynamoDB
async function getConnection(connectionId) {
  const dynamoDB = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION
  });

  const params = {
    TableName: process.env.CONNECTIONS_TABLE,
    Key: {
      ConnectionID: connectionId
    }
  };

  const result = await dynamoDB.get(params).promise();
  return result.Item;
}

// Helper function to delete connection from DynamoDB
async function deleteConnection(connectionId) {
    const params = {
        TableName: process.env.CONNECTIONS_TABLE,
        Key: {
            ConnectionID: connectionId
        }
    };
    const dynamoDB = new AWS.DynamoDB.DocumentClient();
    await dynamoDB.delete(params).promise();
}

// Integration test suite
describe('onConnect Mock Integration Tests', () => {
    const testEvent = {
        requestContext: {
            connectionId: 'test-connection-id'
        },
        // queryStringParameters: {
        //     userId: 'integrationUser1',
        //     otherUserId: 'integrationUser2'
        // }
    };

    afterEach(async () => {
        // Clean up the test data
        await deleteConnection(testEvent.requestContext.connectionId);
    });

    test('should store a new connection in DynamoDB', async () => {
        const response = await handler(testEvent);
        expect(response.statusCode).toBe(200);

        const connection = await getConnection(testEvent.requestContext.connectionId);
        expect(connection).toBeDefined();
        expect(connection.ConnectionID).toBe(testEvent.requestContext.connectionId);
    });

    test('should not create a duplicate connection', async () => {
      let response = await handler(testEvent);
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('Connected successfully');
  
      // Attempt to create duplicate connection
      response = await handler(testEvent);
      expect(response.statusCode).toBe(409);
      expect(response.body).toBe('Connection already exists');
    });
});
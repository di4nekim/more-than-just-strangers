const AWS = require('aws-sdk');
const { handler } = require('../index');

// Mock the shared auth module at the top level
jest.mock('../../shared/auth', () => ({
    authenticateWebSocketEvent: jest.fn(() => Promise.resolve({
        userId: 'test-user-123',
        email: 'test@example.com',
    })),
}));

// Mock AWS SDK v3
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => ({
        send: jest.fn(),
    })),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
    // Create mock command classes that can be instantiated
    class MockPutCommand {
        constructor(params) {
            this.params = params;
        }
    }
    
    class MockGetCommand {
        constructor(params) {
            this.params = params;
        }
    }
    
    class MockUpdateCommand {
        constructor(params) {
            this.params = params;
        }
    }
    
    class MockQueryCommand {
        constructor(params) {
            this.params = params;
        }
    }
    
    class MockDeleteCommand {
        constructor(params) {
            this.params = params;
        }
    }
    
    class MockScanCommand {
        constructor(params) {
            this.params = params;
        }
    }
    
    return {
        DynamoDBDocumentClient: {
            from: jest.fn((client) => ({
                send: jest.fn(),
            })),
        },
        PutCommand: MockPutCommand,
        GetCommand: MockGetCommand,
        UpdateCommand: MockUpdateCommand,
        QueryCommand: MockQueryCommand,
        DeleteCommand: MockDeleteCommand,
        ScanCommand: MockScanCommand,
    };
});

jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
    ApiGatewayManagementApiClient: jest.fn().mockImplementation(() => ({
        send: jest.fn(),
    })),
    PostToConnectionCommand: jest.fn().mockImplementation((params) => ({
        params: params,
    })),
}));

describe('startConversation Lambda', () => {
    let mockDynamoDB;
    let mockScanCommand;
    
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        
        // Set environment variables
        process.env.CONVERSATIONS_TABLE = 'test-conversations-table';
        process.env.USER_METADATA_TABLE = 'test-user-metadata-table';
        process.env.MATCHMAKING_QUEUE_TABLE = 'test-matchmaking-queue-table';
        process.env.AWS_REGION = 'us-east-1';
        
        // Get the mocked DynamoDB client
        const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
        mockDynamoDB = DynamoDBDocumentClient.from();
        
        // Mock the scan command for authentication
        mockScanCommand = require('@aws-sdk/lib-dynamodb').ScanCommand;
        mockDynamoDB.send.mockImplementation((command) => {
            if (command instanceof mockScanCommand) {
                // Return mock user for authentication
                return Promise.resolve({
                    Items: [{
                        userId: 'user123',
                        email: 'user123@example.com',
                        connectionId: 'test-connection-id'
                    }]
                });
            }
            // For other commands, return empty result
            return Promise.resolve({});
        });
    });

    it('should successfully create a new conversation', async () => {
        // Arrange
        const userAId = 'user123';
        const userBId = 'user456';
        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            body: JSON.stringify({
                data: {
                    userAId,
                    userBId
                }
            })
        };

        // Act
        const response = await handler(event);
        
        // Debug: log the actual response
        console.log('Response:', JSON.stringify(response, null, 2));

        // Assert
        expect(response.statusCode).toBe(200);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.action).toBe('conversationStarted');
        expect(responseBody.data.chatId).toBe('user123#user456');
        expect(responseBody.data.participants).toEqual([userAId, userBId]);
        expect(responseBody.data.createdAt).toBeDefined();
    });

    it('should handle missing user IDs', async () => {
        // Arrange
        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            body: JSON.stringify({
                data: {
                    userAId: 'user123'
                    // userBId is missing
                }
            })
        };

        // Act
        const response = await handler(event);

        // Assert
        expect(response.statusCode).toBe(400);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.action).toBe('error');
        expect(responseBody.data.error).toBe('Missing userAId or userBId');
    });

    it('should handle invalid JSON input', async () => {
        // Arrange
        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            body: 'invalid-json'
        };

        // Act
        const response = await handler(event);

        // Assert
        expect(response.statusCode).toBe(500);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.action).toBe('error');
        expect(responseBody.data.error).toBe('Internal Server Error');
    });

    it('should handle DynamoDB errors', async () => {
        // Arrange
        const userAId = 'user123';
        const userBId = 'user456';
        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            body: JSON.stringify({
                data: {
                    userAId,
                    userBId
                }
            })
        };

        // Mock DynamoDB error for the main logic (not authentication)
        mockDynamoDB.send.mockImplementation((command) => {
            if (command instanceof mockScanCommand) {
                // Return mock user for authentication
                return Promise.resolve({
                    Items: [{
                        userId: 'user123',
                        email: 'user123@example.com',
                        connectionId: 'test-connection-id'
                    }]
                });
            }
            // For other commands, throw error
            return Promise.reject(new Error('DynamoDB error'));
        });

        // Act
        const response = await handler(event);

        // Assert
        expect(response.statusCode).toBe(500);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.action).toBe('error');
        expect(responseBody.data.error).toBe('Internal Server Error');
    });

    it('should sort chat participants for consistent chatId generation', async () => {
        // Arrange
        const userAId = 'user456'; // Higher lexicographically
        const userBId = 'user123'; // Lower lexicographically
        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            body: JSON.stringify({
                data: {
                    userAId,
                    userBId
                }
            })
        };

        // Act
        const response = await handler(event);

        // Assert
        expect(response.statusCode).toBe(200);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.data.chatId).toBe('user123#user456'); // Should be sorted
        expect(responseBody.data.participants).toEqual(['user123', 'user456']); // Should be sorted
    });
}); 
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
    DynamoDBClient: jest.fn(() => ({
        send: jest.fn(),
    })),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn((client) => ({
            send: jest.fn(),
        })),
    },
    QueryCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
    ApiGatewayManagementApiClient: jest.fn(() => ({
        send: jest.fn(),
    })),
    PostToConnectionCommand: jest.fn(),
}));

describe('fetchChatHistory Lambda', () => {
    let mockDynamoDB;
    let mockApiGateway;
    let mockQueryCommand;
    let mockPostToConnectionCommand;
    
    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();
        
        // Set up environment variables
        process.env.MESSAGES_TABLE = 'test-messages-table';
        process.env.AWS_REGION = 'us-east-1';
        
        // Get the mocked services
        const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
        mockDynamoDB = DynamoDBDocumentClient.from();
        
        const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
        mockApiGateway = new ApiGatewayManagementApiClient();
        
        mockQueryCommand = require('@aws-sdk/lib-dynamodb').QueryCommand;
        mockPostToConnectionCommand = require('@aws-sdk/client-apigatewaymanagementapi').PostToConnectionCommand;
        
        // Mock DynamoDB responses
        mockDynamoDB.send.mockResolvedValue({
            Items: [],
            LastEvaluatedKey: null
        });
        
        // Debug: log what the mock is set up to do
        console.log('Mock DynamoDB send set up to return:', mockDynamoDB.send.mock.results);
    });

    test('should return 400 when chatId is missing', async () => {
        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            body: JSON.stringify({
                data: {}
            })
        };

        const response = await handler(event);

        expect(response.statusCode).toBe(200); // WebSocket always returns 200
        expect(mockPostToConnectionCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                ConnectionId: 'test-connection-id',
                Data: expect.stringContaining('Missing chatId parameter')
            })
        );
    });

    test('should fetch chat history successfully', async () => {
        const mockMessages = [
            { PK: 'CHAT#123', message: 'Hello' },
            { PK: 'CHAT#123', message: 'World' }
        ];

        // Mock DynamoDB response for this test
        mockDynamoDB.send.mockResolvedValue({
            Items: mockMessages,
            LastEvaluatedKey: null
        });

        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            body: JSON.stringify({
                data: {
                    chatId: '123'
                }
            })
        };

        const response = await handler(event);

        expect(response.statusCode).toBe(200);
        expect(mockPostToConnectionCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                ConnectionId: 'test-connection-id',
                Data: expect.stringContaining('chatHistory')
            })
        );
        
        // Verify the response data contains the messages
        const callArgs = mockPostToConnectionCommand.mock.calls[0][0];
        const responseData = JSON.parse(callArgs.Data);
        expect(responseData.action).toBe('chatHistory');
        expect(responseData.data.messages).toEqual(mockMessages);
        expect(responseData.data.hasMore).toBe(false);
    });

    test('should handle pagination correctly', async () => {
        const mockLastEvaluatedKey = { PK: 'CHAT#123', SK: 'MSG#456' };
        const mockMessages = [
            { PK: 'CHAT#123', message: 'Hello' }
        ];

        // Mock DynamoDB response for this test
        mockDynamoDB.send.mockResolvedValue({
            Items: mockMessages,
            LastEvaluatedKey: mockLastEvaluatedKey
        });

        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            body: JSON.stringify({
                data: {
                    chatId: '123',
                    lastEvaluatedKey: encodeURIComponent(JSON.stringify(mockLastEvaluatedKey))
                }
            })
        };

        const response = await handler(event);

        expect(response.statusCode).toBe(200);
        expect(mockPostToConnectionCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                ConnectionId: 'test-connection-id',
                Data: expect.stringContaining('chatHistory')
            })
        );
        
        // Verify pagination data
        const callArgs = mockPostToConnectionCommand.mock.calls[0][0];
        const responseData = JSON.parse(callArgs.Data);
        expect(responseData.data.hasMore).toBe(true);
        expect(responseData.data.lastEvaluatedKey).toBeDefined();
    });

    test('should handle custom limit parameter', async () => {
        // Mock DynamoDB response for this test
        mockDynamoDB.send.mockResolvedValue({
            Items: [],
            LastEvaluatedKey: null
        });

        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            body: JSON.stringify({
                data: {
                    chatId: '123',
                    limit: 10
                }
            })
        };

        await handler(event);

        expect(mockDynamoDB.send).toHaveBeenCalledWith(
            expect.objectContaining({
                Limit: 10
            })
        );
    });

    test('should handle DynamoDB errors', async () => {
        mockDynamoDB.send.mockRejectedValue(new Error('DynamoDB error'));

        const event = {
            requestContext: {
                connectionId: 'test-connection-id'
            },
            body: JSON.stringify({
                data: {
                    chatId: '123'
                }
            })
        };

        const response = await handler(event);

        expect(response.statusCode).toBe(200); // WebSocket always returns 200
        expect(mockPostToConnectionCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                ConnectionId: 'test-connection-id',
                Data: expect.stringContaining('Internal server error')
            })
        );
    });
}); 
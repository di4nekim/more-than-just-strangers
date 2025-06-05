const AWS = require('aws-sdk');
const { handler } = require('../index');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
    const mockDynamoDB = {
        put: jest.fn().mockReturnThis(),
        promise: jest.fn()
    };
    return {
        DynamoDB: {
            DocumentClient: jest.fn(() => mockDynamoDB)
        }
    };
});

describe('startConversation Lambda', () => {
    let mockDynamoDB;
    
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        
        // Get the mock DynamoDB instance
        mockDynamoDB = new AWS.DynamoDB.DocumentClient();
        
        // Set environment variables
        process.env.CONVERSATIONS_TABLE = 'test-conversations-table';
        process.env.AWS_REGION = 'us-east-1';
    });

    it('should successfully create a new conversation', async () => {
        // Arrange
        const userAId = 'user123';
        const userBId = 'user456';
        const event = {
            body: JSON.stringify({
                data: {
                    userAId,
                    userBId
                }
            })
        };

        mockDynamoDB.promise.mockResolvedValueOnce({});

        // Act
        const response = await handler(event);

        // Assert
        expect(response.statusCode).toBe(200);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.action).toBe('conversationStarted');
        expect(responseBody.data.chatId).toBe('user123#user456');
        expect(responseBody.data.participants).toEqual([userAId, userBId]);
        expect(responseBody.data.createdAt).toBeDefined();

        // Verify DynamoDB call
        expect(mockDynamoDB.put).toHaveBeenCalledWith(expect.objectContaining({
            TableName: 'test-conversations-table',
            Item: expect.objectContaining({
                PK: 'CHAT#user123#user456',
                chatId: 'user123#user456',
                participants: [userAId, userBId],
                lastMessage: null,
                endedBy: null,
                endReason: null
            })
        }));
    });

    it('should handle missing user IDs', async () => {
        // Arrange
        const event = {
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
        expect(mockDynamoDB.put).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON input', async () => {
        // Arrange
        const event = {
            body: 'invalid-json'
        };

        // Act
        const response = await handler(event);

        // Assert
        expect(response.statusCode).toBe(500);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.action).toBe('error');
        expect(responseBody.data.error).toBe('Internal server error');
        expect(mockDynamoDB.put).not.toHaveBeenCalled();
    });

    it('should handle DynamoDB errors', async () => {
        // Arrange
        const event = {
            body: JSON.stringify({
                data: {
                    userAId: 'user123',
                    userBId: 'user456'
                }
            })
        };

        mockDynamoDB.promise.mockRejectedValueOnce(new Error('DynamoDB error'));

        // Act
        const response = await handler(event);

        // Assert
        expect(response.statusCode).toBe(500);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.action).toBe('error');
        expect(responseBody.data.error).toBe('Internal server error');
    });

    it('should sort chat participants for consistent chatId generation', async () => {
        // Arrange
        const userAId = 'user456'; // Higher value
        const userBId = 'user123'; // Lower value
        const event = {
            body: JSON.stringify({
                data: {
                    userAId,
                    userBId
                }
            })
        };

        mockDynamoDB.promise.mockResolvedValueOnce({});

        // Act
        const response = await handler(event);

        // Assert
        expect(response.statusCode).toBe(200);
        const responseBody = JSON.parse(response.body);
        expect(responseBody.data.chatId).toBe('user123#user456'); // Should be sorted
        expect(mockDynamoDB.put).toHaveBeenCalledWith(expect.objectContaining({
            Item: expect.objectContaining({
                PK: 'CHAT#user123#user456',
                chatId: 'user123#user456'
            })
        }));
    });
}); 
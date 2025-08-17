/**
 * Standardized WebSocket Test Utilities
 * 
 * This file provides consistent mocking patterns and utilities for WebSocket-related tests
 * to eliminate the inconsistencies between different test files.
 */

import { jest } from '@jest/globals';

// Mock WebSocket class for browser environment
export class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen({ type: 'open' });
      }
    }, 10);
  }

  send(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Store sent messages for testing
    MockWebSocket.sentMessages.push(data);
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason, type: 'close' });
    }
  }

  // Simulate receiving a message
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data, type: 'message' });
    }
  }

  // Simulate connection error
  simulateError(error) {
    if (this.onerror) {
      this.onerror({ error, type: 'error' });
    }
  }

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static sentMessages = [];

  static reset() {
    MockWebSocket.sentMessages = [];
  }
}

// Setup global WebSocket mock
export function setupWebSocketMock() {
  global.WebSocket = MockWebSocket;
  MockWebSocket.reset();
}

// Cleanup WebSocket mock
export function cleanupWebSocketMock() {
  delete global.WebSocket;
  MockWebSocket.reset();
}

// Standard AWS SDK mocks for consistency - returns mock functions that can be configured
export function createStandardAWSMocks() {
  // Use mockImplementation to avoid scope issues
  const mockDynamoGet = jest.fn();
  const mockDynamoUpdate = jest.fn();
  const mockDynamoPut = jest.fn();
  const mockDynamoQuery = jest.fn();
  const mockApiGatewayPost = jest.fn();

  return {
    mockDynamoGet,
    mockDynamoUpdate,
    mockDynamoPut,
    mockDynamoQuery,
    mockApiGatewayPost,
    
    // Helper to setup successful mocks
    setupSuccessfulMocks() {
      mockDynamoGet.mockReturnValue({
        promise: () => Promise.resolve({ Item: null })
      });
      
      mockDynamoUpdate.mockReturnValue({
        promise: () => Promise.resolve({})
      });
      
      mockDynamoPut.mockReturnValue({
        promise: () => Promise.resolve({})
      });
      
      mockDynamoQuery.mockReturnValue({
        promise: () => Promise.resolve({ Items: [] })
      });
      
      mockApiGatewayPost.mockReturnValue({
        promise: () => Promise.resolve({})
      });
    },

    // Helper to setup error mocks
    setupErrorMocks(errorType = 'ResourceNotFoundException') {
      const error = new Error(errorType);
      error.code = errorType;
      
      mockDynamoGet.mockReturnValue({
        promise: () => Promise.reject(error)
      });
    },

    // Helper to clear all mocks
    clearAllMocks() {
      mockDynamoGet.mockClear();
      mockDynamoUpdate.mockClear();
      mockDynamoPut.mockClear();
      mockDynamoQuery.mockClear();
      mockApiGatewayPost.mockClear();
    },

    // Helper to create AWS SDK mock configuration
    getAWSMockConfig() {
      return {
        DynamoDB: {
          DocumentClient: jest.fn(() => ({
            get: mockDynamoGet,
            update: mockDynamoUpdate,
            put: mockDynamoPut,
            query: mockDynamoQuery
          }))
        },
        ApiGatewayManagementApi: jest.fn(() => ({
          postToConnection: mockApiGatewayPost
        }))
      };
    }
  };
}

// Environment setup for WebSocket tests
export function setupWebSocketTestEnvironment() {
  // Set consistent environment variables
  process.env.AWS_REGION = 'us-east-1';
  process.env.USER_METADATA_TABLE = 'test-user-metadata-table';
  process.env.CONVERSATIONS_TABLE = 'test-conversations-table';
  process.env.MESSAGES_TABLE = 'test-messages-table';
  process.env.WEBSOCKET_API_URL = 'wss://test-api.execute-api.us-east-1.amazonaws.com/dev';
  process.env.NEXT_PUBLIC_WEBSOCKET_API_URL = 'wss://test-api.execute-api.us-east-1.amazonaws.com/dev';
  
  // Set up WebSocket mock
  setupWebSocketMock();
}

// Cleanup test environment
export function cleanupWebSocketTestEnvironment() {
  cleanupWebSocketMock();
}

// Helper to create consistent test events
export function createWebSocketEvent(action, data, connectionId = 'test-connection-123') {
  return {
    requestContext: {
      connectionId,
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      stage: 'dev'
    },
    body: JSON.stringify({
      action,
      data
    })
  };
}

// Helper to create mock user metadata
export function createMockUserMetadata(userId, connectionId, overrides = {}) {
  return {
    PK: `USER#${userId}`,
    userId,
    connectionId,
    chatId: null,
    ready: false,
    questionIndex: 0,
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

// Helper to create mock conversation
export function createMockConversation(chatId, participants = ['user1', 'user2'], overrides = {}) {
  return {
    PK: `CHAT#${chatId}`,
    chatId,
    participants,
    status: 'active',
    startTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    ...overrides
  };
}

// Helper to validate WebSocket responses
export function validateWebSocketResponse(response, expectedAction, expectedStatusCode = 200) {
  expect(response.statusCode).toBe(expectedStatusCode);
  
  if (expectedStatusCode >= 200 && expectedStatusCode < 300) {
    const body = JSON.parse(response.body);
    if (expectedAction) {
      expect(body.action || body.message).toBeDefined();
    }
    return body;
  } else {
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
    return body;
  }
}

// WebSocket connection state manager for tests
export class TestWebSocketStateManager {
  constructor() {
    this.connections = new Map();
    this.messages = [];
  }

  addConnection(connectionId, userId, chatId = null) {
    this.connections.set(connectionId, {
      userId,
      chatId,
      connected: true,
      lastActivity: new Date()
    });
  }

  removeConnection(connectionId) {
    this.connections.delete(connectionId);
  }

  addMessage(connectionId, message) {
    this.messages.push({
      connectionId,
      message,
      timestamp: new Date()
    });
  }

  getConnectionsForChat(chatId) {
    return Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.chatId === chatId)
      .map(([connId, _]) => connId);
  }

  reset() {
    this.connections.clear();
    this.messages = [];
  }
}

export default {
  MockWebSocket,
  setupWebSocketMock,
  cleanupWebSocketMock,
  createStandardAWSMocks,
  setupWebSocketTestEnvironment,
  cleanupWebSocketTestEnvironment,
  createWebSocketEvent,
  createMockUserMetadata,
  createMockConversation,
  validateWebSocketResponse,
  TestWebSocketStateManager
}; 
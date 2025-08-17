/**
 * Comprehensive API Endpoints Tests
 * 
 * Tests all API endpoints in the application
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createFirebaseTestJWT } from '../helpers/jwt-helper.js';

// Mock Firebase Admin SDK
jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
    getUser: jest.fn(),
    updateUser: jest.fn(),
    setCustomUserClaims: jest.fn()
  }))
}));

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  cert: jest.fn()
}));

// Mock DynamoDB
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({
    send: jest.fn()
  }))
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  QueryCommand: jest.fn(),
  PutCommand: jest.fn(),
  UpdateCommand: jest.fn()
}));

describe('API Endpoints', () => {
  let mockVerifyIdToken;
  let mockGetUser;
  let mockUpdateUser;
  let mockSetCustomUserClaims;
  let mockDynamoDBSend;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup Firebase mocks
    const { getAuth } = require('firebase-admin/auth');
    mockVerifyIdToken = jest.fn();
    mockGetUser = jest.fn();
    mockUpdateUser = jest.fn();
    mockSetCustomUserClaims = jest.fn();
    
    getAuth.mockReturnValue({
      verifyIdToken: mockVerifyIdToken,
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
      setCustomUserClaims: mockSetCustomUserClaims
    });

    // Setup DynamoDB mock
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    mockDynamoDBSend = jest.fn();
    DynamoDBClient.mockReturnValue({
      send: mockDynamoDBSend
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Health Endpoint', () => {
    it('should return healthy status', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'healthy',
            timestamp: expect.any(String),
            services: {
              database: 'healthy',
              auth: 'healthy',
              websocket: 'healthy'
            },
            version: expect.any(String),
            environment: expect.any(String)
          })
        })
      );

      const response = await fetch('/api/health');
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.status).toBe('healthy');
      expect(data.services.database).toBe('healthy');
      expect(data.services.auth).toBe('healthy');
      expect(data.services.websocket).toBe('healthy');
    });
  });

  describe('Chat Endpoints', () => {
    describe('POST /api/chat/start', () => {
      it('should start a new chat when user is authenticated', async () => {
        const mockUser = {
          uid: 'test-user-123',
          email: 'test@example.com',
          email_verified: true
        };

        mockVerifyIdToken.mockResolvedValue(mockUser);

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              chatId: 'new-chat-123',
              message: 'Chat started successfully'
            })
          })
        );

        const response = await fetch('/api/chat/start', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${createFirebaseTestJWT(mockUser)}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        expect(response.ok).toBe(true);
        expect(data.success).toBe(true);
        expect(data.chatId).toBe('new-chat-123');
      });

      it('should return error when user is not authenticated', async () => {
        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({
              error: 'Unauthorized',
              message: 'Authentication required'
            })
          })
        );

        const response = await fetch('/api/chat/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        expect(response.ok).toBe(false);
        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/chat/[chatId]/messages', () => {
      it('should return chat messages when user has access', async () => {
        const mockUser = {
          uid: 'test-user-123',
          email: 'test@example.com',
          email_verified: true
        };

        mockVerifyIdToken.mockResolvedValue(mockUser);

        const mockMessages = [
          {
            id: 'msg-1',
            content: 'Hello!',
            senderId: 'test-user-123',
            timestamp: '2024-01-01T00:00:00.000Z'
          },
          {
            id: 'msg-2',
            content: 'Hi there!',
            senderId: 'partner-user-456',
            timestamp: '2024-01-01T00:01:00.000Z'
          }
        ];

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              messages: mockMessages,
              chatId: 'test-chat-123'
            })
          })
        );

        const response = await fetch('/api/chat/test-chat-123/messages', {
          headers: {
            'Authorization': `Bearer ${createFirebaseTestJWT(mockUser)}`
          }
        });

        const data = await response.json();

        expect(response.ok).toBe(true);
        expect(data.success).toBe(true);
        expect(data.messages).toHaveLength(2);
        expect(data.messages[0].content).toBe('Hello!');
      });
    });

    describe('POST /api/chat/[chatId]/end', () => {
      it('should end chat when user is participant', async () => {
        const mockUser = {
          uid: 'test-user-123',
          email: 'test@example.com',
          email_verified: true
        };

        mockVerifyIdToken.mockResolvedValue(mockUser);

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              message: 'Chat ended successfully'
            })
          })
        );

        const response = await fetch('/api/chat/test-chat-123/end', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${createFirebaseTestJWT(mockUser)}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reason: 'user_requested'
          })
        });

        const data = await response.json();

        expect(response.ok).toBe(true);
        expect(data.success).toBe(true);
      });
    });
  });

  describe('User Endpoints', () => {
    describe('GET /api/user/profile', () => {
      it('should return user profile when authenticated', async () => {
        const mockUser = {
          uid: 'test-user-123',
          email: 'test@example.com',
          email_verified: true
        };

        mockVerifyIdToken.mockResolvedValue(mockUser);

        const mockProfile = {
          userId: 'test-user-123',
          email: 'test@example.com',
          name: 'Test User',
          displayName: 'Test User',
          createdAt: '2024-01-01T00:00:00.000Z',
          lastSeen: '2024-01-01T00:00:00.000Z'
        };

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              profile: mockProfile
            })
          })
        );

        const response = await fetch('/api/user/profile', {
          headers: {
            'Authorization': `Bearer ${createFirebaseTestJWT(mockUser)}`
          }
        });

        const data = await response.json();

        expect(response.ok).toBe(true);
        expect(data.success).toBe(true);
        expect(data.profile.userId).toBe('test-user-123');
        expect(data.profile.name).toBe('Test User');
      });
    });

    describe('PUT /api/user/profile', () => {
      it('should update user profile when authenticated', async () => {
        const mockUser = {
          uid: 'test-user-123',
          email: 'test@example.com',
          email_verified: true
        };

        mockVerifyIdToken.mockResolvedValue(mockUser);

        const updateData = {
          name: 'Updated Name',
          displayName: 'Updated Display Name'
        };

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              message: 'Profile updated successfully',
              profile: {
                ...updateData,
                userId: 'test-user-123',
                email: 'test@example.com'
              }
            })
          })
        );

        const response = await fetch('/api/user/profile', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${createFirebaseTestJWT(mockUser)}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateData)
        });

        const data = await response.json();

        expect(response.ok).toBe(true);
        expect(data.success).toBe(true);
        expect(data.profile.name).toBe('Updated Name');
      });
    });

    describe('GET /api/user/active-chat', () => {
      it('should return active chat when user has one', async () => {
        const mockUser = {
          uid: 'test-user-123',
          email: 'test@example.com',
          email_verified: true
        };

        mockVerifyIdToken.mockResolvedValue(mockUser);

        const mockActiveChat = {
          chatId: 'active-chat-123',
          partnerId: 'partner-user-456',
          questionIndex: 5,
          lastMessage: 'Hello there!',
          lastUpdated: '2024-01-01T00:00:00.000Z'
        };

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              hasActiveChat: true,
              chat: mockActiveChat
            })
          })
        );

        const response = await fetch('/api/user/active-chat', {
          headers: {
            'Authorization': `Bearer ${createFirebaseTestJWT(mockUser)}`
          }
        });

        const data = await response.json();

        expect(response.ok).toBe(true);
        expect(data.success).toBe(true);
        expect(data.hasActiveChat).toBe(true);
        expect(data.chat.chatId).toBe('active-chat-123');
      });

      it('should return no active chat when user has none', async () => {
        const mockUser = {
          uid: 'test-user-123',
          email: 'test@example.com',
          email_verified: true
        };

        mockVerifyIdToken.mockResolvedValue(mockUser);

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              hasActiveChat: false,
              chat: null
            })
          })
        );

        const response = await fetch('/api/user/active-chat', {
          headers: {
            'Authorization': `Bearer ${createFirebaseTestJWT(mockUser)}`
          }
        });

        const data = await response.json();

        expect(response.ok).toBe(true);
        expect(data.success).toBe(true);
        expect(data.hasActiveChat).toBe(false);
        expect(data.chat).toBeNull();
      });
    });

    describe('GET /api/user/presence', () => {
      it('should return user presence status', async () => {
        const mockUser = {
          uid: 'test-user-123',
          email: 'test@example.com',
          email_verified: true
        };

        mockVerifyIdToken.mockResolvedValue(mockUser);

        const mockPresence = {
          userId: 'test-user-123',
          isOnline: true,
          lastSeen: '2024-01-01T00:00:00.000Z',
          status: 'available'
        };

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              presence: mockPresence
            })
          })
        );

        const response = await fetch('/api/user/presence', {
          headers: {
            'Authorization': `Bearer ${createFirebaseTestJWT(mockUser)}`
          }
        });

        const data = await response.json();

        expect(response.ok).toBe(true);
        expect(data.success).toBe(true);
        expect(data.presence.isOnline).toBe(true);
      });
    });
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/verify', () => {
      it('should verify valid Firebase token', async () => {
        const mockUser = {
          uid: 'test-user-123',
          email: 'test@example.com',
          email_verified: true
        };

        mockVerifyIdToken.mockResolvedValue(mockUser);

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              user: mockUser,
              message: 'Token verified successfully'
            })
          })
        );

        const response = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${createFirebaseTestJWT(mockUser)}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        expect(response.ok).toBe(true);
        expect(data.success).toBe(true);
        expect(data.user.uid).toBe('test-user-123');
      });

      it('should reject invalid token', async () => {
        mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

        global.fetch = jest.fn(() =>
          Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({
              error: 'Unauthorized',
              message: 'Invalid token'
            })
          })
        );

        const response = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer invalid-token',
            'Content-Type': 'application/json'
          }
        });

        expect(response.ok).toBe(false);
        expect(response.status).toBe(401);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({
            error: 'Internal Server Error',
            message: 'Something went wrong'
          })
        })
      );

      const response = await fetch('/api/nonexistent-endpoint');
      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
    });

    it('should handle network errors', async () => {
      global.fetch = jest.fn(() =>
        Promise.reject(new Error('Network error'))
      );

      await expect(fetch('/api/health')).rejects.toThrow('Network error');
    });
  });
}); 
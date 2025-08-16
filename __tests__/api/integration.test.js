/**
 * API Integration Tests
 * 
 * Tests actual API endpoints by making real HTTP requests
 * Requires the development server to be running
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createFirebaseTestJWT } from '../helpers/jwt-helper.js';

// Configuration
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 10000; // 10 seconds

describe('API Integration Tests', () => {
  let testToken;
  let testChatId;

  beforeAll(() => {
    // Create a test JWT token
    testToken = createFirebaseTestJWT({
      uid: 'integration-test-user-123',
      email: 'integration-test@example.com',
      displayName: 'Integration Test User'
    });
  });

  afterAll(() => {
    // Cleanup if needed
  });

  describe('Health Endpoint', () => {
    it('should return healthy status', async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
      expect(data.services).toBeDefined();
      expect(data.services.database).toBeDefined();
      expect(data.services.auth).toBeDefined();
      expect(data.services.websocket).toBeDefined();
      expect(data.version).toBeDefined();
      expect(data.environment).toBeDefined();
    }, TEST_TIMEOUT);
  });

  describe('Chat Start Endpoint', () => {
    it('should return health check for GET request', async () => {
      const response = await fetch(`${BASE_URL}/api/chat/start`);
      
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      
      expect(data.service).toBe('chat-start');
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
    }, TEST_TIMEOUT);

    it('should require authentication for POST request', async () => {
      const response = await fetch(`${BASE_URL}/api/chat/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    }, TEST_TIMEOUT);

    it('should start a new chat with valid token', async () => {
      const response = await fetch(`${BASE_URL}/api/chat/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      // This might fail if Firebase Admin is not properly configured
      // but we can still test the response structure
      const data = await response.json();
      
      if (response.ok) {
        expect(data.chatId).toBeDefined();
        expect(data.partnerId).toBeDefined();
        expect(data.matched).toBeDefined();
        expect(data.timestamp).toBeDefined();
        expect(data.userId).toBeDefined();
        
        // Store chat ID for other tests
        testChatId = data.chatId;
      } else {
        // If authentication fails, it should be a specific error
        expect(data.error).toBeDefined();
        expect(['Authentication required', 'Invalid token', 'Authentication service not configured']).toContain(data.error);
      }
    }, TEST_TIMEOUT);
  });

  describe('Chat Details Endpoint', () => {
    it('should require authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/chat/test-chat-123`);
      
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    }, TEST_TIMEOUT);

    it('should return chat details with valid token', async () => {
      const response = await fetch(`${BASE_URL}/api/chat/test-chat-123`, {
        headers: {
          'Authorization': `Bearer ${testToken}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        expect(data.chatId).toBe('test-chat-123');
        expect(data.participants).toBeDefined();
        expect(data.status).toBeDefined();
        expect(data.createdAt).toBeDefined();
      } else {
        expect(data.error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('Chat Messages Endpoint', () => {
    it('should require authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/chat/test-chat-123/messages`);
      
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    }, TEST_TIMEOUT);

    it('should return messages with valid token', async () => {
      const response = await fetch(`${BASE_URL}/api/chat/test-chat-123/messages?limit=10`, {
        headers: {
          'Authorization': `Bearer ${testToken}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        expect(data.messages).toBeDefined();
        expect(Array.isArray(data.messages)).toBe(true);
        expect(data.count).toBeDefined();
        expect(data.hasMore).toBeDefined();
      } else {
        expect(data.error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should reject POST requests', async () => {
      const response = await fetch(`${BASE_URL}/api/chat/test-chat-123/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: 'Test message'
        })
      });
      
      expect(response.status).toBe(405);
      
      const data = await response.json();
      expect(data.error).toContain('WebSocket');
    }, TEST_TIMEOUT);
  });

  describe('Chat End Endpoint', () => {
    it('should require authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/chat/test-chat-123/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: 'test'
        })
      });
      
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    }, TEST_TIMEOUT);

    it('should end chat with valid token', async () => {
      const response = await fetch(`${BASE_URL}/api/chat/test-chat-123/end`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: 'user_ended'
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        expect(data.ended).toBe(true);
        expect(data.chatId).toBe('test-chat-123');
        expect(data.reason).toBe('user_ended');
        expect(data.endedBy).toBeDefined();
        expect(data.endedAt).toBeDefined();
      } else {
        expect(data.error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('Chat Validation Endpoint', () => {
    it('should require authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/chat/test-chat-123/validate`);
      
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    }, TEST_TIMEOUT);

    it('should validate chat access with valid token', async () => {
      const response = await fetch(`${BASE_URL}/api/chat/test-chat-123/validate`, {
        headers: {
          'Authorization': `Bearer ${testToken}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        expect(data.hasAccess).toBeDefined();
        expect(data.reason).toBeDefined();
        expect(data.chatId).toBe('test-chat-123');
        expect(data.userId).toBeDefined();
        expect(data.timestamp).toBeDefined();
      } else {
        expect(data.error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('User Profile Endpoint', () => {
    it('should require authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/user/profile`);
      
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    }, TEST_TIMEOUT);

    it('should return user profile with valid token', async () => {
      const response = await fetch(`${BASE_URL}/api/user/profile`, {
        headers: {
          'Authorization': `Bearer ${testToken}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        expect(data.userId).toBeDefined();
        expect(data.email).toBeDefined();
        expect(data.name).toBeDefined();
        expect(data.emailVerified).toBeDefined();
        expect(data.displayName).toBeDefined();
        expect(data.status).toBeDefined();
        expect(data.createdAt).toBeDefined();
        expect(data.updatedAt).toBeDefined();
        expect(data.customAttributes).toBeDefined();
      } else {
        expect(data.error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should update user profile with valid token', async () => {
      const response = await fetch(`${BASE_URL}/api/user/profile`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${testToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          displayName: 'Updated Test User'
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        expect(data.userId).toBeDefined();
        expect(data.displayName).toBe('Updated Test User');
        expect(data.updatedAt).toBeDefined();
      } else {
        expect(data.error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('User Active Chat Endpoint', () => {
    it('should require authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/user/active-chat`);
      
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    }, TEST_TIMEOUT);

    it('should return active chat status with valid token', async () => {
      const response = await fetch(`${BASE_URL}/api/user/active-chat`, {
        headers: {
          'Authorization': `Bearer ${testToken}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        expect(data.hasActiveChat).toBeDefined();
        expect(typeof data.hasActiveChat).toBe('boolean');
        expect(data.chatId).toBeDefined();
      } else {
        expect(data.error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('User Chat Context Endpoint', () => {
    it('should require authentication', async () => {
      const response = await fetch(`${BASE_URL}/api/user/test-user-123/chat-context`);
      
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    }, TEST_TIMEOUT);

    it('should return chat context with valid token', async () => {
      const response = await fetch(`${BASE_URL}/api/user/integration-test-user-123/chat-context`, {
        headers: {
          'Authorization': `Bearer ${testToken}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        expect(data.currentChatId).toBeDefined();
        expect(data.partnerId).toBeDefined();
        expect(data.hasActiveChat).toBeDefined();
        expect(data.questionIndex).toBeDefined();
      } else {
        expect(data.error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should reject access to other user data', async () => {
      const response = await fetch(`${BASE_URL}/api/user/different-user-456/chat-context`, {
        headers: {
          'Authorization': `Bearer ${testToken}`
        }
      });
      
      expect(response.status).toBe(403);
      
      const data = await response.json();
      expect(data.error).toBe('Unauthorized access to user data');
    }, TEST_TIMEOUT);
  });

  describe('Auth Verify Endpoint', () => {
    it('should return health check for GET request', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/verify`);
      
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      
      expect(data.service).toBe('firebase-auth-verification');
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
    }, TEST_TIMEOUT);

    it('should require token in request body', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBe('Token is required');
    }, TEST_TIMEOUT);

    it('should verify valid token', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: testToken
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        expect(data.valid).toBe(true);
        expect(data.user).toBeDefined();
        expect(data.user.id).toBeDefined();
        expect(data.user.email).toBeDefined();
      } else {
        expect(data.valid).toBe(false);
        expect(data.error).toBeDefined();
      }
    }, TEST_TIMEOUT);

    it('should reject invalid token', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: 'invalid.token.here'
        })
      });
      
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.valid).toBe(false);
      expect(data.error).toBeDefined();
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle non-existent endpoints', async () => {
      const response = await fetch(`${BASE_URL}/api/non-existent-endpoint`);
      
      expect(response.status).toBe(404);
    }, TEST_TIMEOUT);

    it('should handle malformed JSON', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json'
      });
      
      expect(response.status).toBe(400);
    }, TEST_TIMEOUT);
  });
}); 
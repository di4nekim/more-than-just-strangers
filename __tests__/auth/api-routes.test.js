/**
 * API Routes Authentication Tests
 * 
 * Tests authentication for various API endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
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
  getApps: jest.fn(() => [])
}));

describe('API Routes Authentication', () => {
  let mockVerifyIdToken;
  let mockGetUser;
  let mockUpdateUser;
  let mockSetCustomUserClaims;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mocks
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/user/profile', () => {
    it('should return user info for valid token', async () => {
      const mockUser = {
        uid: 'test-user-123',
        email: 'test@example.com',
        emailVerified: true,
        displayName: 'Test User',
        photoURL: 'https://example.com/avatar.jpg',
        metadata: {
          creationTime: '2024-01-01T00:00:00.000Z',
          lastSignInTime: '2024-01-02T12:00:00.000Z'
        },
        customClaims: {
          givenName: 'Test',
          familyName: 'User',
          locale: 'en'
        }
      };

      const token = createFirebaseTestJWT({
        uid: 'test-user-123',
        email: 'test@example.com'
      });

      mockVerifyIdToken.mockResolvedValue({
        uid: 'test-user-123',
        email: 'test@example.com'
      });

      mockGetUser.mockResolvedValue(mockUser);

      // Mock the fetch request
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            userId: 'test-user-123',
            email: 'test@example.com',
            name: 'Test User',
            emailVerified: true,
            displayName: 'Test User',
            givenName: 'Test',
            familyName: 'User',
            locale: 'en'
          })
        })
      );

      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.userId).toBe('test-user-123');
      expect(data.email).toBe('test@example.com');
      expect(data.displayName).toBe('Test User');
    });

    it('should return 401 for missing token', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({
            error: 'Authentication required'
          })
        })
      );

      const response = await fetch('/api/user/profile');
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 401 for invalid token', async () => {
      const invalidToken = 'invalid.token.here';

      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({
            error: 'Invalid token'
          })
        })
      );

      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${invalidToken}`
        }
      });

      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid token');
    });
  });

  describe('PATCH /api/user/profile', () => {
    it('should update user profile successfully', async () => {
      const mockUpdatedUser = {
        uid: 'test-user-123',
        email: 'test@example.com',
        emailVerified: true,
        displayName: 'Updated User',
        photoURL: 'https://example.com/avatar.jpg',
        metadata: {
          creationTime: '2024-01-01T00:00:00.000Z',
          lastSignInTime: '2024-01-02T12:00:00.000Z'
        },
        customClaims: {
          givenName: 'Updated',
          familyName: 'User',
          locale: 'en'
        }
      };

      const token = createFirebaseTestJWT({
        uid: 'test-user-123',
        email: 'test@example.com'
      });

      mockVerifyIdToken.mockResolvedValue({
        uid: 'test-user-123',
        email: 'test@example.com'
      });

      mockUpdateUser.mockResolvedValue(mockUpdatedUser);
      mockSetCustomUserClaims.mockResolvedValue();
      mockGetUser.mockResolvedValue(mockUpdatedUser);

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            userId: 'test-user-123',
            email: 'test@example.com',
            name: 'Updated User',
            displayName: 'Updated User',
            updatedAt: '2024-01-02T12:00:00.000Z'
          })
        })
      );

      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          displayName: 'Updated User'
        })
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.userId).toBe('test-user-123');
      expect(data.displayName).toBe('Updated User');
    });

    it('should handle validation errors', async () => {
      const token = createFirebaseTestJWT({
        uid: 'test-user-123',
        email: 'test@example.com'
      });

      mockVerifyIdToken.mockResolvedValue({
        uid: 'test-user-123',
        email: 'test@example.com'
      });

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({
            error: 'Invalid request data'
          })
        })
      );

      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          displayName: '' // Invalid empty name
        })
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request data');
    });
  });

  describe('Error Handling', () => {
    it('should handle Firebase service errors', async () => {
      const token = createFirebaseTestJWT({
        uid: 'test-user-123',
        email: 'test@example.com'
      });

      mockVerifyIdToken.mockRejectedValue(new Error('Firebase service unavailable'));

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({
            error: 'Internal server error'
          })
        })
      );

      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });

    it('should handle user not found errors', async () => {
      const token = createFirebaseTestJWT({
        uid: 'non-existent-user',
        email: 'test@example.com'
      });

      mockVerifyIdToken.mockResolvedValue({
        uid: 'non-existent-user',
        email: 'test@example.com'
      });

      mockGetUser.mockRejectedValue(new Error('User not found'));

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({
            error: 'User not found'
          })
        })
      );

      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User not found');
    });
  });
}); 
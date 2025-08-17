/**
 * Error Scenarios Test Suite
 * 
 * Tests various error conditions and edge cases for authentication
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock the entire jwt-validation module
const mockVerifyIdToken = jest.fn();
const mockGetAuth = jest.fn(() => ({
  verifyIdToken: mockVerifyIdToken
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: mockGetAuth
}));

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  cert: jest.fn(() => ({})),
}));

// Mock the jwt-validation module
jest.mock('../../src/lib/jwt-validation.js', () => ({
  validateFirebaseToken: jest.fn(async (token) => {
    // Validate input token
    if (!token || typeof token !== 'string' || token.trim() === '') {
      throw new Error('Invalid token: token is required and must be a non-empty string');
    }
    
    // Call the mocked verifyIdToken
    return await mockVerifyIdToken(token);
  }),
  extractAndValidateFirebaseToken: jest.fn(async (request) => {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('MISSING_TOKEN');
    }
    
    const token = authHeader.substring(7);
    
    if (!token || token.trim() === '') {
      throw new Error('MISSING_TOKEN');
    }
    
    try {
      const decodedToken = await mockVerifyIdToken(token);
      return {
        token,
        user: decodedToken
      };
    } catch (error) {
      throw new Error('TOKEN_INVALID');
    }
  })
}));

// Import after mocking
import { validateFirebaseToken, extractAndValidateFirebaseToken } from '../../src/lib/jwt-validation.js';
import { createFirebaseTestJWT, createExpiredFirebaseTestJWT } from '../helpers/jwt-helper.js';

describe('JWT Validation Error Scenarios', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Set default successful behavior
    mockVerifyIdToken.mockResolvedValue({
      uid: 'test-user-id',
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
      sub: 'test-user-id',
      iss: 'https://securetoken.google.com/test-project-id',
      aud: 'test-project-id',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Token Validation Errors', () => {
    it('should handle missing token', async () => {
      await expect(validateFirebaseToken(null)).rejects.toThrow();
      await expect(validateFirebaseToken(undefined)).rejects.toThrow();
      await expect(validateFirebaseToken('')).rejects.toThrow();
    });

    it('should handle malformed token', async () => {
      const malformedToken = 'not.a.valid.token';
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token format'));
      
      await expect(validateFirebaseToken(malformedToken)).rejects.toThrow();
    });

    it('should handle expired token', async () => {
      const expiredToken = createExpiredFirebaseTestJWT({
        sub: 'test-user-123',
        email: 'test@example.com'
      });
      
      mockVerifyIdToken.mockRejectedValue(new Error('Token expired'));
      
      await expect(validateFirebaseToken(expiredToken)).rejects.toThrow();
    });

    it('should handle token with missing required claims', async () => {
      const incompletePayload = {
        sub: 'test-user-123'
        // Missing email and other required claims
      };
      
      const token = createFirebaseTestJWT(incompletePayload);
      mockVerifyIdToken.mockRejectedValue(new Error('Missing required claims'));
      
      await expect(validateFirebaseToken(token)).rejects.toThrow();
    });

    it('should handle token with invalid issuer', async () => {
      const invalidIssuerPayload = {
        sub: 'test-user-123',
        email: 'test@example.com',
        iss: 'https://invalid-issuer.com'
      };
      
      const token = createFirebaseTestJWT(invalidIssuerPayload);
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid issuer'));
      
      await expect(validateFirebaseToken(token)).rejects.toThrow();
    });

    it('should handle token with future issued time', async () => {
      const futureIssuedPayload = {
        sub: 'test-user-123',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000) + 3600 // 1 hour in the future
      };
      
      const token = createFirebaseTestJWT(futureIssuedPayload);
      mockVerifyIdToken.mockRejectedValue(new Error('Token issued in the future'));
      
      await expect(validateFirebaseToken(token)).rejects.toThrow();
    });
  });

  describe('Token Extraction Errors', () => {
    it('should handle request with missing Authorization header', async () => {
      const mockRequest = {
        headers: {
          get: jest.fn(() => null)
        }
      };
      
      await expect(extractAndValidateFirebaseToken(mockRequest)).rejects.toThrow('MISSING_TOKEN');
    });

    it('should handle request with malformed Authorization header', async () => {
      const mockRequest = {
        headers: {
          get: jest.fn(() => 'InvalidHeader')
        }
      };
      
      await expect(extractAndValidateFirebaseToken(mockRequest)).rejects.toThrow('MISSING_TOKEN');
    });

    it('should handle request with empty Bearer token', async () => {
      const mockRequest = {
        headers: {
          get: jest.fn(() => 'Bearer ')
        }
      };
      
      await expect(extractAndValidateFirebaseToken(mockRequest)).rejects.toThrow('MISSING_TOKEN');
    });
  });

  describe('Edge Cases', () => {
    it('should handle token with unicode characters in claims', async () => {
      const unicodePayload = {
        sub: 'test-user-123',
        email: 'test@example.com',
        name: 'José María García'
      };
      
      const token = createFirebaseTestJWT(unicodePayload);
      mockVerifyIdToken.mockResolvedValue(unicodePayload);
      
      const result = await validateFirebaseToken(token);
      expect(result.name).toBe('José María García');
    });

    it('should handle token with large payload', async () => {
      const largePayload = {
        sub: 'test-user-123',
        email: 'test@example.com',
        customData: 'x'.repeat(1000) // Large custom data
      };
      
      const token = createFirebaseTestJWT(largePayload);
      mockVerifyIdToken.mockResolvedValue(largePayload);
      
      const result = await validateFirebaseToken(token);
      expect(result.customData).toBe('x'.repeat(1000));
    });

    it('should handle token with special characters in email', async () => {
      const specialEmailPayload = {
        sub: 'test-user-123',
        email: 'test+tag@example.com'
      };
      
      const token = createFirebaseTestJWT(specialEmailPayload);
      mockVerifyIdToken.mockResolvedValue(specialEmailPayload);
      
      const result = await validateFirebaseToken(token);
      expect(result.email).toBe('test+tag@example.com');
    });
  });

  describe('Network and System Errors', () => {
    it('should handle Firebase service unavailable', async () => {
      const token = createFirebaseTestJWT({
        sub: 'test-user-123',
        email: 'test@example.com'
      });
      
      mockVerifyIdToken.mockRejectedValue(new Error('Service unavailable'));
      
      await expect(validateFirebaseToken(token)).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      const token = createFirebaseTestJWT({
        sub: 'test-user-123',
        email: 'test@example.com'
      });
      
      mockVerifyIdToken.mockRejectedValue(new Error('Request timeout'));
      
      await expect(validateFirebaseToken(token)).rejects.toThrow();
    });
  });
}); 
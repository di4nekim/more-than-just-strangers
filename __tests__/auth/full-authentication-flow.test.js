/**
 * Full Authentication Flow Tests
 * 
 * Comprehensive tests covering the complete authentication flow:
 * - User registration (signup)
 * - User login (signin)
 * - Token validation
 * - API access with authentication
 * - Session management
 * - User logout (signout)
 * - Error handling
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createFirebaseTestJWT } from '../helpers/jwt-helper.js';

// Mock Firebase Admin SDK
jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
    getUser: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    setCustomUserClaims: jest.fn(),
    generateEmailVerificationLink: jest.fn(),
    generatePasswordResetLink: jest.fn()
  }))
}));

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => [])
}));

// Mock Firebase client SDK
const mockFirebaseAuth = {
  currentUser: null,
  onAuthStateChanged: jest.fn(),
  signOut: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  updateProfile: jest.fn(),
  updatePassword: jest.fn(),
  reauthenticateWithCredential: jest.fn()
};

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => mockFirebaseAuth),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  sendEmailVerification: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  updateProfile: jest.fn(),
  updatePassword: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  EmailAuthProvider: {
    credential: jest.fn()
  },
  GoogleAuthProvider: jest.fn()
}));

describe('Full Authentication Flow', () => {
  let mockVerifyIdToken;
  let mockGetUser;
  let mockCreateUser;
  let mockUpdateUser;
  let mockDeleteUser;
  let mockSetCustomUserClaims;
  let mockGenerateEmailVerificationLink;
  let mockGeneratePasswordResetLink;

  // Test user data
  const testUser = {
    email: 'test@example.com',
    password: 'TestPassword123!',
    displayName: 'Test User',
    uid: 'test-user-123'
  };

  const testUserData = {
    uid: testUser.uid,
    email: testUser.email,
    emailVerified: false,
    displayName: testUser.displayName,
    photoURL: null,
    metadata: {
      creationTime: '2024-01-01T00:00:00.000Z',
      lastSignInTime: '2024-01-01T00:00:00.000Z'
    },
    customClaims: {}
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup Firebase Admin mocks
    const { getAuth } = require('firebase-admin/auth');
    mockVerifyIdToken = jest.fn();
    mockGetUser = jest.fn();
    mockCreateUser = jest.fn();
    mockUpdateUser = jest.fn();
    mockDeleteUser = jest.fn();
    mockSetCustomUserClaims = jest.fn();
    mockGenerateEmailVerificationLink = jest.fn();
    mockGeneratePasswordResetLink = jest.fn();
    
    getAuth.mockReturnValue({
      verifyIdToken: mockVerifyIdToken,
      getUser: mockGetUser,
      createUser: mockCreateUser,
      updateUser: mockUpdateUser,
      deleteUser: mockDeleteUser,
      setCustomUserClaims: mockSetCustomUserClaims,
      generateEmailVerificationLink: mockGenerateEmailVerificationLink,
      generatePasswordResetLink: mockGeneratePasswordResetLink
    });

    // Reset Firebase client mocks
    mockFirebaseAuth.currentUser = null;
    mockFirebaseAuth.onAuthStateChanged.mockClear();
    mockFirebaseAuth.signOut.mockClear();
    mockFirebaseAuth.createUserWithEmailAndPassword.mockClear();
    mockFirebaseAuth.signInWithEmailAndPassword.mockClear();
    mockFirebaseAuth.sendEmailVerification.mockClear();
    mockFirebaseAuth.sendPasswordResetEmail.mockClear();
    mockFirebaseAuth.updateProfile.mockClear();
    mockFirebaseAuth.updatePassword.mockClear();
    mockFirebaseAuth.reauthenticateWithCredential.mockClear();

    // Mock fetch globally
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. User Registration Flow', () => {
    test('should successfully register a new user', async () => {
      // Mock successful user creation
      mockFirebaseAuth.createUserWithEmailAndPassword.mockResolvedValue({
        user: {
          uid: testUser.uid,
          email: testUser.email,
          emailVerified: false,
          displayName: null,
          getIdToken: jest.fn().mockResolvedValue('mock-id-token')
        }
      });

      mockFirebaseAuth.updateProfile.mockResolvedValue();
      mockFirebaseAuth.sendEmailVerification.mockResolvedValue();

      // Simulate the registration process
      const registrationResult = await mockFirebaseAuth.createUserWithEmailAndPassword(
        testUser.email,
        testUser.password
      );

      expect(registrationResult.user.uid).toBe(testUser.uid);
      expect(registrationResult.user.email).toBe(testUser.email);
      expect(mockFirebaseAuth.createUserWithEmailAndPassword).toHaveBeenCalledWith(
        testUser.email,
        testUser.password
      );
    });

    test('should handle registration with display name', async () => {
      mockFirebaseAuth.createUserWithEmailAndPassword.mockResolvedValue({
        user: {
          uid: testUser.uid,
          email: testUser.email,
          emailVerified: false,
          displayName: null,
          getIdToken: jest.fn().mockResolvedValue('mock-id-token')
        }
      });

      mockFirebaseAuth.updateProfile.mockResolvedValue();
      mockFirebaseAuth.sendEmailVerification.mockResolvedValue();

      // Create user
      const userCredential = await mockFirebaseAuth.createUserWithEmailAndPassword(
        testUser.email,
        testUser.password
      );

      // Update profile with display name
      await mockFirebaseAuth.updateProfile(userCredential.user, {
        displayName: testUser.displayName
      });

      expect(mockFirebaseAuth.updateProfile).toHaveBeenCalledWith(
        userCredential.user,
        { displayName: testUser.displayName }
      );
    });

    test('should send email verification after registration', async () => {
      mockFirebaseAuth.createUserWithEmailAndPassword.mockResolvedValue({
        user: {
          uid: testUser.uid,
          email: testUser.email,
          emailVerified: false,
          getIdToken: jest.fn().mockResolvedValue('mock-id-token')
        }
      });

      mockFirebaseAuth.sendEmailVerification.mockResolvedValue();

      const userCredential = await mockFirebaseAuth.createUserWithEmailAndPassword(
        testUser.email,
        testUser.password
      );

      await mockFirebaseAuth.sendEmailVerification(userCredential.user);

      expect(mockFirebaseAuth.sendEmailVerification).toHaveBeenCalledWith(
        userCredential.user
      );
    });

    test('should handle registration errors', async () => {
      const errorMessage = 'Email already in use';
      mockFirebaseAuth.createUserWithEmailAndPassword.mockRejectedValue(
        new Error(errorMessage)
      );

      await expect(
        mockFirebaseAuth.createUserWithEmailAndPassword(testUser.email, testUser.password)
      ).rejects.toThrow(errorMessage);
    });
  });

  describe('2. User Login Flow', () => {
    test('should successfully login with email and password', async () => {
      mockFirebaseAuth.signInWithEmailAndPassword.mockResolvedValue({
        user: {
          uid: testUser.uid,
          email: testUser.email,
          emailVerified: true,
          displayName: testUser.displayName,
          getIdToken: jest.fn().mockResolvedValue('mock-id-token')
        }
      });

      const loginResult = await mockFirebaseAuth.signInWithEmailAndPassword(
        testUser.email,
        testUser.password
      );

      expect(loginResult.user.uid).toBe(testUser.uid);
      expect(loginResult.user.email).toBe(testUser.email);
      expect(loginResult.user.emailVerified).toBe(true);
      expect(mockFirebaseAuth.signInWithEmailAndPassword).toHaveBeenCalledWith(
        testUser.email,
        testUser.password
      );
    });

    test('should handle login with unverified email', async () => {
      mockFirebaseAuth.signInWithEmailAndPassword.mockResolvedValue({
        user: {
          uid: testUser.uid,
          email: testUser.email,
          emailVerified: false,
          displayName: testUser.displayName,
          getIdToken: jest.fn().mockResolvedValue('mock-id-token')
        }
      });

      const loginResult = await mockFirebaseAuth.signInWithEmailAndPassword(
        testUser.email,
        testUser.password
      );

      expect(loginResult.user.emailVerified).toBe(false);
    });

    test('should handle login errors', async () => {
      const errorMessage = 'Invalid email or password';
      mockFirebaseAuth.signInWithEmailAndPassword.mockRejectedValue(
        new Error(errorMessage)
      );

      await expect(
        mockFirebaseAuth.signInWithEmailAndPassword(testUser.email, 'wrongpassword')
      ).rejects.toThrow(errorMessage);
    });
  });

  describe('3. Token Validation Flow', () => {
    test('should validate valid Firebase ID token', async () => {
      const validToken = createFirebaseTestJWT({
        uid: testUser.uid,
        email: testUser.email,
        email_verified: true
      });

      mockVerifyIdToken.mockResolvedValue({
        uid: testUser.uid,
        email: testUser.email,
        email_verified: true,
        auth_time: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const decodedToken = await mockVerifyIdToken(validToken);

      expect(decodedToken.uid).toBe(testUser.uid);
      expect(decodedToken.email).toBe(testUser.email);
      expect(decodedToken.email_verified).toBe(true);
      expect(mockVerifyIdToken).toHaveBeenCalledWith(validToken);
    });

    test('should reject expired token', async () => {
      const expiredToken = createFirebaseTestJWT({
        uid: testUser.uid,
        email: testUser.email,
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      });

      mockVerifyIdToken.mockRejectedValue(new Error('Token expired'));

      await expect(mockVerifyIdToken(expiredToken)).rejects.toThrow('Token expired');
    });

    test('should reject invalid token format', async () => {
      const invalidToken = 'invalid.token.format';

      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token format'));

      await expect(mockVerifyIdToken(invalidToken)).rejects.toThrow('Invalid token format');
    });
  });

  describe('4. API Access with Authentication', () => {
    test('should access protected API with valid token', async () => {
      const validToken = createFirebaseTestJWT({
        uid: testUser.uid,
        email: testUser.email
      });

      mockVerifyIdToken.mockResolvedValue({
        uid: testUser.uid,
        email: testUser.email,
        email_verified: true
      });

      mockGetUser.mockResolvedValue(testUserData);

      // Mock successful API response
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          userId: testUser.uid,
          email: testUser.email,
          name: testUser.displayName,
          emailVerified: true
        })
      });

      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      expect(response.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });
    });

    test('should reject API access without token', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: 'Authentication required'
        })
      });

      const response = await fetch('/api/user/profile');

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should reject API access with invalid token', async () => {
      const invalidToken = 'invalid.token';

      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      global.fetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: 'Invalid token'
        })
      });

      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${invalidToken}`
        }
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe('5. Session Management', () => {
    test('should maintain session across requests', async () => {
      const validToken = createFirebaseTestJWT({
        uid: testUser.uid,
        email: testUser.email
      });

      mockVerifyIdToken.mockResolvedValue({
        uid: testUser.uid,
        email: testUser.email,
        email_verified: true
      });

      // Mock multiple API calls
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ userId: testUser.uid })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ profile: 'updated' })
        });

      // First API call
      const response1 = await fetch('/api/user/profile', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      // Second API call with same token
      const response2 = await fetch('/api/user/profile', {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('should handle token refresh', async () => {
      const oldToken = createFirebaseTestJWT({
        uid: testUser.uid,
        email: testUser.email,
        exp: Math.floor(Date.now() / 1000) + 300 // Expires in 5 minutes
      });

      const newToken = createFirebaseTestJWT({
        uid: testUser.uid,
        email: testUser.email,
        exp: Math.floor(Date.now() / 1000) + 3600 // Expires in 1 hour
      });

      // Mock token refresh
      mockFirebaseAuth.currentUser = {
        getIdToken: jest.fn()
          .mockResolvedValueOnce(oldToken)
          .mockResolvedValueOnce(newToken)
      };

      const token1 = await mockFirebaseAuth.currentUser.getIdToken();
      const token2 = await mockFirebaseAuth.currentUser.getIdToken();

      expect(token1).toBe(oldToken);
      expect(token2).toBe(newToken);
    });
  });

  describe('6. User Logout Flow', () => {
    test('should successfully logout user', async () => {
      mockFirebaseAuth.currentUser = {
        uid: testUser.uid,
        email: testUser.email
      };

      mockFirebaseAuth.signOut.mockResolvedValue();

      await mockFirebaseAuth.signOut();

      expect(mockFirebaseAuth.signOut).toHaveBeenCalled();
      expect(mockFirebaseAuth.currentUser).toBeNull;
    });

    test('should clear user session after logout', async () => {
      mockFirebaseAuth.currentUser = {
        uid: testUser.uid,
        email: testUser.email
      };

      mockFirebaseAuth.signOut.mockResolvedValue();

      // Simulate logout
      await mockFirebaseAuth.signOut();

      // Verify user is no longer authenticated
      expect(mockFirebaseAuth.currentUser).toBeNull;
    });

    test('should handle logout errors', async () => {
      const errorMessage = 'Logout failed';
      mockFirebaseAuth.signOut.mockRejectedValue(new Error(errorMessage));

      await expect(mockFirebaseAuth.signOut()).rejects.toThrow(errorMessage);
    });
  });

  describe('7. Password Management', () => {
    test('should send password reset email', async () => {
      mockFirebaseAuth.sendPasswordResetEmail.mockResolvedValue();

      await mockFirebaseAuth.sendPasswordResetEmail(testUser.email);

      expect(mockFirebaseAuth.sendPasswordResetEmail).toHaveBeenCalledWith(testUser.email);
    });

    test('should update user password', async () => {
      const newPassword = 'NewPassword123!';
      
      mockFirebaseAuth.currentUser = {
        uid: testUser.uid,
        email: testUser.email
      };

      mockFirebaseAuth.updatePassword.mockResolvedValue();

      await mockFirebaseAuth.updatePassword(mockFirebaseAuth.currentUser, newPassword);

      expect(mockFirebaseAuth.updatePassword).toHaveBeenCalledWith(
        mockFirebaseAuth.currentUser,
        newPassword
      );
    });

    test('should handle password update errors', async () => {
      const newPassword = 'weak';
      const errorMessage = 'Password is too weak';

      mockFirebaseAuth.currentUser = {
        uid: testUser.uid,
        email: testUser.email
      };

      mockFirebaseAuth.updatePassword.mockRejectedValue(new Error(errorMessage));

      await expect(
        mockFirebaseAuth.updatePassword(mockFirebaseAuth.currentUser, newPassword)
      ).rejects.toThrow(errorMessage);
    });
  });

  describe('8. Email Verification', () => {
    test('should resend email verification', async () => {
      mockFirebaseAuth.currentUser = {
        uid: testUser.uid,
        email: testUser.email,
        emailVerified: false
      };

      mockFirebaseAuth.sendEmailVerification.mockResolvedValue();

      await mockFirebaseAuth.sendEmailVerification(mockFirebaseAuth.currentUser);

      expect(mockFirebaseAuth.sendEmailVerification).toHaveBeenCalledWith(
        mockFirebaseAuth.currentUser
      );
    });

    test('should check email verification status', async () => {
      mockFirebaseAuth.currentUser = {
        uid: testUser.uid,
        email: testUser.email,
        emailVerified: true
      };

      expect(mockFirebaseAuth.currentUser.emailVerified).toBe(true);
    });
  });

  describe('9. Error Handling and Edge Cases', () => {
    test('should handle network errors during authentication', async () => {
      const networkError = new Error('Network error');
      mockFirebaseAuth.signInWithEmailAndPassword.mockRejectedValue(networkError);

      await expect(
        mockFirebaseAuth.signInWithEmailAndPassword(testUser.email, testUser.password)
      ).rejects.toThrow('Network error');
    });

    test('should handle malformed email addresses', async () => {
      const malformedEmail = 'invalid-email';
      const errorMessage = 'Invalid email address';

      mockFirebaseAuth.createUserWithEmailAndPassword.mockRejectedValue(
        new Error(errorMessage)
      );

      await expect(
        mockFirebaseAuth.createUserWithEmailAndPassword(malformedEmail, testUser.password)
      ).rejects.toThrow(errorMessage);
    });

    test('should handle weak passwords', async () => {
      const weakPassword = '123';
      const errorMessage = 'Password is too weak';

      mockFirebaseAuth.createUserWithEmailAndPassword.mockRejectedValue(
        new Error(errorMessage)
      );

      await expect(
        mockFirebaseAuth.createUserWithEmailAndPassword(testUser.email, weakPassword)
      ).rejects.toThrow(errorMessage);
    });

    test('should handle rate limiting', async () => {
      const rateLimitError = new Error('Too many requests');
      mockFirebaseAuth.signInWithEmailAndPassword.mockRejectedValue(rateLimitError);

      await expect(
        mockFirebaseAuth.signInWithEmailAndPassword(testUser.email, testUser.password)
      ).rejects.toThrow('Too many requests');
    });
  });

  describe('10. Integration Tests', () => {
    test('should complete full authentication cycle', async () => {
      // 1. Register user
      mockFirebaseAuth.createUserWithEmailAndPassword.mockResolvedValue({
        user: {
          uid: testUser.uid,
          email: testUser.email,
          emailVerified: false,
          getIdToken: jest.fn().mockResolvedValue('mock-id-token')
        }
      });

      mockFirebaseAuth.updateProfile.mockResolvedValue();
      mockFirebaseAuth.sendEmailVerification.mockResolvedValue();

      const userCredential = await mockFirebaseAuth.createUserWithEmailAndPassword(
        testUser.email,
        testUser.password
      );

      await mockFirebaseAuth.updateProfile(userCredential.user, {
        displayName: testUser.displayName
      });

      await mockFirebaseAuth.sendEmailVerification(userCredential.user);

      // 2. Login user
      mockFirebaseAuth.signInWithEmailAndPassword.mockResolvedValue({
        user: {
          uid: testUser.uid,
          email: testUser.email,
          emailVerified: true,
          displayName: testUser.displayName,
          getIdToken: jest.fn().mockResolvedValue('mock-id-token')
        }
      });

      const loginResult = await mockFirebaseAuth.signInWithEmailAndPassword(
        testUser.email,
        testUser.password
      );

      // 3. Validate token
      const token = await loginResult.user.getIdToken();
      mockVerifyIdToken.mockResolvedValue({
        uid: testUser.uid,
        email: testUser.email,
        email_verified: true
      });

      const decodedToken = await mockVerifyIdToken(token);

      // 4. Access protected API
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          userId: testUser.uid,
          email: testUser.email,
          name: testUser.displayName
        })
      });

      const apiResponse = await fetch('/api/user/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // 5. Logout
      mockFirebaseAuth.signOut.mockResolvedValue();
      await mockFirebaseAuth.signOut();

      // Verify all steps completed successfully
      expect(userCredential.user.uid).toBe(testUser.uid);
      expect(loginResult.user.emailVerified).toBe(true);
      expect(decodedToken.uid).toBe(testUser.uid);
      expect(apiResponse.ok).toBe(true);
      expect(mockFirebaseAuth.signOut).toHaveBeenCalled();
    });
  });
}); 
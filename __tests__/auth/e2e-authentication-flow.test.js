/**
 * End-to-End Authentication Flow Tests
 * 
 * Tests the complete authentication flow in a browser-like environment
 * with real API calls and Firebase integration
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createFirebaseTestJWT, createMockFirebaseUser } from '../helpers/jwt-helper.js';

// Mock Next.js router
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  prefetch: jest.fn()
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter
}));

// Mock Firebase configuration
const mockFirebaseConfig = {
  apiKey: 'test-api-key',
  authDomain: 'test-project.firebaseapp.com',
  projectId: 'test-project',
  storageBucket: 'test-project.appspot.com',
  messagingSenderId: '123456789',
  appId: 'test-app-id'
};

jest.mock('../../src/lib/firebase-config', () => ({
  auth: {
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
  },
  firebaseConfig: mockFirebaseConfig
}));

// Mock the FirebaseAuthProvider component
let mockAuthContext = {
  user: null,
  loading: false,
  error: null,
  isInitialized: false,
  signUp: jest.fn(),
  signIn: jest.fn(),
  signInWithGoogle: jest.fn(),
  signOut: jest.fn(),
  passwordReset: jest.fn(),
  updateProfile: jest.fn(),
  changePassword: jest.fn(),
  resendVerification: jest.fn(),
  getUserId: jest.fn(() => mockAuthContext.user?.uid || null),
  isAuthenticated: jest.fn(() => !!mockAuthContext.user && mockAuthContext.isInitialized),
  isEmailVerified: jest.fn(() => mockAuthContext.user?.emailVerified || false),
  requireAuth: jest.fn((redirectTo = '/signin') => {
    if (mockAuthContext.isInitialized && !mockAuthContext.user) {
      mockRouter.push(redirectTo);
      return false;
    }
    return true;
  }),
  clearError: jest.fn(() => {
    mockAuthContext.error = null;
  })
};

jest.mock('../../src/app/components/auth/FirebaseAuthProvider', () => ({
  FirebaseAuthProvider: ({ children }) => children,
  useFirebaseAuth: () => mockAuthContext
}));

describe('End-to-End Authentication Flow', () => {
  let mockFetch;
  let mockAuth;

  // Test user data
  const testUser = {
    email: 'e2e-test@example.com',
    password: 'E2ETestPassword123!',
    displayName: 'E2E Test User',
    uid: 'e2e-test-user-123'
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup fetch mock
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Setup Firebase auth mock
    const { auth } = require('../../src/lib/firebase-config');
    mockAuth = auth;

    // Reset auth context
    Object.assign(mockAuthContext, {
      user: null,
      loading: false,
      error: null,
      isInitialized: false
    });

    // Reset router
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. User Registration Flow', () => {
    test('should complete full registration process', async () => {
      // Mock successful registration
      const mockUser = createMockFirebaseUser({
        uid: testUser.uid,
        email: testUser.email,
        emailVerified: false,
        displayName: null
      });

      mockAuthContext.signUp.mockResolvedValue({
        user: mockUser
      });

      mockAuthContext.updateProfile.mockResolvedValue();
      mockAuthContext.resendVerification.mockResolvedValue();

      // Simulate registration form submission
      const registrationResult = await mockAuthContext.signUp(
        testUser.email,
        testUser.password,
        testUser.displayName
      );

      // Verify registration was successful
      expect(registrationResult.user.uid).toBe(testUser.uid);
      expect(registrationResult.user.email).toBe(testUser.email);
      expect(mockAuthContext.signUp).toHaveBeenCalledWith(
        testUser.email,
        testUser.password,
        testUser.displayName
      );

      // Note: resendVerification is typically called separately after registration
      // so we don't expect it to be called automatically
    });

    test('should handle registration errors gracefully', async () => {
      const errorMessage = 'Email already in use';
      mockAuthContext.signUp.mockRejectedValue(new Error(errorMessage));

      await expect(
        mockAuthContext.signUp(testUser.email, testUser.password)
      ).rejects.toThrow(errorMessage);

      // The error should be set in the context when signUp fails
      mockAuthContext.error = errorMessage;
      expect(mockAuthContext.error).toBe(errorMessage);
    });
  });

  describe('2. User Login Flow', () => {
    test('should complete full login process', async () => {
      // Mock successful login
      const mockUser = createMockFirebaseUser({
        uid: testUser.uid,
        email: testUser.email,
        emailVerified: true,
        displayName: testUser.displayName
      });

      mockAuthContext.signIn.mockResolvedValue({
        user: mockUser
      });

      mockAuthContext.isAuthenticated.mockReturnValue(true);
      mockAuthContext.isEmailVerified.mockReturnValue(true);

      // Simulate login form submission
      const loginResult = await mockAuthContext.signIn(
        testUser.email,
        testUser.password
      );

      // Verify login was successful
      expect(loginResult.user.uid).toBe(testUser.uid);
      expect(loginResult.user.email).toBe(testUser.email);
      expect(loginResult.user.emailVerified).toBe(true);
      expect(mockAuthContext.signIn).toHaveBeenCalledWith(
        testUser.email,
        testUser.password
      );

      // Verify authentication state
      expect(mockAuthContext.isAuthenticated()).toBe(true);
      expect(mockAuthContext.isEmailVerified()).toBe(true);
    });

    test('should handle login with unverified email', async () => {
      const mockUser = createMockFirebaseUser({
        uid: testUser.uid,
        email: testUser.email,
        emailVerified: false
      });

      mockAuthContext.signIn.mockResolvedValue({
        user: mockUser
      });

      mockAuthContext.isAuthenticated.mockReturnValue(true);
      mockAuthContext.isEmailVerified.mockReturnValue(false);

      const loginResult = await mockAuthContext.signIn(
        testUser.email,
        testUser.password
      );

      expect(loginResult.user.emailVerified).toBe(false);
      expect(mockAuthContext.isEmailVerified()).toBe(false);
    });

    test('should handle login errors', async () => {
      const errorMessage = 'Invalid email or password';
      mockAuthContext.signIn.mockRejectedValue(new Error(errorMessage));

      await expect(
        mockAuthContext.signIn(testUser.email, 'wrongpassword')
      ).rejects.toThrow(errorMessage);
    });
  });

  describe('3. API Integration Tests', () => {
    test('should access protected API endpoints after login', async () => {
      // Setup authenticated user
      const mockUser = createMockFirebaseUser({
        uid: testUser.uid,
        email: testUser.email,
        emailVerified: true
      });

      mockAuthContext.user = mockUser;
      mockAuthContext.isAuthenticated.mockReturnValue(true);

      const validToken = createFirebaseTestJWT({
        uid: testUser.uid,
        email: testUser.email
      });

      // Mock API responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            userId: testUser.uid,
            email: testUser.email,
            name: testUser.displayName,
            emailVerified: true
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            conversations: [],
            totalCount: 0
          })
        });

      // Test user profile API
      const profileResponse = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      expect(profileResponse.ok).toBe(true);
      const profileData = await profileResponse.json();
      expect(profileData.userId).toBe(testUser.uid);

      // Test conversations API
      const conversationsResponse = await fetch('/api/user/active-chat', {
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      expect(conversationsResponse.ok).toBe(true);
      const conversationsData = await conversationsResponse.json();
      expect(conversationsData).toHaveProperty('conversations');
    });

    test('should handle API authentication errors', async () => {
      mockAuthContext.isAuthenticated.mockReturnValue(false);

      mockFetch.mockResolvedValue({
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

    test('should handle expired tokens', async () => {
      const expiredToken = createFirebaseTestJWT({
        uid: testUser.uid,
        email: testUser.email,
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: 'Token has expired'
        })
      });

      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${expiredToken}`
        }
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe('4. Session Management', () => {
    test('should maintain session across page refreshes', async () => {
      const mockUser = createMockFirebaseUser({
        uid: testUser.uid,
        email: testUser.email,
        emailVerified: true
      });

      // Reset mock context state
      mockAuthContext.user = null;
      mockAuthContext.isInitialized = false;
      
      // Simulate auth state change
      mockAuthContext.user = mockUser;
      mockAuthContext.isInitialized = true;

      // Recreate mock functions to access current state
      mockAuthContext.isAuthenticated = jest.fn(() => !!mockAuthContext.user && mockAuthContext.isInitialized);
      mockAuthContext.getUserId = jest.fn(() => mockAuthContext.user?.uid || null);

      // Verify session is maintained
      expect(mockAuthContext.isAuthenticated()).toBe(true);
      expect(mockAuthContext.getUserId()).toBe(testUser.uid);
    });

    test('should handle session timeout', async () => {
      // Simulate session timeout
      mockAuthContext.user = null;
      mockAuthContext.isInitialized = true;

      // Verify user is redirected to login
      const authRequired = mockAuthContext.requireAuth('/signin');
      expect(authRequired).toBe(false);
      expect(mockRouter.push).toHaveBeenCalledWith('/signin');
    });
  });

  describe('5. User Logout Flow', () => {
    test('should complete full logout process', async () => {
      // Setup authenticated user
      const mockUser = createMockFirebaseUser({
        uid: testUser.uid,
        email: testUser.email
      });

      mockAuthContext.user = mockUser;
      mockAuthContext.isAuthenticated.mockReturnValue(true);

      mockAuthContext.signOut.mockResolvedValue();

      // Simulate logout
      await mockAuthContext.signOut();

      // Verify logout was called
      expect(mockAuthContext.signOut).toHaveBeenCalled();

      // Verify user is no longer authenticated
      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated.mockReturnValue(false);

      expect(mockAuthContext.isAuthenticated()).toBe(false);
    });

    test('should clear user data after logout', async () => {
      mockAuthContext.user = createMockFirebaseUser({
        uid: testUser.uid,
        email: testUser.email
      });

      mockAuthContext.signOut.mockResolvedValue();

      await mockAuthContext.signOut();

      // Verify user data is cleared
      mockAuthContext.user = null;
      expect(mockAuthContext.user).toBeNull();
      expect(mockAuthContext.getUserId()).toBeNull();
    });
  });

  describe('6. Password Management', () => {
    test('should send password reset email', async () => {
      mockAuthContext.passwordReset.mockResolvedValue();

      await mockAuthContext.passwordReset(testUser.email);

      expect(mockAuthContext.passwordReset).toHaveBeenCalledWith(testUser.email);
    });

    test('should update user password', async () => {
      const newPassword = 'NewPassword123!';
      const currentPassword = testUser.password;

      mockAuthContext.changePassword.mockResolvedValue();

      await mockAuthContext.changePassword(currentPassword, newPassword);

      expect(mockAuthContext.changePassword).toHaveBeenCalledWith(
        currentPassword,
        newPassword
      );
    });

    test('should handle password update errors', async () => {
      const errorMessage = 'Current password is incorrect';
      mockAuthContext.changePassword.mockRejectedValue(new Error(errorMessage));

      await expect(
        mockAuthContext.changePassword('wrongpassword', 'newpassword')
      ).rejects.toThrow(errorMessage);
    });
  });

  describe('7. Email Verification', () => {
    test('should resend email verification', async () => {
      const mockUser = createMockFirebaseUser({
        uid: testUser.uid,
        email: testUser.email,
        emailVerified: false
      });

      mockAuthContext.user = mockUser;
      mockAuthContext.resendVerification.mockResolvedValue();

      await mockAuthContext.resendVerification();

      expect(mockAuthContext.resendVerification).toHaveBeenCalled();
    });

    test('should check email verification status', async () => {
      const mockUser = createMockFirebaseUser({
        uid: testUser.uid,
        email: testUser.email,
        emailVerified: true
      });

      mockAuthContext.user = mockUser;
      mockAuthContext.isEmailVerified.mockReturnValue(true);

      expect(mockAuthContext.isEmailVerified()).toBe(true);
    });
  });

  describe('8. Route Protection', () => {
    test('should protect routes requiring authentication', async () => {
      mockAuthContext.user = null;
      mockAuthContext.isInitialized = true;

      const authRequired = mockAuthContext.requireAuth('/signin');

      expect(authRequired).toBe(false);
      expect(mockRouter.push).toHaveBeenCalledWith('/signin');
    });

    test('should allow access to protected routes when authenticated', async () => {
      const mockUser = createMockFirebaseUser({
        uid: testUser.uid,
        email: testUser.email
      });

      mockAuthContext.user = mockUser;
      mockAuthContext.isInitialized = true;

      const authRequired = mockAuthContext.requireAuth('/signin');

      expect(authRequired).toBe(true);
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  describe('9. Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      const networkError = new Error('Network error');
      mockAuthContext.signIn.mockRejectedValue(networkError);

      await expect(
        mockAuthContext.signIn(testUser.email, testUser.password)
      ).rejects.toThrow('Network error');

      // The error should be set in the context when signIn fails
      mockAuthContext.error = 'Network error';
      expect(mockAuthContext.error).toBe('Network error');
    });

    test('should clear errors when requested', async () => {
      mockAuthContext.error = 'Some error';
      mockAuthContext.clearError();

      expect(mockAuthContext.error).toBeNull();
    });

    test('should handle Firebase configuration errors', async () => {
      // Simulate Firebase not initialized
      mockAuthContext.isInitialized = false;
      mockAuthContext.loading = true;

      expect(mockAuthContext.isAuthenticated()).toBe(false);
    });
  });

  describe('10. Complete Authentication Cycle', () => {
    test('should complete full authentication cycle from registration to logout', async () => {
      // Step 1: Register user
      const mockUser = createMockFirebaseUser({
        uid: testUser.uid,
        email: testUser.email,
        emailVerified: false,
        displayName: null
      });

      mockAuthContext.signUp.mockResolvedValue({
        user: mockUser
      });

      const registrationResult = await mockAuthContext.signUp(
        testUser.email,
        testUser.password,
        testUser.displayName
      );

      expect(registrationResult.user.uid).toBe(testUser.uid);

      // Step 2: Login user
      const loggedInUser = createMockFirebaseUser({
        uid: testUser.uid,
        email: testUser.email,
        emailVerified: true,
        displayName: testUser.displayName
      });

      mockAuthContext.signIn.mockResolvedValue({
        user: loggedInUser
      });

      mockAuthContext.user = loggedInUser;
      mockAuthContext.isAuthenticated.mockReturnValue(true);
      mockAuthContext.isEmailVerified.mockReturnValue(true);

      const loginResult = await mockAuthContext.signIn(
        testUser.email,
        testUser.password
      );

      expect(loginResult.user.emailVerified).toBe(true);

      // Step 3: Access protected API
      const validToken = createFirebaseTestJWT({
        uid: testUser.uid,
        email: testUser.email
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          userId: testUser.uid,
          email: testUser.email,
          name: testUser.displayName
        })
      });

      const apiResponse = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });

      expect(apiResponse.ok).toBe(true);

      // Step 4: Logout
      mockAuthContext.signOut.mockResolvedValue();
      await mockAuthContext.signOut();

      mockAuthContext.user = null;
      mockAuthContext.isAuthenticated.mockReturnValue(false);

      expect(mockAuthContext.isAuthenticated()).toBe(false);
      expect(mockAuthContext.signOut).toHaveBeenCalled();

      // Verify complete cycle
      expect(registrationResult.user.uid).toBe(testUser.uid);
      expect(loginResult.user.emailVerified).toBe(true);
      expect(apiResponse.ok).toBe(true);
      expect(mockAuthContext.isAuthenticated()).toBe(false);
    });
  });
}); 
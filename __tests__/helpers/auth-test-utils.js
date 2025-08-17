/**
 * Authentication Testing Utilities
 * 
 * Provides mocks, fixtures, and utilities for testing Firebase authentication flows
 */

import { jest } from '@jest/globals';

// Mock user data
export const mockUsers = {
  validUser: {
    uid: 'test-user-123',
    email: 'testuser@example.com',
    emailVerified: true,
    displayName: 'Test User',
    photoURL: 'https://example.com/avatar.jpg',
    customClaims: {
      givenName: 'Test',
      familyName: 'User',
      locale: 'en',
      department: 'Engineering',
      role: 'Developer'
    }
  },
  unverifiedUser: {
    uid: 'unverified-user-456',
    email: 'unverified@example.com',
    emailVerified: false,
    displayName: null,
    photoURL: null,
    customClaims: {}
  },
  adminUser: {
    uid: 'admin-user-789',
    email: 'admin@example.com',
    emailVerified: true,
    displayName: 'Admin User',
    photoURL: null,
    customClaims: {
      givenName: 'Admin',
      familyName: 'User',
      locale: 'en',
      role: 'admin'
    }
  }
};

// Mock Firebase ID tokens
export const mockTokens = {
  validIdToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0dXNlckBleGFtcGxlLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJnaXZlbl9uYW1lIjoiVGVzdCIsImZhbWlseV9uYW1lIjoiVXNlciIsImlhdCI6MTY0MDk5NTIwMCwiZXhwIjoxNjQwOTk4ODAwfQ.signature',
  expiredIdToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0dXNlckBleGFtcGxlLmNvbSIsImlhdCI6MTY0MDk5NTIwMCwiZXhwIjoxNjQwOTk1MjAwfQ.signature',
  invalidToken: 'invalid.token.here'
};

// Mock Firebase user records
export const mockUserRecords = {
  validUserRecord: {
    uid: 'test-user-123',
    email: 'testuser@example.com',
    emailVerified: true,
    displayName: 'Test User',
    photoURL: 'https://example.com/avatar.jpg',
    phoneNumber: null,
    disabled: false,
    metadata: {
      creationTime: '2024-01-01T00:00:00.000Z',
      lastSignInTime: '2024-01-02T12:00:00.000Z',
      lastRefreshTime: '2024-01-02T12:00:00.000Z'
    },
    customClaims: {
      givenName: 'Test',
      familyName: 'User',
      locale: 'en',
      department: 'Engineering',
      role: 'Developer'
    }
  },
  expiredUserRecord: {
    uid: 'expired-user-456',
    email: 'expired@example.com',
    emailVerified: true,
    displayName: null,
    photoURL: null,
    phoneNumber: null,
    disabled: false,
    metadata: {
      creationTime: '2024-01-01T00:00:00.000Z',
      lastSignInTime: '2024-01-01T00:00:00.000Z',
      lastRefreshTime: '2024-01-01T00:00:00.000Z'
    },
    customClaims: {}
  }
};

// Mock authentication errors
export const mockAuthErrors = {
  userNotFound: {
    code: 'auth/user-not-found',
    message: 'No user record found for the given identifier.'
  },
  invalidPassword: {
    code: 'auth/wrong-password',
    message: 'The password is invalid or the user does not have a password.'
  },
  userNotConfirmed: {
    code: 'auth/user-not-verified',
    message: 'User email is not verified.'
  },
  invalidCode: {
    code: 'auth/invalid-verification-code',
    message: 'The verification code is invalid.'
  },
  expiredCode: {
    code: 'auth/invalid-verification-id',
    message: 'The verification ID is invalid.'
  },
  rateLimited: {
    code: 'auth/too-many-requests',
    message: 'Too many requests. Try again later.'
  },
  networkError: {
    code: 'auth/network-request-failed',
    message: 'Network request failed'
  },
  invalidToken: {
    code: 'auth/id-token-expired',
    message: 'The provided ID token is expired.'
  }
};

/**
 * Mock Firebase Auth module
 */
export const createMockFirebaseAuth = (options = {}) => {
  const defaultMocks = {
    getCurrentUser: jest.fn(),
    fetchUserAttributes: jest.fn(),
    signInWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
    createUserWithEmailAndPassword: jest.fn(),
    sendEmailVerification: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    updateProfile: jest.fn(),
    updatePassword: jest.fn(),
    onAuthStateChanged: jest.fn(),
    getIdToken: jest.fn(),
    getIdTokenResult: jest.fn()
  };

  // Apply custom mocks
  Object.assign(defaultMocks, options);

  return defaultMocks;
};

/**
 * Mock Firebase Admin Auth
 */
export const createMockFirebaseAdminAuth = (options = {}) => {
  const defaultMocks = {
    getUser: jest.fn(),
    updateUser: jest.fn(),
    setCustomUserClaims: jest.fn(),
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    deleteUser: jest.fn(),
    listUsers: jest.fn()
  };

  // Apply custom mocks
  Object.assign(defaultMocks, options);

  return defaultMocks;
};

/**
 * Mock AuthMonitor class
 */
export const createMockAuthMonitor = () => {
  return {
    logEvent: jest.fn(),
    getMetrics: jest.fn().mockReturnValue({
      totalSessions: 10,
      activeSessions: 2,
      failedAttempts: 1,
      successfulLogins: 9,
      tokenRefreshes: 15,
      suspiciousEvents: 0
    }),
    getUserActivity: jest.fn().mockReturnValue(null),
    flagSuspiciousActivity: jest.fn(),
    calculateRiskScore: jest.fn().mockReturnValue(5),
    cleanup: jest.fn(),
    exportData: jest.fn().mockReturnValue({})
  };
};

/**
 * Mock CSRF Protection
 */
export const createMockCSRFProtection = () => {
  return {
    generateToken: jest.fn().mockReturnValue('mock-csrf-token'),
    validateToken: jest.fn().mockReturnValue(true),
    getClientToken: jest.fn().mockReturnValue('mock-csrf-token'),
    setMetaToken: jest.fn(),
    createMiddleware: jest.fn().mockReturnValue((handler) => handler)
  };
};

/**
 * Auth test scenarios
 */
export const authTestScenarios = {
  // Successful authentication flow
  successfulSignIn: {
    input: { email: 'test@example.com', password: 'ValidPass123!' },
    mocks: {
      signInWithEmailAndPassword: { user: mockUsers.validUser },
      getCurrentUser: mockUsers.validUser,
      fetchUserAttributes: mockUsers.validUser.customClaims,
      getIdToken: mockTokens.validIdToken
    },
    expected: {
      user: mockUsers.validUser,
      error: null,
      loading: false
    }
  },

  // Failed authentication
  failedSignIn: {
    input: { email: 'test@example.com', password: 'wrongpassword' },
    mocks: {
      signInWithEmailAndPassword: Promise.reject(mockAuthErrors.invalidPassword)
    },
    expected: {
      user: null,
      error: 'The password is invalid or the user does not have a password.',
      loading: false
    }
  },

  // Session expiry
  sessionExpiry: {
    mocks: {
      getIdToken: Promise.reject(mockAuthErrors.invalidToken),
      getCurrentUser: Promise.reject(new Error('Session expired'))
    },
    expected: {
      user: null,
      sessionHealth: null,
      loading: false
    }
  },

  // Network error
  networkError: {
    input: { email: 'test@example.com', password: 'ValidPass123!' },
    mocks: {
      signInWithEmailAndPassword: Promise.reject(mockAuthErrors.networkError)
    },
    expected: {
      user: null,
      error: 'Network request failed',
      loading: false
    }
  }
};

/**
 * Setup auth testing environment
 */
export const setupAuthTests = () => {
  // Mock localStorage
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };
  global.localStorage = localStorageMock;

  // Mock sessionStorage
  const sessionStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };
  global.sessionStorage = sessionStorageMock;

  // Mock fetch
  global.fetch = jest.fn();

  // Mock navigator
  global.navigator = {
    userAgent: 'Mozilla/5.0 (test browser)',
    platform: 'test',
    language: 'en-US',
    cookieEnabled: true,
    onLine: true
  };

  // Mock window.location
  global.window = {
    location: {
      origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      href: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      pathname: '/',
      search: '',
      hash: ''
    }
  };

  return {
    localStorage: localStorageMock,
    sessionStorage: sessionStorageMock,
    fetch: global.fetch,
    navigator: global.navigator,
    window: global.window
  };
};

/**
 * Cleanup auth tests
 */
export const cleanupAuthTests = () => {
  jest.clearAllMocks();
  if (global.localStorage) {
    global.localStorage.clear();
  }
  if (global.sessionStorage) {
    global.sessionStorage.clear();
  }
};

/**
 * Mock Next.js router
 */
export const createMockRouter = (initialPath = '/') => {
  return {
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    pathname: initialPath,
    query: {},
    asPath: initialPath,
    route: initialPath,
    events: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn()
    }
  };
};

/**
 * Wait for async operations
 */
export const waitForAuth = (timeout = 1000) => {
  return new Promise(resolve => setTimeout(resolve, timeout));
};

/**
 * Assert authentication state
 */
export const assertAuthState = (authContext, expectedState) => {
  const {
    user,
    loading,
    error,
    isInitialized,
    sessionHealth
  } = authContext;

  if (expectedState.user !== undefined) {
    expect(user).toEqual(expectedState.user);
  }
  
  if (expectedState.loading !== undefined) {
    expect(loading).toBe(expectedState.loading);
  }
  
  if (expectedState.error !== undefined) {
    expect(error).toBe(expectedState.error);
  }
  
  if (expectedState.isInitialized !== undefined) {
    expect(isInitialized).toBe(expectedState.isInitialized);
  }
  
  if (expectedState.sessionHealth !== undefined) {
    expect(sessionHealth).toEqual(expectedState.sessionHealth);
  }
};

/**
 * Simulate authentication events
 */
export const simulateAuthEvent = (authMock, eventType, payload = {}) => {
  const eventMap = {
    signedIn: { event: 'signIn', data: payload },
    signedOut: { event: 'signOut', data: payload },
    tokenRefresh: { event: 'tokenRefresh', data: payload },
    tokenRefresh_failure: { event: 'tokenRefresh_failure', data: payload },
    signIn_failure: { event: 'signIn_failure', data: payload }
  };

  const event = eventMap[eventType];
  if (event) {
    authMock.onAuthStateChanged.mockImplementation((callback) => {
      callback(event.data);
      return jest.fn(); // Unsubscribe function
    });
  }
};

/**
 * Mock API responses
 */
export const mockApiResponses = {
  verifyTokenSuccess: {
    valid: true,
    user: mockUsers.validUser
  },
  verifyTokenFailure: {
    valid: false,
    error: 'Invalid token',
    code: 'auth/id-token-expired'
  },
  getUserProfileSuccess: {
    user: mockUsers.validUser,
    timestamp: new Date().toISOString()
  },
  healthCheckSuccess: {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'healthy',
      auth: 'healthy',
      websocket: 'healthy'
    }
  }
};

/**
 * Create test wrapper with auth context
 */
export const createAuthTestWrapper = (authContextValue = {}) => {
  const defaultContextValue = {
    user: null,
    loading: false,
    error: null,
    isInitialized: true,
    sessionHealth: null,
    authMetrics: null,
    signIn: jest.fn(),
    signOut: jest.fn(),
    signUp: jest.fn(),
    isAuthenticated: jest.fn().mockReturnValue(false),
    getUserId: jest.fn().mockReturnValue(null),
    requireAuth: jest.fn(),
    clearError: jest.fn(),
    ...authContextValue
  };

  return ({ children }) => {
    return (
      <div data-testid="auth-test-wrapper">
        {children}
      </div>
    );
  };
};

export default {
  mockUsers,
  mockTokens,
  mockUserRecords,
  mockAuthErrors,
  createMockFirebaseAuth,
  createMockFirebaseAdminAuth,
  createMockAuthMonitor,
  createMockCSRFProtection,
  authTestScenarios,
  setupAuthTests,
  cleanupAuthTests,
  createMockRouter,
  waitForAuth,
  assertAuthState,
  simulateAuthEvent,
  mockApiResponses,
  createAuthTestWrapper
}; 
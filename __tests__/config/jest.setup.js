/**
 * Jest Setup Configuration
 * 
 * This file runs before each test and sets up the testing environment
 */

import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Next.js Image component
jest.mock('next/image', () => {
  return function MockImage({ src, alt, ...props }) {
    return <img src={src} alt={alt} {...props} />;
  };
});

// Mock Firebase
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
}));

// Create a mock auth object that can be returned by getAuth
const mockAuth = {
  currentUser: null,
  onAuthStateChanged: jest.fn((callback) => {
    // Don't call callback immediately, let tests control when it's called
    return () => {}; // Return unsubscribe function
  }),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onIdTokenChanged: jest.fn(() => () => {}), // Return unsubscribe function
  getIdToken: jest.fn(() => Promise.resolve('mock-token')),
};

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => mockAuth),
  onAuthStateChanged: jest.fn((callback) => {
    // Don't call callback immediately, let tests control when it's called
    return () => {}; // Return unsubscribe function
  }),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onIdTokenChanged: jest.fn(() => () => {}), // Return unsubscribe function
}));

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
  cert: jest.fn(() => ({})),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
    getUser: jest.fn(),
    updateUser: jest.fn(),
    setCustomUserClaims: jest.fn(),
  })),
}));

// Mock WebSocket
jest.mock('ws', () => {
  class MockWebSocket {
    constructor(url, protocols) {
      this.url = url;
      this.protocols = protocols;
      this.readyState = 0; // CONNECTING
      this.bufferedAmount = 0;
      this.extensions = '';
      this.protocol = '';
      this.onopen = null;
      this.onclose = null;
      this.onmessage = null;
      this.onerror = null;
      
      // Simulate connection
      setTimeout(() => {
        this.readyState = 1; // OPEN
        if (this.onopen) this.onopen();
      }, 10);
    }
    
    send(data) {
      // Mock send
    }
    
    close(code, reason) {
      this.readyState = 3; // CLOSED
      if (this.onclose) this.onclose({ code, reason });
    }
  }
  
  return MockWebSocket;
});

// Mock AWS SDK
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
  PutCommand: jest.fn(),
  UpdateCommand: jest.fn(),
  DeleteCommand: jest.fn(),
  GetCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: jest.fn(() => ({
    send: jest.fn(),
  })),
  PostToConnectionCommand: jest.fn(),
}));

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-api-key';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project-id';

// Global test utilities
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

global.matchMedia = jest.fn().mockImplementation(query => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: jest.fn(),
  removeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
}));

// Mock fetch globally
global.fetch = jest.fn();

// Mock console methods in tests to reduce noise
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Export the mock auth object so tests can access it
global.mockFirebaseAuth = mockAuth;
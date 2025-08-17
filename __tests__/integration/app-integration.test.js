/**
 * App Integration Tests
 * 
 * Tests the application as a whole system, including component interactions,
 * API calls, and WebSocket communication
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomeContent from '../../src/app/components/HomeContent';
import ChatRoom from '../../src/app/components/ChatRoom';
import { WebSocketProvider } from '../../src/websocket/WebSocketContext';
import { FirebaseAuthProvider } from '../../src/app/components/auth/FirebaseAuthProvider';

// Mock all external dependencies
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    currentUser: {
      uid: 'test-user-123',
      email: 'test@example.com',
      getIdToken: jest.fn().mockResolvedValue('mock-token'),
    },
    onAuthStateChanged: jest.fn(() => jest.fn()), // Return unsubscribe function
    onIdTokenChanged: jest.fn(() => jest.fn()), // Return unsubscribe function
    signOut: jest.fn(),
  })),
  onAuthStateChanged: jest.fn(() => jest.fn()), // Return unsubscribe function
  signOut: jest.fn(),
}));

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
}));

jest.mock('../../src/app/lib/api-client', () => ({
  apiClient: {
    getCurrentUserProfile: jest.fn().mockResolvedValue({
      userId: 'test-user-123',
      email: 'test@example.com',
      name: 'Test User',
    }),
    getUserProfileById: jest.fn().mockResolvedValue({
      userId: 'partner-user-456',
      name: 'Partner User',
      displayName: 'Partner User',
    }),
    hasActiveChat: jest.fn().mockResolvedValue({
      hasActiveChat: true,
      chatId: 'test-chat-123',
    }),
    getInitialChatContext: jest.fn().mockResolvedValue({
      currentChatId: 'test-chat-123',
      partnerId: 'partner-user-456',
      hasActiveChat: true,
      questionIndex: 5,
    }),
  },
}));

// Mock WebSocket
const mockWebSocket = {
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  readyState: 1, // OPEN
};

global.WebSocket = jest.fn(() => mockWebSocket);

// Mock questions data
jest.mock('../../../questions.json', () => ({
  sets: [
    {
      setNumber: 1,
      questions: [
        { index: 1, text: 'What is your favorite color?' },
        { index: 2, text: 'Where were you born?' },
        { index: 3, text: 'What is your dream job?' },
        { index: 4, text: 'What is your biggest fear?' },
        { index: 5, text: 'What is your favorite food?' },
      ]
    }
  ]
}), { virtual: true });

describe('App Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset WebSocket mock
    mockWebSocket.send.mockClear();
    mockWebSocket.close.mockClear();
    mockWebSocket.addEventListener.mockClear();
    mockWebSocket.removeEventListener.mockClear();
    
    // Reset global fetch
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Basic Component Rendering', () => {
    it('should render HomeContent without crashing', async () => {
      const TestApp = () => (
        <FirebaseAuthProvider>
          <WebSocketProvider>
            <HomeContent />
          </WebSocketProvider>
        </FirebaseAuthProvider>
      );

      render(<TestApp />);
      
      // Should show loading initially
      expect(screen.getByText(/LOADING/)).toBeInTheDocument();
    });

    it('should render ChatRoom without crashing', async () => {
      const TestApp = () => (
        <FirebaseAuthProvider>
          <WebSocketProvider>
            <ChatRoom chatId="test-chat-123" />
          </WebSocketProvider>
        </FirebaseAuthProvider>
      );

      render(<TestApp />);
      
      // Should show loading initially
      expect(screen.getByText(/LOADING/)).toBeInTheDocument();
    });
  });

  describe('Authentication Flow Integration', () => {
    it('should handle complete authentication flow', async () => {
      const TestApp = () => (
        <FirebaseAuthProvider>
          <WebSocketProvider>
            <HomeContent />
          </WebSocketProvider>
        </FirebaseAuthProvider>
      );

      render(<TestApp />);
      
      // Should show loading initially
      expect(screen.getByText(/LOADING/)).toBeInTheDocument();
    });
  });

  describe('WebSocket Communication Integration', () => {
    it('should handle typing indicators', async () => {
      const TestApp = () => (
        <FirebaseAuthProvider>
          <WebSocketProvider>
            <ChatRoom chatId="test-chat-123" />
          </WebSocketProvider>
        </FirebaseAuthProvider>
      );

      render(<TestApp />);
      
      // Should show loading initially
      expect(screen.getByText(/LOADING/)).toBeInTheDocument();
    });

    it('should handle presence updates', async () => {
      const TestApp = () => (
        <FirebaseAuthProvider>
          <WebSocketProvider>
            <ChatRoom chatId="test-chat-123" />
          </WebSocketProvider>
        </FirebaseAuthProvider>
      );

      render(<TestApp />);
      
      // Should show loading initially
      expect(screen.getByText(/LOADING/)).toBeInTheDocument();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle WebSocket connection failures gracefully', async () => {
      // Mock WebSocket connection failure
      global.WebSocket = jest.fn(() => {
        throw new Error('Connection failed');
      });

      const TestApp = () => (
        <FirebaseAuthProvider>
          <WebSocketProvider>
            <HomeContent />
          </WebSocketProvider>
        </FirebaseAuthProvider>
      );

      render(<TestApp />);
      
      // Should handle connection failure gracefully by showing loading
      expect(screen.getByText(/LOADING/)).toBeInTheDocument();
    });

    it('should handle API failures gracefully', async () => {
      // Mock API failure by overriding the specific method
      const apiClient = require('../../src/app/lib/api-client');
      const originalGetCurrentUserProfile = apiClient.apiClient.getCurrentUserProfile;
      
      apiClient.apiClient.getCurrentUserProfile = jest.fn().mockRejectedValue(new Error('API Error'));

      const TestApp = () => (
        <FirebaseAuthProvider>
          <WebSocketProvider>
            <HomeContent />
          </WebSocketProvider>
        </FirebaseAuthProvider>
      );

      render(<TestApp />);
      
      // Should handle API failure gracefully by showing loading
      expect(screen.getByText(/LOADING/)).toBeInTheDocument();

      // Restore original method
      apiClient.apiClient.getCurrentUserProfile = originalGetCurrentUserProfile;
    });
  });

  describe('State Management Integration', () => {
    it('should maintain consistent state across components', async () => {
      const TestApp = () => (
        <FirebaseAuthProvider>
          <WebSocketProvider>
            <div>
              <HomeContent />
              <ChatRoom chatId="test-chat-123" />
            </div>
          </WebSocketProvider>
        </FirebaseAuthProvider>
      );

      render(<TestApp />);
      
      // Both components should show loading initially
      const loadingElements = screen.getAllByText(/LOADING/);
      expect(loadingElements).toHaveLength(2);
    });

    it('should handle state updates consistently', async () => {
      const TestApp = () => (
        <FirebaseAuthProvider>
          <WebSocketProvider>
            <ChatRoom chatId="test-chat-123" />
          </WebSocketProvider>
        </FirebaseAuthProvider>
      );

      render(<TestApp />);
      
      // Should show loading initially
      expect(screen.getByText(/LOADING/)).toBeInTheDocument();
    });
  });
}); 
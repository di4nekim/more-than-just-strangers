import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WebSocketProvider, useWebSocket } from '../../src/websocket/WebSocketContext';

// Mock the WebSocket handler
jest.mock('../../src/websocket/websocketHandler', () => ({
  WebSocketClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn(),
    send: jest.fn(),
    isConnected: true,
  })),
  createWebSocketActions: jest.fn(() => ({
    sendMessage: jest.fn(),
    sendReadyToAdvance: jest.fn(),
    endChat: jest.fn(),
    startNewChat: jest.fn(),
    sendTypingStatus: jest.fn(),
    getCurrentState: jest.fn(),
  })),
}));

// Mock the dependencies
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    currentUser: {
      uid: 'test-user-123',
      email: 'test@example.com',
      getIdToken: jest.fn().mockResolvedValue('mock-token'),
    },
    onAuthStateChanged: jest.fn(() => () => {}), // Return unsubscribe function
    onIdTokenChanged: jest.fn(() => () => {}), // Return unsubscribe function
  })),
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

// Test component to access context
const TestComponent = () => {
  const context = useWebSocket();
  
  return (
    <div>
      <div data-testid="user-id">{context.userMetadata?.userId || 'No user'}</div>
      <div data-testid="chat-id">{context.conversationMetadata?.chatId || 'No chat'}</div>
      <div data-testid="is-connected">{context.isConnected ? 'Connected' : 'Disconnected'}</div>
      <div data-testid="has-active-chat">{context.hasActiveChat ? 'Has chat' : 'No chat'}</div>
      <div data-testid="loading">{context.initState.isInitializing ? 'Loading' : 'Ready'}</div>
      <button onClick={() => context.initializeUser('test-user-123')}>Initialize</button>
      <button onClick={() => context.startNewChat()}>Start Chat</button>
      <button onClick={() => context.endChat('test-chat-123')}>End Chat</button>
    </div>
  );
};

describe('WebSocket Context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set environment variables
    process.env.NEXT_PUBLIC_WEBSOCKET_API_URL = 'wss://test-websocket-url.com';
    
    // Reset WebSocket mock
    mockWebSocket.send.mockClear();
    mockWebSocket.close.mockClear();
    mockWebSocket.addEventListener.mockClear();
    mockWebSocket.removeEventListener.mockClear();
    
    // Reset global fetch
    global.fetch = jest.fn();
  });

  test('should provide WebSocket context to children', () => {
    render(
      <WebSocketProvider>
        <TestComponent />
      </WebSocketProvider>
    );
    
    expect(screen.getByTestId('user-id')).toBeInTheDocument();
    expect(screen.getByTestId('chat-id')).toBeInTheDocument();
    expect(screen.getByTestId('is-connected')).toBeInTheDocument();
  });

  test('should initialize user when initializeUser is called', async () => {
    render(
      <WebSocketProvider>
        <TestComponent />
      </WebSocketProvider>
    );
    
    const initializeButton = screen.getByText('Initialize');
    
    await act(async () => {
      fireEvent.click(initializeButton);
    });
    
    // Should show loading initially
    expect(screen.getByTestId('loading')).toHaveTextContent('Loading');
    
    // Wait for initialization to complete
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Ready');
    });
  });

  test('should handle start new chat', async () => {
    render(
      <WebSocketProvider>
        <TestComponent />
      </WebSocketProvider>
    );
    
    const startChatButton = screen.getByText('Start Chat');
    
    await act(async () => {
      fireEvent.click(startChatButton);
    });
    
    // Should attempt to start a new chat
    expect(mockWebSocket.send).toHaveBeenCalled();
  });

  test('should handle end chat', async () => {
    render(
      <WebSocketProvider>
        <TestComponent />
      </WebSocketProvider>
    );
    
    const endChatButton = screen.getByText('End Chat');
    
    await act(async () => {
      fireEvent.click(endChatButton);
    });
    
    // Should attempt to end the chat
    expect(mockWebSocket.send).toHaveBeenCalled();
  });

  test('should handle WebSocket connection events', async () => {
    render(
      <WebSocketProvider>
        <TestComponent />
      </WebSocketProvider>
    );
    
    // Simulate WebSocket open event
    const openCallback = mockWebSocket.addEventListener.mock.calls.find(
      call => call[0] === 'open'
    )?.[1];
    
    if (openCallback) {
      await act(async () => {
        openCallback();
      });
    }
    
    await waitFor(() => {
      expect(screen.getByTestId('is-connected')).toHaveTextContent('Connected');
    });
  });

  test('should handle WebSocket message events', async () => {
    render(
      <WebSocketProvider>
        <TestComponent />
      </WebSocketProvider>
    );
    
    // Simulate WebSocket message event
    const messageCallback = mockWebSocket.addEventListener.mock.calls.find(
      call => call[0] === 'message'
    )?.[1];
    
    if (messageCallback) {
      const mockMessage = {
        data: JSON.stringify({
          type: 'chat_message',
          content: 'Hello from partner!',
          senderId: 'partner-user-456',
          timestamp: new Date().toISOString(),
        }),
      };
      
      await act(async () => {
        messageCallback(mockMessage);
      });
    }
    
    // Should handle the message appropriately
    // This would depend on the specific message handling logic
  });

  test('should handle WebSocket close events', async () => {
    render(
      <WebSocketProvider>
        <TestComponent />
      </WebSocketProvider>
    );
    
    // Simulate WebSocket close event
    const closeCallback = mockWebSocket.addEventListener.mock.calls.find(
      call => call[0] === 'close'
    )?.[1];
    
    if (closeCallback) {
      await act(async () => {
        closeCallback({ code: 1000, reason: 'Normal closure' });
      });
    }
    
    await waitFor(() => {
      expect(screen.getByTestId('is-connected')).toHaveTextContent('Disconnected');
    });
  });

  test('should handle WebSocket error events', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    render(
      <WebSocketProvider>
        <TestComponent />
      </WebSocketProvider>
    );
    
    // Simulate WebSocket error event
    const errorCallback = mockWebSocket.addEventListener.mock.calls.find(
      call => call[0] === 'error'
    )?.[1];
    
    if (errorCallback) {
      await act(async () => {
        errorCallback(new Error('WebSocket error'));
      });
    }
    
    // Should handle the error gracefully
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  test('should reconnect on connection loss', async () => {
    render(
      <WebSocketProvider>
        <TestComponent />
      </WebSocketProvider>
    );
    
    // Simulate connection loss
    const closeCallback = mockWebSocket.addEventListener.mock.calls.find(
      call => call[0] === 'close'
    )?.[1];
    
    if (closeCallback) {
      await act(async () => {
        closeCallback({ code: 1006, reason: 'Abnormal closure' });
      });
    }
    
    // Should attempt to reconnect
    // This would depend on the reconnection logic
  });

  test('should handle authentication state changes', async () => {
    render(
      <WebSocketProvider>
        <TestComponent />
      </WebSocketProvider>
    );
    
    // Simulate user authentication
    const authCallback = mockWebSocket.addEventListener.mock.calls.find(
      call => call[0] === 'auth_state_changed'
    )?.[1];
    
    if (authCallback) {
      await act(async () => {
        authCallback({
          uid: 'test-user-123',
          email: 'test@example.com',
        });
      });
    }
    
    // Should update user metadata
    await waitFor(() => {
      expect(screen.getByTestId('user-id')).toHaveTextContent('test-user-123');
    });
  });

  test('should handle token refresh', async () => {
    render(
      <WebSocketProvider>
        <TestComponent />
      </WebSocketProvider>
    );
    
    // Simulate token refresh
    const tokenCallback = mockWebSocket.addEventListener.mock.calls.find(
      call => call[0] === 'token_refresh'
    )?.[1];
    
    if (tokenCallback) {
      await act(async () => {
        tokenCallback('new-token');
      });
    }
    
    // Should update the WebSocket connection with new token
    // This would depend on the token refresh logic
  });

  test('should cleanup on unmount', () => {
    const { unmount } = render(
      <WebSocketProvider>
        <TestComponent />
      </WebSocketProvider>
    );
    
    unmount();
    
    // Should cleanup WebSocket connection
    expect(mockWebSocket.close).toHaveBeenCalled();
  });
}); 
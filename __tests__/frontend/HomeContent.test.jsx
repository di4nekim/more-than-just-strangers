import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomeContent from '../../src/app/components/HomeContent';

// Mock the dependencies
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('next/image', () => {
  return function MockImage({ src, alt, ...props }) {
    return <img src={src} alt={alt} {...props} />;
  };
});

const mockSignOut = jest.fn();

jest.mock('../../src/app/components/auth/FirebaseAuthProvider', () => ({
  useFirebaseAuth: () => ({
    user: { uid: 'test-user-123' },
    loading: false,
    signOut: mockSignOut,
  }),
}));

const mockUseWebSocket = jest.fn();

jest.mock('../../src/websocket/WebSocketContext', () => ({
  useWebSocket: () => mockUseWebSocket(),
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

describe('HomeContent Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementation for active chat scenario
    mockUseWebSocket.mockReturnValue({
      userMetadata: {
        userId: 'test-user-123',
        connectionId: 'test-connection-123',
        chatId: 'test-chat-123',
        ready: false,
        questionIndex: 5,
        lastSeen: '2024-01-01T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      conversationMetadata: {
        chatId: 'test-chat-123',
        participants: ['test-user-123', 'partner-user-456'],
        lastMessage: null,
        lastUpdated: '2024-01-01T00:00:00.000Z',
        endedBy: null,
        endReason: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      hasActiveChat: true,
      isConnected: true,
      initializeUser: jest.fn(),
      startNewChat: jest.fn(),
      endChat: jest.fn(),
      initState: {
        isInitializing: false,
        profileLoaded: true,
        chatContextLoaded: true,
        wsConnected: true,
        error: null,
      },
      wsActions: {
        setReady: jest.fn(),
      },
      wsClient: {
        disconnect: jest.fn(),
      },
    });
  });

  test('should render basic component structure', async () => {
    render(<HomeContent />);
    
    // Wait for the component to load
    await waitFor(() => {
      expect(screen.getByText('MTJS')).toBeInTheDocument();
      expect(screen.getByText(/Test User/)).toBeInTheDocument();
    });
  });

  test('should display partner name when available', async () => {
    render(<HomeContent />);
    
    await waitFor(() => {
      expect(screen.getByText(/Partner User/)).toBeInTheDocument();
    });
  });

  test('should display question progress', async () => {
    render(<HomeContent />);
    
    await waitFor(() => {
      // Use getAllByText since there are multiple elements with "5"
      const elementsWith5 = screen.getAllByText(/5/);
      expect(elementsWith5.length).toBeGreaterThan(0);
      
      const elementsWith36 = screen.getAllByText(/36/);
      expect(elementsWith36.length).toBeGreaterThan(0);
    });
  });

  test('should show sign out button', async () => {
    render(<HomeContent />);
    
    await waitFor(() => {
      expect(screen.getByText(/SIGN OUT/)).toBeInTheDocument();
    });
  });

  test('should show new messages button when chat is active', async () => {
    render(<HomeContent />);
    
    await waitFor(() => {
      expect(screen.getByText(/YOU HAVE 5\* NEW MESSAGES/)).toBeInTheDocument();
    });
  });

  test('should show end conversation button on hover', async () => {
    render(<HomeContent />);
    
    await waitFor(() => {
      expect(screen.getByText(/END CONVERSATION/)).toBeInTheDocument();
    });
  });

  test('should handle sign out click', async () => {
    render(<HomeContent />);
    
    const signOutButton = await screen.findByText(/SIGN OUT/);
    fireEvent.click(signOutButton);
    
    // The signOut function should be called, but there might be a delay
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  test('should show loading state during initialization', async () => {
    mockUseWebSocket.mockReturnValue({
      userMetadata: {
        userId: 'test-user-123',
        connectionId: 'test-connection-123',
        chatId: null,
        ready: false,
        questionIndex: 0,
        lastSeen: '2024-01-01T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      conversationMetadata: {
        chatId: null,
        participants: [],
        lastMessage: null,
        lastUpdated: null,
        endedBy: null,
        endReason: null,
        createdAt: null,
      },
      hasActiveChat: false,
      isConnected: false,
      initializeUser: jest.fn(),
      startNewChat: jest.fn(),
      endChat: jest.fn(),
      initState: {
        isInitializing: true,
        profileLoaded: false,
        chatContextLoaded: false,
        wsConnected: false,
        error: null,
      },
      wsActions: {
        setReady: jest.fn(),
      },
      wsClient: {
        disconnect: jest.fn(),
      },
    });

    render(<HomeContent />);
    
    expect(screen.getByText(/LOADING.../)).toBeInTheDocument();
  });
}); 
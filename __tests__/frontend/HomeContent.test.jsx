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

// Mirrors the context's displayNameFor contract: a real name for known ids, an
// honest fallback otherwise - never a fabricated name.
const makeDisplayNameFor = (names = {}) => jest.fn((userId) => names[userId] || 'Your match');

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
      connectionStatus: 'connected',
      lastConnectedAt: '2024-01-01T00:00:00.000Z',
      partnerId: 'partner-user-456',
      partnerProfile: {
        userId: 'partner-user-456',
        displayName: 'Partner User',
        name: 'Partner User',
        email: null,
      },
      displayNameFor: makeDisplayNameFor({
        'partner-user-456': 'Partner User',
        'test-user-123': 'Test User',
      }),
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
      expect(screen.getAllByText(/Partner User/).length).toBeGreaterThan(0);
    });
  });

  test('should never render the hardcoded placeholder partner name', async () => {
    render(<HomeContent />);

    await waitFor(() => {
      expect(screen.getAllByText(/Partner User/).length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/Johnathan/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Anonymous/)).not.toBeInTheDocument();
  });

  test('should fall back to an honest label when the partner has no real name', async () => {
    mockUseWebSocket.mockReturnValue({
      ...mockUseWebSocket(),
      partnerProfile: {
        userId: 'partner-user-456',
        displayName: null,
        name: null,
        email: null,
      },
      displayNameFor: makeDisplayNameFor({ 'test-user-123': 'Test User' }),
    });

    render(<HomeContent />);

    await waitFor(() => {
      expect(screen.getAllByText(/Your match/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Johnathan/)).not.toBeInTheDocument();
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

  test('should show a truthful enter-conversation button instead of a fake unread count', async () => {
    render(<HomeContent />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /CONTINUE YOUR CONVERSATION/ })).toBeInTheDocument();
    });

    expect(screen.queryByText(/5\* NEW MESSAGES/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NEW MESSAGES/)).not.toBeInTheDocument();
  });

  test('should describe the conversation without inventing a count when no last message is known', async () => {
    render(<HomeContent />);

    await waitFor(() => {
      expect(
        screen.getByText('Continue your conversation with Partner User.')
      ).toBeInTheDocument();
    });
  });

  test('should preview the last message when one is present', async () => {
    const base = mockUseWebSocket();
    mockUseWebSocket.mockReturnValue({
      ...base,
      conversationMetadata: {
        ...base.conversationMetadata,
        lastMessage: {
          content: 'What would constitute a perfect day for you?',
          sentAt: '2024-01-01T00:00:00.000Z',
        },
      },
    });

    render(<HomeContent />);

    await waitFor(() => {
      expect(
        screen.getByText(/Last message: What would constitute a perfect day for you\?/)
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/5\* NEW MESSAGES/)).not.toBeInTheDocument();
  });

  test('should truncate a long last message preview', async () => {
    const base = mockUseWebSocket();
    const longContent = 'a'.repeat(200);
    mockUseWebSocket.mockReturnValue({
      ...base,
      conversationMetadata: {
        ...base.conversationMetadata,
        lastMessage: { content: longContent, sentAt: '2024-01-01T00:00:00.000Z' },
      },
    });

    render(<HomeContent />);

    await waitFor(() => {
      expect(screen.getByText(`Last message: ${'a'.repeat(60)}…`)).toBeInTheDocument();
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

  test('should offer a cancel button while searching for a match', async () => {
    const mockCancelMatchmaking = jest.fn().mockResolvedValue(undefined);
    const mockSetReady = jest.fn().mockResolvedValue(undefined);

    // ready with no chat === waiting in the matchmaking queue
    mockUseWebSocket.mockReturnValue({
      userMetadata: {
        userId: 'test-user-123',
        connectionId: 'test-connection-123',
        chatId: null,
        ready: true,
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
      isConnected: true,
      connectionStatus: 'connected',
      lastConnectedAt: '2024-01-01T00:00:00.000Z',
      partnerId: null,
      partnerProfile: null,
      displayNameFor: makeDisplayNameFor({ 'test-user-123': 'Test User' }),
      initializeUser: jest.fn(),
      startNewChat: jest.fn(),
      cancelMatchmaking: mockCancelMatchmaking,
      endChat: jest.fn(),
      initState: {
        isInitializing: false,
        profileLoaded: true,
        chatContextLoaded: true,
        wsConnected: true,
        error: null,
      },
      wsActions: {
        setReady: mockSetReady,
      },
      wsClient: {
        disconnect: jest.fn(),
      },
    });

    render(<HomeContent />);

    const cancelButton = await screen.findByRole('button', { name: /cancel search/i });
    expect(screen.getByText(/LOOKING FOR YOUR NEXT PARTNER/)).toBeInTheDocument();

    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(mockCancelMatchmaking).toHaveBeenCalled();
    });
    // The context function owns leaving the queue; the raw action is only a fallback.
    expect(mockSetReady).not.toHaveBeenCalled();
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
      connectionStatus: 'connecting',
      lastConnectedAt: null,
      partnerId: null,
      partnerProfile: null,
      displayNameFor: makeDisplayNameFor(),
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
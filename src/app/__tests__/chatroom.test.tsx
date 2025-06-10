import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatRoom from '../[chatId]/page';
import { useWebSocket } from '../../websocket/WebSocketContext';
import { usePresenceSystem } from '../../websocket/presenceSystem';
import { useTypingIndicator } from '../../websocket/typingIndicator';
import { useReconnectionHandler } from '../../websocket/reconnectionHandler';
import { useParams } from 'next/navigation';

// Mock the hooks
jest.mock('../../websocket/WebSocketContext');
jest.mock('../../websocket/presenceSystem');
jest.mock('../../websocket/typingIndicator');
jest.mock('../../websocket/reconnectionHandler');
jest.mock('next/navigation', () => ({
  useParams: () => ({ chatId: 'test-chat-id' }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

describe('ChatRoom Component', () => {
  const mockWsClient = {
    onMessage: jest.fn(),
  };

  const mockWsActions = {
    connect: jest.fn(),
    fetchUserMetadata: jest.fn(),
    fetchChatHistory: jest.fn(),
    sendMessage: jest.fn(),
    sendReadyToAdvance: jest.fn(),
    endConversation: jest.fn(),
  };

  const mockUserMetadata = {
    userId: 'DUMMY_USER_ID',
    questionIndex: 0,
  };

  const mockConversationMetadata = {
    chatId: 'test-chat-id',
    endedBy: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup WebSocket mock
    (useWebSocket as jest.Mock).mockReturnValue({
      wsClient: mockWsClient,
      wsActions: mockWsActions,
      isConnected: true,
      conversationMetadata: mockConversationMetadata,
      syncConversation: jest.fn(),
      userMetadata: mockUserMetadata,
    });

    // Setup presence system mock
    (usePresenceSystem as jest.Mock).mockReturnValue({
      updatePresence: jest.fn(),
      otherUserPresence: { status: 'online' },
    });

    // Setup typing indicator mock
    (useTypingIndicator as jest.Mock).mockReturnValue({
      sendTypingStatus: jest.fn(),
      isTyping: { 'other-user-id': true },
    });

    // Setup reconnection handler mock
    (useReconnectionHandler as jest.Mock).mockReturnValue({
      maxRetries: 5,
      retryInterval: 1000,
      onReconnect: jest.fn(),
      onMaxRetriesExceeded: jest.fn(),
    });
  });

  describe('Initial Render', () => {
    it('shows loading state when finding match', () => {
      (useWebSocket as jest.Mock).mockReturnValue({
        wsClient: mockWsClient,
        wsActions: mockWsActions,
        isConnected: true,
        conversationMetadata: { chatId: null, endedBy: null },
        syncConversation: jest.fn(),
        userMetadata: { questionIndex: 0, userId: 'DUMMY_USER_ID' },
      });

      render(<ChatRoom />);
      expect(screen.getByText('Finding a match...')).toBeInTheDocument();
    });
  });

  describe('WebSocket Integration', () => {
    it('establishes connection and fetches initial data on mount', () => {
      (useWebSocket as jest.Mock).mockReturnValue({
        wsClient: mockWsClient,
        wsActions: mockWsActions,
        isConnected: true,
        conversationMetadata: mockConversationMetadata,
        syncConversation: jest.fn(),
        userMetadata: { questionIndex: 0 },
      });

      render(<ChatRoom />);
      
      expect(mockWsActions.connect).toHaveBeenCalledWith({ userId: 'DUMMY_USER_ID' });
      expect(mockWsActions.fetchUserMetadata).toHaveBeenCalledWith({ userId: 'DUMMY_USER_ID' });
      expect(mockWsActions.fetchChatHistory).toHaveBeenCalledWith({ 
        chatId: 'test-chat-id', 
        limit: 20 
      });
    });
  });

  describe('Message Handling', () => {
    it('handles incoming messages', async () => {
      render(<ChatRoom />);

      const messageHandler = mockWsClient.onMessage.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];

      await act(async () => {
        messageHandler?.({
          id: 'test-message-id',
          sender: 'other-user',
          text: 'Hello!',
          timestamp: new Date().toISOString(),
        });
      });

      expect(screen.getByText('Hello!')).toBeInTheDocument();
    });
  });

  describe('Typing Indicator', () => {
    it('shows typing indicator when partner is typing', () => {
      const otherUserId = 'other-user-id';
      const chatId = `DUMMY_USER_ID#${otherUserId}`;

      // Mock useParams to return the correct chatId
      (useParams as jest.Mock).mockReturnValue({ chatId: encodeURIComponent(chatId) });

      (useWebSocket as jest.Mock).mockReturnValue({
        wsClient: mockWsClient,
        wsActions: mockWsActions,
        isConnected: true,
        conversationMetadata: { chatId, endedBy: null },
        syncConversation: jest.fn(),
        userMetadata: { questionIndex: 0, userId: 'DUMMY_USER_ID' },
      });

      (useTypingIndicator as jest.Mock).mockReturnValue({
        sendTypingStatus: jest.fn(),
        isTyping: { [otherUserId]: true },
      });

      render(<ChatRoom />);
      expect(screen.getByText(/partner is typing/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('sets error state when connection fails', () => {
      const mockOnMaxRetriesExceeded = jest.fn();
      
      (useReconnectionHandler as jest.Mock).mockReturnValue({
        maxRetries: 5,
        retryInterval: 1000,
        onReconnect: jest.fn(),
        onMaxRetriesExceeded: mockOnMaxRetriesExceeded,
      });

      render(<ChatRoom />);
      
      // Simulate max retries exceeded
      mockOnMaxRetriesExceeded();
      
      // The error message should be rendered in the UI
      expect(screen.getByText('Connection lost. Please refresh the page to reconnect.')).toBeInTheDocument();
    });
  });
}); 
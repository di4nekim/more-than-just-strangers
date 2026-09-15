import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WebSocketProvider, useWebSocket } from '../../src/websocket/WebSocketContext';

/**
 * WebSocketProvider tests.
 *
 * The provider never touches the raw WebSocket API: it drives a WebSocketClient
 * plus the actions from createWebSocketActions, and reacts to server messages
 * through client.onMessage(action, handler). Those are the seams mocked here.
 *
 * The client/actions/user mocks are STABLE singletons on purpose — returning a
 * fresh object from every call hands effects keyed on them a new dependency each
 * render, which re-fires them forever (a heap OOM in practice).
 */

// The provider passes a connection-state callback into the client; capture it so
// tests can simulate connect / disconnect the way the real client reports them.
const mockConnectionState = { callback: null };

const mockWsClient = {
  ws: { readyState: 1 }, // WebSocket.OPEN — the provider checks this before getCurrentState
  connect: jest.fn(async () => {
    mockConnectionState.callback?.(true);
    return true;
  }),
  disconnect: jest.fn(async () => {
    mockConnectionState.callback?.(false);
  }),
  send: jest.fn(),
  onMessage: jest.fn(),
  isConnected: true,
};

const mockWsActions = {
  connect: jest.fn(() => mockWsClient.connect()),
  startConversation: jest.fn().mockResolvedValue(true),
  endConversation: jest.fn().mockResolvedValue(true),
  getCurrentState: jest.fn().mockResolvedValue(true),
  updatePresence: jest.fn().mockResolvedValue(true),
  sendMessage: jest.fn().mockResolvedValue(true),
  setReady: jest.fn().mockResolvedValue(true),
  syncConversation: jest.fn().mockResolvedValue(true),
  fetchChatHistory: jest.fn().mockResolvedValue(true),
};

jest.mock('../../src/websocket/websocketHandler', () => ({
  WebSocketClient: jest.fn((url, onConnectionStateChange) => {
    mockConnectionState.callback = onConnectionStateChange;
    return mockWsClient;
  }),
  createWebSocketActions: jest.fn(() => mockWsActions),
}));

// The provider builds its actions from websocketActions (not websocketHandler);
// mock that module too, or the real actions run against the mock client.
jest.mock('../../src/websocket/websocketActions', () => ({
  __esModule: true,
  createWebSocketActions: jest.fn(() => mockWsActions),
  default: jest.fn(() => mockWsActions),
}));

const mockFirebaseUser = {
  uid: 'test-user-123',
  email: 'test@example.com',
  getIdToken: jest.fn().mockResolvedValue('mock-token'),
};

jest.mock('../../src/app/components/auth/FirebaseAuthProvider', () => ({
  useFirebaseAuth: () => ({ user: mockFirebaseUser, isInitialized: true, loading: false }),
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
    hasActiveChat: jest.fn().mockResolvedValue({ hasActiveChat: false, chatId: null }),
    getInitialChatContext: jest.fn().mockResolvedValue({
      currentChatId: null,
      partnerId: null,
      hasActiveChat: false,
      questionIndex: 1,
    }),
    validateChatAccess: jest.fn().mockResolvedValue({ hasAccess: true }),
  },
}));

const { apiClient } = require('../../src/app/lib/api-client');
const { WebSocketClient } = require('../../src/websocket/websocketHandler');

const USER_ID = 'test-user-123';
const CHAT_ID = 'test-chat-123';

// Exposes the live context value to the tests without a component per action.
let ctx;
const Probe = () => {
  ctx = useWebSocket();
  return (
    <div>
      <div data-testid="profile-id">{ctx.userProfile?.userId || 'No user'}</div>
      <div data-testid="chat-id">{ctx.conversationMetadata?.chatId || 'No chat'}</div>
      <div data-testid="is-connected">{ctx.isConnected ? 'Connected' : 'Disconnected'}</div>
      <div data-testid="init">{ctx.initState.isInitializing ? 'Loading' : 'Ready'}</div>
      <div data-testid="init-error">{ctx.initState.error || ''}</div>
    </div>
  );
};

const renderProvider = () =>
  render(
    <WebSocketProvider>
      <Probe />
    </WebSocketProvider>
  );

// Server-message handlers the provider registered, keyed by action name.
const handlers = () => Object.fromEntries(mockWsClient.onMessage.mock.calls);
const dispatch = (action, data) => act(async () => { handlers()[action](data); });

// Polls the DOM without act(); for the one flow whose follow-up work keeps act() busy.
const untilDom = async (predicate, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('untilDom: condition not met within ' + timeoutMs + 'ms');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

async function waitForConnection() {
  await waitFor(() => expect(screen.getByTestId('is-connected')).toHaveTextContent('Connected'));
}

async function initializeUser() {
  await waitForConnection();
  await act(async () => { await ctx.initializeUser(USER_ID); });
  await waitFor(() => expect(screen.getByTestId('init')).toHaveTextContent('Ready'));
}

describe('WebSocketProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnectionState.callback = null;
    process.env.NEXT_PUBLIC_WEBSOCKET_API_URL = 'wss://test-websocket-url.com';
  });

  describe('connection lifecycle', () => {
    test('creates a client for the configured URL and connects automatically on mount', async () => {
      renderProvider();

      await waitForConnection();
      expect(WebSocketClient).toHaveBeenCalledWith('wss://test-websocket-url.com', expect.any(Function));
      expect(mockWsActions.connect).toHaveBeenCalled();
    });

    test('reflects a dropped connection reported by the client', async () => {
      renderProvider();
      await waitForConnection();

      await act(async () => { mockConnectionState.callback(false); });

      expect(screen.getByTestId('is-connected')).toHaveTextContent('Disconnected');
    });

    test('registers exactly one handler per server action (no duplicate "error" registration)', async () => {
      renderProvider();
      await waitForConnection();

      const registered = mockWsClient.onMessage.mock.calls.map(([action]) => action);
      expect(registered.filter((a) => a === 'error')).toHaveLength(1);
      expect(registered).toEqual(expect.arrayContaining(['conversationStarted', 'error']));
    });
  });

  describe('initializeUser', () => {
    test('loads the profile, syncs state over the socket and finishes without error', async () => {
      renderProvider();

      await initializeUser();

      expect(apiClient.getCurrentUserProfile).toHaveBeenCalled();
      expect(mockWsActions.getCurrentState).toHaveBeenCalledWith({ userId: USER_ID });
      expect(screen.getByTestId('profile-id')).toHaveTextContent(USER_ID);
      expect(screen.getByTestId('init-error')).toHaveTextContent('');
    });
  });

  describe('starting a chat', () => {
    test('rejects before the user is initialized', async () => {
      renderProvider();
      await waitForConnection();

      await expect(ctx.startNewChat()).rejects.toThrow(/not ready|not loaded/);
      expect(mockWsActions.startConversation).not.toHaveBeenCalled();
    });

    test('sends startConversation and resolves when the server confirms the conversation', async () => {
      renderProvider();
      await initializeUser();

      let pending;
      await act(async () => { pending = ctx.startNewChat(); });
      expect(mockWsActions.startConversation).toHaveBeenCalledWith({ userId: USER_ID });

      // Deliver the server's confirmation directly rather than inside act(): the
      // provider reacts by kicking off the chat-history load, whose pending work
      // keeps act() from settling. React still renders the update outside act.
      handlers().conversationStarted({
        chatId: CHAT_ID,
        participants: [USER_ID, 'partner-user-456'],
        matched: true,
        createdAt: new Date().toISOString(),
      });

      await expect(pending).resolves.toMatchObject({ chatId: CHAT_ID, matched: true });
      // conversationStarted populates the conversation metadata (it used to stay empty).
      await untilDom(() => screen.getByTestId('chat-id').textContent === CHAT_ID);
      expect(ctx.conversationMetadata.participants).toEqual(expect.arrayContaining([USER_ID, 'partner-user-456']));
    });

    test('rejects promptly when the server answers with an error, instead of waiting for the timeout', async () => {
      renderProvider();
      await initializeUser();

      let pending;
      await act(async () => { pending = ctx.startNewChat(); });
      pending.catch(() => {}); // observed below; avoid an unhandled rejection in between

      const startedAt = Date.now();
      await dispatch('error', { error: 'User already in a conversation' });

      await expect(pending).rejects.toThrow(/already in a conversation/);
      expect(Date.now() - startedAt).toBeLessThan(5000);
    });
  });

  describe('ending a chat', () => {
    test('rejects before the user is initialized', async () => {
      renderProvider();
      await waitForConnection();

      await expect(ctx.endChat(CHAT_ID)).rejects.toThrow(/not ready|not loaded/);
      expect(mockWsActions.endConversation).not.toHaveBeenCalled();
    });

    test('sends endConversation for the given chat', async () => {
      renderProvider();
      await initializeUser();

      await act(async () => { await ctx.endChat(CHAT_ID); });

      expect(mockWsActions.endConversation).toHaveBeenCalledWith({
        userId: USER_ID,
        chatId: CHAT_ID,
        endReason: 'user_ended',
      });
    });
  });

  describe('unmount', () => {
    test('unmounts cleanly after connecting', async () => {
      const { unmount } = renderProvider();
      await waitForConnection();

      expect(() => unmount()).not.toThrow();
    });
  });
});

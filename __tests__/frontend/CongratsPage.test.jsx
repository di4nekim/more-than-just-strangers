import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Congrats from '../../src/app/congrats/page';

// Mock the dependencies
const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('next/image', () => {
  return function MockImage({ src, alt }) {
    return <img src={src} alt={alt} />;
  };
});

jest.mock('../../src/app/components/auth/FirebaseAuthProvider', () => ({
  useFirebaseAuth: () => ({
    user: { uid: 'test-user-123' },
    loading: false,
    signOut: jest.fn(),
  }),
}));

const mockUseWebSocket = jest.fn();

jest.mock('../../src/websocket/WebSocketContext', () => ({
  useWebSocket: () => mockUseWebSocket(),
}));

// Mirrors the context's displayNameFor contract: a real name for known ids, an
// honest fallback otherwise - never a fabricated name.
const makeDisplayNameFor = (names = {}) => jest.fn((userId) => names[userId] || 'Your match');

describe('Congrats Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseWebSocket.mockReturnValue({
      conversationMetadata: {
        chatId: 'test-chat-123',
        participants: ['test-user-123', 'partner-user-456'],
        lastMessage: null,
        lastUpdated: '2024-01-01T00:00:00.000Z',
        endedBy: null,
        endReason: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      partnerId: 'partner-user-456',
      partnerProfile: {
        userId: 'partner-user-456',
        displayName: 'Partner User',
        name: 'Partner User',
        email: null,
      },
      userProfile: {
        userId: 'test-user-123',
        displayName: 'Test User',
        name: 'Test User',
        email: 'test@example.com',
      },
      displayNameFor: makeDisplayNameFor({
        'partner-user-456': 'Partner User',
        'test-user-123': 'Test User',
      }),
      isConnected: true,
      connectionStatus: 'connected',
      lastConnectedAt: '2024-01-01T00:00:00.000Z',
    });
  });

  test('should render the signed-in user\'s real name, not a hardcoded one', () => {
    render(<Congrats />);

    expect(screen.getByText('Congratulations,')).toBeInTheDocument();
    expect(screen.getByText('Test User.')).toBeInTheDocument();
    expect(screen.queryByText(/Quincey/)).not.toBeInTheDocument();
  });

  test('should render the partner\'s real name', () => {
    render(<Congrats />);

    expect(screen.getByText(/conversation with/)).toHaveTextContent('Partner User.');
    expect(screen.queryByText(/Anonymous/)).not.toBeInTheDocument();
  });

  test('should fall back to the email prefix when the user has no real name', () => {
    const base = mockUseWebSocket();
    mockUseWebSocket.mockReturnValue({
      ...base,
      userProfile: {
        userId: 'test-user-123',
        displayName: 'Anonymous',
        name: null,
        email: 'diane@example.com',
      },
    });

    render(<Congrats />);

    expect(screen.getByText('diane.')).toBeInTheDocument();
    expect(screen.queryByText(/Quincey/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Anonymous/)).not.toBeInTheDocument();
  });

  test('should fall back to an honest label when nothing is known about either side', () => {
    mockUseWebSocket.mockReturnValue({
      conversationMetadata: {
        chatId: null,
        participants: [],
        lastMessage: null,
        lastUpdated: null,
        endedBy: null,
        endReason: null,
        createdAt: null,
      },
      partnerId: null,
      partnerProfile: null,
      userProfile: null,
      displayNameFor: makeDisplayNameFor({ 'test-user-123': 'You' }),
      isConnected: false,
      connectionStatus: 'connecting',
      lastConnectedAt: null,
    });

    render(<Congrats />);

    expect(screen.getByText('You.')).toBeInTheDocument();
    expect(screen.getByText(/conversation with/)).toHaveTextContent('Your match.');
    expect(screen.queryByText(/Quincey/)).not.toBeInTheDocument();
  });

  test('should keep both navigation actions', () => {
    render(<Congrats />);

    expect(
      screen.getByRole('button', { name: /continue the connection/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /find a new connection/i })
    ).toBeInTheDocument();
  });

  test('should stack its panels into one column below md', () => {
    const { container } = render(<Congrats />);

    const root = container.firstChild;
    expect(root).toHaveClass('flex-col');
    expect(root).toHaveClass('md:flex-row');
  });
});

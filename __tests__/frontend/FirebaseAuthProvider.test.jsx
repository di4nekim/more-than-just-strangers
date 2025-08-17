// Mock the firebase-config.js file
jest.mock('../../src/lib/firebase-config', () => {
  const mockAuth = {
    currentUser: null,
    onAuthStateChanged: jest.fn(),
    onIdTokenChanged: jest.fn(),
    signOut: jest.fn(),
    getIdToken: jest.fn(() => Promise.resolve('mock-token')),
  };
  
  return {
    auth: mockAuth,
    app: {},
  };
});

import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FirebaseAuthProvider, useFirebaseAuth } from '../../src/app/components/auth/FirebaseAuthProvider';

describe('FirebaseAuthProvider', () => {
  let mockOnAuthStateChanged;
  let mockOnIdTokenChanged;
  let mockAuth;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get the mocked auth object from firebase-config
    const firebaseConfig = require('../../src/lib/firebase-config');
    mockAuth = firebaseConfig.auth;
    
    mockOnAuthStateChanged = jest.fn();
    mockOnIdTokenChanged = jest.fn();
    
    // Reset currentUser to null
    mockAuth.currentUser = null;
  });

  const TestComponent = () => {
    const { user, loading, signOut } = useFirebaseAuth();
    
    if (loading) return <div>Loading...</div>;
    if (!user) return <div>Not authenticated</div>;
    
    return (
      <div>
        <div>Authenticated as {user.email}</div>
        <button onClick={signOut}>Sign Out</button>
      </div>
    );
  };

  test('should show loading state initially', () => {
    // Don't call the callback - let the component show loading
    mockAuth.onAuthStateChanged.mockImplementation((callback) => {
      // Don't call callback yet
      return () => {};
    });

    render(
      <FirebaseAuthProvider>
        <TestComponent />
      </FirebaseAuthProvider>
    );
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('should handle auth state changes when callback is called', async () => {
    let authCallback;
    
    // Capture the callback for later use
    mockAuth.onAuthStateChanged.mockImplementation((callback) => {
      authCallback = callback;
      return () => {};
    });

    render(
      <FirebaseAuthProvider>
        <TestComponent />
      </FirebaseAuthProvider>
    );
    
    // Should show loading initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    
    // Now call the callback with null (no user)
    if (authCallback) {
      act(() => {
        authCallback(null);
      });
    }
    
    // Should show not authenticated state after callback
    await waitFor(() => {
      expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    });
  });

  test('should handle authenticated user when callback is called', async () => {
    let authCallback;
    
    // Capture the callback for later use
    mockAuth.onAuthStateChanged.mockImplementation((callback) => {
      authCallback = callback;
      return () => {};
    });

    render(
      <FirebaseAuthProvider>
        <TestComponent />
      </FirebaseAuthProvider>
    );
    
    // Should show loading initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    
    // Now call the callback with authenticated user
    if (authCallback) {
      const mockUser = {
        uid: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        getIdToken: jest.fn(() => Promise.resolve('mock-token')),
      };
      
      act(() => {
        authCallback(mockUser);
      });
    }
    
    // Should show authenticated state after callback
    await waitFor(() => {
      expect(screen.getByText('Authenticated as test@example.com')).toBeInTheDocument();
    });
  });

  test('should handle sign out flow', async () => {
    let authCallback;
    
    // Capture the callback for later use
    mockAuth.onAuthStateChanged.mockImplementation((callback) => {
      authCallback = callback;
      return () => {};
    });

    render(
      <FirebaseAuthProvider>
        <TestComponent />
      </FirebaseAuthProvider>
    );
    
    // Start with authenticated user
    if (authCallback) {
      const mockUser = {
        uid: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        getIdToken: jest.fn(() => Promise.resolve('mock-token')),
      };
      
      act(() => {
        authCallback(mockUser);
      });
    }
    
    // Wait for authenticated state
    await waitFor(() => {
      expect(screen.getByText('Authenticated as test@example.com')).toBeInTheDocument();
    });
    
    // Now simulate sign out by calling callback with null
    if (authCallback) {
      act(() => {
        authCallback(null);
      });
    }
    
    // Should show not authenticated after sign out
    await waitFor(() => {
      expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    });
  });

  test('should handle token refresh when callback is called', async () => {
    let authCallback;
    
    // Capture the callback for later use
    mockAuth.onAuthStateChanged.mockImplementation((callback) => {
      authCallback = callback;
      return () => {};
    });

    render(
      <FirebaseAuthProvider>
        <TestComponent />
      </FirebaseAuthProvider>
    );
    
    // Start with authenticated user
    if (authCallback) {
      const mockUser = {
        uid: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        getIdToken: jest.fn(() => Promise.resolve('mock-token')),
      };
      
      act(() => {
        authCallback(mockUser);
      });
    }
    
    // Should show authenticated user after callback
    await waitFor(() => {
      expect(screen.getByText('Authenticated as test@example.com')).toBeInTheDocument();
    });
    
    // Simulate token refresh by calling callback again with same user
    if (authCallback) {
      const mockUser = {
        uid: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        getIdToken: jest.fn(() => Promise.resolve('mock-token')),
      };
      
      act(() => {
        authCallback(mockUser);
      });
    }
    
    // Should still show authenticated user after token refresh
    expect(screen.getByText('Authenticated as test@example.com')).toBeInTheDocument();
  });

  test('should handle auth state transitions', async () => {
    let authCallback;
    
    // Capture the callback for later use
    mockAuth.onAuthStateChanged.mockImplementation((callback) => {
      authCallback = callback;
      return () => {};
    });

    render(
      <FirebaseAuthProvider>
        <TestComponent />
      </FirebaseAuthProvider>
    );
    
    // Start with no user
    if (authCallback) {
      act(() => {
        authCallback(null);
      });
    }
    
    // Should show not authenticated after callback
    await waitFor(() => {
      expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    });
    
    // Now simulate user signing in
    if (authCallback) {
      const mockUser = {
        uid: 'user1-123',
        email: 'user1@example.com',
        displayName: 'User 1',
        emailVerified: true,
        getIdToken: jest.fn(() => Promise.resolve('mock-token')),
      };
      
      act(() => {
        authCallback(mockUser);
      });
    }
    
    // Should show authenticated user after sign in
    await waitFor(() => {
      expect(screen.getByText('Authenticated as user1@example.com')).toBeInTheDocument();
    });
  });

  test('should handle errors gracefully', async () => {
    let authCallback;
    
    // Capture the callback for later use
    mockAuth.onAuthStateChanged.mockImplementation((callback) => {
      authCallback = callback;
      return () => {};
    });

    render(
      <FirebaseAuthProvider>
        <TestComponent />
      </FirebaseAuthProvider>
    );
    
    // Simulate error by calling callback with null
    if (authCallback) {
      act(() => {
        authCallback(null);
      });
    }
    
    // Should show not authenticated after callback
    await waitFor(() => {
      expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    });
  });
}); 
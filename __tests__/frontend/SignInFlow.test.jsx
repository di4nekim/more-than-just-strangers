import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Stable router mocks: jest.setup's next/navigation mock hands out a fresh object (and
// fresh jest.fn()s) on every useRouter() call, so redirects can't be asserted against it.
const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/image', () => {
  return function MockImage({ src, alt, ...props }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={typeof src === 'string' ? src : 'mock-image'} alt={alt} {...props} />;
  };
});

const mockUseFirebaseAuth = jest.fn();

jest.mock('../../src/app/components/auth/FirebaseAuthProvider', () => ({
  useFirebaseAuth: () => mockUseFirebaseAuth(),
}));

import SignIn from '../../src/app/signin/page';
import FirebaseSignInRedirect from '../../src/app/firebase-signin/page';
import Landing from '../../src/app/page';

// `null` (not undefined) is the "no value" default, per the suite conventions.
const authState = ({
  user = null,
  loading = false,
  authLoading = false,
  error = null,
  signIn = jest.fn().mockResolvedValue({}),
} = {}) => ({
  user,
  loading,
  authLoading,
  error,
  signIn,
  signUp: jest.fn().mockResolvedValue({}),
  signInWithGoogle: jest.fn().mockResolvedValue(undefined),
  signOut: jest.fn().mockResolvedValue(undefined),
  passwordReset: jest.fn().mockResolvedValue(undefined),
  resendVerification: jest.fn().mockResolvedValue(undefined),
  isEmailVerified: jest.fn(() => true),
  clearError: jest.fn(),
});

const signedInUser = {
  uid: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
};

const setUrl = (url) => {
  window.history.replaceState({}, '', url);
};

describe('Sign-in flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setUrl('/signin');
    mockUseFirebaseAuth.mockReturnValue(authState());
  });

  afterAll(() => {
    setUrl('/');
  });

  describe('canonical /signin page', () => {
    it('shows the sign-in form to an unauthenticated visitor and does not redirect', () => {
      render(<SignIn />);

      expect(screen.getByRole('heading', { name: 'SIGN IN' })).toBeInTheDocument();
      expect(screen.getByLabelText('EMAIL ADDRESS')).toBeInTheDocument();
      expect(screen.getByLabelText('PASSWORD')).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('redirects an already-signed-in visitor to /home', async () => {
      mockUseFirebaseAuth.mockReturnValue(authState({ user: signedInUser }));

      render(<SignIn />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/home');
      });
      // replace(), not push(), so the sign-in page is not left in history
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('waits for auth to settle before redirecting', () => {
      mockUseFirebaseAuth.mockReturnValue(authState({ user: signedInUser, loading: true }));

      render(<SignIn />);

      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('honours a valid ?next= path', async () => {
      setUrl('/signin?next=%2Fcongrats');
      mockUseFirebaseAuth.mockReturnValue(authState({ user: signedInUser }));

      render(<SignIn />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/congrats');
      });
    });

    it.each([
      ['//evil.example.com', 'protocol-relative URL'],
      ['https://evil.example.com/steal', 'absolute URL'],
      ['/\\evil.example.com', 'backslash-escaped host'],
      ['', 'empty value'],
    ])('falls back to /home for an unsafe ?next= (%s: %s)', async (next) => {
      setUrl(`/signin?next=${encodeURIComponent(next)}`);
      mockUseFirebaseAuth.mockReturnValue(authState({ user: signedInUser }));

      render(<SignIn />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/home');
      });
    });

    it.each(['/signin', '/firebase-signin'])(
      'falls back to /home rather than looping back to %s',
      async (next) => {
        setUrl(`/signin?next=${encodeURIComponent(next)}`);
        mockUseFirebaseAuth.mockReturnValue(authState({ user: signedInUser }));

        render(<SignIn />);

        await waitFor(() => {
          expect(mockReplace).toHaveBeenCalledWith('/home');
        });
      }
    );

    it('sends the user to /home after a successful sign-in submit', async () => {
      const signIn = jest.fn().mockResolvedValue({});
      mockUseFirebaseAuth.mockReturnValue(authState({ signIn }));

      render(<SignIn />);

      fireEvent.change(screen.getByLabelText('EMAIL ADDRESS'), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByLabelText('PASSWORD'), {
        target: { value: 'hunter2hunter2' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'SIGN IN' }));

      await waitFor(() => {
        expect(signIn).toHaveBeenCalledWith('test@example.com', 'hunter2hunter2');
      });
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/home');
      });
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('legacy /firebase-signin route', () => {
    it('redirects to the canonical /signin route', async () => {
      setUrl('/firebase-signin');

      render(<FirebaseSignInRedirect />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/signin');
      });
      expect(screen.getByText('Redirecting to sign in...')).toBeInTheDocument();
    });

    it('preserves the query string when redirecting', async () => {
      setUrl('/firebase-signin?next=%2Fcongrats');

      render(<FirebaseSignInRedirect />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/signin?next=%2Fcongrats');
      });
    });
  });

  describe('landing page', () => {
    it('redirects a signed-in visitor to /home', async () => {
      setUrl('/');
      mockUseFirebaseAuth.mockReturnValue(authState({ user: signedInUser }));

      render(<Landing />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/home');
      });
    });

    it('leaves a signed-out visitor on the page and sends START to sign in', () => {
      setUrl('/');

      render(<Landing />);

      expect(mockReplace).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'START' }));
      expect(mockPush).toHaveBeenCalledWith('/signin');
    });

    it('sends START straight to /home for a signed-in visitor', () => {
      setUrl('/');
      mockUseFirebaseAuth.mockReturnValue(authState({ user: signedInUser }));

      render(<Landing />);

      fireEvent.click(screen.getByRole('button', { name: 'START' }));
      expect(mockPush).toHaveBeenCalledWith('/home');
    });
  });
});

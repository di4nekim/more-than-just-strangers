'use client';

import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { useFirebaseAuth } from '../components/auth/FirebaseAuthProvider';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import SignInBg from '../../../public/SIGNUP_BG.svg';

const FirebaseSignIn = memo(function FirebaseSignIn() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [showReset, setShowReset] = useState(false);
  
  // Use refs for form data to prevent re-renders on every keystroke
  const emailRef = useRef('');
  const passwordRef = useRef('');
  const displayNameRef = useRef('');
  const resetEmailRef = useRef('');
  
  const {
    user,
    loading,
    authLoading,
    error,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    passwordReset,
    resendVerification,
    isEmailVerified,
    clearError
  } = useFirebaseAuth();
  
  const router = useRouter();

  useEffect(() => {
    if (user && !loading) {
      router.push('/home');
    }
  }, [user, loading, router]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    clearError();
    
    try {
      if (isSignUp) {
        await signUp(emailRef.current.value, passwordRef.current.value, displayNameRef.current.value);
        alert('Account created! Please check your email for verification.');
        // Clear form fields
        if (emailRef.current) emailRef.current.value = '';
        if (passwordRef.current) passwordRef.current.value = '';
        if (displayNameRef.current) displayNameRef.current.value = '';
      } else {
        await signIn(emailRef.current.value, passwordRef.current.value);
        router.push('/');
      }
    } catch (err) {
      console.error('Auth error:', err);
    }
  }, [isSignUp, signUp, signIn, clearError, router]);

  const handleGoogleSignIn = useCallback(async () => {
    clearError();
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Google sign in error:', err);
    }
  }, [clearError, signInWithGoogle]);

  const handlePasswordReset = useCallback(async (e) => {
    e.preventDefault();
    clearError();
    
    try {
      await passwordReset(resetEmailRef.current.value);
      alert('Password reset email sent! Check your inbox.');
      setShowReset(false);
      if (resetEmailRef.current) {
        resetEmailRef.current.value = '';
      }
    } catch (err) {
      console.error('Password reset error:', err);
    }
  }, [passwordReset, clearError]);

  const handleResendVerification = useCallback(async () => {
    clearError();
    try {
      await resendVerification();
      alert('Verification email sent! Check your inbox.');
    } catch (err) {
      console.error('Resend verification error:', err);
    }
  }, [clearError, resendVerification]);

  const handleToggleSignUp = useCallback(() => {
    setIsSignUp(prev => !prev);
  }, []);

  const handleShowReset = useCallback(() => {
    setShowReset(true);
  }, []);

  const handleHideReset = useCallback(() => {
    setShowReset(false);
  }, []);

  const buttonBase = "w-full flex justify-center py-2 px-4 border rounded-md shadow-sm text-sm font-medium disabled:opacity-50";
  const buttonPrimary = `${buttonBase} border-transparent text-white bg-teal hover:bg-sky-blue`;
  const buttonSecondary = `${buttonBase} border-teal text-teal bg-white hover:bg-light-blue`;
  const inputBase = "mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500";

  const ErrorDisplay = memo(({ error }) => error && (
    <div className="bg-red-50 border border-red-200 rounded-md p-4">
      <p className="text-sm text-red-800">{error}</p>
    </div>
  ));
  ErrorDisplay.displayName = 'ErrorDisplay';

  const FormInput = memo(({ id, label, type, inputRef, placeholder, required = false }) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-teal">{label}</label>
      <input
        id={id}
        type={type}
        required={required}
        ref={inputRef}
        className={inputBase}
        placeholder={placeholder}
      />
    </div>
  ));
  FormInput.displayName = 'FormInput';

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Welcome!</h2>
            <p className="mt-2 text-gray-600 dark:text-gray-400">You're signed in with Firebase Auth</p>
          </div>
          
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Email:</strong> {user.email}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Display Name:</strong> {user.displayName || 'Not set'}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Email Verified:</strong> {isEmailVerified() ? 'Yes' : 'No'}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <strong>User ID:</strong> {user.uid}
              </p>
            </div>
            
            {!isEmailVerified() && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Your email is not verified. Please check your inbox or resend verification.
                </p>
                <button
                  onClick={handleResendVerification}
                  className="mt-2 text-sm text-yellow-600 dark:text-yellow-400 hover:underline"
                >
                  Resend verification email
                </button>
              </div>
            )}
            
            <button
              onClick={signOut}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showReset) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Reset Password</h2>
          </div>
          
          <form onSubmit={handlePasswordReset} className="space-y-6">
            <ErrorDisplay error={error} />
            
            <FormInput
              id="reset-email"
              label="Email address"
              type="email"
              inputRef={resetEmailRef}
              placeholder="Enter your email"
              required
            />
            
            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={authLoading}
                className="flex-1 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {authLoading ? 'Sending...' : 'Send Reset Email'}
              </button>
              
              <button
                type="button"
                onClick={handleHideReset}
                className="flex-1 flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen relative font-jetbrains-mono">
      <Image src={SignInBg} alt="Sign In Background" className="w-full h-full object-cover absolute" />
      
      <div className="relative z-10 h-full flex">
        <div className="w-1/2 flex items-center justify-center">
          <div className="text-left text-beige">
            <div className="text-xl italic">let's be</div>
            <div className="text-5xl font-semibold">MORE THAN</div>
            <div className="text-5xl font-semibold">JUST STRANGERS</div>
          </div>
        </div>

        <div className="w-1/2 flex items-center justify-center">
          <div className="w-96 space-y-8 p-8 bg-white rounded-lg shadow-md">
            <div className="text-center">
              <h2 className="text-3xl font-semibold text-teal">
                {isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <ErrorDisplay error={error} />
              
              {isSignUp && (
                <FormInput
                  id="displayName"
                  label="DISPLAY NAME (optional)"
                  type="text"
                  inputRef={displayNameRef}
                  placeholder="Your name"
                />
              )}
              
              <FormInput
                id="email"
                label="EMAIL ADDRESS"
                type="email"
                inputRef={emailRef}
                placeholder="your@email.com"
                required
              />
              
              <FormInput
                id="password"
                label="PASSWORD"
                type="password"
                inputRef={passwordRef}
                placeholder="Password"
                required
              />
              
              <button
                type="submit"
                disabled={authLoading}
                className={buttonPrimary}
              >
                {authLoading ? 'LOADING...' : (isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN')}
              </button>
              
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={authLoading}
                className={buttonSecondary}
              >
                CONTINUE WITH GOOGLE
              </button>
            </form>
            
            <div className="text-center space-y-2">
              <button
                type="button"
                onClick={handleToggleSignUp}
                className="text-sm text-teal hover:underline"
              >
                {isSignUp ? 'ALREADY HAVE AN ACCOUNT? SIGN IN' : 'NEED AN ACCOUNT? SIGN UP'}
              </button>
              
              {!isSignUp && (
                <button
                  type="button"
                  onClick={handleShowReset}
                  className="block text-sm text-sky-blue hover:underline mx-auto"
                >
                  FORGOT YOUR PASSWORD?
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

FirebaseSignIn.displayName = 'FirebaseSignIn';

export default FirebaseSignIn; 
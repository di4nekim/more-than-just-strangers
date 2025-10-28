'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth } from '../../../lib/firebase-config';

const FirebaseAuthContext = createContext(undefined);

export function FirebaseAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const router = useRouter();

  const signUp = useCallback(async (email, password, displayName = '') => {
    try {
      setAuthLoading(true);
      setError(null);
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      if (displayName) {
        await updateProfile(userCredential.user, { displayName });
      }
      
      await sendEmailVerification(userCredential.user);
      return userCredential;
    } catch (error) {
      setError(error.message || 'Failed to create account');
      throw error;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const signIn = useCallback(async (email, password) => {
    try {
      setAuthLoading(true);
      setError(null);
      
      console.log('Attempting sign in with:', { email, authDomain: auth.app.options.authDomain });
      console.log('Firebase config:', auth.app.options);
      
      // Add retry logic for network issues
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          console.log('Sign in successful:', userCredential.user.uid);
          return userCredential;
        } catch (error) {
          lastError = error;
          console.error(`Sign in attempt ${attempt} failed:`, {
            code: error.code,
            message: error.message
          });
          
          // If it's a network error and we have retries left, wait and try again
          if (error.code === 'auth/network-request-failed' && attempt < 3) {
            console.log(`Retrying in ${attempt * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            continue;
          }
          
          // For non-network errors or final attempt, throw immediately
          throw error;
        }
      }
      
      // If we get here, all retries failed
      throw lastError;
    } catch (error) {
      console.error('Sign in error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      
      // Provide more helpful error messages
      let errorMessage = error.message || 'Failed to sign in';
      if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later or reset your password.';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled. Please contact support.';
      }
      
      setError(errorMessage);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const googleSignIn = useCallback(async () => {
    try {
      setAuthLoading(true);
      setError(null);
      
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Google sign in error:', {
        code: error.code,
        message: error.message
      });
      
      let errorMessage = error.message || 'Failed to sign in with Google';
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign in was cancelled. Please try again.';
      } else if (error.code === 'auth/popup-blocked') {
        errorMessage = 'Popup was blocked by your browser. Please allow popups and try again.';
      } else if (error.code === 'auth/cancelled-popup-request') {
        errorMessage = 'Sign in was cancelled. Please try again.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      }
      
      setError(errorMessage);
      throw error;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      setError(null);
      await signOut(auth);
    } catch (error) {
      setError(error.message || 'Failed to sign out');
      throw error;
    }
  }, []);

  const passwordReset = useCallback(async (email) => {
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      setError(error.message || 'Failed to send password reset email');
      throw error;
    }
  }, []);

  const handleUpdateProfile = useCallback(async (updates) => {
    try {
      setError(null);
      if (!user) throw new Error('No user signed in');
      
      await updateProfile(user, updates);
    } catch (error) {
      setError(error.message || 'Failed to update profile');
      throw error;
    }
  }, [user]);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    try {
      setError(null);
      if (!user || !user.email) throw new Error('No user signed in');
      
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      await updatePassword(user, newPassword);
    } catch (error) {
      setError(error.message || 'Failed to change password');
      throw error;
    }
  }, [user]);

  const resendVerification = useCallback(async () => {
    try {
      setError(null);
      if (!user) throw new Error('No user signed in');
      
      await sendEmailVerification(user);
    } catch (error) {
      setError(error.message || 'Failed to resend verification email');
      throw error;
    }
  }, [user]);

  const getUserId = useCallback(() => user?.uid || null, [user]);
  const isAuthenticated = useCallback(() => !!user && isInitialized, [user, isInitialized]);
  const isEmailVerified = useCallback(() => user?.emailVerified || false, [user]);

  const requireAuth = useCallback((redirectTo = '/signin') => {
    if (isInitialized && !user) {
      router.push(redirectTo);
      return false;
    }
    return true;
  }, [isInitialized, user, router]);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (!auth) {
      console.error('Firebase auth not initialized');
      setError('Firebase authentication not available');
      setLoading(false);
      setIsInitialized(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.log('Firebase auth state changed:', firebaseUser?.uid || 'signed out');
      
      // Only update state if something actually changed
      setUser(prevUser => {
        // Check if user actually changed
        if (prevUser?.uid === firebaseUser?.uid && 
            prevUser?.email === firebaseUser?.email &&
            prevUser?.emailVerified === firebaseUser?.emailVerified) {
          return prevUser; // No change, return same reference
        }
        return firebaseUser;
      });
      
      setLoading(false);
      setIsInitialized(true);
    });

    return () => unsubscribe();
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    authLoading,
    error,
    isInitialized,
    
    signUp,
    signIn,
    signInWithGoogle: googleSignIn,
    signOut: handleSignOut,
    passwordReset,
    updateProfile: handleUpdateProfile,
    changePassword,
    resendVerification,
    
    getUserId,
    isAuthenticated,
    isEmailVerified,
    requireAuth,
    clearError
  }), [
    user,
    loading,
    authLoading,
    error,
    isInitialized,
    signUp,
    signIn,
    googleSignIn,
    handleSignOut,
    passwordReset,
    handleUpdateProfile,
    changePassword,
    resendVerification,
    getUserId,
    isAuthenticated,
    isEmailVerified,
    requireAuth,
    clearError
  ]);

  return (
    <FirebaseAuthContext.Provider value={value}>
      {children}
    </FirebaseAuthContext.Provider>
  );
}

export const useFirebaseAuth = () => {
  const context = useContext(FirebaseAuthContext);
  if (context === undefined) {
    throw new Error('useFirebaseAuth must be used within a FirebaseAuthProvider');
  }
  return context;
}; 
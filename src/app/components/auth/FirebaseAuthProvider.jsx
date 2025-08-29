'use client';

import { createContext, useContext, useEffect, useState } from 'react';
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
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const router = useRouter();

  const signUp = async (email, password, displayName = '') => {
    try {
      setLoading(true);
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
      setLoading(false);
    }
  };

  const signIn = async (email, password) => {
    try {
      setLoading(true);
      setError(null);
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential;
    } catch (error) {
      setError(error.message || 'Failed to sign in');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const googleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      setError(error.message || 'Failed to sign in with Google');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setError(null);
      await signOut(auth);
    } catch (error) {
      setError(error.message || 'Failed to sign out');
      throw error;
    }
  };

  const passwordReset = async (email) => {
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      setError(error.message || 'Failed to send password reset email');
      throw error;
    }
  };

  const handleUpdateProfile = async (updates) => {
    try {
      setError(null);
      if (!user) throw new Error('No user signed in');
      
      await updateProfile(user, updates);
    } catch (error) {
      setError(error.message || 'Failed to update profile');
      throw error;
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
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
  };

  const resendVerification = async () => {
    try {
      setError(null);
      if (!user) throw new Error('No user signed in');
      
      await sendEmailVerification(user);
    } catch (error) {
      setError(error.message || 'Failed to resend verification email');
      throw error;
    }
  };

  const getUserId = () => user?.uid || null;
  const isAuthenticated = () => !!user && isInitialized;
  const isEmailVerified = () => user?.emailVerified || false;

  const requireAuth = (redirectTo = '/signin') => {
    if (isInitialized && !user) {
      router.push(redirectTo);
      return false;
    }
    return true;
  };

  const clearError = () => setError(null);

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
      
      const updates = () => {
        setUser(firebaseUser);
        setLoading(false);
        setIsInitialized(true);
      };
      
      if (typeof window !== 'undefined') {
        setTimeout(updates, 0);
      } else {
        updates();
      }
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    loading,
    error,
    isInitialized,
    
    signUp: signUp,
    signIn: signIn,
    signInWithGoogle: googleSignIn,
    signOut: handleSignOut,
    passwordReset: passwordReset,
    updateProfile: handleUpdateProfile,
    changePassword: changePassword,
    resendVerification: resendVerification,
    
    getUserId,
    isAuthenticated,
    isEmailVerified,
    requireAuth,
    clearError
  };

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
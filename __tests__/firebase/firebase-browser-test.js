// Firebase Browser Test Script
// Run this in the browser console when your Next.js app is running at http://localhost:3000

console.log('Testing Firebase authentication...');

// Check if we're in the right context
if (typeof window === 'undefined') {
  console.error('This test must be run in a browser environment');
  return;
}

// Check if the app is loaded
if (!window.__NEXT_DATA__) {
  console.error('Next.js app not detected. Make sure you are on your app page with Firebase loaded');
  return;
}

// Test Firebase availability
try {
  // Check if Firebase is available globally (it might be)
  if (typeof firebase !== 'undefined') {
    console.log('Firebase is available globally');
  } else {
    console.log('Firebase not available globally, checking app context...');
    console.log('This is normal for Next.js applications');
  }

  // Try to access Firebase through the app's context
  // This will work if the app has loaded Firebase
  const testFirebase = async () => {
    try {
      // Check if we can access the Firebase auth from the app context
      const { auth } = await import('/src/lib/firebase-config.js');
      
      if (auth) {
        console.log('Firebase auth is available in app context');
        
        // Test getting current user
        const currentUser = auth.currentUser;
        console.log('Current user:', currentUser ? {
          uid: currentUser.uid,
          email: currentUser.email,
          emailVerified: currentUser.emailVerified
        } : 'No user signed in');
        
        // Test auth state listener
        const unsubscribe = auth.onAuthStateChanged((user) => {
          console.log('Auth state changed:', user ? 'User signed in' : 'User signed out');
        });
        
        // Clean up listener after 5 seconds
        setTimeout(() => {
          unsubscribe();
          console.log('Auth state listener cleaned up');
        }, 5000);
        
      } else {
        console.error('Firebase auth not available');
      }
    } catch (error) {
      console.error('Error accessing Firebase:', error.message);
    }
  };

  testFirebase();

} catch (error) {
  console.error('Firebase test failed:', error.message);
  console.log('Make sure you are on your app page with Firebase loaded');
}

// Alternative test: Check if the app's Firebase context is available
console.log('Checking app Firebase context...');

// Try to access the Firebase auth provider context
if (window.React && window.React.useContext) {
  console.log('React context available');
} else {
  console.log('React context not available globally');
  console.log('This is normal for Next.js applications');
}

// Test environment variables (these should be available in Next.js)
console.log('Environment check:');
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- Firebase API Key available:', !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
console.log('- Firebase Firebase Auth Domain available:', !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);

console.log('Firebase browser test completed'); 
// Simple Firebase Console Test
// Copy and paste this entire script into your browser console when on your app page

(function() {
  console.log('Testing Firebase authentication...');
  
  // Check if we're in the right context
  if (typeof window === 'undefined') {
    console.error('This test must be run in a browser environment');
    return;
  }

  // Check if Next.js app is loaded
  if (!window.__NEXT_DATA__) {
    console.error('Next.js app not detected. Make sure you are on your app page');
    return;
  }

  console.log('Next.js app detected');

  // Method 1: Try to access Firebase through window object
  if (window.firebase) {
    console.log('Firebase found on window object');
    console.log('Firebase version:', window.firebase.SDK_VERSION);
  } else {
    console.log('Firebase not found on window object');
    console.log('This is expected in a browser environment');
    return false;
  }

  // Method 2: Try to access through React DevTools
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    console.log('React DevTools available');
  }

  // Method 3: Check if the app has any Firebase-related global variables
  const firebaseKeys = Object.keys(window).filter(key => 
    key.toLowerCase().includes('firebase') || 
    key.toLowerCase().includes('auth') ||
    key.toLowerCase().includes('config')
  );
  
  if (firebaseKeys.length === 0) {
    console.log('No Firebase-related keys found on window');
    console.log('This is expected in a browser environment');
    return false;
  }

  console.log('Found Firebase-related keys:', firebaseKeys);

  // Method 4: Try to access the app's Firebase context through React
  try {
    // This might work if the app exposes Firebase through a global variable
    if (window.__FIREBASE_AUTH__) {
      console.log('Firebase auth found on window.__FIREBASE_AUTH__');
    }
  } catch (e) {
    console.log('Firebase auth not found on window.__FIREBASE_AUTH__');
  }

  // Method 5: Check if we can access the app's components
  const appRoot = document.querySelector('#__next');
  if (appRoot) {
    console.log('Next.js app root found');
    
    // Look for any Firebase-related elements or data attributes
    const firebaseElements = appRoot.querySelectorAll('[data-firebase], [class*="firebase"], [id*="firebase"]');
    if (firebaseElements.length > 0) {
      console.log('Found Firebase-related elements:', firebaseElements.length);
    }
  }

  // Method 6: Check environment variables (these should be available in Next.js)
  console.log('Environment check:');
  try {
    console.log('- NODE_ENV:', process.env.NODE_ENV);
    console.log('- Firebase API Key available:', !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
    console.log('- Firebase Auth Domain available:', !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
  } catch (e) {
    console.log('Environment variables not accessible from console');
  }

  // Method 7: Try to create a simple Firebase test
  console.log('Attempting Firebase initialization test...');
  
  // This will only work if Firebase is already loaded by the app
  if (typeof firebase !== 'undefined') {
    try {
      const auth = firebase.auth();
      console.log('Firebase auth accessible');
      
      // Check current user
      const user = auth.currentUser;
      console.log('Current user:', user ? {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified
      } : 'No user signed in');
      
    } catch (error) {
      console.error('Error accessing Firebase auth:', error.message);
    }
  } else {
    console.log('Firebase not available globally - this is normal for Next.js apps');
    console.log('Firebase is loaded within the app context, not globally');
  }

  console.log('Firebase console test completed');
  console.log('If Firebase is not accessible, try running this test from within your app page');
})(); 
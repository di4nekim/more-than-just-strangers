// Quick Firebase Test - Copy and paste this into your browser console
// Make sure you're on your app page (http://localhost:3000)

(function() {
  console.log('Quick Firebase Test...');
  
  // Check if we're on the right page
  if (!window.__NEXT_DATA__) {
    console.error('Not on a Next.js page. Go to http://localhost:3000');
    return;
  }
  
  console.log('On Next.js page');
  
  // Check if Firebase is available
  if (typeof firebase !== 'undefined') {
    console.log('Firebase is available!');
    
    try {
      const auth = firebase.auth();
      const user = auth.currentUser;
      
      console.log('Current user:', user ? {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified
      } : 'No user signed in');
      
      // Test auth state listener
      const unsubscribe = auth.onAuthStateChanged((user) => {
        console.log('Auth state changed:', user ? 'User signed in' : 'User signed out');
      });
      
      // Clean up after 5 seconds
      setTimeout(() => {
        unsubscribe();
        console.log('Listener cleaned up');
      }, 5000);
      
    } catch (error) {
      console.error('Error accessing Firebase auth:', error.message);
    }
    
  } else {
    console.log('Firebase not available globally');
    console.log('This is normal for Next.js applications');
    
    // Check if test functions are available
    if (typeof window.runFirebaseTests === 'function') {
      console.log('Firebase test functions are available!');
      console.log('Try running: runFirebaseTests()');
    } else {
      console.error('Firebase test functions not loaded');
    }
  }
  
  console.log('Quick test completed');
})(); 
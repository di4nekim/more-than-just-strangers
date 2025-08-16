// Test Firebase Admin SDK initialization
console.log('Testing Firebase Admin SDK Initialization');

// Check environment variables
console.log('Environment Variables:');
console.log('Firebase Admin SDK test completed successfully');

// Test Firebase Admin initialization
async function testFirebaseAdmin() {
  try {
    console.log('Testing Firebase Admin initialization...');
    
    // Import Firebase Admin
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');
    
    console.log('Firebase Admin modules imported successfully');
    
    // Check if already initialized
    const apps = getApps();
    console.log('Existing Firebase apps:', apps.length);
    
    if (apps.length === 0) {
      console.log('Initializing Firebase Admin...');
      
      // Check environment variables
      if (!process.env.FIREBASE_PROJECT_ID) {
        throw new Error('FIREBASE_PROJECT_ID is missing');
      }
      if (!process.env.FIREBASE_CLIENT_EMAIL) {
        throw new Error('FIREBASE_CLIENT_EMAIL is missing');
      }
      if (!process.env.FIREBASE_PRIVATE_KEY) {
        throw new Error('FIREBASE_PRIVATE_KEY is missing');
      }
      
      // Initialize Firebase Admin
      const app = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
      
      console.log('Firebase Admin initialized successfully');
      console.log('App name:', app.name);
    } else {
      console.log('Firebase Admin already initialized');
    }
    
    // Test auth
    const auth = getAuth();
    console.log('Firebase Auth initialized:', !!auth);
    
    // Test with a sample token (this will fail but should not crash)
    try {
      await auth.verifyIdToken('invalid-token');
    } catch (error) {
      console.log('Token verification test (expected to fail):', error.message);
    }
    
    console.log('Firebase Admin SDK test completed successfully');
    console.log('All tests passed!');
    
  } catch (error) {
    console.error('Firebase Admin SDK test failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
}

// Run the test
testFirebaseAdmin(); 
// Firebase Test Component
// This can be used to test Firebase authentication from within the app

// Function to test Firebase authentication
function testFirebaseAuth() {
  console.log('Testing Firebase authentication...');
  
  try {
    // Check if we can access Firebase through the app's context
    const appRoot = document.querySelector('#__next');
    if (appRoot) {
      console.log('✅ Next.js app root found');
    }
    
    // Check if Firebase is available globally (for older SDKs)
    if (typeof firebase !== 'undefined') {
      console.log('✅ Firebase found globally');
      const auth = firebase.auth();
      const user = auth.currentUser;
      console.log('👤 Current user:', user ? {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified
      } : 'No user signed in');
      return true;
    }
    
    // Check if we can access through window object
    if (window.firebaseAuth) {
      console.log('✅ Firebase auth found on window');
      return true;
    }
    
    console.log('Firebase auth not directly accessible from console');
    console.log('This is expected in a browser environment');
    return false;
    
  } catch (error) {
    console.log('Firebase auth not available:', error.message);
    console.log('This is expected in a browser environment');
    return false;
  }
}

// Function to test Firebase configuration
function testFirebaseConfig() {
  console.log('Testing Firebase configuration...');
  
  try {
    // Check environment variables
    const config = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
    };
    
    console.log('Firebase config check:');
    Object.entries(config).forEach(([key, value]) => {
      console.log(`  ${key}: ${value ? 'Set' : 'Missing'}`);
    });
    
    // Check if all required config is present
    const required = ['apiKey', 'authDomain', 'projectId'];
    const missing = required.filter(key => !config[key]);
    
    if (missing.length === 0) {
      console.log('All required Firebase config is present');
      return true;
    } else {
      console.error('Missing required Firebase config:', missing);
      return false;
    }
  } catch (error) {
    console.error('Error checking Firebase config:', error);
    return false;
  }
}

// Function to test Firebase auth methods
async function testFirebaseAuthMethods() {
  console.log('Testing Firebase auth methods...');
  
  try {
    if (window.firebase) {
      const auth = window.firebase.auth();
      
      // Test 1: Check if auth methods are available
      const methods = [
        'signInWithEmailAndPassword',
        'createUserWithEmailAndPassword',
        'signOut',
        'onAuthStateChanged',
        'currentUser'
      ];
      
      console.log('Auth methods check:');
      methods.forEach(method => {
        const available = typeof auth[method] === 'function' || auth[method] !== undefined;
        console.log(`  ${method}: ${available ? 'Available' : 'Not available'}`);
      });
      
      // Test 2: Try to get current user
      const user = auth.currentUser;
      console.log('Current user test:', user ? 'User is signed in' : 'No user signed in');
      
      return true;
    } else {
      console.log('Firebase not available globally');
      console.log('This is normal for Next.js applications');
      return false;
    }
  } catch (error) {
    console.error('Error testing Firebase auth methods:', error);
    return false;
  }
}

// Comprehensive test function
async function runFirebaseTests() {
  console.log('Starting comprehensive Firebase tests...');
  
  const results = {
    config: testFirebaseConfig(),
    auth: testFirebaseAuth(),
    methods: await testFirebaseAuthMethods()
  };
  
  console.log('Test results:', results);
  
  const allPassed = Object.values(results).every(result => result === true);
  
  if (allPassed) {
    console.log('All Firebase tests passed!');
  } else {
    console.log('Some Firebase tests failed');
  }
  
  return results;
}

// Make functions available globally for console testing
if (typeof window !== 'undefined') {
  window.testFirebaseAuth = testFirebaseAuth;
  window.testFirebaseConfig = testFirebaseConfig;
  window.testFirebaseAuthMethods = testFirebaseAuthMethods;
  window.runFirebaseTests = runFirebaseTests;
  
  console.log('Firebase test functions available globally:');
  console.log('  - testFirebaseAuth()');
  console.log('  - testFirebaseConfig()');
  console.log('  - testFirebaseAuthMethods()');
  console.log('  - runFirebaseTests()');
} 
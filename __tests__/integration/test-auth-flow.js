// Test authentication flow
console.log('🔐 Testing Authentication Flow');

// Check if we're in a browser environment
if (typeof window === 'undefined') {
  console.log('❌ This test must be run in a browser environment');
  process.exit(1);
}

// Check if Firebase is available
if (!window.firebase) {
  console.log('❌ Firebase is not available in browser');
  console.log('📝 Make sure Firebase is properly initialized');
  return;
}

console.log('✅ Firebase is available');

// Check if user is signed in
const auth = window.firebase.auth();
if (!auth) {
  console.log('❌ Firebase Auth is not available');
  return;
}

console.log('✅ Firebase Auth is available');

// Check current user
const currentUser = auth.currentUser;
if (currentUser) {
  console.log('✅ User is signed in:', currentUser.email);
  
  // Get the ID token
  currentUser.getIdToken()
    .then(token => {
      console.log('✅ ID token obtained (length:', token.length + ')');
      
      // Test the API with the real token
      testAPIWithToken(token);
    })
    .catch(error => {
      console.error('❌ Failed to get ID token:', error);
    });
} else {
  console.log('❌ No user is signed in');
  console.log('📝 Please sign in to Firebase first');
  
  // Listen for auth state changes
  auth.onAuthStateChanged(user => {
    if (user) {
      console.log('✅ User signed in:', user.email);
      user.getIdToken()
        .then(token => {
          console.log('✅ ID token obtained (length:', token.length + ')');
          testAPIWithToken(token);
        })
        .catch(error => {
          console.error('❌ Failed to get ID token:', error);
        });
    } else {
      console.log('❌ User signed out');
    }
  });
}

async function testAPIWithToken(token) {
  try {
    console.log('🌐 Testing API with real Firebase token...');
    
    const response = await fetch('/api/user/profile', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('📡 API Response:', response.status, response.statusText);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API call successful:', data);
    } else {
      const errorData = await response.json();
      console.log('❌ API call failed:', errorData);
    }
    
  } catch (error) {
    console.error('❌ API test failed:', error);
  }
}

console.log('📝 Instructions:');
console.log('1. Make sure you are signed in to Firebase');
console.log('2. Check the console for authentication status');
console.log('3. If not signed in, sign in and the test will run automatically'); 
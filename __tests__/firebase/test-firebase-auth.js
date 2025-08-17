// Test Firebase authentication flow
console.log('Testing Firebase Authentication');

// Check if Firebase is available
if (typeof window !== 'undefined' && window.firebase) {
  console.log('✅ Firebase is available in browser');
} else {
  console.log('❌ Firebase is not available in browser');
}

// Check environment variables
console.log('Environment Check:');
console.log('NEXT_PUBLIC_FIREBASE_API_KEY:', process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✅ Set' : '❌ Missing');
console.log('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? '✅ Set' : '❌ Missing');
console.log('NEXT_PUBLIC_FIREBASE_PROJECT_ID:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing');

// Test API endpoint
async function testAPI() {
  try {
    console.log('🌐 Testing API endpoint...');
    
    // Test without token (should return 401)
    const response1 = await fetch('/api/user/profile');
    console.log('Response without token:', response1.status, response1.statusText);
    
    // Test with invalid token (should return 401)
    const response2 = await fetch('/api/user/profile', {
      headers: {
        'Authorization': 'Bearer invalid-token'
      }
    });
    console.log('Response with invalid token:', response2.status, response2.statusText);
    
    // Test with demo token (should return 401 but different error)
    const response3 = await fetch('/api/user/profile', {
      headers: {
        'Authorization': 'Bearer demo-token'
      }
    });
    console.log('Response with demo token:', response3.status, response3.statusText);
    
    const data3 = await response3.json();
    console.log('Demo token response data:', data3);
    
  } catch (error) {
    console.error('❌ API test failed:', error);
  }
}

// Run the test
testAPI();

console.log('📝 Next steps:');
console.log('1. Check if user is signed in to Firebase');
console.log('2. Check if Firebase token is being sent with API requests');
console.log('3. Check browser console for authentication errors'); 
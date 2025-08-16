/**
 * Test WebSocket Connection with Firebase Token
 * This script tests the WebSocket endpoint with a Firebase token
 */

import WebSocket from 'ws';

// Configuration
const WEBSOCKET_URL = 'wss://82hp8bmge8.execute-api.us-east-1.amazonaws.com/Dev';

// You need to replace this with a valid Firebase ID token
// Get this from your browser console: firebase.auth().currentUser.getIdToken()
const FIREBASE_TOKEN = 'YOUR_FIREBASE_TOKEN_HERE'; // Replace this!

console.log('Testing WebSocket Connection with Firebase Token');
console.log('URL:', WEBSOCKET_URL);
console.log('');

if (FIREBASE_TOKEN === 'YOUR_FIREBASE_TOKEN_HERE') {
  console.log('Please replace FIREBASE_TOKEN with a valid Firebase ID token');
  console.log('');
  console.log('To get a Firebase token:');
  console.log('   1. Open your browser console (F12)');
  console.log('   2. Run: firebase.auth().currentUser.getIdToken().then(token => console.log(token))');
  console.log('   3. Copy the token and replace FIREBASE_TOKEN in this script');
  process.exit(1);
}

// Test connection with Firebase token
console.log('Testing connection with Firebase token...');
const wsUrl = `${WEBSOCKET_URL}?token=${encodeURIComponent(FIREBASE_TOKEN)}`;
const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('WebSocket connection opened successfully with Firebase token!');
  console.log('Authentication successful');
  console.log('');
  console.log('Your WebSocket endpoint is working correctly!');
  console.log('');
  console.log('Next steps:');
  console.log('   - Test sending messages through the WebSocket');
  console.log('   - Test receiving messages from the WebSocket');
  console.log('   - Test the full chat functionality');
  console.log('');
  console.log('Troubleshooting:');
  console.log('   - Check if the Firebase token is valid and not expired');
  console.log('   - Verify the WebSocket URL is correct');
  console.log('   - Check the browser console for any errors');
  console.log('   - Verify your Firebase configuration');
  
  // Close the connection
  ws.close();
});

ws.on('error', (error) => {
  console.log('WebSocket connection failed:', error.message);
  console.log('');
  console.log('Troubleshooting:');
  console.log('   - Check if the Firebase token is valid and not expired');
  console.log('   - Verify the WebSocket URL is correct');
  console.log('   - Check if the Lambda functions are deployed');
  console.log('   - Look at CloudWatch logs for backend errors');
});

ws.on('close', (code, reason) => {
  console.log('WebSocket closed with code:', code);
  if (code === 1000) {
    console.log('Normal closure - test completed successfully');
  } else {
    console.log('Unexpected closure');
  }
});

// Timeout after 10 seconds
setTimeout(() => {
  if (ws.readyState === WebSocket.CONNECTING) {
    console.log('Connection timeout after 10 seconds');
    ws.terminate();
  }
}, 10000); 
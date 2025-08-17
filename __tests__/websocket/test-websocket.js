/**
 * Simple WebSocket Connection Test
 * Tests the WebSocket endpoint without authentication to identify 502 errors
 */

const WebSocket = require('ws');

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_API_URL || 'wss://your-websocket-api.execute-api.us-east-1.amazonaws.com/dev';

console.log('Testing WebSocket connection to:', WEBSOCKET_URL);

const ws = new WebSocket(WEBSOCKET_URL);

ws.on('open', () => {
    console.log('✅ WebSocket connection opened successfully');
    console.log('Ready state:', ws.readyState);
    ws.close();
});

ws.on('error', (error) => {
    console.log('❌ WebSocket connection error:', error.message);
    console.log('Error details:', error);
});

ws.on('close', (code, reason) => {
    console.log('🔌 WebSocket closed with code:', code);
    console.log('Close reason:', reason ? reason.toString() : 'No reason provided');
    
    // Interpret close codes
    switch (code) {
        case 1000:
            console.log('✅ Normal closure');
            break;
        case 1001:
            console.log('Going away');
            break;
        case 1002:
            console.log('❌ Protocol error');
            break;
        case 1003:
            console.log('❌ Unsupported data');
            break;
        case 1006:
            console.log('❌ Abnormal closure');
            break;
        case 1008:
            console.log('❌ Policy violation (often auth-related)');
            break;
        case 1011:
            console.log('❌ Server error');
            break;
        case 1015:
            console.log('❌ TLS handshake failed');
            break;
        default:
            console.log(`❌ Unknown close code: ${code}`);
    }
});

// Timeout after 10 seconds
setTimeout(() => {
    if (ws.readyState === WebSocket.CONNECTING) {
        console.log('⏰ Connection timeout after 10 seconds');
        ws.terminate();
    }
}, 10000);

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted by user');
    ws.close();
    process.exit(0);
}); 
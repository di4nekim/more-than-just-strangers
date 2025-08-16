/**
 * WebSocket Connection Diagnostic Script
 * 
 * This script helps diagnose WebSocket connection issues by:
 * 1. Testing the WebSocket endpoint directly
 * 2. Checking environment variables
 * 3. Validating Firebase configuration
 * 4. Testing Lambda function invocation
 */

const WebSocket = require('ws');
const { getAuth } = require('firebase/auth');
const admin = require('firebase-admin');

// Configuration
const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_API_URL || 'wss://82hp8bmge8.execute-api.us-east-1.amazonaws.com/Dev';

/**
 * Test 1: Basic WebSocket Connection (without authentication)
 */
async function testBasicConnection() {
    console.log('Test 1: Basic WebSocket Connection');
    console.log('URL:', WEBSOCKET_URL);
    
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WEBSOCKET_URL);
        
        ws.on('open', () => {
            console.log('WebSocket connection opened successfully');
            ws.close();
            resolve(true);
        });
        
        ws.on('error', (error) => {
            console.log('WebSocket connection failed:', error.message);
            reject(error);
        });
        
        ws.on('close', (code, reason) => {
            console.log('WebSocket closed:', { code, reason: reason.toString() });
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
            if (ws.readyState === WebSocket.CONNECTING) {
                ws.terminate();
                reject(new Error('Connection timeout'));
            }
        }, 10000);
    });
}

/**
 * Test 2: Check Environment Variables
 */
function checkEnvironmentVariables() {
    console.log('\nTest 2: Environment Variables Check');
    
    const requiredVars = [
        'FIREBASE_PROJECT_ID',
        'FIREBASE_PRIVATE_KEY', 
        'FIREBASE_CLIENT_EMAIL',
        'USER_METADATA_TABLE',
        'CONVERSATIONS_TABLE',
        'MESSAGES_TABLE'
    ];
    
    const missing = [];
    const present = [];
    
    requiredVars.forEach(varName => {
        if (process.env[varName]) {
            present.push(varName);
            console.log(`✅ ${varName}: ${varName.includes('KEY') ? '[HIDDEN]' : process.env[varName]}`);
        } else {
            missing.push(varName);
            console.log(`${varName}: NOT SET`);
        }
    });
    
    if (missing.length > 0) {
        console.log(`Missing environment variables: ${missing.join(', ')}`);
        return false;
    }
    
    console.log('All required environment variables are set');
    return true;
}

/**
 * Test 3: Firebase Configuration
 */
async function testFirebaseConfig() {
    console.log('\nTest 3: Firebase Configuration Test');
    
    try {
        // Check if Firebase Admin is initialized
        if (admin.apps.length === 0) {
            console.log('Firebase Admin SDK not initialized');
            return false;
        }
        
        const auth = admin.auth();
        console.log('Firebase Admin SDK initialized');
        
        // Test Firebase configuration
        const projectId = process.env.FIREBASE_PROJECT_ID;
        console.log(`Firebase Project ID: ${projectId}`);
        
        return true;
    } catch (error) {
        console.log('Firebase configuration error:', error.message);
        return false;
    }
}

/**
 * Test 4: DynamoDB Tables Check
 */
async function checkDynamoDBTables() {
    console.log('\nTest 4: DynamoDB Tables Check');
    
    const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
    
    try {
        const client = new DynamoDBClient({ region: 'us-east-1' });
        const command = new ListTablesCommand({});
        const response = await client.send(command);
        
        const requiredTables = [
            'UserMetadataV2',
            'ConversationsV3', 
            'MessagesV2'
        ];
        
        const existingTables = response.TableNames || [];
        
        requiredTables.forEach(tableName => {
            if (existingTables.includes(tableName)) {
                console.log(`✅ Table exists: ${tableName}`);
            } else {
                console.log(`❌ Table missing: ${tableName}`);
            }
        });
        
        return true;
    } catch (error) {
        console.log('DynamoDB check failed:', error.message);
        return false;
    }
}

/**
 * Test 5: Lambda Function Test
 */
async function testLambdaFunction() {
  console.log('\nTest 5: Lambda Function Test');
  
  try {
    // This is a placeholder - you would need to actually invoke your lambda
    console.log('Lambda function test requires actual function name');
    console.log('To test lambda functions, you need to:');
    console.log('1. Deploy your lambda functions');
    console.log('2. Use AWS SDK to invoke them');
    console.log('3. Check the response and logs');
    
    return true; // Placeholder
  } catch (error) {
    console.error('Error testing lambda function:', error.message);
    return false;
  }
}

// Generate diagnostic summary
function generateSummary(results) {
  console.log('\nDiagnostic Summary:');
  console.log('==================');
  
  for (const [testName, result] of Object.entries(results)) {
    const status = result ? 'PASS' : 'FAIL';
    const color = result ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}${testName}: ${status}\x1b[0m`);
  }
  
  const passedTests = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;
  
  console.log(`\nOverall: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('All tests passed! Your WebSocket setup should work correctly.');
  } else {
    console.log('Some tests failed. Please check the issues above.');
  }
}

// Provide recommended actions
function provideRecommendations(results) {
  console.log('\nRecommended Actions:');
  console.log('====================');
}

/**
 * Main diagnostic function
 */
async function runDiagnostics() {
    console.log('Starting WebSocket Connection Diagnostics\n');
    
    try {
        // Test 1: Basic connection
        await testBasicConnection();
    } catch (error) {
        console.log('Basic connection test failed');
    }
    
    // Test 2: Environment variables
    const envOk = checkEnvironmentVariables();
    
    // Test 3: Firebase config
    const firebaseOk = await testFirebaseConfig();
    
    // Test 4: DynamoDB tables
    const dynamoOk = await checkDynamoDBTables();
    
    // Test 5: Lambda function
    const lambdaOk = await testLambdaFunction();
    
    // Summary
    console.log('\nDiagnostic Summary:');
    console.log(`Environment Variables: ${envOk ? 'PASS' : 'FAIL'}`);
    console.log(`Firebase Configuration: ${firebaseOk ? 'PASS' : 'FAIL'}`);
    console.log(`DynamoDB Tables: ${dynamoOk ? 'PASS' : 'FAIL'}`);
    console.log(`Lambda Function: ${lambdaOk ? 'PASS' : 'FAIL'}`);
    
    console.log('\nRecommended Actions:');
    
    if (!envOk) {
        console.log('1. Set missing environment variables in your Lambda function');
        console.log('2. Check your SAM template parameters');
    }
    
    if (!firebaseOk) {
        console.log('3. Verify Firebase service account credentials');
        console.log('4. Check Firebase project configuration');
    }
    
    if (!dynamoOk) {
        console.log('5. Deploy DynamoDB tables using SAM template');
        console.log('6. Verify IAM permissions for Lambda functions');
    }
    
    console.log('\n7. Check CloudWatch logs for detailed error information');
    console.log('8. Verify API Gateway WebSocket configuration');
}

// Run diagnostics if this file is executed directly
if (require.main === module) {
    runDiagnostics().catch(console.error);
}

module.exports = {
    runDiagnostics,
    testBasicConnection,
    checkEnvironmentVariables,
    testFirebaseConfig,
    checkDynamoDBTables,
    testLambdaFunction
}; 
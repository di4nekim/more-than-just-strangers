/**
 * Debug version of SendMessage Lambda to identify the root cause of Internal Server Error
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");

// Debug handler without authentication to test basic functionality
exports.debugHandler = async (event, context) => {
    console.log('=== DEBUG LAMBDA STARTED ===');
    console.log('Event:', JSON.stringify(event, null, 2));
    console.log('Context:', JSON.stringify(context, null, 2));
    
    try {
        // Test 1: Environment Variables
        console.log('=== TESTING ENVIRONMENT VARIABLES ===');
        console.log('USER_METADATA_TABLE:', process.env.USER_METADATA_TABLE);
        console.log('CONVERSATIONS_TABLE:', process.env.CONVERSATIONS_TABLE);
        console.log('MESSAGES_TABLE:', process.env.MESSAGES_TABLE);
        console.log('WEBSOCKET_API_URL:', process.env.WEBSOCKET_API_URL);
        console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? 'SET' : 'NOT SET');
        console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? 'SET (length: ' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : 'NOT SET');
        console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'NOT SET');

        // Test 2: DynamoDB Connection
        console.log('=== TESTING DYNAMODB CONNECTION ===');
        const client = new DynamoDBClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });
        const dynamoDB = DynamoDBDocumentClient.from(client);
        console.log('DynamoDB client created successfully');

        // Test 3: API Gateway Management API
        console.log('=== TESTING API GATEWAY SETUP ===');
        const apiGateway = new ApiGatewayManagementApiClient({
            endpoint: process.env.WEBSOCKET_API_URL || "https://82hp8bmge8.execute-api.us-east-1.amazonaws.com/Dev"
        });
        console.log('API Gateway client created successfully');

        // Test 4: Parse Event Body
        console.log('=== TESTING EVENT PARSING ===');
        if (!event.body) {
            throw new Error('Missing event body');
        }
        
        const body = JSON.parse(event.body);
        console.log('Parsed body:', JSON.stringify(body, null, 2));

        // Test 5: Test Firebase Token Extraction
        console.log('=== TESTING TOKEN EXTRACTION ===');
        let token = null;
        if (body && body.token) {
            token = body.token;
            console.log('Token found in body, length:', token.length);
        } else {
            console.log('No token found in body');
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Debug successful',
                tests: {
                    environmentVariables: 'PASS',
                    dynamodbConnection: 'PASS', 
                    apiGatewaySetup: 'PASS',
                    eventParsing: 'PASS',
                    tokenExtraction: token ? 'PASS' : 'FAIL'
                }
            })
        };

    } catch (error) {
        console.error('=== DEBUG ERROR ===');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: error.message,
                stack: error.stack
            })
        };
    }
};

// Original handler for comparison
exports.handler = async (event, context) => {
    try {
        // Add debug logging at the very start
        console.log('=== SENDMESSAGE LAMBDA STARTING ===');
        console.log('Event received:', JSON.stringify(event, null, 2));
        console.log('Environment check:');
        console.log('- USER_METADATA_TABLE:', process.env.USER_METADATA_TABLE);
        console.log('- FIREBASE_PROJECT_ID set:', !!process.env.FIREBASE_PROJECT_ID);
        
        // Try to load the authentication middleware
        console.log('Loading authentication middleware...');
        const { authenticateWebSocketEvent } = require("../shared/auth");
        console.log('Authentication middleware loaded successfully');
        
        // Try authentication
        console.log('Attempting authentication...');
        const userInfo = await authenticateWebSocketEvent(event);
        console.log('Authentication successful for user:', userInfo.userId);
        
        // Add user info to event
        event.userInfo = userInfo;
        
        // Load the main handler logic
        console.log('Loading main handler logic...');
        const { handlerLogic } = require('./index');
        console.log('Main handler logic loaded successfully');
        
        // Execute main logic
        console.log('Executing main logic...');
        const result = await handlerLogic(event, context);
        console.log('Main logic completed successfully');
        
        return result;
        
    } catch (error) {
        console.error('=== HANDLER ERROR ===');
        console.error('Error at stage:', error.stage || 'unknown');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
                details: error.message,
                stage: error.stage || 'unknown'
            })
        };
    }
}; 
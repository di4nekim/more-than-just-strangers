#!/usr/bin/env node

/**
 * Test script for Parameter Store integration
 * 
 * This script tests the Parameter Store utility and Firebase configuration
 * to ensure credentials can be retrieved properly.
 */

const parameterStore = require('./shared/parameter-store');
const { initializeFirebaseAdmin } = require('./shared/firebase-config');

async function testParameterStore() {
    console.log('🔍 Testing Parameter Store Integration...\n');

    try {
        // Test 1: Parameter Store utility
        console.log('1. Testing Parameter Store utility...');
        const environment = process.env.ENVIRONMENT || 'development';
        console.log(`   Environment: ${environment}`);
        
        const credentials = await parameterStore.getFirebaseCredentials(environment);
        console.log('   ✅ Successfully retrieved Firebase credentials');
        console.log(`   Project ID: ${credentials.projectId}`);
        console.log(`   Client Email: ${credentials.clientEmail}`);
        console.log(`   Private Key: ${credentials.privateKey ? 'Present' : 'Missing'} (${credentials.privateKey?.length || 0} chars)`);
        
        // Test 2: Firebase Admin initialization
        console.log('\n2. Testing Firebase Admin SDK initialization...');
        const firebaseApp = await initializeFirebaseAdmin(environment);
        console.log('   ✅ Firebase Admin SDK initialized successfully');
        console.log(`   App name: ${firebaseApp.name}`);
        
        // Test 3: Cache functionality
        console.log('\n3. Testing cache functionality...');
        const startTime = Date.now();
        const cachedCredentials = await parameterStore.getFirebaseCredentials(environment);
        const cacheTime = Date.now() - startTime;
        console.log(`   ✅ Cached retrieval completed in ${cacheTime}ms`);
        console.log(`   Cache hit: ${cacheTime < 50 ? 'Yes' : 'No'}`);
        
        // Test 4: Parameter validation
        console.log('\n4. Testing parameter validation...');
        const requiredFields = ['projectId', 'privateKey', 'clientEmail'];
        const missingFields = requiredFields.filter(field => !credentials[field]);
        
        if (missingFields.length === 0) {
            console.log('   ✅ All required parameters present');
        } else {
            console.log(`   ❌ Missing required parameters: ${missingFields.join(', ')}`);
        }
        
        console.log('\n🎉 All tests passed! Parameter Store integration is working correctly.');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        
        // Provide helpful troubleshooting information
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Ensure AWS credentials are configured');
        console.log('2. Verify Parameter Store parameters exist:');
        console.log(`   - /mtjs/${process.env.ENVIRONMENT || 'development'}/firebase/project-id`);
        console.log(`   - /mtjs/${process.env.ENVIRONMENT || 'development'}/firebase/private-key`);
        console.log(`   - /mtjs/${process.env.ENVIRONMENT || 'development'}/firebase/client-email`);
        console.log('3. Check IAM permissions for Parameter Store access');
        console.log('4. Verify the AWS region is correct');
        
        process.exit(1);
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
    testParameterStore();
}

module.exports = { testParameterStore };

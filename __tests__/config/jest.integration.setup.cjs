/**
 * Jest Integration Test Setup (CommonJS)
 * 
 * Simplified setup for integration tests that avoids ES module issues
 * Updated for current Cognito configuration
 */

// Load environment variables for tests
require('dotenv').config({ path: '.env.test' });
require('dotenv').config({ path: '.env.local' });

// Ensure AWS credentials are available in test environment
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.warn('AWS credentials not found in environment variables');
  console.warn('Integration tests require valid AWS credentials');
  console.warn('Please run: aws configure');
  console.warn('Or set environment variables:');
  console.warn('  AWS_ACCESS_KEY_ID');
  console.warn('  AWS_SECRET_ACCESS_KEY');
  console.warn('  AWS_REGION');
  return false;
}

// Check if integration tests are enabled
if (process.env.ENABLE_INTEGRATION_TESTS === 'false') {
  console.log('Skipping integration test - ENABLE_INTEGRATION_TESTS=false');
  return false;
}

// Validate environment configuration
const requiredEnvVars = [
  'CONVERSATIONS_TABLE',
  'USER_METADATA_TABLE',
  'MESSAGES_TABLE',
  'WEBSOCKET_API_URL'
];

const missing = requiredEnvVars.filter(varName => !process.env[varName]);
if (missing.length > 0) {
  console.log(`Skipping integration test - invalid environment configuration`);
  console.log(`Missing environment variables: ${missing.join(', ')}`);
  console.log(`Please check your .env file or environment configuration`);
  return false;
}

// Check if destructive tests are enabled
if (process.env.ENABLE_DESTRUCTIVE_TESTS === 'false') {
  console.log('Skipping destructive test - ENABLE_DESTRUCTIVE_TESTS=false');
  return false;
}

// Global test configuration
global.INTEGRATION_TEST_CONFIG = {
  userPoolId: process.env.TEST_USER_POOL_ID || process.env.USER_POOL_ID || 'us-east-1_qVW2B28u0',
  clientId: process.env.TEST_USER_POOL_CLIENT_ID || process.env.USER_POOL_CLIENT_ID || '3d97e2rrt8rat4djsgj7kpccla',
  region: process.env.AWS_REGION || 'us-east-1',
  identityPoolId: process.env.IDENTITY_POOL_ID || 'us-east-1:2807b470-754f-4dbb-91cc-5705dbd203e6',
  oauthDomain: process.env.OAUTH_DOMAIN,
  testUserEmail: process.env.TEST_USER_EMAIL,
  testUserPassword: process.env.TEST_USER_PASSWORD,
  enableIntegrationTests: process.env.ENABLE_INTEGRATION_TESTS === 'true',
  enableDestructiveTests: process.env.ENABLE_DESTRUCTIVE_TESTS === 'true',
  timeout: parseInt(process.env.INTEGRATION_TEST_TIMEOUT) || 30000
};

/**
 * Global test helpers available in all integration tests
 */
global.integrationTestHelpers = {
  /**
   * Skip test if integration tests are disabled
   */
  skipIfDisabled() {
    if (!global.INTEGRATION_TEST_CONFIG.enableIntegrationTests) {
      console.log('Skipping integration test - ENABLE_INTEGRATION_TESTS=false');
      return true;
    }
    return false;
  },
  
  /**
   * Skip test if environment is not valid
   */
  skipIfInvalidEnvironment() {
    if (!global.INTEGRATION_TEST_CONFIG.userPoolId || !global.INTEGRATION_TEST_CONFIG.clientId) {
      console.log('Skipping integration test - invalid environment configuration');
      return true;
    }
    return false;
  },
  
  /**
   * Skip test if no AWS credentials for admin operations
   */
  skipIfNoCredentials() {
    const requiredVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
    const missing = requiredVars.filter(envVar => !process.env[envVar]);
    if (missing.length > 0) {
      console.log(`Skipping test - missing environment variables: ${missing.join(', ')}`);
      return true;
    }
    return false;
  },
  
  /**
   * Skip destructive test if not enabled
   */
  skipIfNoDestructiveTests() {
    if (!global.INTEGRATION_TEST_CONFIG.enableDestructiveTests) {
      console.log('Skipping destructive test - ENABLE_DESTRUCTIVE_TESTS=false');
      return true;
    }
    return false;
  },

  /**
   * Generate test email with timestamp
   */
  generateTestEmail(baseName = 'test') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${baseName}+${timestamp}_${random}@example.com`;
  },

  /**
   * Generate test password
   */
  generateTestPassword() {
    return `TestPass${Date.now()}!`;
  },

  /**
   * Wait for Cognito consistency
   */
  async waitForConsistency(durationMs = 2000) {
    return new Promise(resolve => setTimeout(resolve, durationMs));
  },

  /**
   * Retry operation with exponential backoff
   */
  async retryWithBackoff(operation, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) throw error;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
};

// Set longer default timeout for integration tests
jest.setTimeout(global.INTEGRATION_TEST_CONFIG.timeout);

// Enhanced error reporting for integration tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection in integration test:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception in integration test:', error);
});

console.log('Integration test setup complete (CommonJS)');
console.log('Test Configuration:', {
  userPoolId: global.INTEGRATION_TEST_CONFIG.userPoolId?.substring(0, 10) + '...',
  clientId: global.INTEGRATION_TEST_CONFIG.clientId?.substring(0, 10) + '...',
  region: global.INTEGRATION_TEST_CONFIG.region,
  tables: {
    conversations: global.INTEGRATION_TEST_CONFIG.tables.conversations,
    userMetadata: global.INTEGRATION_TEST_CONFIG.tables.userMetadata,
    messages: global.INTEGRATION_TEST_CONFIG.tables.messages
  }
}); 
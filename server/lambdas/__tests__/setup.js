// Set test environment variables
process.env.USER_METADATA_TABLE = process.env.USER_METADATA_TABLE || 'user-metadata-table';
process.env.CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE || 'conversations-table';
process.env.WEBSOCKET_API_URL = process.env.WEBSOCKET_API_URL || 'wss://test-api.execute-api.region.amazonaws.com/prod';

// Increase timeout for integration tests
jest.setTimeout(30000); 
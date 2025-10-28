/**
 * Shared authentication utility for Firebase token validation
 * Provides reusable authentication functions for all lambda functions
 */
const { verifyIdToken, getUserByUid: firebaseGetUserByUid } = require('./firebase-config.js');
const { createErrorResponse, extractAction, extractRequestId } = require('./errorHandler.js');

/**
 * Validate Firebase ID token
 * @param {string} token - Firebase ID token to validate
 * @returns {Promise<Object>} Decoded token payload
 */
const validateFirebaseToken = async (token) => {
    try {
        console.log('FIREBASE: Starting token validation');
        console.log('FIREBASE: Token length:', token ? token.length : 'no token');
        
        const decodedToken = await verifyIdToken(token);
        
        // Check token expiration
        const now = Math.floor(Date.now() / 1000);
        const exp = decodedToken.exp;
        const iat = decodedToken.iat;
        
        console.log('FIREBASE: Token validation successful');
        console.log('FIREBASE: Token issued at:', new Date(iat * 1000).toISOString());
        console.log('FIREBASE: Token expires at:', new Date(exp * 1000).toISOString());
        console.log('FIREBASE: Current time:', new Date(now * 1000).toISOString());
        console.log('FIREBASE: Time until expiration:', Math.max(0, exp - now), 'seconds');
        console.log('FIREBASE: User ID:', decodedToken.uid);
        console.log('FIREBASE: Email:', decodedToken.email);
        
        return decodedToken;
    } catch (error) {
        console.error('FIREBASE: Token validation failed:', error.message);
        console.error('FIREBASE: Error code:', error.code);
        
        // Provide more specific error messages
        if (error.code === 'auth/id-token-expired') {
            throw new Error('FIREBASE_TOKEN_EXPIRED');
        } else if (error.code === 'auth/id-token-revoked') {
            throw new Error('FIREBASE_TOKEN_REVOKED');
        } else if (error.code === 'auth/invalid-id-token') {
            throw new Error('FIREBASE_TOKEN_INVALID');
        } else {
            throw new Error('FIREBASE_TOKEN_INVALID');
        }
    }
};

/**
 * Extract Firebase ID token from WebSocket event
 * @param {Object} event - WebSocket event object
 * @returns {string|null} Firebase ID token or null if not found
 */
const extractTokenFromEvent = (event) => {
    // Check query parameters first
    if (event.queryStringParameters && event.queryStringParameters.token) {
        return event.queryStringParameters.token;
    }
    
    // Check Authorization header
    if (event.headers && event.headers.Authorization) {
        const authHeader = event.headers.Authorization;
        if (authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        } else {
            return authHeader;
        }
    }
    
    return null;
};

/**
 * Extract Firebase ID token from HTTP request body (for WebSocket messages)
 * @param {Object} body - Parsed request body
 * @returns {string|null} Firebase ID token or null if not found
 */
const extractTokenFromBody = (body) => {
    // Check root level first (where WebSocket handler puts it)
    if (body && body.token) {
        return body.token;
    }
    
    // Fallback to data.token for backward compatibility
    if (body && body.data && body.data.token) {
        return body.data.token;
    }
    
    return null;
};

/**
 * Authenticate and get user information from WebSocket event using Firebase
 * @param {Object} event - WebSocket event object
 * @returns {Promise<Object>} User information from validated Firebase token
 * @throws {Error} Authentication error
 */
const authenticateWebSocketEvent = async (event) => {
    try {
        let token = null;
        
        console.log('AUTH: Starting WebSocket authentication');
        console.log('AUTH: Event has queryStringParameters:', !!event.queryStringParameters);
        console.log('AUTH: Event has body:', !!event.body);
        
        // First try to get token from query string parameters
        if (event.queryStringParameters && event.queryStringParameters.token) {
            token = event.queryStringParameters.token;
            console.log('AUTH: Token found in query parameters');
        }
        
        // If not found, try to get from event body
        if (!token && event.body) {
            try {
                const body = JSON.parse(event.body);
                console.log('AUTH: Parsed body structure:', Object.keys(body));
                
                // Check root level first (where WebSocket handler puts it)
                token = body.token;
                if (token) {
                    console.log('AUTH: Token found at root level of body');
                } else {
                    // Fallback to data.token if not found at root level
                    if (body.data && body.data.token) {
                        token = body.data.token;
                        console.log('AUTH: Token found in body.data.token');
                    }
                }
            } catch (e) {
                console.log('AUTH: Body is not valid JSON, ignoring');
            }
        }
        
        if (!token) {
            console.error('AUTH: No token found in query parameters or body');
            throw new Error('FIREBASE_TOKEN_MISSING');
        }
        
        console.log('AUTH: Token found, proceeding with validation');
        
        const decodedToken = await validateFirebaseToken(token);
        
        return {
            userId: decodedToken.uid,
            email: decodedToken.email,
            name: decodedToken.name || decodedToken.email?.split('@')[0]
        };
    } catch (error) {
        console.error('Authentication error:', error.message);
        throw error;
    }
};

/**
 * Get user information by UID using Firebase Admin
 * @param {string} uid - Firebase user UID
 * @returns {Promise<Object>} User information from Firebase
 */
const getUserByUid = async (uid) => {
    try {
        const userRecord = await firebaseGetUserByUid(uid);
        return {
            userId: userRecord.uid,
            email: userRecord.email,
            name: userRecord.displayName,
            picture: userRecord.photoURL,
            emailVerified: userRecord.emailVerified,
            userRecord: userRecord
        };
    } catch (error) {
        console.error('Failed to get user by UID:', error.message);
        throw new Error('USER_NOT_FOUND');
    }
};

/**
 * Create authentication middleware for lambda functions
 * @param {Function} handler - The lambda handler function
 * @returns {Function} Wrapped handler with authentication
 */
const withAuth = (handler) => {
    return async (event, context) => {
        try {
            const userInfo = await authenticateWebSocketEvent(event);
            // Add user info to event for handler to use
            event.userInfo = userInfo;
            return await handler(event, context);
        } catch (error) {
            console.error('Authentication failed:', error.message);
            
            const action = extractAction(event);
            const requestId = extractRequestId(event);
            
            if (error.message === 'FIREBASE_TOKEN_MISSING') {
                return createErrorResponse(401, 'Authentication required. Firebase ID token missing.', action, {
                    operation: 'authentication',
                    authType: 'firebase'
                }, requestId);
            } else if (error.message === 'FIREBASE_TOKEN_INVALID') {
                return createErrorResponse(401, 'Invalid or expired Firebase ID token', action, {
                    operation: 'authentication',
                    authType: 'firebase'
                }, requestId);
            } else {
                return createErrorResponse(500, 'Internal Server Error', action, {
                    operation: 'authentication',
                    errorMessage: error.message
                }, requestId);
            }
        }
    };
};

module.exports = {
    validateFirebaseToken,
    extractTokenFromEvent,
    extractTokenFromBody,
    authenticateWebSocketEvent,
    getUserByUid,
    withAuth
}; 
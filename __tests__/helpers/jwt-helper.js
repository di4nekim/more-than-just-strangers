/**
 * JWT Helper for Firebase Authentication Tests
 * 
 * Provides utilities for creating test JWT tokens that mimic Firebase ID tokens
 */

import jwt from 'jsonwebtoken';

// Mock Firebase project configuration
const FIREBASE_PROJECT_ID = 'test-project-123';
const FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk-test@test-project-123.iam.gserviceaccount.com';
// Use a simple secret for testing instead of complex private key
const FIREBASE_SECRET = 'test-secret-key-for-jwt-signing';

/**
 * Create a Firebase test JWT token
 * @param {Object} payload - Token payload
 * @param {string} payload.uid - User ID
 * @param {string} payload.email - User email
 * @param {boolean} payload.email_verified - Email verification status
 * @param {string} payload.name - User display name
 * @param {string} payload.picture - User profile picture URL
 * @param {number} payload.auth_time - Authentication time (Unix timestamp)
 * @param {number} payload.exp - Expiration time (Unix timestamp)
 * @param {number} payload.iat - Issued at time (Unix timestamp)
 * @returns {string} JWT token
 */
export function createFirebaseTestJWT(payload = {}) {
  const now = Math.floor(Date.now() / 1000);
  
  const defaultPayload = {
    iss: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    aud: FIREBASE_PROJECT_ID,
    auth_time: now,
    user_id: payload.uid || 'test-user-123',
    sub: payload.uid || 'test-user-123',
    iat: payload.iat || now,
    exp: payload.exp || (now + 3600), // Default 1 hour expiration
    email: payload.email || 'test@example.com',
    email_verified: payload.email_verified !== undefined ? payload.email_verified : true,
    firebase: {
      identities: {
        email: [payload.email || 'test@example.com']
      },
      sign_in_provider: 'password'
    }
  };

  // Merge custom payload with defaults
  const finalPayload = { ...defaultPayload, ...payload };

  // Create JWT token using HS256 for testing (simpler than RS256)
  const token = jwt.sign(finalPayload, FIREBASE_SECRET, {
    algorithm: 'HS256'
  });

  return token;
}

/**
 * Create an expired Firebase test JWT token
 * @param {Object} payload - Token payload
 * @returns {string} Expired JWT token
 */
export function createExpiredFirebaseTestJWT(payload = {}) {
  const now = Math.floor(Date.now() / 1000);
  return createFirebaseTestJWT({
    ...payload,
    exp: now - 3600, // Expired 1 hour ago
    iat: now - 7200  // Issued 2 hours ago
  });
}

/**
 * Create a Firebase test JWT token that expires soon
 * @param {Object} payload - Token payload
 * @param {number} expiresIn - Seconds until expiration (default: 300 = 5 minutes)
 * @returns {string} JWT token that expires soon
 */
export function createExpiringFirebaseTestJWT(payload = {}, expiresIn = 300) {
  const now = Math.floor(Date.now() / 1000);
  return createFirebaseTestJWT({
    ...payload,
    exp: now + expiresIn,
    iat: now
  });
}

/**
 * Create a Firebase test JWT token with custom claims
 * @param {Object} payload - Token payload
 * @param {Object} customClaims - Custom claims to add
 * @returns {string} JWT token with custom claims
 */
export function createFirebaseTestJWTWithClaims(payload = {}, customClaims = {}) {
  return createFirebaseTestJWT({
    ...payload,
    firebase: {
      identities: {
        email: [payload.email || 'test@example.com']
      },
      sign_in_provider: 'password'
    },
    ...customClaims
  });
}

/**
 * Create a Firebase test JWT token for Google OAuth
 * @param {Object} payload - Token payload
 * @returns {string} JWT token for Google OAuth
 */
export function createGoogleOAuthTestJWT(payload = {}) {
  return createFirebaseTestJWT({
    ...payload,
    firebase: {
      identities: {
        email: [payload.email || 'test@gmail.com'],
        'google.com': [payload.googleId || 'google-user-123']
      },
      sign_in_provider: 'google.com'
    }
  });
}

/**
 * Create a Firebase test JWT token for unverified email
 * @param {Object} payload - Token payload
 * @returns {string} JWT token for unverified email
 */
export function createUnverifiedEmailTestJWT(payload = {}) {
  return createFirebaseTestJWT({
    ...payload,
    email_verified: false
  });
}

/**
 * Validate a JWT token structure (without signature verification)
 * @param {string} token - JWT token to validate
 * @returns {Object} Decoded token payload
 */
export function validateJWTStructure(token) {
  try {
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded) {
      throw new Error('Invalid JWT structure');
    }

    const { header, payload } = decoded;

    // Validate required Firebase JWT fields
    const requiredFields = ['iss', 'aud', 'auth_time', 'user_id', 'sub', 'iat', 'exp', 'email'];
    const missingFields = requiredFields.filter(field => !payload[field]);

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // Validate Firebase-specific structure
    if (!payload.firebase || !payload.firebase.identities) {
      throw new Error('Missing Firebase-specific claims');
    }

    return payload;
  } catch (error) {
    throw new Error(`JWT validation failed: ${error.message}`);
  }
}

/**
 * Create a mock Firebase user object
 * @param {Object} userData - User data
 * @returns {Object} Mock Firebase user
 */
export function createMockFirebaseUser(userData = {}) {
  const defaultUser = {
    uid: 'test-user-123',
    email: 'test@example.com',
    emailVerified: true,
    displayName: 'Test User',
    photoURL: null,
    metadata: {
      creationTime: '2024-01-01T00:00:00.000Z',
      lastSignInTime: '2024-01-01T00:00:00.000Z'
    },
    getIdToken: jest.fn().mockResolvedValue(createFirebaseTestJWT({ uid: 'test-user-123' })),
    getIdTokenResult: jest.fn().mockResolvedValue({
      authTime: '2024-01-01T00:00:00.000Z',
      expirationTime: '2024-01-01T01:00:00.000Z',
      issuedAtTime: '2024-01-01T00:00:00.000Z',
      signInProvider: 'password',
      claims: {}
    })
  };

  return { ...defaultUser, ...userData };
}

/**
 * Create a mock Firebase Auth error
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @returns {Error} Mock Firebase Auth error
 */
export function createMockFirebaseAuthError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export default {
  createFirebaseTestJWT,
  createExpiredFirebaseTestJWT,
  createExpiringFirebaseTestJWT,
  createFirebaseTestJWTWithClaims,
  createGoogleOAuthTestJWT,
  createUnverifiedEmailTestJWT,
  validateJWTStructure,
  createMockFirebaseUser,
  createMockFirebaseAuthError
};

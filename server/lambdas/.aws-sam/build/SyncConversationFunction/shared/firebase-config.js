/**
 * Firebase Admin SDK Configuration for Server-side Authentication
 * 
 * This file handles Firebase Admin SDK initialization for AWS Lambda functions
 * using secure credentials from AWS Parameter Store.
 */

const admin = require('firebase-admin');
const parameterStore = require('./parameter-store');

// Cache for initialized Firebase app
let firebaseApp = null;

/**
 * Initialize Firebase Admin SDK with credentials from Parameter Store
 * @param {string} environment - Environment name (development, staging, production)
 * @returns {Promise<Object>} Firebase Admin app instance
 */
const initializeFirebaseAdmin = async (environment = null) => {
    // Return existing app if already initialized
    if (firebaseApp) {
        return firebaseApp;
    }

    // Check if Firebase Admin is already initialized by another instance
    if (admin.apps.length > 0) {
        firebaseApp = admin.app();
        return firebaseApp;
    }

    try {
        // Determine environment from Lambda context or default to development
        const env = environment || process.env.ENVIRONMENT || 'development';
        console.log(`Initializing Firebase Admin SDK for environment: ${env}`);
        
        // Retrieve Firebase credentials from Parameter Store
        const credentials = await parameterStore.getFirebaseCredentials(env);
        
        // Ensure private key has proper line breaks
        const privateKey = credentials.privateKey.replace(/\\n/g, '\n');
        
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert({
                projectId: credentials.projectId,
                clientEmail: credentials.clientEmail,
                privateKey: privateKey
            })
        });

        console.log('Firebase Admin SDK initialized successfully with Parameter Store credentials');
        return firebaseApp;
        
    } catch (error) {
        console.error('Firebase Admin SDK initialization failed:', error);
        
        // Reset cached app on failure
        firebaseApp = null;
        
        throw new Error(`Firebase initialization failed: ${error.message}`);
    }
};

/**
 * Get Firebase Auth instance
 * @param {string} environment - Environment name
 * @returns {Promise<Object>} Firebase Auth instance
 */
const getAuth = async (environment = null) => {
    const app = await initializeFirebaseAdmin(environment);
    return admin.auth(app);
};

/**
 * Verify Firebase ID token
 * @param {string} idToken - Firebase ID token to verify
 * @param {string} environment - Environment name
 * @returns {Promise<Object>} Decoded token payload
 */
const verifyIdToken = async (idToken, environment = null) => {
    try {
        const auth = await getAuth(environment);
        const decodedToken = await auth.verifyIdToken(idToken);
        return decodedToken;
    } catch (error) {
        console.error('Firebase ID token verification failed:', error.message);
        throw error;
    }
};

/**
 * Get user by UID
 * @param {string} uid - Firebase user UID
 * @param {string} environment - Environment name
 * @returns {Promise<Object>} User record
 */
const getUserByUid = async (uid, environment = null) => {
    try {
        const auth = await getAuth(environment);
        const userRecord = await auth.getUser(uid);
        return userRecord;
    } catch (error) {
        console.error('Failed to get user by UID:', error.message);
        throw error;
    }
};

/**
 * Create custom token for a user
 * @param {string} uid - Firebase user UID
 * @param {Object} additionalClaims - Additional custom claims
 * @param {string} environment - Environment name
 * @returns {Promise<string>} Custom token
 */
const createCustomToken = async (uid, additionalClaims = {}, environment = null) => {
    try {
        const auth = await getAuth(environment);
        const customToken = await auth.createCustomToken(uid, additionalClaims);
        return customToken;
    } catch (error) {
        console.error('Failed to create custom token:', error.message);
        throw error;
    }
};

module.exports = {
    admin,
    initializeFirebaseAdmin,
    getAuth,
    verifyIdToken,
    getUserByUid,
    createCustomToken
}; 
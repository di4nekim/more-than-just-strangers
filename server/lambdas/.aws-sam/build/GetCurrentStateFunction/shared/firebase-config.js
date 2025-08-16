/**
 * Firebase Admin SDK Configuration for Server-side Authentication
 * 
 * This file handles Firebase Admin SDK initialization for AWS Lambda functions.
 * It supports both service account credentials and default credentials.
 */

const admin = require('firebase-admin');

// Firebase project configuration
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;

/**
 * Initialize Firebase Admin SDK with appropriate credentials
 * @returns {Object} Firebase Admin app instance
 */
const initializeFirebaseAdmin = () => {
    // Check if Firebase Admin is already initialized
    if (admin.apps.length > 0) {
        return admin.app();
    }

    let firebaseApp;

    try {
        // Option 1: Use service account credentials from environment variables
        if (FIREBASE_PRIVATE_KEY && FIREBASE_CLIENT_EMAIL && FIREBASE_PROJECT_ID) {
            console.log('Initializing Firebase Admin with service account credentials');
            
            // Decode the private key (it might be base64 encoded)
            const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
            
            firebaseApp = admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: FIREBASE_PROJECT_ID,
                    clientEmail: FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey
                })
            });
        }
        // Option 2: Use default credentials (works with AWS Lambda IAM roles)
        else if (FIREBASE_PROJECT_ID) {
            console.log('Initializing Firebase Admin with default credentials');
            
            firebaseApp = admin.initializeApp({
                projectId: FIREBASE_PROJECT_ID,
                credential: admin.credential.applicationDefault()
            });
        }
        // Option 3: Use service account file (for local development)
        else {
            console.log('Initializing Firebase Admin with service account file');
            
            firebaseApp = admin.initializeApp({
                credential: admin.credential.applicationDefault()
            });
        }

        console.log('✅ Firebase Admin SDK initialized successfully');
        return firebaseApp;
    } catch (error) {
        console.error('❌ Firebase Admin SDK initialization failed:', error);
        throw error;
    }
};

/**
 * Get Firebase Auth instance
 * @returns {Object} Firebase Auth instance
 */
const getAuth = () => {
    const app = initializeFirebaseAdmin();
    return admin.auth(app);
};

/**
 * Verify Firebase ID token
 * @param {string} idToken - Firebase ID token to verify
 * @returns {Promise<Object>} Decoded token payload
 */
const verifyIdToken = async (idToken) => {
    try {
        const auth = getAuth();
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
 * @returns {Promise<Object>} User record
 */
const getUserByUid = async (uid) => {
    try {
        const auth = getAuth();
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
 * @returns {Promise<string>} Custom token
 */
const createCustomToken = async (uid, additionalClaims = {}) => {
    try {
        const auth = getAuth();
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
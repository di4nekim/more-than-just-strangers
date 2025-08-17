import { auth } from './firebase-admin.js';

export const validateFirebaseToken = async (token) => {
  if (!auth) {
    throw new Error('Firebase Admin SDK not configured');
  }

  if (!token || typeof token !== 'string' || token.trim() === '') {
    throw new Error('Invalid token: token is required and must be a non-empty string');
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Firebase token validation failed:', error);
    throw error;
  }
};

export const validateJWTToken = validateFirebaseToken;
export const validateJWT = validateFirebaseToken;

export const extractAndValidateFirebaseToken = async (request) => {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('MISSING_TOKEN');
  }
  
  const token = authHeader.substring(7);
  
  if (!token || token.trim() === '') {
    throw new Error('MISSING_TOKEN');
  }
  
  try {
    const decodedToken = await validateFirebaseToken(token);
    return {
      token,
      user: decodedToken
    };
  } catch (error) {
    console.error('Token validation error:', error);
    throw new Error('TOKEN_INVALID');
  }
};

export const extractAndValidateJWT = extractAndValidateFirebaseToken; 
import { auth } from './firebase-admin.js';

export const validateToken = async (request) => {
  if (!auth) {
    throw new Error('AUTH_NOT_CONFIGURED');
  }

  const authHeader = request.headers.get('authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('MISSING_TOKEN');
  }
  
  const token = authHeader.substring(7);
  
  if (!token?.trim()) {
    throw new Error('MISSING_TOKEN');
  }
  
  try {
    const decodedToken = await auth.verifyIdToken(token);
    return { token, user: decodedToken };
  } catch (error) {
    console.error('Token validation failed:', error);
    throw new Error('TOKEN_INVALID');
  }
};

export const handleAuthError = (error) => {
  const errorMap = {
    'MISSING_TOKEN': { error: 'Authentication required', status: 401 },
    'TOKEN_INVALID': { error: 'Invalid token', status: 401 },
    'AUTH_NOT_CONFIGURED': { error: 'Authentication service not configured', status: 503 }
  };

  return errorMap[error.message] || { error: 'Internal server error', status: 500 };
}; 
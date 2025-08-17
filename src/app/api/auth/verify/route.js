import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';

export async function POST(request) {
  try {
    const { token } = await request.json();
    
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }
    
    const decodedToken = await auth.verifyIdToken(token);
    
    return NextResponse.json({
      valid: true,
      user: {
        id: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        name: decodedToken.name,
        picture: decodedToken.picture,
        authTime: decodedToken.auth_time,
        exp: decodedToken.exp,
        iat: decodedToken.iat
      }
    });
  } catch (error) {
    console.error('Token verification failed:', error);
    
    const errorMap = {
      'auth/id-token-expired': 'Token has expired',
      'auth/id-token-revoked': 'Token has been revoked',
      'auth/invalid-id-token': 'Malformed token',
      'auth/argument-error': 'Invalid token format'
    };
    
    const errorMessage = errorMap[error.code] || 'Invalid token';
    const statusCode = error.code === 'auth/id-token-expired' ? 401 : 401;
    
    return NextResponse.json(
      { 
        valid: false, 
        error: errorMessage,
        code: error.code || 'UNKNOWN_ERROR'
      },
      { status: statusCode }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'firebase-auth-verification',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
} 
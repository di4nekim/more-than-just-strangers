import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';
import { auth } from '@/lib/firebase-admin';

export async function GET(request) {
  try {
    const { user } = await validateToken(request);
    const userId = user.uid || user.sub;
    
    const userRecord = await auth.getUser(userId);
    
    return NextResponse.json({
      userId: userRecord.uid,
      email: userRecord.email,
      emailVerified: userRecord.emailVerified,
      displayName: userRecord.displayName || '',
      givenName: userRecord.customClaims?.givenName || '',
      familyName: userRecord.customClaims?.familyName || '',
      locale: userRecord.customClaims?.locale || 'en',
      status: userRecord.disabled ? 'DISABLED' : 'ENABLED',
      createdAt: userRecord.metadata.creationTime,
      updatedAt: userRecord.metadata.lastSignInTime,
      customAttributes: {
        department: userRecord.customClaims?.department || null,
        role: userRecord.customClaims?.role || null,
        phoneNumber: userRecord.phoneNumber || null
      }
    });
  } catch (error) {
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

export async function PATCH(request) {
  try {
    const { user } = await validateToken(request);
    const userId = user.uid || user.sub;
    
    const updates = await request.json();
    const allowedFields = ['displayName', 'phoneNumber'];
    const allowedUpdates = Object.fromEntries(
      allowedFields
        .filter(field => updates[field] !== undefined)
        .map(field => [field, updates[field]])
    );
    
    const updatedUserRecord = await auth.updateUser(userId, allowedUpdates);
    
    return NextResponse.json({
      userId: updatedUserRecord.uid,
      email: updatedUserRecord.email,
      emailVerified: updatedUserRecord.emailVerified,
      displayName: updatedUserRecord.displayName || '',
      phoneNumber: updatedUserRecord.phoneNumber || null,
      updatedAt: updatedUserRecord.metadata.lastSignInTime
    });
  } catch (error) {
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 
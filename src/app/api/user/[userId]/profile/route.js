import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';
import { auth } from '@/lib/firebase-admin';

export async function GET(request, { params }) {
  try {
    const { userId: requestedUserId } = await params;
    const { user } = await validateToken(request);
    
    const userRecord = await auth.getUser(requestedUserId);
    
    return NextResponse.json({
      userId: userRecord.uid,
      displayName: userRecord.displayName || 'Anonymous'
    });
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 
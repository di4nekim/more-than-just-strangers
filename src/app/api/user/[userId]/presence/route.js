import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';

export async function GET(request, { params }) {
  try {
    await validateToken(request);
    const { userId: requestedUserId } = await params;
    
    return NextResponse.json({
      status: 'online',
      lastSeen: new Date().toISOString(),
      userId: requestedUserId,
      isOnline: true
    });
  } catch (error) {
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 
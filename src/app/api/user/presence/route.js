import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';

export async function PUT(request) {
  try {
    const { user } = await validateToken(request);
    const userId = user.uid || user.sub;
    
    const { status, lastSeen = new Date().toISOString() } = await request.json();
    
    if (!['online', 'offline', 'away'].includes(status)) {
      return NextResponse.json(
        { error: 'Valid status is required (online, offline, away)' },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      updated: true,
      status,
      userId,
      lastSeen,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 
import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';

export async function GET(request, { params }) {
  try {
    const { user } = await validateToken(request);
    const authenticatedUserId = user.uid || user.sub;
    const { userId: requestedUserId } = await params;
    
    if (authenticatedUserId !== requestedUserId) {
      return NextResponse.json(
        { error: 'Unauthorized access to user data' },
        { status: 403 }
      );
    }
    
    return NextResponse.json({
      currentChatId: null,
      partnerId: null,
      hasActiveChat: false,
      questionIndex: 0
    });
  } catch (error) {
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 
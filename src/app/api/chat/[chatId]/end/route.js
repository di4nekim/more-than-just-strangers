import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';

export async function POST(request, { params }) {
  try {
    const { chatId } = await params;
    const { user } = await validateToken(request);
    const userId = user.uid || user.sub;
    const body = await request.json().catch(() => ({}));
    
    return NextResponse.json({
      ended: true,
      chatId: chatId,
      reason: body.reason || 'user_ended',
      endedBy: userId,
      endedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error ending chat:', error);
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 
import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';

export async function GET(request, { params }) {
  try {
    const { chatId } = await params;
    const { user } = await validateToken(request);
    const userId = user.uid || user.sub;
    
    return NextResponse.json({
      chatId: chatId,
      participants: [userId, `partner_${Math.random().toString(36).substr(2, 9)}`],
      status: 'active',
      createdAt: new Date().toISOString(),
      endedAt: null,
      endReason: null
    });
  } catch (error) {
    console.error('Error fetching chat details:', error);
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 
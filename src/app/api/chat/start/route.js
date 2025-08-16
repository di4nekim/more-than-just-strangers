import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';

export async function POST(request) {
  try {
    const { user } = await validateToken(request);
    const userId = user.uid || user.sub;
    
    return NextResponse.json({
      chatId: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      partnerId: `partner_${Math.random().toString(36).substr(2, 9)}`,
      matched: true,
      timestamp: new Date().toISOString(),
      userId
    });
  } catch (error) {
    console.error('Error starting new chat:', error);
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'chat-start',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
} 
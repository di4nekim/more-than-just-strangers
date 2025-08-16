import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';

export async function GET(request, { params }) {
  try {
    const { chatId } = await params;
    const { user } = await validateToken(request);
    
    return NextResponse.json({
      hasAccess: true,
      reason: 'User has access to this chat',
      chatId: chatId,
      userId: user.uid || user.sub,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error validating chat access:', error);
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 
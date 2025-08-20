import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';

export async function POST(request) {
  try {
    const { user } = await validateToken(request);
    const userId = user.uid || user.sub;
    
    // This endpoint should not create chat IDs - they should be created by the backend
    // when actual conversations are started through the WebSocket API
    return NextResponse.json({
      message: 'Chat creation should be initiated through WebSocket API',
      userId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in chat start endpoint:', error);
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'chat-start',
    status: 'healthy',
    message: 'Chat creation should be initiated through WebSocket API',
    timestamp: new Date().toISOString()
  });
} 
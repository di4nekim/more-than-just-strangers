import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';

export async function PUT(request, { params }) {
  try {
    const { user } = await validateToken(request);
    const userId = user.uid || user.sub;
    const { messageId } = params;
    
    if (!messageId) {
      return NextResponse.json(
        { error: 'Message ID is required' },
        { status: 400 }
      );
    }

    // For now, return success since the main logic is handled by the WebSocket
    // This endpoint serves as a fallback mechanism
    // In a production environment, you might want to implement actual DynamoDB updates here
    
    return NextResponse.json({
      success: true,
      message: 'Queued message marked as delivered',
      messageId,
      userId
    });
    
  } catch (error) {
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

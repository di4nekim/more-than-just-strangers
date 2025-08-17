import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';

export async function GET(request) {
  try {
    await validateToken(request);
    return NextResponse.json({ hasActiveChat: false, chatId: null });
  } catch (error) {
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 
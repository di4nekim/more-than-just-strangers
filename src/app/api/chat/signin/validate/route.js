import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';

const createValidationResponse = (user, body = {}) => ({
  hasAccess: true,
  userId: user.uid || user.sub,
  email: user.email,
  emailVerified: user.email_verified,
  timestamp: new Date().toISOString(),
  ...body
});

export async function GET(request) {
  try {
    const { user } = await validateToken(request);
    return NextResponse.json(createValidationResponse(user));
  } catch (error) {
    console.error('Error validating chat signin:', error);
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

export async function POST(request) {
  try {
    const { user } = await validateToken(request);
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(createValidationResponse(user, body));
  } catch (error) {
    console.error('Error validating chat signin:', error);
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { email, password, action } = await request.json();
    
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Import Firebase client-side auth for testing
    const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
    const { auth } = await import('../../../../lib/firebase-config.js');

    let result;
    try {
      if (action === 'signup') {
        result = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        result = await signInWithEmailAndPassword(auth, email, password);
      }

      // Get ID token for server-side validation
      const idToken = await result.user.getIdToken();
      
      // Test server-side token validation
      let serverValidation = 'Not tested';
      try {
        const { auth: adminAuth } = await import('../../../../lib/firebase-admin.js');
        if (adminAuth) {
          const decodedToken = await adminAuth.verifyIdToken(idToken);
          serverValidation = `Valid - User: ${decodedToken.email}`;
        }
      } catch (adminError) {
        serverValidation = `Failed: ${adminError.message}`;
      }

      return NextResponse.json({
        success: true,
        action: action || 'signin',
        user: {
          uid: result.user.uid,
          email: result.user.email,
          emailVerified: result.user.emailVerified
        },
        serverValidation,
        timestamp: new Date().toISOString()
      });

    } catch (authError) {
      return NextResponse.json({
        success: false,
        action: action || 'signin',
        error: {
          code: authError.code,
          message: authError.message
        },
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Test auth route error:', error);
    return NextResponse.json(
      { 
        error: 'Test auth failed', 
        message: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

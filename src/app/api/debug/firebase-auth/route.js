import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    // Check client-side Firebase configuration
    const clientConfig = {
      NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? 'Set' : 'Missing',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'Not set',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'Not set',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'Not set',
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 'Not set',
      NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'Not set',
    };

    // Check server-side Firebase configuration
    const serverConfig = {
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'Set' : 'Missing',
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? 'Set' : 'Missing',
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? `Set (${process.env.FIREBASE_PRIVATE_KEY.length} chars)` : 'Missing',
    };

    // Validate configuration consistency
    const validationIssues = [];
    
    // Compare actual values, not just "Set" status
    const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const serverProjectId = process.env.FIREBASE_PROJECT_ID;
    
    if (clientProjectId && serverProjectId && clientProjectId !== serverProjectId) {
      validationIssues.push(`Project ID mismatch: client="${clientProjectId}" vs server="${serverProjectId}"`);
    }

    if (clientConfig.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN === 'demo-project.firebaseapp.com') {
      validationIssues.push('Using demo auth domain - authentication will fail');
    }

    if (clientConfig.NEXT_PUBLIC_FIREBASE_API_KEY === 'Missing') {
      validationIssues.push('Missing Firebase API key - authentication will fail');
    }

    // Test Firebase Admin SDK
    let adminSDKStatus = 'Not tested';
    try {
      const { auth } = await import('../../../../lib/firebase-admin.js');
      if (auth) {
        adminSDKStatus = 'Available and initialized';
      } else {
        adminSDKStatus = 'Failed to initialize';
      }
    } catch (error) {
      adminSDKStatus = `Error: ${error.message}`;
    }

    // Common Firebase auth error codes and solutions
    const commonErrors = {
      'auth/invalid-credential': {
        description: 'Invalid email/password combination',
        solutions: [
          'Verify the email and password are correct',
          'Check if the user account exists',
          'Ensure Firebase project configuration is correct'
        ]
      },
      'auth/user-not-found': {
        description: 'No user record found for the given email',
        solutions: [
          'Check if the email address is correct',
          'User may need to sign up first',
          'Verify Firebase project has the user'
        ]
      },
      'auth/wrong-password': {
        description: 'Password is incorrect',
        solutions: [
          'Verify the password is correct',
          'User may need to reset password',
          'Check for caps lock or typing errors'
        ]
      },
      'auth/network-request-failed': {
        description: 'Network connection failed',
        solutions: [
          'Check internet connection',
          'Verify Firebase project is accessible',
          'Check for firewall or proxy issues'
        ]
      }
    };

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: validationIssues.length === 0 ? 'healthy' : 'issues_detected',
      clientConfig,
      serverConfig,
      adminSDKStatus,
      validationIssues,
      commonErrors,
      recommendations: [
        'Ensure all Firebase environment variables are set in .env.local',
        'Verify Firebase project configuration matches your actual project',
        'Check Firebase console for project status and authentication settings',
        'Test with a known valid user account'
      ]
    });
    
  } catch (error) {
    console.error('Firebase auth debug route error:', error);
    return NextResponse.json(
      { 
        error: 'Firebase auth debug failed', 
        message: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

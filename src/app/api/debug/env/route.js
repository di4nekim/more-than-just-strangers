import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    // Check environment variables
    const envStatus = {
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'Set' : 'Missing',
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? 'Set' : 'Missing',
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? 'Set (length: ' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : 'Missing',
      FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET ? 'Set' : 'Missing',
      NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? 'Set' : 'Missing',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? 'Set' : 'Missing',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? 'Set' : 'Missing',
    };

    // Test Firebase Admin initialization
    let firebaseAdminStatus = 'Not tested';
    try {
      const { initializeApp, getApps, cert } = await import('firebase-admin/app');
      const { getAuth } = await import('firebase-admin/auth');
      
      const apps = getApps();
      if (apps.length === 0) {
        if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
          const app = initializeApp({
            credential: cert({
              projectId: process.env.FIREBASE_PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            })
          });
          firebaseAdminStatus = `Initialized (${app.name})`;
        } else {
          firebaseAdminStatus = 'Missing environment variables';
        }
      } else {
        firebaseAdminStatus = `Already initialized (${apps.length} apps)`;
      }
      
      const auth = getAuth();
      firebaseAdminStatus += ` | Auth: ${auth ? 'Available' : 'Not available'}`;
      
    } catch (error) {
      firebaseAdminStatus = `Error: ${error.message}`;
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      environment: envStatus,
      firebaseAdmin: firebaseAdminStatus,
      nodeVersion: process.version,
      platform: process.platform
    });
    
  } catch (error) {
    console.error('Debug route error:', error);
    return NextResponse.json(
      { error: 'Debug route failed', message: error.message },
      { status: 500 }
    );
  }
} 
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'demo-project.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '123456789012',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:123456789012:web:abcdef1234567890',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const requiredVars = ['NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'];
const missingVars = requiredVars.filter(envVar => !process.env[envVar]);

if (missingVars.length > 0) {
  console.warn(`Missing required Firebase environment variables: ${missingVars.join(', ')}`);
  console.warn('Firebase will use demo configuration. Please set up proper environment variables for production.');
}

let app, auth;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  console.log(missingVars.length > 0 ? 'Firebase initialized with demo configuration' : 'Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization failed:', error);
  
  try {
    console.log('Attempting fallback Firebase configuration...');
    app = initializeApp({
      apiKey: 'demo-api-key',
      authDomain: 'demo-project.firebaseapp.com',
      projectId: 'demo-project',
      storageBucket: 'demo-project.appspot.com',
      messagingSenderId: '123456789012',
      appId: '1:123456789012:web:abcdef1234567890'
    });
    auth = getAuth(app);
    console.log('Firebase fallback configuration successful');
  } catch (fallbackError) {
    console.error('Firebase fallback initialization also failed:', fallbackError);
    auth = {
      currentUser: null,
      onAuthStateChanged: (callback) => {
        callback(null);
        return () => {};
      },
      signOut: async () => {},
      getIdToken: async () => 'demo-token'
    };
  }
}

export { app, auth };
export default app; 
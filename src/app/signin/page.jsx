'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SignInRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/firebase-signin');
  }, [router]);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-beige">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal mx-auto mb-4"></div>
        <p className="text-teal">Redirecting to sign in...</p>
      </div>
    </div>
  );
}

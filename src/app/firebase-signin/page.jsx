'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// /signin is the canonical sign-in route. This path is kept only as an alias so old
// links and bookmarks keep working; middleware normally redirects before this renders,
// and this client redirect covers client-side navigations to the legacy path.
export default function FirebaseSignInRedirect() {
  const router = useRouter();

  useEffect(() => {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    router.replace(`/signin${search}`);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-beige px-4">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal mx-auto mb-4"></div>
        <p className="text-teal">Redirecting to sign in...</p>
      </div>
    </div>
  );
}

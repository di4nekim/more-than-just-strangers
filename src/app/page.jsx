'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useFirebaseAuth } from './components/auth/FirebaseAuthProvider';
import LandingBg from '../../public/LANDING_BG.svg';

export default function Landing() {
  const router = useRouter();
  const { user, loading } = useFirebaseAuth();

  // A signed-in user has no use for the marketing page: send them straight to /home,
  // and replace() so "back" from /home does not bounce them here again.
  useEffect(() => {
    if (user && !loading) {
      router.replace('/home');
    }
  }, [user, loading, router]);

  const handleStart = () => {
    // /home itself requires auth, so send signed-out visitors to sign in first
    // rather than letting /home bounce them there.
    router.push(user ? '/home' : '/signin');
  };

  return (
    <div className="min-h-screen relative font-jetbrains-mono overflow-x-hidden">
      <Image
        src={LandingBg}
        alt="Landing Background"
        className="absolute inset-0 w-full h-full object-cover"
        priority
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
        <div className="text-center mb-8">
          <div className="text-sky-blue text-lg sm:text-xl text-left">
            COULD WE BE
          </div>
          <div className="text-teal text-3xl sm:text-4xl md:text-5xl font-medium">
            MORE THAN JUST STRANGERS?
          </div>
        </div>

        <button
          onClick={handleStart}
          className="bg-sky-blue text-beige font-semibold px-10 py-3 rounded-[10px] hover:bg-teal hover:text-beige transition-colors"
        >
          START
        </button>
      </div>
    </div>
  );
}

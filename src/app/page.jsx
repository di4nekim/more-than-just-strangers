'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import LandingBg from '../../public/LANDING_BG.svg';

export default function Landing() {
  const router = useRouter();

  return (
    <div className="h-screen relative font-jetbrains-mono">
      <Image src={LandingBg} alt="Landing Background" className="w-full h-full object-cover" />
      
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-center mb-8">
          <div className="text-sky-blue text-xl text-left">
            COULD WE BE
          </div>
          <div className="text-teal text-5xl font-medium">
            MORE THAN JUST STRANGERS?
          </div>
        </div>
        
        <button
          onClick={() => router.push('/home')}
          className="bg-sky-blue text-beige font-semibold px-10 py-2 rounded-[10px] hover:bg-teal hover:text-beige transition-colors"
        >
          START
        </button>
      </div>
    </div>
  );
}
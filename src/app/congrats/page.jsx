'use client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useWebSocket } from '../../websocket/WebSocketContext';
import { useFirebaseAuth } from '../components/auth/FirebaseAuthProvider';

// The placeholder the profile endpoint returns when an account has no name set -
// it is not a real name, so it must never be shown as one.
const PLACEHOLDER_NAME = 'anonymous';

// First usable name out of the candidates, or null. Mirrors the context's own
// rule: blanks and the 'Anonymous' placeholder count as "no name".
const firstRealName = (...candidates) => {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed || trimmed.toLowerCase() === PLACEHOLDER_NAME) continue;
    return trimmed;
  }
  return null;
};

// The local part of an email, used only as a last resort for the signed-in user's
// own name. Never invents anything the user did not supply.
const emailPrefix = (email) => {
  if (typeof email !== 'string') return null;
  const local = email.split('@')[0]?.trim();
  return local || null;
};

export default function Congrats() {
  const router = useRouter();
  const { user } = useFirebaseAuth();
  const { partnerId = null, userProfile = null, displayNameFor } = useWebSocket();

  // displayNameFor always returns a real, non-empty label; guard only against a
  // context value that predates it so the page never crashes on an older provider.
  const nameFor = typeof displayNameFor === 'function' ? displayNameFor : () => 'Your match';

  // Real identities only. The partner's name comes from the context (which falls
  // back to an honest label); the user's own name comes from their own profile,
  // with the context's self-resolution as the fallback.
  const partnerName = nameFor(partnerId);
  const ownName =
    firstRealName(userProfile?.displayName, userProfile?.name) ||
    emailPrefix(userProfile?.email) ||
    nameFor(userProfile?.userId || user?.uid || null);

  return (
    <div className="min-h-screen relative flex flex-col md:flex-row">
      <Image
        src="/CONGRATS_BG.svg"
        alt="Congratulations background"
        fill
        className="object-cover"
        priority
      />

      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-4 py-10 sm:p-8">
        <div className="text-center w-full max-w-md">
          <h1 className="text-3xl sm:text-4xl font-mono font-semibold text-teal mb-2 break-words">Congratulations,</h1>
          <h2 className="text-3xl sm:text-4xl font-mono font-semibold text-teal mb-8 md:mb-16 break-words">
            <span className="italic">{ownName}.</span>
          </h2>
          <button
            onClick={() => router.push('/')}
            className="w-full sm:w-auto min-h-[44px] bg-light-blue border-2 border-teal text-teal px-6 py-3 rounded-lg font-mono font-semibold uppercase tracking-wide hover:bg-teal hover:text-light-blue hover:border-light-blue transition-colors"
          >
            Continue the connection
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-4 py-10 sm:p-8">
        <div className="text-center w-full max-w-md">
          <h3 className="text-3xl sm:text-4xl font-mono font-semibold text-teal mb-2 break-words">You&apos;ve completed your</h3>
          <h4 className="text-3xl sm:text-4xl font-mono font-semibold text-teal mb-8 md:mb-16 break-words">
            conversation with <span className="italic">{partnerName}.</span>
          </h4>
          <button
            onClick={() => router.push('/')}
            className="w-full sm:w-auto min-h-[44px] bg-teal text-light-blue px-6 py-3 rounded-lg border border-beige font-mono font-semibold uppercase tracking-wide hover:bg-beige hover:text-teal hover:border hover:border-teal transition-colors"
          >
            Find a new connection
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useRouter } from 'next/navigation';

export default function Congrats() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-lg">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          Congratulations!
        </h1>
        <p className="text-gray-600 mb-6">
          You've completed all the questions. Thank you for participating in this meaningful conversation.
        </p>

        <div className="text-gray-600 mb-6">
          How do you want to proceed?
        </div>
        <div className="flex justify-center gap-4">
          <button onClick={() => router.push('/')} className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors">Continue this connection</button>
          <button onClick={() => router.push('/')} className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors">Find a new connection</button>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useWebSocket } from '../../websocket/WebSocketContext';
import { useFirebaseAuth } from '../components/auth/FirebaseAuthProvider';
import { apiClient } from '../lib/api-client';

export default function Congrats() {
  const router = useRouter();
  const { user } = useFirebaseAuth();
  const { conversationMetadata } = useWebSocket();
  const [partnerName, setPartnerName] = useState("Anonymous");

  const getName = useCallback(async () => {
    try {
      if (!conversationMetadata.participants || conversationMetadata.participants.length === 0) {
        return "Anonymous";
      }

      const currentUserId = user?.uid || null;
      if (!currentUserId) {
        return "Anonymous";
      }

      const participants = Array.isArray(conversationMetadata.participants) 
        ? conversationMetadata.participants 
        : [];
      
      const partnerId = participants.find(id => id !== currentUserId);
      
      if (!partnerId) {
        return "Anonymous";
      }

      const profile = await apiClient.getUserProfileById(partnerId);
      return profile.name || profile.displayName || "Anonymous";
    } catch (error) {
      console.error('Failed to get partner name:', error);
      return "Anonymous";
    }
  }, [conversationMetadata.participants, user?.uid]);

  useEffect(() => {
    const updateName = async () => {
      try {
        const name = await getName();
        setPartnerName(name);
      } catch (error) {
        console.error('Failed to update partner name:', error);
        setPartnerName("Anonymous");
      }
    };

    if (conversationMetadata.participants && conversationMetadata.participants.length > 0) {
      updateName();
    }
  }, [conversationMetadata.participants, getName]);

  return (
    <div className="min-h-screen relative flex">
      <Image
        src="/CONGRATS_BG.svg"
        alt="Congratulations background"
        fill
        className="object-cover"
        priority
      />
      
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-8">
        <div className="text-center">
          <h1 className="text-4xl font-mono font-semibold text-teal mb-2">Congratulations,</h1>
          <h2 className="text-4xl font-mono font-semibold text-teal mb-16">
            <span className="italic">Quincey.</span>
          </h2>
          <button 
            onClick={() => router.push('/')} 
            className="bg-light-blue border-2 border-teal text-teal px-6 py-3 rounded-lg font-mono font-semibold uppercase tracking-wide hover:bg-teal hover:text-light-blue hover:border-light-blue transition-colors"
          >
            Continue the connection
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-8">
        <div className="text-center">
          <h3 className="text-4xl font-mono font-semibold text-teal mb-2">You've completed your</h3>
          <h4 className="text-4xl font-mono font-semibold text-teal mb-16">
            conversation with <span className="italic">{partnerName}.</span>
          </h4>
          <button 
            onClick={() => router.push('/')} 
            className="bg-teal text-light-blue px-6 py-3 rounded-lg border border-beige font-mono font-semibold uppercase tracking-wide hover:bg-beige hover:text-teal hover:border hover:border-teal transition-colors"
          >
            Find a new connection
          </button>
        </div>
      </div>
    </div>
  );
}

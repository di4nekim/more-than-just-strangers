import { useWebSocket } from './WebSocketContext';
import { PresenceStatusPayload } from './websocketTypes';
import { useDebounce } from '../hooks/useDebounce';
import { useState, useEffect } from 'react';

export const usePresenceSystem = () => {
  const { wsActions, userMetadata, otherUserPresence } = useWebSocket();
  const [localStatus, setLocalStatus] = useState<PresenceStatusPayload['status']>('online');
  const debouncedStatus = useDebounce(localStatus, 1000); // 1 second debounce

  useEffect(() => {
    if (!wsActions || !userMetadata.userId || !userMetadata.chatId) return;

    wsActions.updatePresence({
      chatId: userMetadata.chatId,
      status: debouncedStatus,
      lastSeen: debouncedStatus === 'offline' ? new Date().toISOString() : undefined
    });
  }, [debouncedStatus, wsActions, userMetadata]);

  const updatePresence = (status: PresenceStatusPayload['status']) => {
    setLocalStatus(status);
  };

  return {
    updatePresence,
    otherUserPresence
  };
}; 
import { useWebSocket } from './WebSocketContext';
import { PresenceStatusPayload } from './websocketTypes';

export const usePresenceSystem = () => {
  const { wsActions, userMetadata } = useWebSocket();

  const updatePresence = (status: PresenceStatusPayload['status']) => {
    if (!wsActions || !userMetadata.userId) return;

    wsActions.updatePresence({
      userId: userMetadata.userId,
      status,
      lastSeen: status === 'offline' ? new Date().toISOString() : undefined
    });
  };

  return {
    updatePresence
  };
}; 
import { useWebSocket } from './WebSocketContext';
import { PresenceStatusPayload } from './websocketTypes';

export const usePresenceSystem = () => {
  const { wsActions, userMetadata, otherUserPresence } = useWebSocket();

  const updatePresence = (status: PresenceStatusPayload['status']) => {
    if (!wsActions || !userMetadata.userId || !userMetadata.chatId) return;

    wsActions.updatePresence({
      chatId: userMetadata.chatId,
      status,
      lastSeen: status === 'offline' ? new Date().toISOString() : undefined
    });
  };

  return {
    updatePresence,
    otherUserPresence
  };
}; 
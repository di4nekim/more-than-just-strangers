import { useWebSocket } from './WebSocketContext';
import { useEffect, useState, useCallback } from 'react';
import { useDebounce } from '../hooks/useDebounce';

/**
 * @typedef {'online'|'offline'|'away'} PresenceStatus
 */

export const usePresenceSystem = () => {
  const { wsActions, userMetadata } = useWebSocket();
  const [localStatus, setLocalStatus] = useState('online');
  const debouncedStatus = useDebounce(localStatus, 1000);

  useEffect(() => {
    if (!wsActions || !userMetadata.userId || !userMetadata.chatId) return;

    wsActions.updatePresence({
      chatId: userMetadata.chatId,
      userId: userMetadata.userId,
      status: debouncedStatus
    });
  }, [debouncedStatus, wsActions, userMetadata]);

  /**
   * @param {PresenceStatus} status
   */
  const updatePresence = (status) => {
    setLocalStatus(status);
  };

  return {
    currentStatus: localStatus,
    updatePresence
  };
}; 
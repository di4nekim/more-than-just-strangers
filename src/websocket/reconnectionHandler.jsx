import { useWebSocket } from './WebSocketContext';
import { useEffect, useCallback } from 'react';

interface ReconnectionOptions {
  maxRetries?: number;
  retryInterval?: number;
  onReconnect?: () => void;
  onMaxRetriesExceeded?: () => void;
}

export const useReconnectionHandler = (options: ReconnectionOptions = {}) => {
  const {
    maxRetries = 5,
    retryInterval = 1000,
    onReconnect,
    onMaxRetriesExceeded
  } = options;

  const { wsClient, isConnected, userMetadata, wsActions } = useWebSocket();

  const handleReconnect = useCallback(async () => {
    if (!wsClient || !wsActions || !userMetadata.userId) return;

    try {
      await wsClient.connect();
      
      // Re-sync user state after reconnection
      wsActions.connect({ userId: userMetadata.userId });
      
      // If in a chat, re-sync conversation
      if (userMetadata.chatId) {
        wsActions.syncConversation({ chatId: userMetadata.chatId });
      }

      onReconnect?.();
    } catch (error) {
      console.error('Reconnection failed:', error);
    }
  }, [wsClient, wsActions, userMetadata, onReconnect]);

  useEffect(() => {
    if (!wsClient) return;

    let retryCount = 0;
    let retryTimeout: NodeJS.Timeout;

    const handleDisconnect = () => {
      if (retryCount >= maxRetries) {
        onMaxRetriesExceeded?.();
        return;
      }

      retryTimeout = setTimeout(() => {
        retryCount++;
        handleReconnect();
      }, retryInterval);
    };

    wsClient.onDisconnect(handleDisconnect);

    return () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [wsClient, maxRetries, retryInterval, handleReconnect, onMaxRetriesExceeded]);

  return {
    isConnected,
    handleReconnect
  };
}; 
import { useWebSocket } from './WebSocketContext';
import { useEffect, useCallback } from 'react';

/**
 * @typedef {Object} ReconnectionOptions
 * @property {number} [maxRetries]
 * @property {number} [retryInterval]
 * @property {function(): void} [onReconnect]
 */

/**
 * @param {ReconnectionOptions} options
 */
export const useReconnectionHandler = (options = {}) => {
  const { wsClient, isConnected } = useWebSocket();
  const {
    maxRetries = 5,
    retryInterval = 1000,
    onReconnect
  } = options;

  const handleReconnect = useCallback(() => {
    if (!wsClient) return;

    let retryCount = 0;
    const attemptReconnect = () => {
      if (retryCount >= maxRetries) {
        console.error('Max reconnection attempts reached');
        return;
      }

      wsClient.connect()
        .then(() => {
          console.log('Reconnected successfully');
          if (onReconnect) onReconnect();
        })
        .catch((error) => {
          console.error('Reconnection attempt failed:', error);
          retryCount++;
          setTimeout(attemptReconnect, retryInterval);
        });
    };

    attemptReconnect();
  }, [wsClient, maxRetries, retryInterval, onReconnect]);

  useEffect(() => {
    if (!isConnected && wsClient) {
      handleReconnect();
    }
  }, [isConnected, wsClient, handleReconnect]);

  return {
    handleReconnect
  };
}; 
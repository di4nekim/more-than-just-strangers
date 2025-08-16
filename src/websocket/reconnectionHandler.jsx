import { useWebSocket } from './WebSocketContext';
import { useEffect, useCallback, useRef } from 'react';

/**
 * @typedef {Object} ReconnectionOptions
 * @property {number} [maxRetries]
 * @property {number} [retryInterval]
 * @property {function(): void} [onReconnect]
 * @property {function(): void} [onMaxRetriesExceeded]
 */

/**
 * @param {ReconnectionOptions} options
 */
export const useReconnectionHandler = (options = {}) => {
  const { wsClient, isConnected } = useWebSocket();
  const {
    maxRetries = 5,
    retryInterval = 1000,
    onReconnect,
    onMaxRetriesExceeded
  } = options;

  // Add refs to track reconnection state
  const isReconnectingRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef(null);

  const handleReconnect = useCallback(() => {
    if (!wsClient || isReconnectingRef.current) {
      console.log('ReconnectionHandler: Already reconnecting or no client available');
      return;
    }

    if (retryCountRef.current >= maxRetries) {
      console.error('ReconnectionHandler: Max reconnection attempts reached');
      isReconnectingRef.current = false;
      if (onMaxRetriesExceeded) {
        onMaxRetriesExceeded();
      }
      return;
    }

    if (isConnected) {
      console.log('ReconnectionHandler: Already connected, stopping reconnection attempts');
      isReconnectingRef.current = false;
      if (onReconnect) onReconnect();
      return;
    }

    isReconnectingRef.current = true;
    retryCountRef.current = 0;

    const attemptReconnect = () => {
      if (retryCountRef.current >= maxRetries) {
        console.error('ReconnectionHandler: Max reconnection attempts reached');
        isReconnectingRef.current = false;
        if (onMaxRetriesExceeded) {
          onMaxRetriesExceeded();
        }
        return;
      }

      // Check if already connected before attempting reconnection
      if (isConnected) {
        console.log('ReconnectionHandler: Already connected, stopping reconnection attempts');
        isReconnectingRef.current = false;
        if (onReconnect) onReconnect();
        return;
      }

      wsClient.connect()
        .then(() => {
          if (process.env.NODE_ENV === 'development') {
            console.log('ReconnectionHandler: Reconnected successfully');
          }
          isReconnectingRef.current = false;
          retryCountRef.current = 0;
          if (onReconnect) onReconnect();
        })
        .catch((error) => {
          console.error('ReconnectionHandler: Reconnection attempt failed:', error);
          retryCountRef.current++;
          isReconnectingRef.current = false;
          
          // Only schedule next attempt if we haven't reached max retries
          if (retryCountRef.current < maxRetries) {
            retryTimeoutRef.current = setTimeout(attemptReconnect, retryInterval);
          } else {
            if (onMaxRetriesExceeded) {
              onMaxRetriesExceeded();
            }
          }
        });
    };

    attemptReconnect();
  }, [wsClient, maxRetries, retryInterval, onReconnect, onMaxRetriesExceeded, isConnected]);

  useEffect(() => {
    // Only attempt reconnection if not connected and not already reconnecting
    if (!isConnected && wsClient && !isReconnectingRef.current) {
      console.log('ReconnectionHandler: Connection lost, starting reconnection attempts');
      handleReconnect();
    }
  }, [isConnected, wsClient, handleReconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      isReconnectingRef.current = false;
    };
  }, []);

  return {
    handleReconnect
  };
}; 
import { useWebSocket } from './WebSocketContext';
import { useCallback } from 'react';

/**
 * @deprecated Typing indicator functionality disabled for API compatibility.
 * Will be reimplemented in future update.
 */
export const useTypingIndicator = () => {
  const { typingStatus } = useWebSocket();

  /**
   * @deprecated No-op function for API compatibility.
   * @param {boolean} isTyping - Ignored
   */
  const sendTypingStatus = useCallback(async (isTyping) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('sendTypingStatus is deprecated and has been disabled. Typing status will not be sent.');
    }

    return Promise.resolve();
  }, []);

  return {
    typingStatus: {},
    sendTypingStatus
  };
}; 
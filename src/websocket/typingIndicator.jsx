import { useWebSocket } from './WebSocketContext';
import { useCallback } from 'react';

/**
 * @deprecated This typing indicator functionality has been temporarily deprecated.
 * The function is maintained for API compatibility but does not send typing status.
 * Will be reimplemented in a future update.
 * 
 * @see https://github.com/your-repo/issues/typing-status-reimplement
 */
export const useTypingIndicator = () => {
  const { typingStatus } = useWebSocket();

  /**
   * @deprecated This function has been deprecated and no longer sends typing status.
   * Calls to this function will log a warning but otherwise have no effect.
   * @param {boolean} isTyping - The typing state (ignored)
   */
  const sendTypingStatus = useCallback(async (isTyping) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('sendTypingStatus is deprecated and has been disabled. Typing status will not be sent.');
    }
    // No-op: Function preserved for API compatibility but does nothing
    return Promise.resolve();
  }, []);

  return {
    typingStatus: {}, // Always return empty object
    sendTypingStatus
  };
}; 
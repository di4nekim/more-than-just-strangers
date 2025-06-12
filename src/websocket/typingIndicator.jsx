import { useWebSocket } from './WebSocketContext';
import { useCallback } from 'react';

export const useTypingIndicator = () => {
  const { wsActions, userMetadata, typingStatus } = useWebSocket();

  /**
   * @param {boolean} isTyping
   */
  const sendTypingStatus = (isTyping) => {
    if (!wsActions || !userMetadata.userId || !userMetadata.chatId) return;

    wsActions.sendTypingStatus({
      userId: userMetadata.userId,
      chatId: userMetadata.chatId,
      isTyping
    });
  };

  return {
    typingStatus,
    sendTypingStatus
  };
}; 
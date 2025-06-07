import { useWebSocket } from './WebSocketContext';
import { TypingStatusPayload } from './websocketTypes';

export const useTypingIndicator = () => {
  const { wsActions, userMetadata } = useWebSocket();

  const sendTypingStatus = (isTyping: boolean) => {
    if (!wsActions || !userMetadata.userId || !userMetadata.chatId) return;

    wsActions.sendTypingStatus({
      userId: userMetadata.userId,
      chatId: userMetadata.chatId,
      isTyping
    });
  };

  return {
    sendTypingStatus
  };
}; 
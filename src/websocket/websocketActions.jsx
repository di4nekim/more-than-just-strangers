import { WebSocketClient } from './websocketHandler';
import { validateChatIdFormat, validateUserId } from '../lib/chatIdUtils';
import {
  ConnectPayload,
  StartConversationPayload,
  ReadyToAdvancePayload,
  EndConversationPayload,
  SendMessagePayload,
  FetchChatHistoryPayload,
  FetchUserMetadataPayload,
  SyncConversationPayload,
  TypingStatusPayload,
  PresenceStatusPayload
} from './websocketTypes';


export const createWebSocketActions = (wsClient) => ({
  connect: async () => {
    try {
      await wsClient.connect();
      await new Promise(resolve => setTimeout(resolve, 100));
      await wsClient.send({ action: 'connect', data: {} });
    } catch (error) {
      console.error('Failed to establish WebSocket connection or update connection ID:', error);
      throw error;
    }
  },

  sendReadyToAdvance: async (payload) => {
    await wsClient.send({ action: 'setReady', data: payload });
  },

  endConversation: async (payload) => {
    await wsClient.send({ action: 'endConversation', data: payload });
  },

  sendMessage: async (payload) => {
    await wsClient.send({ action: 'sendMessage', data: payload });
  },

  startConversation: async (payload) => {
    try {
      console.log('WebSocket: Sending startConversation action:', payload);
      
      // Validate user IDs before sending
      if (payload.otherUserId) {
        const validation = validateUserId(payload.otherUserId);
        if (!validation.isValid) {
          const error = new Error(`Invalid other user ID: ${validation.error}`);
          console.error('WebSocket: User ID validation failed:', error.message);
          throw error;
        }
      }
      
      await wsClient.send({ action: 'startConversation', data: payload });
      console.log('WebSocket: startConversation action sent successfully');
    } catch (error) {
      console.error('WebSocket: Failed to send startConversation action:', error);
      throw error;
    }
  },

  fetchChatHistory: async (payload) => {
    await wsClient.send({ action: 'fetchChatHistory', data: payload });
  },

  getCurrentState: async (payload) => {
    await wsClient.send({ action: 'getCurrentState', data: payload });
  },

  syncConversation: async (payload) => {
    try {
      console.log('WebSocket: Sending syncConversation action:', payload);
      
      // Validate chat ID before sending
      if (payload.chatId) {
        const validation = validateChatIdFormat(payload.chatId);
        if (!validation.isValid) {
          const error = new Error(`Invalid chat ID format: ${validation.error}`);
          console.error('WebSocket: Chat ID validation failed:', error.message);
          throw error;
        }
      }
      
      await wsClient.send({ action: 'syncConversation', data: payload });
      console.log('WebSocket: syncConversation action sent successfully');
    } catch (error) {
      console.error('WebSocket: Failed to send syncConversation action:', error);
      throw error;
    }
  },

  /**
   * @deprecated No-op function for API compatibility.
   */
  sendTypingStatus: async (payload) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('sendTypingStatus WebSocket action is deprecated and has been disabled.');
    }

    return Promise.resolve();
  },

  updatePresence: async (payload) => {
    await wsClient.send({ action: 'updatePresence', data: payload });
  },

  setReady: async (payload) => {
    await wsClient.send({ action: 'setReady', data: payload });
  },

  disconnect: () => {
    wsClient.disconnect();
  }
});

export const WebSocketActions = createWebSocketActions; 